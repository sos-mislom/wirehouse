/** Shared domain rules used by the API, UI and regression tests. */
export const CLOSED_TICKET_STATUSES = new Set(['completed', 'resolved', 'closed', 'rejected']);
export const isOpenTicket = status => !CLOSED_TICKET_STATUSES.has(status);
export const isCriticalTicket = ticket => isOpenTicket(ticket.status) && ticket.priority === 'urgent';
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export function slaState(ticket, now = Date.now()) {
  if (!ticket?.slaDueAt) return { state: 'none', hours: 0 };
  if (!isOpenTicket(ticket.status)) return { state: 'finished', hours: 0 };
  const delta = new Date(ticket.slaDueAt).getTime() - now;
  if (!Number.isFinite(delta)) return { state: 'none', hours: 0 };
  return { state: delta < 0 ? 'overdue' : delta <= 7200000 ? 'warning' : 'open', hours: Math.max(1, Math.ceil(Math.abs(delta) / 3600000)) };
}
export function requireNumber(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: допустимо число от ${min} до ${max}`);
  return n;
}
export function requireDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label}: некорректная дата`);
  return value;
}
export function leaseOverlaps(a, b) {
  return a.stage !== 'terminated' && b.stage !== 'terminated' && a.start_date <= b.end_date && b.start_date <= a.end_date;
}
