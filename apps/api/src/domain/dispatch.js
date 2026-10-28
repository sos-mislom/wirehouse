import crypto from "node:crypto";
import { contextCan, requireContext } from "./context-access.js";
import { businessError, requiredRecord } from "./accounting.js";
import { nextVersionTime } from "./version-time.js";
import {
  teamInput,
  dispatchRuleInput,
} from "../../../../packages/contracts/src/business-workflows.ts";
import { parseDto } from "../http/body.js";

export function dispatchWorkspace(db, actor) {
  const allowed = (id) =>
    contextCan(db, actor, "services.write", "properties", id) &&
    ["admin", "manager"].includes(actor.role);
  return {
    teams: db.data.service_teams.filter((r) => allowed(r.propertyId)),
    rules: db.data.dispatch_rules.filter((r) => allowed(r.propertyId)),
  };
}
export function saveDispatch(db, actor, kind, id, input) {
  if (!["admin", "manager"].includes(actor.role))
    throw businessError("Диспетчеризацию настраивает руководитель", 403);
  const body = parseDto(
    kind === "teams" ? teamInput : dispatchRuleInput,
    input,
  );
  requireContext(db, actor, "services.write", "properties", body.propertyId);
  const table = kind === "teams" ? "service_teams" : "dispatch_rules";
  const current = id ? requiredRecord(db, table, id) : null;
  if (
    current &&
    (current.propertyId !== body.propertyId ||
      current.updatedAt !== body.updatedAt)
  )
    throw businessError("Настройка изменена. Обновите список", 409);
  if (!current && body.updatedAt !== null)
    throw businessError("Новая настройка не имеет версии", 409);
  if (kind === "teams") {
    for (const memberId of body.memberIds) {
      const user = requiredRecord(db, "users", memberId);
      if (
        user.role === "tenant" ||
        !user.is_active ||
        !contextCan(db, user, "tickets.write", "properties", body.propertyId)
      )
        throw businessError("Участник службы не имеет доступа к объекту", 409);
    }
  } else {
    const team = requiredRecord(db, "service_teams", body.teamId),
      reviewer = requiredRecord(db, "users", body.reviewerId);
    if (
      team.propertyId !== body.propertyId ||
      !team.active ||
      !reviewer.is_active ||
      !["admin", "manager"].includes(reviewer.role) ||
      !contextCan(db, reviewer, "tickets.accept", "properties", body.propertyId)
    )
      throw businessError("Служба или принимающий недоступны на объекте", 409);
    if (
      db.data.dispatch_rules.some(
        (r) =>
          r.id !== id &&
          r.propertyId === body.propertyId &&
          r.category === body.category,
      )
    )
      throw businessError("Для категории уже задан маршрут", 409);
  }
  const { updatedAt, ...values } = body;
  const row = {
    ...values,
    id: id ?? crypto.randomUUID(),
    updatedAt: current
      ? nextVersionTime(current.updatedAt)
      : new Date().toISOString(),
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
  if (current) Object.assign(current, row);
  else db.data[table].push(row);
  return row;
}
export function routeTicket(db, ticket, w) {
  const rule = db.data.dispatch_rules.find(
    (r) =>
      r.active &&
      r.propertyId === ticket.property_id &&
      r.category === ticket.category,
  );
  w.teamId = rule?.teamId ?? null;
  w.reviewerId = rule?.reviewerId ?? null;
  validateDispatchAssignment(db, ticket, w);
}
export function validateDispatchAssignment(db, ticket, w) {
  if (!w.teamId || !ticket.assigned_to) return;
  const team = requiredRecord(db, "service_teams", w.teamId);
  if (!team.active || !team.memberIds.includes(ticket.assigned_to))
    throw businessError("Выберите исполнителя из назначенной службы", 409);
  if (w.reviewerId === ticket.assigned_to)
    throw businessError(
      "Исполнитель и принимающий должны быть разными сотрудниками",
      409,
    );
}
export function canReviewRoutedTicket(db, actor, ticket, w) {
  return (
    (!w.reviewerId || w.reviewerId === actor.id) &&
    contextCan(db, actor, "tickets.accept", "tickets", ticket.id)
  );
}
