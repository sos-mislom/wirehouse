import { businessError } from "./accounting.js";
const scopes = {
  property: "properties",
  unit: "units",
  lease: "leases",
  account: "personal_accounts",
};
const documentTypes = new Set([
  "properties",
  "buildings",
  "units",
  "equipment",
  "leases",
  "personal_accounts",
  "tickets",
  "meters",
]);
export function assertBusinessReferences(data) {
  const ids = new Map(
    Object.entries(data).map(([key, rows]) => [
      key,
      new Set(rows.map((r) => r.id)),
    ]),
  );
  const exists = (table, id) => ids.get(table)?.has(id);
  for (const team of data.service_teams)
    if (team.memberIds.some((id) => !exists("users", id)))
      throw businessError("Участник службы не найден", 409, "LINKED_DISPATCH");
  for (const rule of data.dispatch_rules)
    if (
      data.service_teams.find((t) => t.id === rule.teamId)?.propertyId !==
      rule.propertyId
    )
      throw businessError(
        "Служба другого объекта",
        409,
        "DISPATCH_CONTEXT_MISMATCH",
      );
  for (const workflow of data.ticket_workflows)
    if (
      workflow.teamId &&
      data.service_teams.find((t) => t.id === workflow.teamId)?.propertyId !==
        data.tickets.find((t) => t.id === workflow.ticketId)?.property_id
    )
      throw businessError(
        "Служба процесса другого объекта",
        409,
        "DISPATCH_CONTEXT_MISMATCH",
      );
  for (const row of data.ticket_workflows)
    if (
      row.estimateId &&
      data.estimates.find((e) => e.id === row.estimateId)?.ticketId !==
        row.ticketId
    )
      throw businessError(
        "Смета должна относиться к заявке процесса",
        409,
        "ESTIMATE_CONTEXT_MISMATCH",
      );
  for (const row of data.user_assignments)
    if (!exists(scopes[row.scopeType], row.scopeId))
      throw businessError(
        "Нельзя удалить запись с историей назначенного доступа",
        409,
        "LINKED_ACCESS",
      );
  for (const row of data.external_links)
    if (
      (!documentTypes.has(row.entityType) && row.entityType !== "tenants") ||
      !exists(row.entityType, row.localId)
    )
      throw businessError(
        "Нельзя удалить запись, сопоставленную с источником учета",
        409,
        "LINKED_ACCOUNTING",
      );
  for (const row of data.document_links)
    if (
      !documentTypes.has(row.entityType) ||
      !exists(row.entityType, row.entityId)
    )
      throw businessError(
        "Нельзя удалить запись со связанными документами",
        409,
        "LINKED_DOCUMENTS",
      );
}
