import crypto from "node:crypto";
import { contextCan, entityContext } from "./context-access.js";
import { businessError, requiredRecord } from "./accounting.js";
const now = () => new Date().toISOString();
const publicDocument = ({ storedName, storageKind, ...row }, links) => ({
  ...row,
  links,
});
export function canReadDocument(db, actor, documentId) {
  const document = db.getById("entity_documents", documentId);
  return Boolean(
    document &&
    db.data.document_links.some(
      (l) => l.documentId === documentId && canReadLink(db, actor, document, l),
    ),
  );
}
function canReadLink(db, actor, document, link) {
  const at = document.createdAt.slice(0, 10);
  return (
    contextCan(
      db,
      actor,
      "documents.read",
      link.entityType,
      link.entityId,
      undefined,
      at,
    ) &&
    (!["act", "contract", "lease", "invoice", "payment", "receipt"].includes(
      document.category,
    ) ||
      contextCan(
        db,
        actor,
        "finance.read",
        link.entityType,
        link.entityId,
        undefined,
        at,
      ))
  );
}
export function listDocuments(db, actor) {
  return db.data.entity_documents
    .filter((d) => canReadDocument(db, actor, d.id))
    .map((d) =>
      publicDocument(
        d,
        db.data.document_links.filter(
          (l) => l.documentId === d.id && canReadLink(db, actor, d, l),
        ),
      ),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function validateDocumentLinks(db, actor, body) {
  let propertyId = null;
  const seen = new Set();
  return {
    links: body.links.map((link) => {
      const ctx = entityContext(db, link.entityType, link.entityId);
      if (!ctx) throw businessError("Не найдена связь документа", 404);
      const writePermission =
        link.entityType === "tickets"
          ? "tickets.write"
          : link.entityType === "meters" && body.category === "photo"
            ? "readings.submit"
            : "documents.write";
      if (
        !contextCan(db, actor, writePermission, link.entityType, link.entityId)
      )
        throw businessError(
          "Нет права прикрепить документ в этом контексте",
          403,
        );
      if (
        actor.role === "worker" &&
        link.entityType === "tickets" &&
        requiredRecord(db, "tickets", link.entityId).assigned_to !== actor.id
      )
        throw businessError("Заявка назначена другому исполнителю", 403);
      if (propertyId && propertyId !== ctx.propertyId)
        throw businessError(
          "Связи документа должны относиться к одному объекту",
        );
      propertyId = ctx.propertyId;
      const key = link.entityType + ":" + link.entityId;
      if (seen.has(key)) throw businessError("Связь повторяется");
      seen.add(key);
      let revision = null;
      if (link.phase !== "general") {
        if (
          link.entityType !== "tickets" ||
          body.category !== "photo" ||
          !body.mimeType.startsWith("image/")
        )
          throw businessError("Фото этапа прикрепляют к заявке");
        const workflow = db.data.ticket_workflows.find(
          (w) => w.ticketId === link.entityId,
        );
        if (!workflow) throw businessError("Отсутствует процесс заявки", 409);
        if (["accepted", "closed", "rejected"].includes(workflow.state))
          throw businessError("Заявка уже завершена", 409);
        if (
          link.phase === "after" &&
          !["in_progress", "paused"].includes(workflow.state)
        )
          throw businessError(
            "Фото результата добавляют после начала работ",
            409,
          );
        revision =
          link.phase === "before"
            ? workflow.termsVersion
            : workflow.resultVersion;
      }
      return { ...link, propertyId, revision };
    }),
    get propertyId() {
      return propertyId;
    },
  };
}
export function registerDocument(db, actor, body, storedName, sizeBytes) {
  const validated = validateDocumentLinks(db, actor, body),
    stamp = now(),
    id = crypto.randomUUID();
  const row = {
    id,
    propertyId: validated.propertyId,
    name: body.name,
    category: body.category,
    storedName,
    storageKind: "documents",
    mimeType: body.mimeType,
    url: null,
    uploadedBy: actor.id,
    sizeBytes,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.data.entity_documents.push(row);
  for (const { propertyId, ...link } of validated.links)
    db.data.document_links.push({
      ...link,
      id: crypto.randomUUID(),
      documentId: id,
      createdAt: stamp,
    });
  return publicDocument(
    row,
    db.data.document_links.filter((l) => l.documentId === id),
  );
}
export function registerExistingDocument(db, type, record) {
  const isTicket = type === "tickets",
    entityId = isTicket ? record.ticket_id : record.lease_id;
  const ctx = entityContext(db, type, entityId);
  if (!ctx || !record.uploaded_by) return;
  const stamp = record.created_at;
  db.data.entity_documents.push({
    id: record.id,
    propertyId: ctx.propertyId,
    name: record.file_name,
    category: isTicket
      ? record.mime_type?.startsWith("image/")
        ? "photo"
        : "other"
      : record.document_category,
    storedName: record.stored_name,
    storageKind: isTicket ? "tickets" : "documents",
    mimeType: record.mime_type,
    url: null,
    uploadedBy: record.uploaded_by,
    sizeBytes: record.size_bytes,
    createdAt: stamp,
    updatedAt: stamp,
  });
  db.data.document_links.push({
    id: crypto.randomUUID(),
    documentId: record.id,
    entityType: type,
    entityId,
    phase: "general",
    revision: null,
    createdAt: stamp,
  });
}
export function removeExistingDocument(db, id) {
  if (
    db.data.reading_submissions.some((r) => r.photoDocumentId === id) ||
    db.data.document_links.some(
      (l) => l.documentId === id && l.phase !== "general",
    )
  )
    throw businessError(
      "Документ используется в процессе; удалить его нельзя",
      409,
    );
  db.data.document_links = db.data.document_links.filter(
    (l) => l.documentId !== id,
  );
  db.data.entity_documents = db.data.entity_documents.filter(
    (d) => d.id !== id,
  );
}

export function registerActDocument(db, actor, act, ticket) {
  const stamp = act.createdAt,
    docId = crypto.randomUUID();
  db.data.entity_documents.push({
    id: docId,
    propertyId: act.propertyId,
    name: act.number + ".html",
    category: "act",
    storedName: null,
    storageKind: null,
    mimeType: "text/html",
    url: "service-act:" + act.id,
    uploadedBy: actor.id,
    sizeBytes: null,
    createdAt: stamp,
    updatedAt: stamp,
  });
  const links = [{ entityType: "tickets", entityId: ticket.id }];
  if (ticket.lease_id)
    links.push({ entityType: "leases", entityId: ticket.lease_id });
  const account = db.data.ticket_workflows.find(
    (w) => w.ticketId === ticket.id,
  )?.accountId;
  if (account)
    links.push({ entityType: "personal_accounts", entityId: account });
  for (const l of links)
    db.data.document_links.push({
      ...l,
      id: crypto.randomUUID(),
      documentId: docId,
      phase: "general",
      revision: null,
      createdAt: stamp,
    });
}
const escape = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function renderServiceAct(act) {
  const s = act.snapshot;
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(act.number)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:16px;color:#222}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc;text-align:left}h1{font-size:24px}@media print{body{margin:0}}</style><h1>Акт выполненных работ ${escape(act.number)}</h1><p>Дата: ${escape(act.date)}</p><p>Объект: ${escape(s.propertyName)}<br>Заявка: ${escape(s.ticketNumber)}<br>Заказчик: ${escape(s.tenantName)}<br>Исполнитель: ${escape(s.contractorName)}</p><table><thead><tr><th>Работа / материал</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${s.lines.map((l) => `<tr><td>${escape(l.description)}</td><td>${escape(l.quantity)} ${escape(l.unit)}</td><td>${escape(l.unitPrice)}</td><td>${escape(l.total)}</td></tr>`).join("")}</tbody></table><p><strong>Итого: ${escape(act.total)} ₽</strong></p><p>Заказчик: ____________________ &nbsp; Исполнитель: ____________________</p></html>`;
}
