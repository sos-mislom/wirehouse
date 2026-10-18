import { hasPermission } from "../../../../packages/contracts/src/permissions.ts";

export function routePermission(method, path) {
  if (/^\/api\/(auth|integrations)\//.test(path)) return null;
  if (method === "GET" || method === "HEAD")
    return path.startsWith("/api/audit") ? "audit.read" : "workspace.read";
  if (/^\/api\/maintenance\/tickets\/[^/]+\/change$/.test(path))
    return "workspace.read";
  if (/^\/api\/maintenance-import\//.test(path)) return "maintenance.write";
  if (/^\/api\/documents/.test(path)) return "workspace.read";
  if (/^\/api\/leases\/[^/]+\/documents(?:\/[^/]+)?$/.test(path))
    return "documents.write";
  if (/^\/api\/tickets\/[^/]+\/workflow\//.test(path)) return "workspace.read";
  if (/^\/api\/readings\/periods/.test(path)) return "meters.write";
  if (/^\/api\/readings\/submissions\/[^/]+\/review/.test(path))
    return "readings.review";
  if (/^\/api\/readings\/submissions/.test(path)) return "readings.submit";
  if (/^\/api\/access\//.test(path)) return "permissions.manage";
  if (/^\/api\/accounting\/(sources|links)/.test(path))
    return "accounting.manage";
  if (/^\/api\/accounting\/(inbox|outbox)/.test(path)) return "exchange.manage";
  if (/^\/api\/accounting\/accounts/.test(path)) return "leases.write";
  if (/^\/api\/users/.test(path)) return "users.manage";
  if (/^\/api\/structure|^\/api\/operations\/floorplans/.test(path))
    return "plans.write";
  if (/^\/api\/estimates\/[^/]+\/(approve|reject|act)$/.test(path))
    return "estimates.approve";
  if (/^\/api\/estimates/.test(path)) return "estimates.write";
  if (/^\/api\/maintenance\/(materials|contractors)/.test(path))
    return "services.write";
  if (/^\/api\/operations\/plans|^\/api\/maintenance/.test(path))
    return "maintenance.write";
  if (/^\/api\/operations\/equipment/.test(path)) return "equipment.write";
  if (/^\/api\/operations\/services|^\/api\/(materials|contractors)/.test(path))
    return "services.write";
  if (/^\/api\/operations\/news/.test(path)) return "news.write";
  if (/^\/api\/operations\/expenses/.test(path)) return "expenses.write";
  if (/^\/api\/(operations\/meters|meter-readings)/.test(path))
    return "meters.write";
  if (/^\/api\/(operations\/tickets|tickets)/.test(path))
    return "tickets.write";
  if (/^\/api\/leases/.test(path)) return "leases.write";
  if (/^\/api\/billing/.test(path)) return "billing.write";
  if (/^\/api\/(imports|import-approvals|import-batches)/.test(path))
    return "imports.write";
  if (/^\/api\/(properties|units|tenants|tenant-notes)/.test(path))
    return "portfolio.write";
  if (/^\/api\/notifications/.test(path)) return "workspace.read";
  return "permissions.manage";
}
export function assertPermission(user, permission) {
  if (!hasPermission(user, permission))
    throw Object.assign(new Error("Нет права на это действие"), {
      status: 403,
      code: "PERMISSION_DENIED",
    });
}
