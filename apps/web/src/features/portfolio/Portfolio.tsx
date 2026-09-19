import { useWorkspace } from "../../app/WorkspaceContext";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  formatArea,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatMoney,
  paymentMethodLabel,
} from "../../shared/format";
import { type PaymentStatus } from "../../shared/types";
import { Button } from "../../ui";
export function Portfolio() {
  const {
    t,
    propertySnapshots,
    selectedPropertyId,
    handlePropertySelect,
    locale,
    ui,
    propertyScopedTenantRows,
    selectedTenantId,
    setSelectedTenantId,
    tenantDetail,
    selectedTenant,
    tenantDetailBusy,
    propertyScopedUnits,
  } = useWorkspace();
  return (
    <section className="section-grid portfolio-grid">
      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="property-grid">
          {propertySnapshots.map((property) => (
            <Button
              variant="plain"
              className={
                selectedPropertyId === property.id
                  ? "property-card property-card--active"
                  : "property-card"
              }
              key={property.id}
              onClick={() => handlePropertySelect(property.id)}
              type="button"
            >
              <strong>{property.name}</strong>
              <p>{property.address}</p>
              <div className="property-meta">
                <span>{property.warehouseClass}</span>
                <span>{formatArea(property.rentableArea, locale)}</span>
                <span>{property.occupancy}%</span>
              </div>
            </Button>
          ))}
        </div>
      </article>

      <article
        className="surface surface--wide selection-stage"
        key={`portfolio-tenants-${selectedPropertyId}`}
      >
        <div className="surface-head">
          <div>
            <h3>{ui.tenantRegistry}</h3>
          </div>
        </div>
        <div className="table-shell">
          <ResponsiveTable className="industrial-table">
            <thead>
              <tr>
                <th>{ui.tenantRegistry}</th>
                <th>{t.fields.unit}</th>
                <th>{ui.monthlyRent}</th>
                <th>{ui.nextExpiry}</th>
                <th>{ui.paymentDiscipline}</th>
                <th>{t.metrics.openTickets}</th>
              </tr>
            </thead>
            <tbody>
              {propertyScopedTenantRows.map((tenant) => (
                <tr
                  className={
                    selectedTenantId === tenant.id ? "table-row-active" : ""
                  }
                  key={tenant.id}
                  onClick={() => setSelectedTenantId(tenant.id)}
                >
                  <td>
                    <strong>{tenant.name}</strong>
                    <small>
                      {
                        t.riskLevels[
                          tenant.riskLevel as keyof typeof t.riskLevels
                        ]
                      }
                    </small>
                  </td>
                  <td>{tenant.unitLabel}</td>
                  <td>{formatCompactMoney(tenant.monthlyRent, locale)}</td>
                  <td>{formatDate(tenant.nextExpiry, locale)}</td>
                  <td>{tenant.paymentDiscipline}%</td>
                  <td>{tenant.openTicketCount}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
        {propertyScopedTenantRows.length === 0 ? (
          <div className="empty-state">{t.hints.noData}</div>
        ) : null}
      </article>

      <article
        className="surface surface--wide selection-stage"
        key={`portfolio-detail-${selectedPropertyId}-${selectedTenantId}`}
      >
        <div className="surface-head">
          <div>
            <h3>
              {tenantDetail?.tenant.name ??
                selectedTenant?.name ??
                ui.tenantPassport}
            </h3>
          </div>
        </div>

        {tenantDetailBusy ? (
          <div className="empty-state">{t.loading}</div>
        ) : tenantDetail ? (
          <div className="tenant-detail-shell">
            <div className="tenant-summary-grid">
              <div className="summary-tile">
                <span>{t.fields.area}</span>
                <strong>
                  {formatArea(tenantDetail.summary.totalArea, locale)}
                </strong>
              </div>
              <div className="summary-tile">
                <span>{ui.monthlyRent}</span>
                <strong>
                  {formatCompactMoney(tenantDetail.summary.monthlyRent, locale)}
                </strong>
              </div>
              <div className="summary-tile">
                <span>{ui.paymentDiscipline}</span>
                <strong>{tenantDetail.summary.paymentDiscipline}%</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.arrears}</span>
                <strong>
                  {formatCompactMoney(
                    tenantDetail.summary.arrearsAmount,
                    locale,
                  )}
                </strong>
              </div>
              <div className="summary-tile">
                <span>{t.metrics.openTickets}</span>
                <strong>{tenantDetail.summary.openTicketCount}</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.nextExpiry}</span>
                <strong>
                  {formatDate(tenantDetail.summary.nextExpiry, locale)}
                </strong>
              </div>
            </div>

            <div className="tenant-detail-grid">
              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.payments}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.payments.map((payment) => (
                    <div className="list-row" key={payment.id}>
                      <div>
                        <strong>{payment.period}</strong>
                        <p>
                          {formatMoney(payment.amount, locale)} ·{" "}
                          {paymentMethodLabel(payment.method)}
                        </p>
                      </div>
                      <div className="list-aside">
                        <span
                          className={`status-pill status-pill--${payment.status}`}
                        >
                          {ui.paymentStatus[payment.status as PaymentStatus]}
                        </span>
                        <small>
                          {formatDate(
                            payment.paidDate ?? payment.dueDate,
                            locale,
                          )}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.meters}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.meters.map((meter) => (
                    <div className="list-row" key={meter.id}>
                      <div>
                        <strong>{meter.name}</strong>
                        <p>
                          {meter.unitNumber} · {meter.lastValue}
                        </p>
                      </div>
                      <div className="list-aside">
                        <span
                          className={`status-pill status-pill--${meter.status}`}
                        >
                          {meter.deltaPct}%
                        </span>
                        <small>{formatDateTime(meter.updatedAt, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.notes}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.notes.map((note) => (
                    <div className="list-row list-row--stacked" key={note.id}>
                      <div>
                        <strong>{note.title}</strong>
                        <p>{note.content}</p>
                      </div>
                      <div className="list-aside">
                        <span>{note.authorName}</span>
                        <small>{formatDateTime(note.createdAt, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.risks}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.risks.map((risk) => (
                    <div className="list-row" key={risk.id}>
                      <div>
                        <strong>{risk.title}</strong>
                        <p>{risk.owner}</p>
                      </div>
                      <div className="list-aside">
                        <span
                          className={`status-pill status-pill--${risk.severity}`}
                        >
                          {ui.riskSeverity[risk.severity]}
                        </span>
                        <small>{formatDate(risk.dueDate, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="empty-state">{ui.emptyTenant}</div>
        )}
      </article>

      <article
        className="surface surface--wide selection-stage"
        key={`portfolio-units-${selectedPropertyId}`}
      >
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="stack-list">
          {propertyScopedUnits.length > 0 ? (
            propertyScopedUnits.map((unit) => (
              <div className="list-row" key={unit.id}>
                <div>
                  <strong>
                    {unit.propertyName ?? "—"} · {unit.number}
                  </strong>
                  <p>
                    {t.unitTypes[unit.type as keyof typeof t.unitTypes]} ·{" "}
                    {formatArea(unit.area, locale)} ·{" "}
                    {unit.tenantName ?? t.hints.noData}
                  </p>
                </div>
                <div className="list-aside">
                  <span className={`status-pill status-pill--${unit.status}`}>
                    {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
                  </span>
                  <small>{unit.temperatureRegime || "—"}</small>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>
    </section>
  );
}
