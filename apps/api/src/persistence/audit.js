import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
// Authentication material and upload contents must never be copied to history.
const excluded = new Set([
  "audit_log",
  "auth_challenges",
  "bot_link_codes",
  "password_resets",
  "notification_reads",
]);
const privateKey =
  /password|secret|token|hash|content_base64|contentBase64|image|photo_url|photoUrl|stored_name/i;
function safe(value) {
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        privateKey.test(key) ? (item ? "[скрыто]" : null) : safe(item),
      ]),
    );
  return value;
}
export function appendAudit(
  before,
  after,
  { actor = null, requestId = crypto.randomUUID(), source = "system" } = {},
) {
  for (const [entityType, rows] of Object.entries(after)) {
    if (excluded.has(entityType)) continue;
    const previous = new Map(
      before[entityType].map((row) => [row.id ?? row.leaseId, row]),
    );
    const current = new Map(rows.map((row) => [row.id ?? row.leaseId, row]));
    for (const entityId of new Set([...previous.keys(), ...current.keys()])) {
      const old = previous.get(entityId),
        next = current.get(entityId);
      if (isDeepStrictEqual(old, next)) continue;
      after.audit_log.push({
        id: crypto.randomUUID(),
        actorId: actor?.id ?? null,
        actorName: actor?.full_name ?? "Система",
        action: !old ? "created" : !next ? "deleted" : "updated",
        entityType,
        entityId,
        changes: {
          before: safe(old ?? null),
          after: safe(next ?? null),
          requestId,
          source,
        },
        createdAt: new Date().toISOString(),
      });
    }
  }
}
