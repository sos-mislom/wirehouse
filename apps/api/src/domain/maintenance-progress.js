import crypto from "node:crypto";
import { requireContext, contextCan } from "./context-access.js";
import { businessError, requiredRecord } from "./accounting.js";
export function changeMaintenanceTask(db, actor, id, body) {
  const ticket = requiredRecord(db, "tickets", id);
  if (!ticket.maintenance_plan_id)
    throw businessError("Заявка не является заданием ППР");
  requireContext(
    db,
    actor,
    body.toDate ? "maintenance.write" : "tickets.write",
    "tickets",
    id,
  );
  if (
    actor.role === "tenant" ||
    (actor.role === "worker" && ticket.assigned_to !== actor.id)
  )
    throw businessError("Замечание вносит назначенный сотрудник", 403);
  if (ticket.updated_at !== body.updatedAt)
    throw businessError("Задание изменено. Обновите данные.", 409);
  if (
    body.toDate &&
    ["completed", "closed", "rejected", "resolved"].includes(ticket.status)
  )
    throw businessError("Задание уже завершено", 409);
  const stamp = new Date().toISOString(),
    fromDate = ticket.sla_due_at;
  db.data.maintenance_changes.push({
    id: crypto.randomUUID(),
    ticketId: id,
    actorId: actor.id,
    reason: body.reason,
    remark: body.remark,
    fromDate: body.toDate ? fromDate : null,
    toDate: body.toDate,
    createdAt: stamp,
  });
  if (body.toDate) ticket.sla_due_at = body.toDate;
  ticket.updated_at = stamp;
  return ticket;
}
export function maintenanceProgress(db, actor) {
  const items = db.data.tickets
    .filter(
      (t) =>
        t.maintenance_plan_id &&
        contextCan(db, actor, "workspace.read", "tickets", t.id),
    )
    .map((t) => ({
      ticketId: t.id,
      number: t.number,
      title: t.title,
      planId: t.maintenance_plan_id,
      plannedOn: t.maintenance_date,
      dueAt: t.sla_due_at,
      completedAt: ["completed", "closed", "resolved"].includes(t.status)
        ? t.resolved_at
        : null,
      status: t.status,
      updatedAt: t.updated_at,
      overdue: !t.resolved_at && t.sla_due_at < new Date().toISOString(),
      changes: db.data.maintenance_changes.filter((c) => c.ticketId === t.id),
    }));
  return {
    items,
    summary: {
      planned: items.length,
      completed: items.filter((t) => t.completedAt).length,
      overdue: items.filter((t) => t.overdue).length,
      rescheduled: items.filter((t) => t.changes.some((c) => c.toDate)).length,
    },
  };
}
