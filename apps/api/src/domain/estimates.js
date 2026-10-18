import { enqueueExchange, requiredRecord } from "./accounting.js";
import { publishEstimateTerms, workflowFor } from "./ticket-workflow.js";
import { registerActDocument } from "./documents.js";
import { requireContext, contextCan } from "./context-access.js";
import { MAX_WORK_AMOUNT } from "../../../../packages/contracts/src/operations-platform.ts";
import crypto from "node:crypto";
import { assertPermission } from "../services/permissions.js";
const cents = (value) => Math.round((value + Number.EPSILON) * 100);
const conflict = (message) =>
  Object.assign(new Error(message), { status: 409 });
const preparationStates = [
  "registered",
  "assigned",
  "awaiting_approval",
  "rejected",
];
export function canPrepareEstimate(db, actor, ticketId) {
  return (
    contextCan(db, actor, "estimates.write", "tickets", ticketId) &&
    preparationStates.includes(workflowFor(db, ticketId).state) &&
    !db.data.service_acts.some((a) => a.ticketId === ticketId)
  );
}
export function estimateView(db, actor, row) {
  const w = workflowFor(db, row.ticketId),
    ticket = requiredRecord(db, "tickets", row.ticketId),
    isCurrent = w.estimateId === row.id,
    prepare = canPrepareEstimate(db, actor, row.ticketId),
    approve = contextCan(
      db,
      actor,
      "estimates.approve",
      "tickets",
      row.ticketId,
    ),
    paid = row.total > 0,
    accepted =
      ["accepted", "closed"].includes(w.state) &&
      ["completed", "resolved", "closed"].includes(ticket.status);
  return {
    ...row,
    isCurrent,
    capabilities: {
      edit: prepare && ["draft", "rejected"].includes(row.status),
      submit:
        prepare &&
        row.status === "draft" &&
        contextCan(db, actor, "finance.read", "tickets", row.ticketId),
      approve: approve && isCurrent && row.status === "submitted",
      reject: approve && isCurrent && row.status === "submitted",
      act:
        approve &&
        isCurrent &&
        row.status === "approved" &&
        accepted &&
        w.amount === row.total &&
        w.paid === paid &&
        (!w.paid || w.approvedVersion === w.termsVersion) &&
        !ticket.checklist_items.some((c) => c.required && !c.completed) &&
        !db.data.service_acts.some((a) => a.ticketId === row.ticketId),
    },
  };
}

export function saveEstimate(db, actor, id, input) {
  assertPermission(actor, "estimates.write");
  const current = id ? db.getById("estimates", id) : null;
  if (id && !current)
    throw Object.assign(new Error("Смета не найдена"), { status: 404 });
  if (
    current &&
    (current.version !== input.version ||
      !["draft", "rejected"].includes(current.status))
  )
    throw conflict("Смета изменена или уже передана на согласование");
  if (!current && input.version !== 0)
    throw conflict("У новой сметы версия должна быть 0");
  const ticket = db.getById("tickets", input.ticketId);
  if (!ticket || ticket.property_id !== input.propertyId)
    throw new Error("Заявка другого объекта");
  if (
    current &&
    (current.ticketId !== input.ticketId ||
      current.propertyId !== input.propertyId)
  )
    throw new Error("Нельзя менять заявку существующей сметы");
  requireContext(db, actor, "estimates.write", "tickets", ticket.id);
  if (!canPrepareEstimate(db, actor, ticket.id))
    throw conflict(
      "Смету готовят до начала работ. Дополнительную работу оформите новой заявкой",
    );
  const contractor = input.contractorId
    ? db.getById("contractors", input.contractorId)
    : null;
  if (
    input.contractorId &&
    (!contractor?.active || contractor.propertyId !== input.propertyId)
  )
    throw new Error("Подрядчик недоступен");
  const lines = input.lines.map((line) => {
    if (line.catalogId) {
      const item = db.getById(
        line.kind === "material" ? "materials" : "service_catalog",
        line.catalogId,
      );
      if (!item?.active || item.propertyId !== input.propertyId)
        throw new Error("Позиция каталога недоступна на объекте");
    }
    const net = cents(line.quantity * line.unitPrice);
    const vat = Math.round((net * Number(line.vatRate)) / 100);
    if (!Number.isSafeInteger(net + vat) || net + vat > 1e12)
      throw new Error("Превышена допустимая сумма строки");
    return {
      ...line,
      net: net / 100,
      vat: vat / 100,
      total: (net + vat) / 100,
    };
  });
  const total = lines.reduce((sum, l) => sum + cents(l.total), 0) / 100;
  if (total > MAX_WORK_AMOUNT)
    throw new Error("Превышена допустимая сумма сметы");
  const now = new Date().toISOString();
  const row = {
    ...input,
    id: id ?? crypto.randomUUID(),
    lines,
    total,
    status: "draft",
    version: input.version + 1,
    createdBy: current?.createdBy ?? actor.id,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
    submittedBy: null,
    rejectionReason: "",
  };
  if (current) Object.assign(current, row);
  else db.data.estimates.push(row);
  return row;
}

export function transitionEstimate(db, actor, id, action, input) {
  assertPermission(
    actor,
    ["approve", "reject", "act"].includes(action)
      ? "estimates.approve"
      : "estimates.write",
  );
  const row = db.getById("estimates", id);
  if (!row) throw Object.assign(new Error("Смета не найдена"), { status: 404 });
  requireContext(
    db,
    actor,
    ["approve", "reject", "act"].includes(action)
      ? "estimates.approve"
      : "estimates.write",
    "tickets",
    row.ticketId,
  );
  if (row.version !== input.version) throw conflict("Версия сметы устарела");
  const expected = {
    submit: "draft",
    approve: "submitted",
    reject: "submitted",
    act: "approved",
  }[action];
  if (row.status !== expected)
    throw conflict("Это действие недоступно в текущем статусе");
  const workflow = workflowFor(db, row.ticketId);
  if (["approve", "act"].includes(action) && workflow.estimateId !== row.id)
    throw conflict("Смета заменена. Используйте актуальную смету заявки");
  const now = new Date().toISOString();
  if (action === "reject" && !input.reason?.trim())
    throw new Error("Укажите причину отклонения");
  if (action === "submit") publishEstimateTerms(db, actor, row);
  let act;
  if (action === "act") {
    const ticket = db.getById("tickets", row.ticketId);
    if (!["completed", "resolved", "closed"].includes(ticket.status))
      throw conflict("Акт доступен после выполнения заявки");
    if (!["accepted", "closed"].includes(workflowFor(db, ticket.id).state))
      throw conflict("Акт доступен после приемки результата");
    if (
      workflow.amount !== row.total ||
      workflow.paid !== Boolean(row.total) ||
      (workflow.paid && workflow.approvedVersion !== workflow.termsVersion)
    )
      throw conflict(
        "Условия актуальной сметы не согласованы для принятого результата",
      );
    if (ticket.checklist_items.some((item) => item.required && !item.completed))
      throw conflict("Обязательный чек-лист не завершён");
    if (db.data.service_acts.some((a) => a.ticketId === row.ticketId))
      throw conflict("По заявке уже выпущен акт");
    const number = `АКТ-${now.slice(0, 4)}-${String(db.data.service_acts.length + 1).padStart(6, "0")}`;
    act = {
      id: crypto.randomUUID(),
      propertyId: row.propertyId,
      estimateId: id,
      estimateVersion: row.version,
      ticketId: row.ticketId,
      number,
      issuedBy: actor.id,
      date: now.slice(0, 10),
      createdAt: now,
      total: row.total,
      snapshot: {
        name: row.name,
        ticketNumber: ticket.number,
        tenantName: db.getTenantById(ticket.tenant_id)?.name ?? "",
        propertyName: db.getPropertyById(row.propertyId).name,
        contractorName:
          db.getById("contractors", row.contractorId)?.name ??
          "Собственная служба",
        lines: structuredClone(row.lines),
        total: row.total,
      },
    };
    db.data.service_acts.push(act);
    registerActDocument(db, actor, act, ticket);
    if (workflow.accountId) {
      const account = requiredRecord(
        db,
        "personal_accounts",
        workflow.accountId,
      );
      enqueueExchange(
        db,
        account.sourceId,
        "service_acts",
        `service-act-${act.id}`,
        {
          schemaVersion: 1,
          actId: act.id,
          number: act.number,
          date: act.date,
          ticketId: ticket.id,
          accountExternalId: account.externalId,
          total: act.total,
          lines: structuredClone(act.snapshot.lines),
        },
      );
    }
  }
  row.status = {
    submit: "submitted",
    approve: "approved",
    reject: "rejected",
    act: "acted",
  }[action];
  row.version++;
  row.updatedAt = now;
  if (action === "submit") row.submittedBy = actor.id;
  if (action === "approve") {
    row.approvedBy = actor.id;
    row.approvedAt = now;
  }
  if (action === "reject") row.rejectionReason = input.reason.trim();
  return { item: row, act };
}
