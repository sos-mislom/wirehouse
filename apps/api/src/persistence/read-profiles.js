import { tables } from "./schema.js";

const access = [
  "users",
  "properties",
  "units",
  "leases",
  "user_assignments",
  "personal_accounts",
  "accounting_sources",
];
// Workspace responses still need their related entities, but never the transport
// payloads or authentication challenges. Focused reads declare a smaller model.
const workspace = Object.keys(tables).filter(
  (name) =>
    !["exchange_inbox", "exchange_outbox", "auth_challenges"].includes(name),
);
export function readCollectionsFor(pathname) {
  if (pathname === "/api/auth/tenant/onboarding") return [];
  if (
    [
      "/api/auth/me",
      "/api/audit",
      "/api/accounting/exchange",
      "/api/system/readiness",
    ].includes(pathname)
  )
    return ["users"];
  if (pathname === "/api/structure")
    return [...access, "buildings", "entrances", "floors"];
  if (pathname === "/api/accounting")
    return [...access, "account_statements", "external_links"];
  if (pathname === "/api/maintenance")
    return [
      ...access,
      "tickets",
      "ticket_workflows",
      "estimates",
      "service_acts",
      "maintenance_templates",
      "materials",
      "contractors",
    ];
  return workspace;
}
