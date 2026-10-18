import crypto from "node:crypto";
import { contextCan, requireContext } from "./context-access.js";
import {
  businessError,
  requiredRecord,
  currentRecord,
  enqueueExchange,
} from "./accounting.js";
import { postAcceptedReading } from "../operations.js";
const now = () => new Date().toISOString();
export function saveReadingPeriod(db, actor, body) {
  requireContext(db, actor, "meters.write", "properties", body.propertyId);
  if (
    db.data.reading_periods.some(
      (p) =>
        p.propertyId === body.propertyId &&
        p.startsOn <= body.endsOn &&
        p.endsOn >= body.startsOn,
    )
  )
    throw businessError("Периоды ввода пересекаются", 409);
  const row = {
    ...body,
    id: crypto.randomUUID(),
    createdBy: actor.id,
    createdAt: now(),
    updatedAt: now(),
  };
  db.data.reading_periods.push(row);
  return row;
}
function latest(db, meterId) {
  return db.data.resource_readings
    .filter((r) => r.meterId === meterId)
    .sort((a, b) => b.period.localeCompare(a.period));
}
export function submitReading(db, actor, body) {
  const meter = requiredRecord(db, "meters", body.meterId),
    period = requiredRecord(db, "reading_periods", body.periodId),
    day = now().slice(0, 10);
  requireContext(db, actor, "readings.submit", "meters", meter.id);
  if (actor.role === "worker" && meter.responsibleId !== actor.id)
    throw businessError("Прибор закреплен за другим сотрудником", 403);
  if (!meter.active || meter.propertyId !== period.propertyId)
    throw businessError("Прибор не относится к периоду или отключен");
  if (day < period.startsOn || day > period.endsOn)
    throw businessError("Период ввода закрыт", 409);
  if (
    db.data.reading_submissions.some(
      (r) =>
        r.meterId === meter.id &&
        r.periodId === period.id &&
        r.status !== "rejected",
    )
  )
    throw businessError("Показание уже отправлено", 409);
  const readings = latest(db, meter.id),
    previous = readings[0]?.value ?? meter.initialValue;
  if (readings[0]?.period >= period.startsOn.slice(0, 7))
    throw businessError("Этот или более поздний месяц уже принят", 409);
  if (body.value < previous)
    throw businessError(
      "Новое значение меньше предыдущего. Замену прибора оформляет инженер",
    );
  if (period.photoRequired && !body.photoDocumentId)
    throw businessError("Прикрепите фотографию прибора");
  if (body.photoDocumentId) {
    const doc = requiredRecord(db, "entity_documents", body.photoDocumentId);
    if (
      !doc.mimeType.startsWith("image/") ||
      doc.uploadedBy !== actor.id ||
      !db.data.document_links.some(
        (l) =>
          l.documentId === doc.id &&
          l.entityType === "meters" &&
          l.entityId === meter.id,
      )
    )
      throw businessError("Нужна ваша фотография этого прибора");
  }
  let sourceId = null;
  if (body.accountId) {
    const account = requiredRecord(db, "personal_accounts", body.accountId),
      lease = requiredRecord(db, "leases", account.leaseId);
    if (account.status !== "active" || lease.unit_id !== meter.unitId)
      throw businessError("ЛС не относится к прибору");
    requireContext(
      db,
      actor,
      "readings.submit",
      "personal_accounts",
      account.id,
    );
    sourceId = account.sourceId;
  } else if (actor.role === "tenant")
    throw businessError("Выберите лицевой счет");
  const delta = body.value - previous,
    lastDelta = readings[0]?.consumption;
  const anomaly =
    lastDelta !== undefined &&
    (lastDelta === 0
      ? delta > 0
      : (Math.abs(delta - lastDelta) / lastDelta) * 100 >
        period.thresholdPercent);
  const row = {
    ...body,
    id: crypto.randomUUID(),
    propertyId: meter.propertyId,
    sourceId,
    outboxId: null,
    submittedBy: actor.id,
    reviewedBy: null,
    status: "pending",
    reason: null,
    previous,
    anomaly,
    createdAt: now(),
    updatedAt: now(),
    reviewedAt: null,
  };
  db.data.reading_submissions.push(row);
  return row;
}
export function reviewReading(db, actor, id, body) {
  const row = currentRecord(db, "reading_submissions", id, body.updatedAt);
  requireContext(db, actor, "readings.review", "meters", row.meterId);
  if (row.status !== "pending") throw businessError("Решение уже принято", 409);
  if ((row.anomaly || !body.accepted) && !body.reason.trim())
    throw businessError("Укажите обоснование решения инженера");
  if (body.accepted) {
    const meter = requiredRecord(db, "meters", row.meterId),
      period = requiredRecord(db, "reading_periods", row.periodId),
      readings = latest(db, meter.id),
      previous = readings[0]?.value ?? meter.initialValue;
    if (previous !== row.previous)
      throw businessError(
        "Предыдущее показание изменилось. Отклоните и запросите новое",
        409,
      );
    let mapping = null,
      account = null;
    if (row.sourceId) {
      const source = requiredRecord(db, "accounting_sources", row.sourceId);
      if (!source.active) throw businessError("Источник учета отключен", 409);
      mapping = db.data.external_links.find(
        (l) =>
          l.sourceId === row.sourceId &&
          l.entityType === "meters" &&
          l.localId === meter.id,
      );
      if (!mapping)
        throw businessError(
          "Сначала сопоставьте прибор с источником учета",
          422,
        );
      account = requiredRecord(db, "personal_accounts", row.accountId);
    }
    row.status = "accepted";
    postAcceptedReading(db, actor, row.id);
    if (row.sourceId) {
      row.outboxId = enqueueExchange(
        db,
        row.sourceId,
        "readings",
        `reading-${row.id}`,
        {
          schemaVersion: 1,
          submissionId: row.id,
          period: period.startsOn.slice(0, 7),
          meterExternalId: mapping.externalId,
          accountExternalId: account.externalId,
          value: row.value,
          previous: row.previous,
          photoDocumentId: row.photoDocumentId,
        },
      ).id;
    }
  } else row.status = "rejected";
  row.reason = body.reason;
  row.reviewedBy = actor.id;
  row.reviewedAt = now();
  row.updatedAt = now();
  return row;
}
export function readingsWorkspace(db, actor) {
  const meters = db.data.meters.filter((m) =>
    contextCan(db, actor, "workspace.read", "meters", m.id),
  );
  const ids = new Set(meters.map((m) => m.id));
  return {
    meters,
    accounts: db.data.personal_accounts
      .filter(
        (a) =>
          a.status === "active" &&
          contextCan(db, actor, "readings.submit", "personal_accounts", a.id),
      )
      .map((a) => ({
        id: a.id,
        number: a.number,
        unitId: db.getById("leases", a.leaseId).unit_id,
        sourceName: db.getById("accounting_sources", a.sourceId).name,
      })),
    periods: db.data.reading_periods.filter((p) =>
      meters.some((m) => m.propertyId === p.propertyId),
    ),
    submissions: db.data.reading_submissions.filter(
      (s) =>
        ids.has(s.meterId) &&
        contextCan(
          db,
          actor,
          "workspace.read",
          "meters",
          s.meterId,
          undefined,
          s.createdAt.slice(0, 10),
        ) &&
        (actor.role !== "tenant" ||
          s.submittedBy === actor.id ||
          (s.accountId &&
            contextCan(
              db,
              actor,
              "workspace.read",
              "personal_accounts",
              s.accountId,
              undefined,
              s.createdAt.slice(0, 10),
            ))),
    ),
    readings: db.data.resource_readings
      .filter(
        (r) =>
          ids.has(r.meterId) &&
          contextCan(
            db,
            actor,
            "workspace.read",
            "meters",
            r.meterId,
            undefined,
            r.period + "-01",
          ),
      )
      .map(({ allocations, amount, tariff, unallocated, ...r }) => r),
  };
}
