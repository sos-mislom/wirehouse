import { isCriticalTicket } from "../../../../../packages/contracts/src/domain";
import { useWorkspace } from "../../app/WorkspaceContext";
import { ForecastChart } from "../../ForecastChart";
import {
  formatArea,
  formatCompactMoney,
  formatDateTime,
  getCollectionBasisLabel,
} from "../../shared/format";
import { NavigationIcon } from "../shell/NavigationIcon";
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
  } = useWorkspace();
  return (
    <section className="mvp-page dashboard-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.dashboard}</h2>
        </div>
      </div>

      <div className="dashboard-work" aria-label="Текущая работа">
        <Button variant="plain" onClick={() => setManagerScreen("tickets")}>
          <span>
            <strong>Открытые заявки</strong>
            <small>
              {serviceTickets.filter(isCriticalTicket).length} требуют срочного
              внимания
            </small>
          </span>
          <span className="dashboard-work-value">
            {openTicketCount}
            <NavigationIcon name="forward" />
          </span>
        </Button>
        <Button variant="plain" onClick={() => setManagerScreen("agenda")}>
          <span>
            <strong>Сроки и работы</strong>
            <small>Платежи, договоры и обслуживание</small>
          </span>
          <NavigationIcon name="forward" />
        </Button>
        <Button variant="plain" onClick={() => setManagerScreen("leases")}>
          <span>
            <strong>Договоры к продлению</strong>
            <small>Истекают в ближайшие 45 дней</small>
          </span>
          <span className="dashboard-work-value">
            {overview.expiringLeaseCount}
            <NavigationIcon name="forward" />
          </span>
        </Button>
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
          <small>По просроченным счетам</small>
        </article>
      </div>
      <div className="mvp-grid mvp-grid--dashboard">
        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{ui.notifications}</h3>
            </div>
            <Button
              variant="text"
              onClick={() => setManagerScreen("notifications")}
            >
              Все уведомления
            </Button>
          </div>
          <div className="dashboard-activity-list">
            {criticalNotifications.length > 0 ? (
              criticalNotifications.slice(0, 3).map((item) => (
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
          <div className="dashboard-activity-list">
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
      </div>
      <details className="workspace-disclosure dashboard-forecast">
        <summary>Показать план доходов и расходов</summary>
        <div className="disclosure-content">
          <div className="mvp-card-head">
            <div>
              <h3>{ui.cashflow}</h3>
              <p className="field-hint">
                План начислений минус внесённые расходы. Будущая оплата не
                гарантирована.
              </p>
            </div>
          </div>
          <dl className="forecast-summary">
            <div>
              <dt>Доля операционных расходов</dt>
              <dd>{overview.finance.opexRatio}%</dd>
            </div>
            <div>
              <dt>Чистый операционный доход</dt>
              <dd>{formatCompactMoney(overview.finance.noi, locale)}</dd>
            </div>
            <div>
              <dt>Плановый остаток за 3 месяца</dt>
              <dd>
                {formatCompactMoney(overview.finance.forecastQuarter, locale)}
              </dd>
            </div>
          </dl>
          <ForecastChart series={overview.finance.series} />
        </div>
      </details>
    </section>
  );
}
