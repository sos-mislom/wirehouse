import { useWorkspace } from "../../app/WorkspaceContext";
import { formatArea } from "../../shared/format";
import { Button } from "../../ui";
import { StructureWorkspace } from "../platform/StructureWorkspace";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
export function ManagerObjects() {
  const {
    session,
    overview,
    tickets,
    operations,
    openTicketDetail,
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
    canManagePortfolio,
    handleDelete,
    openUnitDetail,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.objects}</h2>
        </div>
        {canManagePortfolio && (
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
        )}
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

      <div className="platform-section">
        <article
          className="mvp-card platform-section"
          key={`manager-objects-board-${selectedPropertyId}`}
        >
          <div className="surface-head">
            <div>
              <h3>{selectedProperty?.name ?? t.sections.twin}</h3>
            </div>
            {selectedProperty && canManagePortfolio ? (
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
          <StructureWorkspace
            embedded
            key={selectedPropertyId}
            token={session.token}
            properties={overview.properties.filter(
              (p) => !selectedPropertyId || p.id === selectedPropertyId,
            )}
            units={overview.units}
            tickets={tickets}
            equipment={operations?.equipment ?? []}
            onUnit={openUnitDetail}
            onTicket={openTicketDetail}
            canWrite={hasPermission(session.user, "plans.write")}
          />
        </article>
      </div>
    </section>
  );
}
