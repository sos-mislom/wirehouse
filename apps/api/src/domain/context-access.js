import crypto from "node:crypto";
import {
  hasPermission,
  rolePermissions,
} from "../../../../packages/contracts/src/permissions.ts";
import {
  assignmentInput,
  businessRolePermissions,
} from "../../../../packages/contracts/src/access.ts";
import { parseDto } from "../http/body.js";
import { businessError, requiredRecord, currentRecord } from "./accounting.js";
const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const readPermissions = new Set([
  "workspace.read",
  "finance.read",
  "documents.read",
]);
const scopeTables = {
  property: "properties",
  unit: "units",
  lease: "leases",
  account: "personal_accounts",
};
export function entityContext(db, type, id) {
  const row = db.getById(type, id);
  if (!row) return null;
  if (type === "properties")
    return { propertyId: id, unitId: null, leaseIds: [], accountId: null };
  if (type === "personal_accounts") {
    const context = entityContext(db, "leases", row.leaseId);
    return context ? { ...context, accountId: row.id } : null;
  }
  if (type === "leases") {
    const unit = db.getById("units", row.unit_id);
    return unit
      ? {
          propertyId: unit.property_id,
          unitId: unit.id,
          leaseIds: [row.id],
          accountId: null,
        }
      : null;
  }
  if (type === "units")
    return {
      propertyId: row.property_id,
      unitId: row.id,
      leaseIds: db.data.leases.filter((l) => l.unit_id === id).map((l) => l.id),
      accountId: null,
    };
  if (type === "tickets")
    return {
      propertyId: row.property_id,
      unitId: row.unit_id,
      leaseIds: row.lease_id ? [row.lease_id] : [],
      accountId:
        db.data.ticket_workflows.find((w) => w.ticketId === row.id)
          ?.accountId ?? null,
    };
  if (["equipment", "meters", "maintenance_plans"].includes(type))
    return {
      propertyId: row.propertyId,
      unitId: row.unitId ?? null,
      leaseIds: row.unitId
        ? db.data.leases
            .filter((l) => l.unit_id === row.unitId)
            .map((l) => l.id)
        : [],
      accountId: null,
    };
  return null;
}
function usable(db, assignment, permission, at, occurredOn = null) {
  if (
    assignment.revokedAt ||
    assignment.validFrom > at ||
    !assignment.permissions.includes(permission)
  )
    return false;
  let end = assignment.validTo;
  if (assignment.businessRole === "tenant") {
    const ctx = entityContext(
      db,
      scopeTables[assignment.scopeType],
      assignment.scopeId,
    );
    const leases = (ctx?.leaseIds ?? [])
      .map((id) => db.getById("leases", id))
      .filter(Boolean);
    if (
      !readPermissions.has(permission) &&
      (!leases.length ||
        !leases.some(
          (l) =>
            ["signed", "active", "prolongation"].includes(l.stage) &&
            l.start_date <= at &&
            l.end_date >= at,
        ))
    )
      return false;
    if (leases[0] && (!end || leases[0].end_date < end))
      end = leases[0].end_date;
  }
  return (
    !end ||
    end >= at ||
    (assignment.retainHistory &&
      readPermissions.has(permission) &&
      (!occurredOn || occurredOn <= end))
  );
}
function matches(db, a, ctx, permission) {
  const financial =
    permission === "finance.read" ||
    permission === "work.approve" ||
    (permission === "documents.read" && ctx.accountId);
  if (
    financial &&
    ["owner", "tenant"].includes(a.businessRole) &&
    ["property", "unit"].includes(a.scopeType)
  )
    return false;
  if (a.scopeType === "property") return a.scopeId === ctx.propertyId;
  if (a.scopeType === "unit") return a.scopeId === ctx.unitId;
  if (a.scopeType === "lease") return ctx.leaseIds.includes(a.scopeId);
  if (ctx.accountId) return a.scopeId === ctx.accountId;
  return (
    !financial &&
    ctx.leaseIds.includes(db.getById("personal_accounts", a.scopeId)?.leaseId)
  );
}
export function contextCan(
  db,
  actor,
  permission,
  type,
  id,
  at = day(),
  occurredOn = null,
) {
  if (!actor || actor.is_active === 0 || !hasPermission(actor, permission))
    return false;
  if (
    type === "tickets" &&
    actor.role === "worker" &&
    db.getById("tickets", id)?.assigned_to !== actor.id
  )
    return false;
  if (type === "personal_accounts" && !readPermissions.has(permission)) {
    const account = db.getById(type, id);
    if (
      !account ||
      account.status !== "active" ||
      account.validFrom > at ||
      (account.validTo && account.validTo < at) ||
      !db.getById("accounting_sources", account.sourceId)?.active
    )
      return false;
  }
  if (actor.role === "admin") return true;
  const ctx = entityContext(db, type, id);
  if (!ctx) return false;
  const recordDay =
    occurredOn ??
    (["tickets", "equipment", "maintenance_plans"].includes(type)
      ? (
          db.getById(type, id).created_at ?? db.getById(type, id).createdAt
        )?.slice(0, 10)
      : null);
  return db.data.user_assignments.some(
    (a) =>
      a.userId === actor.id &&
      usable(db, a, permission, at, recordDay) &&
      matches(db, a, ctx, permission),
  );
}
export function canSeeProperty(db, actor, propertyId) {
  if (actor.role === "admin") return true;
  return db.data.user_assignments.some(
    (a) =>
      a.userId === actor.id &&
      usable(db, a, "workspace.read", day()) &&
      entityContext(db, scopeTables[a.scopeType], a.scopeId)?.propertyId ===
        propertyId,
  );
}
export function requireContext(db, actor, permission, type, id) {
  if (!contextCan(db, actor, permission, type, id))
    throw businessError(
      "Нет разрешения на действие в этом контексте",
      403,
      "CONTEXT_PERMISSION_DENIED",
    );
}
export function saveAssignment(db, actor, id, input) {
  if (!hasPermission(actor, "permissions.manage"))
    throw businessError("Нет права назначать доступ", 403);
  const body = parseDto(assignmentInput, input),
    user = requiredRecord(db, "users", body.userId),
    old = id ? currentRecord(db, "user_assignments", id, body.updatedAt) : null;
  if (user.role === "admin")
    throw businessError("Права администратора задаются его ролью");
  if (body.userId === actor.id)
    throw businessError(
      "Собственные назначения изменяет другой администратор",
      403,
    );
  const allowedRole = ["owner", "tenant"].includes(body.businessRole)
    ? "tenant"
    : body.businessRole;
  if (
    body.businessRole === "tenant" &&
    !["lease", "account"].includes(body.scopeType)
  )
    throw businessError("Арендатору назначают доступ по договору или ЛС");
  if (user.role !== allowedRole)
    throw businessError("Назначение не соответствует типу учетной записи");
  requiredRecord(db, scopeTables[body.scopeType], body.scopeId);
  if (
    body.permissions.some(
      (p) => !businessRolePermissions[body.businessRole].includes(p),
    )
  )
    throw businessError("Право недоступно этой бизнес-роли");
  if (
    ["owner", "tenant"].includes(body.businessRole) &&
    body.permissions.some((p) =>
      ["finance.read", "work.approve"].includes(p),
    ) &&
    !["lease", "account"].includes(body.scopeType)
  )
    throw businessError(
      "Финансы и согласование назначаются на договор или конкретный ЛС",
    );
  if (
    old &&
    (old.userId !== body.userId ||
      old.scopeId !== body.scopeId ||
      old.scopeType !== body.scopeType ||
      old.revokedAt)
  )
    throw businessError("Область или отозванное назначение менять нельзя", 409);
  if (
    db.data.user_assignments.some(
      (a) =>
        a.id !== id &&
        !a.revokedAt &&
        a.userId === body.userId &&
        a.businessRole === body.businessRole &&
        a.scopeType === body.scopeType &&
        a.scopeId === body.scopeId &&
        (!a.validTo || a.validTo >= body.validFrom) &&
        (!body.validTo || body.validTo >= a.validFrom),
    )
  )
    throw businessError("Период пересекается с существующим назначением", 409);
  const row = {
    ...body,
    id: id ?? crypto.randomUUID(),
    origin: old?.origin
      ? old.origin.endsWith("_custom") || old.origin === "manual"
        ? old.origin
        : old.origin + "_custom"
      : "manual",
    createdBy: old?.createdBy ?? actor.id,
    createdAt: old?.createdAt ?? now(),
    updatedAt: now(),
    revokedAt: null,
    revokedBy: null,
  };
  if (old) Object.assign(old, row);
  else db.data.user_assignments.push(row);
  return row;
}
export function revokeAssignment(db, actor, id, reason) {
  if (!hasPermission(actor, "permissions.manage"))
    throw businessError("Нет права отзывать доступ", 403);
  const row = requiredRecord(db, "user_assignments", id);
  if (row.userId === actor.id)
    throw businessError(
      "Собственный доступ изменяет другой администратор",
      403,
    );
  if (!reason?.trim()) throw businessError("Укажите причину отзыва");
  if (!row.revokedAt) {
    row.revokedAt = now();
    row.revokedBy = actor.id;
    row.reason = reason;
    row.updatedAt = now();
  }
  return row;
}
export function syncStaffAssignment(db, user) {
  const old = db.data.user_assignments.find(
    (a) => a.userId === user.id && a.origin.startsWith("staff_record"),
  );
  if (!["manager", "worker"].includes(user.role) || !user.property_id) {
    if (old && !old.revokedAt) {
      old.revokedAt = now();
      old.updatedAt = now();
    }
    return;
  }
  if (old?.origin === "staff_record_custom") {
    if (old.scopeId !== user.property_id || old.businessRole !== user.role) {
      old.revokedAt = now();
      old.updatedAt = now();
    }
    return;
  }
  const body = {
    userId: user.id,
    businessRole: user.role,
    scopeType: "property",
    scopeId: user.property_id,
    permissions: [...rolePermissions[user.role]],
    validFrom: user.created_at.slice(0, 10),
    validTo: null,
    retainHistory: true,
    origin: "staff_record",
    reason: "Назначение сотрудника на объект",
    createdBy: old?.createdBy ?? null,
    revokedBy: old?.revokedBy ?? null,
  };
  if (old) Object.assign(old, body, { updatedAt: now() });
  else
    db.data.user_assignments.push({
      ...body,
      id: crypto.randomUUID(),
      createdAt: now(),
      updatedAt: now(),
      revokedAt: null,
    });
}
export function syncLeaseAssignments(db, lease) {
  for (const a of db.data.user_assignments.filter(
    (a) =>
      a.origin.startsWith("lease_record") &&
      a.scopeId === lease.id &&
      !a.revokedAt,
  )) {
    if (db.getById("users", a.userId)?.tenant_id !== lease.tenant_id) {
      a.revokedAt = now();
      a.updatedAt = now();
    }
  }
  for (const user of db.data.users.filter(
    (u) => u.role === "tenant" && u.tenant_id === lease.tenant_id,
  )) {
    const old = db.data.user_assignments.find(
      (a) =>
        a.userId === user.id &&
        a.scopeType === "lease" &&
        a.scopeId === lease.id &&
        a.origin.startsWith("lease_record"),
    );
    if (old?.origin === "lease_record_custom") continue;
    const body = {
      userId: user.id,
      businessRole: "tenant",
      scopeType: "lease",
      scopeId: lease.id,
      permissions: [...businessRolePermissions.tenant],
      validFrom: lease.start_date,
      validTo: lease.end_date,
      retainHistory: true,
      origin: "lease_record",
      reason: "Доступ участника договора",
      createdBy: old?.createdBy ?? null,
      revokedBy: old?.revokedBy ?? null,
    };
    if (old) Object.assign(old, body, { updatedAt: now() });
    else
      db.data.user_assignments.push({
        ...body,
        id: crypto.randomUUID(),
        createdAt: now(),
        updatedAt: now(),
        revokedAt: null,
      });
  }
}
