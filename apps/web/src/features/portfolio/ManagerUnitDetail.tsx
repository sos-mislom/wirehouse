import { useWorkspace } from "../../app/WorkspaceContext";
import { ResponsiveTable } from "../../ResponsiveTable";
import { formatArea, formatDate } from "../../shared/format";
import { Button, Input } from "../../ui";
export function ManagerUnitDetail() {
  const {
    setManagerScreen,
    managerUi,
    selectedUnit,
    downloadUnitExport,
    unitExportLabel,
    openManagerUnitEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
    t,
    locale,
    canManagePortfolio,
    selectedUnitLeases,
    handleUnitSplitSubmit,
    handleFieldChange,
    setUnitSplitForm,
    unitSplitForm,
    busyAction,
    selectedUnitTickets,
    openTicketDetail,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => setManagerScreen("units")}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>
            {selectedUnit
              ? `${selectedUnit.propertyName ?? "—"} · ${selectedUnit.number}`
              : managerUi.titles.unitDetail}
          </h2>
        </div>
        {selectedUnit ? (
          <div className="mvp-actions">
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => void downloadUnitExport(selectedUnit)}
              type="button"
            >
              {unitExportLabel}
            </Button>
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => openManagerUnitEdit(selectedUnit)}
              type="button"
            >
              {adminEditLabel}
            </Button>
            {canDeletePortfolioItems ? (
              <Button
                variant="text"
                className="text-button text-button--danger"
                onClick={() =>
                  void handleDelete(`/api/units/${selectedUnit.id}`)
                }
                type="button"
              >
                {t.actions.delete}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedUnit ? (
        <div className="mvp-grid">
          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <h3>{selectedUnit.number}</h3>
              </div>
            </div>
            <div className="mvp-info-list">
              <div className="mvp-info-row">
                <span>{t.fields.property}</span>
                <strong>{selectedUnit.propertyName ?? "—"}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.area}</span>
                <strong>{formatArea(selectedUnit.area, locale)}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.type}</span>
                <strong>
                  {t.unitTypes[selectedUnit.type as keyof typeof t.unitTypes]}
                </strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.status}</span>
                <strong>
                  {
                    t.unitStatuses[
                      selectedUnit.status as keyof typeof t.unitStatuses
                    ]
                  }
                </strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.temperatureRegime}</span>
                <strong>{selectedUnit.temperatureRegime || "—"}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.ceilingHeight}</span>
                <strong>{selectedUnit.ceilingHeight || "—"}</strong>
              </div>
              {selectedUnit.description ? (
                <div className="mvp-info-row">
                  <span>{t.fields.legend}</span>
                  <strong>{selectedUnit.description}</strong>
                </div>
              ) : null}
            </div>
          </article>

          {canManagePortfolio ? (
            <article className="mvp-card">
              <div className="mvp-card-head">
                <div>
                  <h3>
                    {locale === "ru" ? "Разделить помещение" : "Split unit"}
                  </h3>
                </div>
              </div>
              {selectedUnit.status === "occupied" ||
              selectedUnitLeases.some((lease) =>
                ["signed", "active", "prolongation"].includes(lease.stage),
              ) ? (
                <div className="empty-state">
                  {locale === "ru"
                    ? "Помещение с активной арендой нельзя разделить без переноса договора."
                    : "A unit with an active lease cannot be split without lease transfer."}
                </div>
              ) : (
                <form className="mvp-form" onSubmit={handleUnitSplitSubmit}>
                  <label>
                    <span>
                      {locale === "ru"
                        ? "Номер новой площади"
                        : "New unit number"}
                    </span>
                    <Input
                      name="number"
                      onChange={handleFieldChange(setUnitSplitForm)}
                      placeholder={`${selectedUnit.number}-1`}
                      value={unitSplitForm.number}
                    />
                  </label>
                  <label>
                    <span>
                      {locale === "ru"
                        ? "Площадь новой части, м²"
                        : "New part area, sqm"}
                    </span>
                    <Input
                      max={Math.max(1, selectedUnit.area - 1)}
                      min="1"
                      name="area"
                      onChange={handleFieldChange(setUnitSplitForm)}
                      placeholder={String(Math.floor(selectedUnit.area / 2))}
                      type="number"
                      value={unitSplitForm.area}
                    />
                  </label>
                  <div className="mvp-info-row">
                    <span>
                      {locale === "ru"
                        ? "Останется в исходной"
                        : "Remaining in original"}
                    </span>
                    <strong>
                      {Number(unitSplitForm.area) > 0 &&
                      Number(unitSplitForm.area) < selectedUnit.area
                        ? formatArea(
                            selectedUnit.area - Number(unitSplitForm.area),
                            locale,
                          )
                        : "—"}
                    </strong>
                  </div>
                  <Button
                    variant="primary"
                    className="primary-button"
                    disabled={
                      busyAction === `unit-split-${selectedUnit.id}` ||
                      !unitSplitForm.number.trim() ||
                      Number(unitSplitForm.area) <= 0 ||
                      Number(unitSplitForm.area) >= selectedUnit.area
                    }
                    type="submit"
                  >
                    {busyAction === `unit-split-${selectedUnit.id}`
                      ? locale === "ru"
                        ? "Разделяем..."
                        : "Splitting..."
                      : locale === "ru"
                        ? "Разделить"
                        : "Split"}
                  </Button>
                </form>
              )}
            </article>
          ) : null}

          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <h3>{managerUi.leaseHistory}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {selectedUnitLeases.length > 0 ? (
                selectedUnitLeases.map((lease) => (
                  <div className="mvp-list-row" key={lease.id}>
                    <div>
                      <strong>{lease.contractNumber}</strong>
                      <p>{lease.tenantName ?? "—"}</p>
                    </div>
                    <div className="mvp-list-aside">
                      <span>
                        {
                          t.leaseStages[
                            lease.stage as keyof typeof t.leaseStages
                          ]
                        }
                      </span>
                      <small>{formatDate(lease.endDate, locale)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">{t.hints.noData}</div>
              )}
            </div>
          </article>

          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <h3>{managerUi.linkedTickets}</h3>
              </div>
            </div>
            <div className="mvp-table-wrap">
              <ResponsiveTable className="mvp-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>{t.fields.title}</th>
                    <th>{t.fields.priority}</th>
                    <th>{t.fields.status}</th>
                    <th>{t.fields.endDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUnitTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicketDetail(ticket.id)}
                    >
                      <td>{ticket.number}</td>
                      <td>{ticket.title}</td>
                      <td>
                        {
                          t.ticketPriorities[
                            ticket.priority as keyof typeof t.ticketPriorities
                          ]
                        }
                      </td>
                      <td>
                        {
                          t.ticketStatuses[
                            ticket.status as keyof typeof t.ticketStatuses
                          ]
                        }
                      </td>
                      <td>{formatDate(ticket.updatedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
            {selectedUnitTickets.length === 0 ? (
              <div className="empty-state">{t.hints.ticketEmpty}</div>
            ) : null}
          </article>
        </div>
      ) : (
        <div className="mvp-card">
          <div className="empty-state">{t.hints.noData}</div>
        </div>
      )}
    </section>
  );
}
