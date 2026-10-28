import { realtimeResources } from "../../../../packages/contracts/src/realtime.ts";
import { hasPermission } from "../../../../packages/contracts/src/permissions.ts";

const ephemeral = new Set([
  "auth_challenges",
  "password_resets",
  "bot_link_codes",
]);
export function resourcesForChanges(collections) {
  const topics = new Set();
  for (const name of collections) {
    if (ephemeral.has(name)) continue;
    if (name === "audit_log") {
      topics.add("audit");
      continue;
    }
    if (name.startsWith("exchange_")) {
      topics.add("exchange");
      continue;
    }
    // Overview and operations are aggregate read models with cross-entity totals.
    topics.add("workspace");
    topics.add("operations");
    topics.add("agenda");
    if (
      [
        "users",
        "user_assignments",
        "leases",
        "units",
        "properties",
        "personal_accounts",
        "accounting_sources",
      ].includes(name)
    ) {
      for (const topic of realtimeResources) topics.add(topic);
    }
    if (["buildings", "entrances", "floors"].includes(name))
      topics.add("structure");
    if (name === "buildings") topics.add("documents");
    if (["external_links", "account_statements"].includes(name))
      topics.add("accounting");
    if (
      [
        "entity_documents",
        "document_links",
        "ticket_attachments",
        "lease_documents",
      ].includes(name)
    )
      topics.add("documents");
    if (name.includes("reading") || name === "meters") topics.add("readings");
    if (
      name.startsWith("maintenance_") ||
      [
        "estimates",
        "service_acts",
        "materials",
        "contractors",
        "tickets",
        "ticket_workflows",
        "ticket_decisions",
      ].includes(name)
    )
      topics.add("maintenance");
    if (name.startsWith("import_")) topics.add("imports");
  }
  return [...topics];
}
export function allowedResources(user) {
  if (!hasPermission(user, "workspace.read")) return [];
  return realtimeResources.filter((topic) => {
    if (topic === "audit") return hasPermission(user, "audit.read");
    if (topic === "exchange") return hasPermission(user, "exchange.manage");
    if (topic === "access") return hasPermission(user, "permissions.manage");
    if (topic === "imports") return hasPermission(user, "imports.write");
    return true;
  });
}
