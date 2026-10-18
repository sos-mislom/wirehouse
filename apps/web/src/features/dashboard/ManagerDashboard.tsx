import {
  isCriticalTicket,
  isOpenTicket,
} from "../../../../../packages/contracts/src/domain";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { getSlaState, getTicketStatusLabel } from "../../shared/format";
import { NavigationIcon } from "../shell/NavigationIcon";
import { Button } from "../../ui";

export function ManagerDashboard() {
  const {
    managerUi,
    session,
    overview,
    locale,
    serviceTickets,
    setManagerScreen,
    openTicketDetail,
  } = useWorkspace();
  const tickets = serviceTickets
    .filter((ticket) => isOpenTicket(ticket.status))
    .sort(
      (a, b) =>
        Number(isCriticalTicket(b)) - Number(isCriticalTicket(a)) ||
        a.slaDueAt?.localeCompare(b.slaDueAt ?? "") ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const urgent = tickets.filter(isCriticalTicket).length;
  return (
    <section className="mvp-page dashboard-page">
      <div className="mvp-page-header">
        <h2>{managerUi.titles.dashboard}</h2>
        {hasPermission(session.user, "tickets.write") && (
          <Button
            variant="primary"
            onClick={() => setManagerScreen("ticket-create")}
          >
            Создать заявку
          </Button>
        )}
      </div>
      <div className="dashboard-work" aria-label="Ближайшие действия">
        <Button variant="plain" onClick={() => setManagerScreen("agenda")}>
          <span>
            <strong>Сроки и работы</strong>
            <small>
              {overview.expiringLeaseCount > 0
                ? `Договоров к продлению: ${overview.expiringLeaseCount}`
                : "Платежи, продления договоров и обслуживание"}
            </small>
          </span>
          <NavigationIcon name="forward" />
        </Button>
      </div>
      <article className="mvp-card dashboard-tickets">
        <div className="mvp-card-head">
          <div>
            <h3>Открытые заявки · {tickets.length}</h3>
            {urgent > 0 && <p>Срочных: {urgent}</p>}
          </div>
          <Button variant="text" onClick={() => setManagerScreen("tickets")}>
            Все заявки
          </Button>
        </div>
        {tickets.length ? (
          <div className="dashboard-ticket-list">
            {tickets.slice(0, 5).map((ticket) => (
              <Button
                variant="plain"
                key={ticket.id}
                onClick={() => openTicketDetail(ticket.id)}
              >
                <span className="dashboard-ticket-copy">
                  <small>
                    {ticket.number} · {ticket.propertyName} ·{" "}
                    {ticket.unitNumber}
                  </small>
                  <strong>{ticket.title}</strong>
                  <small>
                    {ticket.assignedToName || "Исполнитель не назначен"} ·{" "}
                    {getSlaState(ticket, locale).label}
                  </small>
                </span>
                <span className="dashboard-ticket-status">
                  {getTicketStatusLabel(ticket.status, locale)}
                </span>
                <NavigationIcon name="forward" />
              </Button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Открытых заявок нет. Новое обращение можно создать кнопкой выше.
          </div>
        )}
      </article>
    </section>
  );
}
