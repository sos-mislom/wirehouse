import { isOpenTicket } from "../../../packages/contracts/src/domain.js";
import { RequestError } from "./http/body.js";
const dayMs = 86400000;
const iso = (date) => date.toISOString().slice(0, 10);
const requireStaff = (user) => {
  if (!["admin", "manager"].includes(user.role))
    throw new RequestError("Нет доступа к срокам портфеля", 403, "FORBIDDEN");
};
const inScope = (user, propertyId) =>
  user.role === "admin" ||
  Boolean(user.property_id && user.property_id === propertyId);
const renewal = (db, leaseId) => {
  const record = db.data.lease_followups.find((r) => r.leaseId === leaseId);
  return record
    ? {
        status: record.status,
        note: record.note,
        version: record.version,
        updatedAt: record.updatedAt,
        updatedByName: db.getUserById(record.updatedBy)?.full_name ?? null,
      }
    : {
        status: "pending",
        note: "",
        version: 0,
        updatedAt: null,
        updatedByName: null,
      };
};
/** @returns {import('../../../packages/contracts/src/agenda.ts').AgendaDto} */
export function getAgenda(
  db,
  user,
  { days = 30, propertyId } = {},
  now = new Date(),
) {
  requireStaff(user);
  if (propertyId && !inScope(user, propertyId))
    throw new RequestError("Нет доступа к объекту", 403, "FORBIDDEN");
  const asOf = iso(now);
  const start = Date.parse(asOf);
  const until = iso(new Date(start + days * dayMs));
  const items = [];
  const visible = (p) => inScope(user, p) && (!propertyId || p === propertyId);
  function add(kind, recordId, title, date, unitId, extra = {}) {
    if (!date || date.slice(0, 10) > until) return;
    const unit = db.getById("units", unitId);
    const property = db.getById(
      "properties",
      unit?.property_id ?? extra.propertyId,
    );
    if (!property || !visible(property.id)) return;
    const due = date.slice(0, 10);
    const daysLeft = Math.round((Date.parse(due) - start) / dayMs);
    items.push({
      id: `${kind}-${recordId}`,
      kind,
      entityId: recordId,
      title,
      date: due,
      daysLeft,
      overdue: daysLeft < 0,
      propertyId: property.id,
      propertyName: property.name,
      unitId: unit?.id ?? null,
      unitNumber: unit?.number ?? null,
      tenantName: null,
      amount: null,
      renewal: null,
      ...extra,
    });
  }
  const liveStages = new Set(["signed", "active", "prolongation"]);
  for (const lease of db.data.leases) {
    if (!liveStages.has(lease.stage)) continue;
    const hasSuccessor = db.data.leases.some(
      (next) =>
        next.id !== lease.id &&
        next.unit_id === lease.unit_id &&
        liveStages.has(next.stage) &&
        next.start_date > lease.end_date,
    );
    if (!hasSuccessor)
      add(
        "lease",
        lease.id,
        `Договор ${lease.contract_number}`,
        lease.end_date,
        lease.unit_id,
        {
          tenantName: db.getTenant(lease.tenant_id)?.name ?? null,
          renewal: renewal(db, lease.id),
        },
      );
  }
  for (const invoice of db.data.billing_invoices) {
    const lease = db.getById("leases", invoice.lease_id);
    if (!lease) continue;
    const paid = db.data.billing_payments
      .filter((p) => p.invoice_id === invoice.id)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const amount =
      Math.round((Number(invoice.total_amount) - paid) * 100) / 100;
    if (amount > 0)
      add(
        "payment",
        invoice.id,
        `Оплата за ${invoice.period}`,
        invoice.due_date,
        lease.unit_id,
        { tenantName: db.getTenant(lease.tenant_id)?.name ?? null, amount },
      );
  }
  for (const plan of db.data.maintenance_plans)
    if (plan.active)
      add("maintenance", plan.id, plan.name, plan.nextDate, plan.unitId);
  for (const ticket of db.data.tickets)
    if (isOpenTicket(ticket.status))
      add("ticket", ticket.id, ticket.title, ticket.sla_due_at, ticket.unit_id);
  for (const asset of db.data.equipment)
    if (
      asset.status !== "retired" &&
      asset.warrantyUntil &&
      asset.warrantyUntil >= asOf
    )
      add(
        "warranty",
        asset.id,
        `Гарантия: ${asset.name}`,
        asset.warrantyUntil,
        asset.unitId,
      );
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
  return {
    asOf,
    until,
    items,
    counts: Object.fromEntries(
      ["lease", "payment", "maintenance", "ticket", "warranty"].map((kind) => [
        kind,
        items.filter((x) => x.kind === kind).length,
      ]),
    ),
  };
}
export function updateRenewal(db, user, leaseId, body) {
  requireStaff(user);
  const lease = db.getById("leases", leaseId);
  if (!lease) throw new RequestError("Договор не найден", 404, "NOT_FOUND");
  const propertyId = db.getUnitById(lease.unit_id)?.property_id;
  if (!inScope(user, propertyId))
    throw new RequestError("Нет доступа к договору", 403, "FORBIDDEN");
  if (!["signed", "active", "prolongation"].includes(lease.stage))
    throw new RequestError(
      "Контроль продления доступен для действующего договора",
      409,
      "LEASE_NOT_ACTIVE",
    );
  return db.transaction(() => {
    const current = db.data.lease_followups.find((r) => r.leaseId === leaseId);
    if ((current?.version ?? 0) !== body.version)
      throw new RequestError(
        "Запись изменена другим сотрудником. Обновите список и повторите изменение.",
        409,
        "VERSION_CONFLICT",
      );
    const record = {
      leaseId,
      status: body.status,
      note: body.note,
      version: body.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };
    db.audit(user, "lease_renewal_updated", "lease", leaseId, {
      before: current ? structuredClone(current) : null,
      after: record,
    });
    if (current) Object.assign(current, record);
    else db.data.lease_followups.push(record);
    return renewal(db, leaseId);
  });
}
function escapeIcs(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function foldIcs(line) {
  let result = "",
    bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += size;
  }
  return result;
}
export function agendaIcs(agenda, now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wirehouse//Agenda//RU",
    "CALSCALE:GREGORIAN",
  ];
  for (const item of agenda.items) {
    const next = iso(new Date(Date.parse(item.date) + dayMs));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@wirehouse`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${next.replaceAll("-", "")}`,
      `SUMMARY:${escapeIcs(item.title)}`,
      `LOCATION:${escapeIcs([item.propertyName, item.unitNumber].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${escapeIcs(item.tenantName ?? "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcs).join("\r\n") + "\r\n";
}
