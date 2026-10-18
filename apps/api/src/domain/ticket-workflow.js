import crypto from "node:crypto";
import { contextCan, requireContext } from "./context-access.js";
import {
  businessError,
  requiredRecord,
  enqueueExchange,
} from "./accounting.js";
const now = () => new Date().toISOString();
export function createTicketWorkflow(db, ticket) {
  const service = ticket.service_id
    ? db.getById("service_catalog", ticket.service_id)
    : null;
  const paid = Boolean(service?.paid),
    technical =
      !["billing", "lease", "other"].includes(ticket.category) &&
      !ticket.maintenance_plan_id;
  const row = {
    ticketId: ticket.id,
    accountId: null,
    paid,
    amount: paid ? service.basePrice : 0,
    requireBeforePhoto: technical,
    requireAfterPhoto: technical,
    termsVersion: 1,
    approvedVersion: null,
    resultVersion: 1,
    state: paid
      ? "awaiting_approval"
      : ticket.status === "in_progress"
        ? "in_progress"
        : ticket.assigned_to
          ? "assigned"
          : "registered",
    pauseReason: null,
    approvalBy: null,
    acceptanceBy: null,
    updatedAt: now(),
  };
  db.data.ticket_workflows.push(row);
  return row;
}
export function workflowFor(db, id) {
  requiredRecord(db, "tickets", id);
  const w = db.data.ticket_workflows.find((w) => w.ticketId === id);
  if (!w)
    throw businessError(
      "Для заявки отсутствует процесс. Проверьте миграцию",
      409,
    );
  return w;
}
function version(w, stamp) {
  if (!stamp || stamp !== w.updatedAt)
    throw businessError(
      "Заявка изменена. Обновите данные.",
      409,
      "VERSION_CONFLICT",
    );
}
function proof(db, w, phase) {
  return db.data.document_links.some(
    (l) =>
      l.entityType === "tickets" &&
      l.entityId === w.ticketId &&
      l.phase === phase &&
      l.revision === (phase === "before" ? w.termsVersion : w.resultVersion) &&
      db
        .getById("entity_documents", l.documentId)
        ?.mimeType?.startsWith("image/"),
  );
}
function decision(db, w, actor, action, reason = "") {
  db.data.ticket_decisions.push({
    id: crypto.randomUUID(),
    ticketId: w.ticketId,
    actorId: actor.id,
    action,
    reason,
    termsVersion: w.termsVersion,
    resultVersion: w.resultVersion,
    snapshot: structuredClone(w),
    createdAt: now(),
  });
  w.updatedAt = now();
}
function canExecute(db, actor, ticket) {
  requireContext(db, actor, "tickets.write", "tickets", ticket.id);
  if (
    actor.role === "tenant" ||
    (actor.role === "worker" && ticket.assigned_to !== actor.id)
  )
    throw businessError("Работу выполняет назначенный сотрудник", 403);
}
export function saveTerms(db, actor, ticketId, body) {
  const ticket = requiredRecord(db, "tickets", ticketId),
    w = workflowFor(db, ticketId);
  version(w, body.updatedAt);
  requireContext(db, actor, "services.write", "tickets", ticketId);
  requireContext(db, actor, "finance.read", "tickets", ticketId);
  if (
    !["registered", "assigned", "awaiting_approval", "rejected"].includes(
      w.state,
    )
  )
    throw businessError(
      "Условия выполняемой или завершенной работы менять нельзя",
      409,
    );
  const quote = publishedEstimate(db, ticketId);
  if (quote && quote.total > 0 && (!body.paid || body.amount !== quote.total))
    throw businessError(
      "Стоимость должна совпадать с опубликованной сметой",
      409,
    );
  if (body.accountId) {
    const account = requiredRecord(db, "personal_accounts", body.accountId);
    if (account.leaseId !== ticket.lease_id || account.status !== "active")
      throw businessError("Выберите действующий ЛС договора заявки");
  }
  Object.assign(w, {
    paid: body.paid,
    amount: body.amount,
    accountId: body.accountId,
    requireBeforePhoto: body.requireBeforePhoto,
    requireAfterPhoto: body.requireAfterPhoto,
    termsVersion: w.termsVersion + 1,
    approvedVersion: null,
    approvalBy: null,
    state: body.paid
      ? "awaiting_approval"
      : ticket.assigned_to
        ? "assigned"
        : "registered",
  });
  decision(db, w, actor, "terms");
  return w;
}
export function guardTicketTransition(db, current, next, payload) {
  const w = workflowFor(db, current.id);
  if (next.service_id !== current.service_id) {
    if (!["registered", "assigned", "awaiting_approval"].includes(w.state))
      throw businessError("Услугу выполняемой работы менять нельзя", 409);
    const service = next.service_id
      ? db.getById("service_catalog", next.service_id)
      : null;
    Object.assign(w, {
      paid: Boolean(service?.paid),
      amount: service?.paid ? service.basePrice : 0,
      termsVersion: w.termsVersion + 1,
      approvedVersion: null,
      approvalBy: null,
      state: service?.paid
        ? "awaiting_approval"
        : next.assigned_to
          ? "assigned"
          : "registered",
      updatedAt: now(),
    });
  }
  if (
    (next.unit_id !== current.unit_id ||
      next.lease_id !== current.lease_id ||
      next.tenant_id !== current.tenant_id) &&
    (db.data.ticket_decisions.some((d) => d.ticketId === current.id) ||
      db.data.document_links.some(
        (l) => l.entityType === "tickets" && l.entityId === current.id,
      ))
  )
    throw businessError(
      "Контекст заявки с документами или решениями неизменяем",
      409,
    );
  if (current.status === next.status) return;
  const actor = payload.updatedBy
    ? db.getById("users", payload.updatedBy)
    : null;
  if (["in_progress", "completed", "resolved"].includes(next.status)) {
    if (w.paid && (!w.accountId || w.approvedVersion !== w.termsVersion))
      throw businessError(
        "Сначала согласуйте актуальную стоимость работы",
        409,
      );
    if (w.requireBeforePhoto && !proof(db, w, "before"))
      throw businessError("Прикрепите фото до начала работ", 409);
  }
  if (
    ["completed", "resolved"].includes(next.status) &&
    w.state !== "in_progress"
  )
    throw businessError("Завершить можно только работу в исполнении", 409);
  if (
    ["completed", "resolved"].includes(next.status) &&
    w.requireAfterPhoto &&
    !proof(db, w, "after")
  )
    throw businessError("Прикрепите фото результата работ", 409);
  if (next.status === "closed" && w.state !== "accepted")
    throw businessError("Сначала получите приемку результата", 409);
  if (
    ["completed", "resolved", "closed"].includes(current.status) &&
    !["completed", "resolved", "closed"].includes(next.status)
  ) {
    if (
      !actor ||
      !contextCan(db, actor, "tickets.accept", "tickets", current.id) ||
      !payload.reopenReason?.trim()
    )
      throw businessError(
        "Возврат результата требует права приемки и причины",
        403,
      );
    if (db.data.service_acts.some((a) => a.ticketId === current.id))
      throw businessError(
        "По заявке выпущен акт. Дополнительную работу оформите новой заявкой",
        409,
      );
    const previousResultVersion = w.resultVersion;
    w.resultVersion++;
    if (w.accountId) {
      const account = requiredRecord(db, "personal_accounts", w.accountId);
      enqueueExchange(
        db,
        account.sourceId,
        "work_reopened",
        `work-reopened-${current.id}-${w.resultVersion}`,
        {
          schemaVersion: 1,
          ticketId: current.id,
          accountExternalId: account.externalId,
          previousResultVersion,
          resultVersion: w.resultVersion,
          reason: payload.reopenReason,
        },
      );
    }
    w.acceptanceBy = null;
  }
  if (next.status === "in_progress") {
    w.state = "in_progress";
    w.pauseReason = null;
  } else if (["completed", "resolved"].includes(next.status))
    w.state = "awaiting_acceptance";
  else if (next.status === "closed") w.state = "closed";
  else if (next.status === "rejected") w.state = "rejected";
  else if (next.status === "waiting_tenant") {
    w.state = "paused";
    w.pauseReason = payload.reason ?? "Ожидание ответа";
  } else
    w.state =
      w.paid && w.approvedVersion !== w.termsVersion
        ? "awaiting_approval"
        : next.assigned_to
          ? "assigned"
          : "registered";
  w.updatedAt = now();
}
export function decideTicket(db, actor, ticketId, body) {
  const ticket = requiredRecord(db, "tickets", ticketId),
    w = workflowFor(db, ticketId);
  version(w, body.updatedAt);
  const action = body.action;
  if (["approve", "decline"].includes(action)) {
    if (w.state !== "awaiting_approval" || !w.paid || !w.accountId)
      throw businessError(
        "Работа не ожидает согласования или не выбран ЛС",
        409,
      );
    requireContext(db, actor, "work.approve", "personal_accounts", w.accountId);
    const quote = publishedEstimate(db, ticketId);
    if (
      action === "approve" &&
      quote &&
      (!["approved", "acted"].includes(quote.status) ||
        quote.total !== w.amount)
    )
      throw businessError("Сначала утвердите актуальную смету", 409);
    if (action === "approve") {
      w.approvedVersion = w.termsVersion;
      w.approvalBy = actor.id;
      w.state =
        ticket.status === "in_progress"
          ? "in_progress"
          : ticket.assigned_to
            ? "assigned"
            : "registered";
    } else {
      w.state = "rejected";
      db.updateTicket(ticketId, {
        status: "rejected",
        reason: body.reason,
        updatedBy: actor.id,
      });
    }
  } else if (["accept", "return"].includes(action)) {
    if (w.state !== "awaiting_acceptance")
      throw businessError("Результат не передан на приемку", 409);
    requireContext(db, actor, "tickets.accept", "tickets", ticketId);
    if (action === "accept") {
      w.state = "accepted";
      w.acceptanceBy = actor.id;
      if (w.accountId) {
        const account = requiredRecord(db, "personal_accounts", w.accountId);
        enqueueExchange(
          db,
          account.sourceId,
          "work_results",
          `work-result-${ticketId}-${w.resultVersion}`,
          {
            schemaVersion: 1,
            ticketId,
            number: ticket.number,
            accountExternalId: account.externalId,
            termsVersion: w.termsVersion,
            resultVersion: w.resultVersion,
            amount: w.amount,
            acceptedBy: actor.id,
            acceptedAt: now(),
          },
        );
      }
    } else {
      db.updateTicket(ticketId, {
        status: "in_progress",
        reopenReason: body.reason,
        updatedBy: actor.id,
      });
    }
  } else {
    canExecute(db, actor, ticket);
    if (action === "start" || action === "resume") {
      if (
        !(
          action === "resume" ? ["paused"] : ["registered", "assigned"]
        ).includes(w.state)
      )
        throw businessError("Работу сейчас нельзя начать", 409);
      if (w.paid && (!w.accountId || w.approvedVersion !== w.termsVersion))
        throw businessError(
          "Сначала согласуйте актуальную стоимость работы",
          409,
        );
      if (w.requireBeforePhoto && !proof(db, w, "before"))
        throw businessError("Прикрепите фото до начала работ", 409);
      db.updateTicket(ticketId, { status: "in_progress", updatedBy: actor.id });
      w.state = "in_progress";
      w.pauseReason = null;
    } else if (action === "pause") {
      if (w.state !== "in_progress")
        throw businessError("Приостановить можно работу в исполнении", 409);
      w.state = "paused";
      w.pauseReason = body.reason;
    } else if (action === "submit") {
      if (w.state !== "in_progress")
        throw businessError("Сначала начните работу", 409);
      db.updateTicket(ticketId, { status: "completed", updatedBy: actor.id });
    } else if (action === "close") {
      if (w.state !== "accepted")
        throw businessError("Нет приемки результата", 409);
      db.updateTicket(ticketId, { status: "closed", updatedBy: actor.id });
    }
  }
  decision(db, w, actor, action, body.reason);
  return w;
}

export function publishedEstimate(db, ticketId) {
  return (
    db.data.estimates
      .filter(
        (e) =>
          e.ticketId === ticketId &&
          ["submitted", "approved", "acted"].includes(e.status),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .at(0) ?? null
  );
}
export function publishEstimateTerms(db, actor, estimate) {
  const w = workflowFor(db, estimate.ticketId);
  requireContext(db, actor, "estimates.write", "tickets", estimate.ticketId);
  requireContext(db, actor, "finance.read", "tickets", estimate.ticketId);
  if (
    !["registered", "assigned", "awaiting_approval", "rejected"].includes(
      w.state,
    )
  )
    throw businessError(
      "Смету передают до начала работ. Для дополнительной работы создайте новую заявку",
      409,
    );
  Object.assign(w, {
    paid: estimate.total > 0,
    amount: estimate.total,
    termsVersion: w.termsVersion + 1,
    approvedVersion: null,
    approvalBy: null,
    state: estimate.total > 0 ? "awaiting_approval" : "registered",
  });
  decision(
    db,
    w,
    actor,
    "estimate_submitted",
    `Смета ${estimate.name}, версия ${estimate.version}`,
  );
}
