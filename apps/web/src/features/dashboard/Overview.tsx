import { isCriticalTicket } from "../../../../../packages/contracts/src/domain";
import { useWorkspace } from "../../app/WorkspaceContext";
import { ForecastChart } from "../../ForecastChart";
import { BotLinkPanel } from "../../MessengerButtons";
import { TenantServices } from "../../Operations";
import {
  daysUntil,
  formatArea,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatMoney,
  getCollectionBasisLabel,
} from "../../shared/format";
import { Button } from "../../ui";
export function Overview() {
  const {
    isTenant,
    operations,
    session,
    sectionTitle,
    t,
    overview,
    locale,
    ui,
    openTicketCount,
    serviceTickets,
    canManagePortfolio,
    criticalNotifications,
    openNotification,
    selectedPropertyId,
    selectedProperty,
    handlePropertySelect,
    boardFloors,
    leaseWatch,
    isWorker,
    setSelectedSection,
    focusTickets,
    setSelectedTicketId,
    propertyOperations,
    downloadExport,
    managerUi,
  } = useWorkspace();
  return (
    <section className="section-grid overview-grid">
      {isTenant ? (
        <>
          <TenantServices data={operations} />
          <article className="surface">
            <BotLinkPanel token={session.token} />
          </article>
        </>
      ) : null}
      <article className="surface surface--hero surface--wide">
        <div className="industrial-hero">
          <div className="industrial-hero-copy">
            <h2>{sectionTitle}</h2>
          </div>

          <div className="metrics-grid">
            <div className="metric-panel">
              <span>{t.metrics.occupancy}</span>
              <strong>{overview.occupancyRate}%</strong>
              <small title="Занятая / общая арендопригодная площадь">
                {formatArea(overview.totals.occupied_area, locale)} /{" "}
                {formatArea(overview.totals.total_rentable_area, locale)}
              </small>
            </div>
            <div className="metric-panel">
              <span>
                {ui.collectionRate} · {overview.finance.collectionPeriodLabel}
              </span>
              <strong>{overview.finance.collectionRate}%</strong>
              <small title="Фактически оплачено / начислено за указанный месяц">
                {getCollectionBasisLabel(overview.finance, locale)}
              </small>
            </div>
            <div className="metric-panel metric-panel--alert">
              <span>{ui.arrears}</span>
              <strong>
                {formatCompactMoney(overview.finance.arrearsAmount, locale)}
              </strong>
              <small>
                {overview.expiringLeaseCount} {t.metrics.expiring.toLowerCase()}
              </small>
            </div>
            <div className="metric-panel">
              <span>{t.metrics.openTickets}</span>
              <strong>{openTicketCount}</strong>
              <small>
                {serviceTickets.filter(isCriticalTicket).length}{" "}
                {ui.urgent.toLowerCase()}
              </small>
            </div>
            <div className="metric-panel">
              <span>{ui.noi}</span>
              <strong>
                {formatCompactMoney(overview.finance.noi, locale)}
              </strong>
              <small>
                {ui.opex}: {overview.finance.opexRatio}%
              </small>
            </div>
            <div className="metric-panel">
              <span>{ui.forecast}</span>
              <strong>
                {formatCompactMoney(overview.finance.forecastQuarter, locale)}
              </strong>
              <small>
                {overview.finance.forecastPeriodLabel ??
                  `${t.metrics.activeLeases}: ${overview.totals.active_lease_count}`}
              </small>
            </div>
          </div>
        </div>
      </article>

      {canManagePortfolio ? (
        <article className="surface surface--wide">
          <div className="surface-head">
            <div>
              <h3>{ui.cashflow}</h3>
              <p className="field-hint">
                План начислений минус внесённые расходы. Будущая оплата не
                гарантирована.
              </p>
            </div>
          </div>
          <ForecastChart series={overview.finance.series} />
          <div className="summary-strip">
            <div className="summary-chip">
              <span>
                {ui.collectionRate} · {overview.finance.collectionPeriodLabel}
              </span>
              <strong>{overview.finance.collectionRate}%</strong>
            </div>
            <div className="summary-chip">
              <span>{ui.arrears}</span>
              <strong>
                {formatMoney(overview.finance.arrearsAmount, locale)}
              </strong>
            </div>
            <div className="summary-chip">
              <span>{ui.noi}</span>
              <strong>{formatMoney(overview.finance.noi, locale)}</strong>
            </div>
            <div className="summary-chip">
              <span>{ui.opex}</span>
              <strong>{overview.finance.opexRatio}%</strong>
            </div>
          </div>
        </article>
      ) : null}

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{ui.notifications}</h3>
          </div>
        </div>
        <div className="notification-stack">
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

      <article
        className="surface surface--board selection-stage"
        key={`overview-board-${selectedPropertyId}`}
      >
        <div className="surface-head">
          <div>
            <h3>{selectedProperty?.name ?? t.sections.twin}</h3>
          </div>
          <div className="chip-row">
            {overview.properties.map((property) => (
              <Button
                variant="plain"
                className={
                  selectedPropertyId === property.id
                    ? "chip-button chip-button--active"
                    : "chip-button"
                }
                key={property.id}
                onClick={() => handlePropertySelect(property.id)}
                type="button"
              >
                {property.name}
              </Button>
            ))}
          </div>
        </div>
        <p className="surface-copy">{t.hints.twin}</p>
        <div className="board-shell">
          {boardFloors.length > 0 ? (
            boardFloors.map((entry) => (
              <div className="board-floor" key={entry.floor}>
                <div className="board-floor-label">
                  {entry.floor > 0 ? `${t.fields.floor} ${entry.floor}` : "G"}
                </div>
                <div className="board-floor-track">
                  {entry.units.map((unit) => {
                    const remainingDays = daysUntil(unit.leaseEndDate);
                    const tone =
                      unit.status === "maintenance"
                        ? "maintenance"
                        : unit.status === "vacant"
                          ? "vacant"
                          : remainingDays !== null && remainingDays <= 15
                            ? "critical"
                            : remainingDays !== null && remainingDays <= 45
                              ? "warning"
                              : "occupied";

                    return (
                      <article
                        className={`board-unit board-unit--${tone}`}
                        key={unit.id}
                      >
                        <div className="board-unit-head">
                          <strong>{unit.number}</strong>
                          <span>{formatArea(unit.area, locale)}</span>
                        </div>
                        <p>{unit.tenantName ?? t.hints.noData}</p>
                        <small>
                          {
                            t.unitStatuses[
                              unit.status as keyof typeof t.unitStatuses
                            ]
                          }
                          {remainingDays !== null
                            ? ` · ${remainingDays} дн.`
                            : ""}
                        </small>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{t.sections.watchlist}</h3>
          </div>
        </div>
        <div className="lease-rail">
          {leaseWatch.length > 0 ? (
            leaseWatch.map((lease) => {
              const remainingDays = daysUntil(lease.endDate);
              const tone =
                remainingDays !== null && remainingDays <= 15
                  ? "critical"
                  : remainingDays !== null && remainingDays <= 45
                    ? "warning"
                    : "calm";

              return (
                <article
                  className={`lease-node lease-node--${tone}`}
                  key={lease.id}
                >
                  <small>{lease.propertyName ?? "—"}</small>
                  <strong>{lease.contractNumber}</strong>
                  <p>
                    {lease.tenantName ?? "—"} · {lease.unitNumber ?? "—"}
                  </p>
                  <span>{formatDate(lease.endDate, locale)}</span>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>
              {isWorker
                ? locale === "ru"
                  ? "Мои заявки на обслуживание"
                  : "My service jobs"
                : t.sections.serviceFeed}
            </h3>
          </div>
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => setSelectedSection("service")}
            type="button"
          >
            {t.nav.service}
          </Button>
        </div>
        <div className="focus-grid">
          {focusTickets.length > 0 ? (
            focusTickets.map((ticket) => (
              <Button
                variant="plain"
                className="focus-card"
                key={ticket.id}
                onClick={() => {
                  setSelectedSection("service");
                  setSelectedTicketId(ticket.id);
                }}
                type="button"
              >
                <div className="focus-card-top">
                  <span
                    className={`priority-pill priority-pill--${ticket.priority}`}
                  >
                    {
                      t.ticketPriorities[
                        ticket.priority as keyof typeof t.ticketPriorities
                      ]
                    }
                  </span>
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {
                      t.ticketStatuses[
                        ticket.status as keyof typeof t.ticketStatuses
                      ]
                    }
                  </span>
                </div>
                <strong>{ticket.title}</strong>
                <p>
                  {ticket.number} · {ticket.propertyName ?? "—"} ·{" "}
                  {ticket.unitNumber ?? "—"}
                </p>
                <small>{ticket.tenantName ?? t.hints.noData}</small>
              </Button>
            ))
          ) : (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          )}
        </div>
      </article>

      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="property-rail">
          {propertyOperations.map((property) => (
            <Button
              variant="plain"
              className={
                selectedPropertyId === property.id
                  ? "property-stat property-stat--active"
                  : "property-stat"
              }
              key={property.id}
              onClick={() => {
                handlePropertySelect(property.id, "portfolio");
              }}
              type="button"
            >
              <div className="property-stat-head">
                <div>
                  <strong>{property.name}</strong>
                  <p>{property.address}</p>
                </div>
                <span>{property.warehouseClass}</span>
              </div>
              <div className="property-progress">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(property.occupancy, 100))}%`,
                  }}
                />
              </div>
              <div className="property-stat-meta">
                <small>
                  {property.occupancy}% {t.metrics.occupancy.toLowerCase()}
                </small>
                <small>
                  {property.openTicketCount}{" "}
                  {t.metrics.openTickets.toLowerCase()}
                </small>
                <small>
                  {property.urgentTicketCount} {ui.urgent.toLowerCase()}
                </small>
              </div>
            </Button>
          ))}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{ui.team}</h3>
          </div>
        </div>
        <div className="team-stack">
          {overview.team.length > 0 ? (
            overview.team.slice(0, 4).map((member) => (
              <div className="team-card" key={member.id}>
                <div className="team-card-top">
                  <strong>{member.fullName}</strong>
                  <span>{t.roles[member.role]}</span>
                </div>
                <p>{member.focus}</p>
                <small>
                  {ui.assigned}: {member.assignedTicketCount} · {ui.urgent}:{" "}
                  {member.urgentTicketCount}
                </small>
              </div>
            ))
          ) : (
            <div className="empty-state">{ui.noTeam}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{ui.exports}</h3>
          </div>
        </div>
        <div className="export-stack">
          {overview.exports.length > 0 ? (
            overview.exports.map((item) => (
              <div className="export-card" key={item.id}>
                <div className="export-card-top">
                  <strong>{item.name}</strong>
                  <span className={`status-pill status-pill--${item.status}`}>
                    {ui.exportStatus[item.status]}
                  </span>
                </div>
                <p>{item.scope}</p>
                <small>
                  {item.format} · {item.cadence}
                </small>
                <Button
                  variant="secondary"
                  className="secondary-button secondary-button--compact"
                  onClick={() => void downloadExport(item.id)}
                  type="button"
                >
                  {managerUi.open}
                </Button>
              </div>
            ))
          ) : (
            <div className="empty-state">{ui.noExports}</div>
          )}
        </div>
      </article>
    </section>
  );
}
