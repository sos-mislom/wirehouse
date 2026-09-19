import { useWorkspace } from "../../app/WorkspaceContext";
import { UnitStructure } from "../../Operations";
import { unitStatusOptions, unitTypeOptions } from "../../projectData";
import { ResponsiveTable } from "../../ResponsiveTable";
import { countLabel, formatArea } from "../../shared/format";
import { Button, Select } from "../../ui";
export function ManagerUnits() {
  const {
    managerUi,
    filteredPropertyScopedUnits,
    setUnitTypeFilter,
    unitTypeFilter,
    locale,
    t,
    setUnitStatusFilter,
    unitStatusFilter,
    setUnitRampFilter,
    unitRampFilter,
    cancelAdminEdit,
    setAdminPanel,
    setManagerScreen,
    overview,
    selectedPropertyId,
    handleManagerPropertySelect,
    session,
    propertyScopedUnits,
    tickets,
    operations,
    openUnitDetail,
    openManagerUnitEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.units}</h2>
          <p>
            {countLabel(filteredPropertyScopedUnits.length, [
              "помещение",
              "помещения",
              "помещений",
            ])}
          </p>
        </div>
        <div className="mvp-actions">
          <Select
            className="filter-select"
            onChange={(event) => setUnitTypeFilter(event.target.value)}
            value={unitTypeFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0442\u0438\u043f\u044b"
                : "All types"}
            </option>
            {unitTypeOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitTypes[option]}
              </option>
            ))}
          </Select>
          <Select
            className="filter-select"
            onChange={(event) => setUnitStatusFilter(event.target.value)}
            value={unitStatusFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044b"
                : "All statuses"}
            </option>
            {unitStatusOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitStatuses[option]}
              </option>
            ))}
          </Select>
          <Select
            className="filter-select"
            onChange={(event) => setUnitRampFilter(event.target.value)}
            value={unitRampFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0440\u0430\u043c\u043f\u044b"
                : "All ramps"}
            </option>
            <option value="ramp">{t.fields.hasRamp}</option>
            <option value="no-ramp">
              {locale === "ru"
                ? "\u0411\u0435\u0437 \u0440\u0430\u043c\u043f\u044b"
                : "No ramp"}
            </option>
          </Select>
          <Button
            variant="primary"
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("unit");
              setAdminPanel("unit");
              setManagerScreen("unit-add");
            }}
            type="button"
          >
            {managerUi.add}
          </Button>
        </div>
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
            onClick={() => handleManagerPropertySelect(property.id, "units")}
            type="button"
          >
            {property.name}
          </Button>
        ))}
      </div>

      <UnitStructure
        token={session.token}
        properties={overview.properties}
        units={propertyScopedUnits}
        tickets={tickets}
        equipment={operations?.equipment ?? []}
        onUnit={openUnitDetail}
      />
      <article
        className="mvp-card selection-stage"
        key={`manager-units-${selectedPropertyId}`}
      >
        <div className="mvp-table-wrap">
          <ResponsiveTable className="mvp-table">
            <thead>
              <tr>
                <th>{t.fields.unit}</th>
                <th>{t.fields.area}</th>
                <th>{t.fields.type}</th>
                <th>{managerUi.unitMeta}</th>
                <th>{t.fields.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPropertyScopedUnits.map((unit) => (
                <tr key={unit.id} onClick={() => openUnitDetail(unit.id)}>
                  <td>
                    <strong>
                      {unit.propertyName ?? "—"} · {unit.number}
                    </strong>
                    <small>{unit.tenantName ?? t.hints.noData}</small>
                  </td>
                  <td>{formatArea(unit.area, locale)}</td>
                  <td>{t.unitTypes[unit.type as keyof typeof t.unitTypes]}</td>
                  <td>{unit.temperatureRegime || "—"}</td>
                  <td>
                    {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        openManagerUnitEdit(unit);
                      }}
                      type="button"
                    >
                      {adminEditLabel}
                    </Button>
                    {canDeletePortfolioItems ? (
                      <Button
                        variant="text"
                        className="text-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(`/api/units/${unit.id}`);
                        }}
                        type="button"
                      >
                        {t.actions.delete}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
        {filteredPropertyScopedUnits.length === 0 ? (
          <div className="empty-state">{t.hints.noData}</div>
        ) : null}
      </article>
    </section>
  );
}
