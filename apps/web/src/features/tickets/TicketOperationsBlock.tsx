import { useWorkspace } from "../../app/WorkspaceContext";
import { TicketOperations } from "../../Operations";
import { formatDateTime, getSlaState } from "../../shared/format";
import { type Ticket } from "../../shared/types";
import { Input } from "../../ui";
export function TicketOperationsBlock({ ticket }: { ticket: Ticket }) {
  const {
    locale,
    isManagerShell,
    session,
    overview,
    operations,
    refreshWorkspace,
    setSelectedSection,
    openTicketDetail,
    tickets,
    isTenant,
    canUpdateTickets,
    busyAction,
    toggleChecklistItem,
  } = useWorkspace();

  const slaState = getSlaState(ticket, locale);
  const completedCount = ticket.checklistItems.filter(
    (item) => item.completed,
  ).length;

  return (
    <div className="ticket-ops">
      {!isManagerShell && session && overview ? (
        <TicketOperations
          token={session.token}
          ticket={ticket}
          overview={overview}
          operations={operations}
          onRefresh={refreshWorkspace}
          onUnit={() => setSelectedSection("portfolio")}
          onTenant={() => setSelectedSection("leases")}
          onTicket={openTicketDetail}
          tickets={tickets}
          readOnly={isTenant}
          canEditLinks={false}
        />
      ) : null}
      <div className="ticket-ops-summary">
        <span className={`status-pill status-pill--${slaState.tone}`}>
          {slaState.label}
        </span>
        <strong>
          {ticket.slaDueAt ? formatDateTime(ticket.slaDueAt, locale) : "—"}
        </strong>
        <small>
          {completedCount}/{ticket.checklistItems.length}{" "}
          {locale === "ru" ? "пунктов" : "items"}
        </small>
      </div>
      <div className="checklist">
        {ticket.checklistItems.map((item) => (
          <label
            className={
              item.completed
                ? "checklist-item checklist-item--done"
                : "checklist-item"
            }
            key={item.id}
          >
            <Input
              checked={item.completed}
              disabled={
                !canUpdateTickets ||
                busyAction === `ticket-checklist-${item.id}`
              }
              onChange={() => void toggleChecklistItem(ticket.id, item)}
              type="checkbox"
            />
            <span>{item.label}</span>
            {item.completedByName ? (
              <small>{item.completedByName}</small>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  );
}
