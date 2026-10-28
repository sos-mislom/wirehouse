import { contextCan } from "./context-access.js";
import { workflowFor } from "./ticket-workflow.js";
import { canReviewRoutedTicket } from "./dispatch.js";
export function presentTicket(db, actor, ticket) {
  const financialAccess = contextCan(
    db,
    actor,
    "finance.read",
    "tickets",
    ticket.id,
  );
  return {
    ...ticket,
    financialAccess,
    workLogs: financialAccess
      ? ticket.workLogs
      : (ticket.workLogs ?? []).map(
          ({ cost, hourlyRate, materialCost, ...log }) => log,
        ),
  };
}
export function workflowView(db, actor, id) {
  const w = workflowFor(db, id),
    ticket = db.getById("tickets", id);
  const approve = Boolean(
    w.accountId &&
    contextCan(db, actor, "work.approve", "personal_accounts", w.accountId),
  );
  const financial =
    contextCan(db, actor, "finance.read", "tickets", id) || approve;
  return {
    item: {
      ...w,
      amount: financial ? w.amount : null,
      accountId: financial ? w.accountId : null,
    },
    capabilities: {
      approve,
      accept: canReviewRoutedTicket(db, actor, ticket, w),
      execute:
        actor.role !== "tenant" &&
        contextCan(db, actor, "tickets.write", "tickets", id) &&
        (actor.role !== "worker" || ticket.assigned_to === actor.id),
      terms:
        financial && contextCan(db, actor, "services.write", "tickets", id),
    },
    decisions: db.data.ticket_decisions
      .filter((d) => d.ticketId === id)
      .map(({ snapshot, ...d }) => d),
  };
}
