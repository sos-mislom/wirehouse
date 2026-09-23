import { isCriticalTicket } from "../../../../../packages/contracts/src/domain";
import { useWorkspace } from "../../app/WorkspaceContext";
import { ForecastChart } from "../../ForecastChart";
import {
  formatArea,
  formatCompactMoney,
  formatDateTime,
  getCollectionBasisLabel,
} from "../../shared/format";
import { Button } from "../../ui";
export function ManagerDashboard() {
  const {
    managerUi,
    t,
    overview,
    locale,
    ui,
    openTicketCount,
    serviceTickets,
    criticalNotifications,
    openNotification,
    setManagerScreen,
    chatThreads,
    setSelectedChatTenantId,
    productBrand,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.dashboard}</h2>
        </div>
      </div>

      <div className="mvp-metrics">
        <article className="mvp-metric">
          <span>{t.metrics.occupancy}</span>
          <strong>{overview.occupancyRate}%</strong>
          <small title="Занятая / общая арендопригодная площадь">
            {formatArea(overview.totals.occupied_area, locale)} /{" "}
            {formatArea(overview.totals.total_rentable_area, locale)}
          </small>
        </article>
        <article className="mvp-metric">
          <span>
            {ui.collectionRate} · {overview.finance.collectionPeriodLabel}
          </span>
          <strong>{overview.finance.collectionRate}%</strong>
          <small title="Фактически оплачено / начислено за указанный месяц">
            {getCollectionBasisLabel(overview.finance, locale)}
          </small>
        </article>
        <article className="mvp-metric">
          <span>{ui.arrears}</span>
          <strong>
            {formatCompactMoney(overview.finance.arrearsAmount, locale)}
          </strong>
          <small>
            {overview.expiringLeaseCount} {t.metrics.expiring.toLowerCase()}
          </small>
        </article>
        <article className="mvp-metric">
          <span>{t.metrics.openTickets}</span>
          <strong>{openTicketCount}</strong>
          <small>
            {serviceTickets.filter(isCriticalTicket).length}{" "}
            {ui.urgent.toLowerCase()}
          </small>
        </article>
        <article className="mvp-metric">
          <span>{ui.opex}</span>
          <strong>{overview.finance.opexRatio}%</strong>
          <small title="Полученные платежи минус внесённые операционные расходы за месяц. Для полного расчёта внесите все расходы в Эксплуатации.">
            Чистый операционный доход:{" "}
            {formatCompactMoney(overview.finance.noi, locale)}
          </small>
        </article>
        <article className="mvp-metric">
          <span>{ui.forecast}</span>
          <strong>
            {formatCompactMoney(overview.finance.forecastQuarter, locale)}
          </strong>
          <small>
            {overview.finance.forecastPeriodLabel ??
              `${t.metrics.activeLeases}: ${overview.totals.active_lease_count}`}
          </small>
        </article>
      </div>

      <div className="mvp-grid mvp-grid--dashboard">
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>{ui.cashflow}</h3>
              <p className="field-hint">
                План начислений минус внесённые расходы. Будущая оплата не
                гарантирована.
              </p>
            </div>
          </div>
          <ForecastChart series={overview.finance.series} />
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{ui.notifications}</h3>
            </div>
          </div>
          <div className="mvp-stack">
            {criticalNotifications.length > 0 ? (
              criticalNotifications.map((item) => (
                <Button
                  variant="plain"
                  className={`notification-card notification-card--${item.tone}`}
                  key={item.id}
                  onClick={() => void openNotification(item)}
                  type="button"
                >
                  <div className="notification-card-top">
                    <span className="notification-dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.message}</p>
                  <small>
                    {formatDateTime(item.createdAt, locale)} ·{" "}
                    {item.unread ? "Не прочитано" : "Прочитано"}
                  </small>
                </Button>
              ))
            ) : (
              <div className="empty-state">{ui.noNotifications}</div>
            )}
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{managerUi.nav.chat}</h3>
            </div>
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => setManagerScreen("chat")}
              type="button"
            >
              {managerUi.open}
            </Button>
          </div>
          <div className="mvp-stack">
            {chatThreads.length > 0 ? (
              chatThreads.slice(0, 3).map((thread) => (
                <Button
                  variant="plain"
                  className="mvp-list-button"
                  key={thread.tenantId}
                  onClick={() => {
                    setSelectedChatTenantId(thread.tenantId);
                    setManagerScreen("chat");
                  }}
                  type="button"
                >
                  <strong>{thread.tenantName}</strong>
                  <p>{thread.preview}</p>
                  <small>
                    {thread.propertyName ?? "—"} · {thread.ticketCount}{" "}
                    {managerUi.chatThreadMeta}
                  </small>
                </Button>
              ))
            ) : (
              <div className="empty-state">{ui.noNotifications}</div>
            )}
          </div>
        </article>

        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>{ui.team}</h3>
            </div>
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => setManagerScreen("staff")}
              type="button"
            >
              {managerUi.open}
            </Button>
          </div>
          <div className="mvp-stack">
            {overview.team.slice(0, 4).map((member) => (
              <div className="mvp-list-row" key={member.id}>
                <div>
                  <strong>{member.fullName}</strong>
                  <p>{t.roles[member.role]}</p>
                </div>
                <div className="mvp-list-aside">
                  <span title="Количество назначенных открытых заявок">
                    {member.assignedTicketCount} открытых заявок
                  </span>
                  <small>{member.propertyName ?? productBrand.name}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
