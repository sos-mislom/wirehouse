import { useWorkspace } from "../../app/WorkspaceContext";
import { formatArea } from "../../shared/format";
import { Button } from "../../ui";
export function ManagerObjects() {
  const {
    managerUi,
    setManagerScreen,
    locale,
    cancelAdminEdit,
    setAdminPanel,
    propertyOperations,
    selectedPropertyId,
    handleManagerPropertySelect,
    t,
    selectedPropertySnapshot,
    selectedProperty,
    openManagerPropertyEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
    boardFloors,
    openUnitDetail,
    propertyScopedUnits,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.objects}</h2>
        </div>
        <div className="mvp-actions">
          <Button
            variant="primary"
            className="primary-button"
            onClick={() => setManagerScreen("object-launch")}
            type="button"
          >
            {locale === "ru" ? "Запустить объект" : "Launch"}
          </Button>
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => {
              cancelAdminEdit("property");
              setAdminPanel("property");
              setManagerScreen("property-add");
            }}
            type="button"
          >
            {managerUi.add}
          </Button>
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
            onClick={() => handleManagerPropertySelect(property.id, "objects")}
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
                {property.openTicketCount} {t.metrics.openTickets.toLowerCase()}
              </small>
            </div>
          </Button>
        ))}
      </div>

      {selectedPropertySnapshot ? (
        <article
          className="mvp-card area-split-card selection-stage"
          key={`manager-area-split-${selectedPropertyId}`}
        >
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Деление площадей" : "Area split"}</h3>
            </div>
            <small>
              {formatArea(selectedPropertySnapshot.rentableArea, locale)}
            </small>
          </div>
          <div
            className="area-split-bar"
            aria-label={
              locale === "ru"
                ? "Деление площадей по статусам"
                : "Area split by status"
            }
          >
            {selectedPropertySnapshot.statusBreakdown.map((item) => (
              <span
                className={`area-split-segment area-split-segment--${item.id}`}
                key={item.id}
                style={{
                  width: `${Math.max(2, (item.area / Math.max(1, selectedPropertySnapshot.rentableArea)) * 100)}%`,
                }}
                title={`${item.label}: ${formatArea(item.area, locale)}`}
              />
            ))}
          </div>
          <div className="area-split-grid">
            {selectedPropertySnapshot.statusBreakdown.map((item) => (
              <div className="area-split-item" key={item.id}>
                <span className={`area-split-dot area-split-dot--${item.id}`} />
                <div>
                  <strong>{item.label}</strong>
                  <small>
                    {formatArea(item.area, locale)} ·{" "}
                    {Math.round(
                      (item.area /
                        Math.max(1, selectedPropertySnapshot.rentableArea)) *
                        100,
                    )}
                    %
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="area-type-grid">
            {selectedPropertySnapshot.typeBreakdown.map((item) => (
              <div className="area-type-chip" key={item.id}>
                <span>{item.label}</span>
                <strong>{formatArea(item.area, locale)}</strong>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="mvp-grid">
        <article
          className="surface surface--board selection-stage"
          key={`manager-objects-board-${selectedPropertyId}`}
        >
          <div className="surface-head">
            <div>
              <h3>{selectedProperty?.name ?? t.sections.twin}</h3>
            </div>
            {selectedProperty ? (
              <div className="mvp-actions">
                <Button
                  variant="secondary"
                  className="secondary-button"
                  onClick={() => openManagerPropertyEdit(selectedProperty)}
                  type="button"
                >
                  {adminEditLabel}
                </Button>
                {canDeletePortfolioItems ? (
                  <Button
                    variant="text"
                    className="text-button text-button--danger"
                    onClick={() =>
                      void handleDelete(
                        `/api/properties/${selectedProperty.id}`,
                      )
                    }
                    type="button"
                  >
                    {t.actions.delete}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="board-shell">
            {boardFloors.length > 0 ? (
              boardFloors.map((entry) => (
                <div className="board-floor" key={entry.floor}>
                  <div className="board-floor-label">
                    {entry.floor > 0 ? `${t.fields.floor} ${entry.floor}` : "G"}
                  </div>
                  <div className="board-floor-track">
                    {entry.units.map((unit) => (
                      <Button
                        variant="plain"
                        className={`board-unit board-unit--${unit.status}`}
                        key={unit.id}
                        onClick={() => openUnitDetail(unit.id)}
                        type="button"
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
                        </small>
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">{t.hints.noData}</div>
            )}
          </div>
        </article>

        <article
          className="mvp-card selection-stage"
          key={`manager-objects-units-${selectedPropertyId}`}
        >
          <div className="mvp-card-head">
            <div>
              <h3>{t.fields.unit}</h3>
            </div>
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => setManagerScreen("units")}
              type="button"
            >
              {managerUi.open}
            </Button>
          </div>
          <div className="mvp-stack">
            {propertyScopedUnits.map((unit) => (
              <Button
                variant="plain"
                className="mvp-list-button"
                key={unit.id}
                onClick={() => openUnitDetail(unit.id)}
                type="button"
              >
                <strong>{unit.number}</strong>
                <p>{unit.tenantName ?? t.hints.noData}</p>
                <small>
                  {formatArea(unit.area, locale)} ·{" "}
                  {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
                </small>
              </Button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
