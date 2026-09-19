import { useWorkspace } from "../../app/WorkspaceContext";
import { riskLevelOptions } from "../../projectData";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  countLabel,
  formatArea,
  formatCompactMoney,
  formatDate,
} from "../../shared/format";
import { Button, Input, Select } from "../../ui";
export function ManagerTenants() {
  const {
    managerUi,
    propertyScopedTenantRows,
    setTenantSearch,
    locale,
    tenantSearch,
    setTenantRiskFilter,
    tenantRiskFilter,
    t,
    setManagerScreen,
    cancelAdminEdit,
    setAdminPanel,
    overview,
    selectedPropertyId,
    handleManagerPropertySelect,
    ui,
    openTenantDetail,
    openManagerTenantEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.tenants}</h2>
          <p>
            {countLabel(propertyScopedTenantRows.length, [
              "арендатор",
              "арендатора",
              "арендаторов",
            ])}
          </p>
        </div>
        <div className="mvp-actions">
          <Input
            className="filter-select"
            onChange={(event) => setTenantSearch(event.target.value)}
            placeholder={
              locale === "ru" ? "\u041f\u043e\u0438\u0441\u043a" : "Search"
            }
            value={tenantSearch}
          />
          <Select
            className="filter-select"
            onChange={(event) => setTenantRiskFilter(event.target.value)}
            value={tenantRiskFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0440\u0438\u0441\u043a\u0438"
                : "All risks"}
            </option>
            {riskLevelOptions.map((option) => (
              <option key={option} value={option}>
                {t.riskLevels[option]}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => setManagerScreen("import")}
            type="button"
          >
            {managerUi.import}
          </Button>
          <Button
            variant="primary"
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("tenant");
              setAdminPanel("tenant");
              setManagerScreen("tenant-add");
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
            onClick={() => handleManagerPropertySelect(property.id, "tenants")}
            type="button"
          >
            {property.name}
          </Button>
        ))}
      </div>

      <article className="mvp-card">
        <div
          className="mvp-table-wrap selection-stage"
          key={`manager-tenants-${selectedPropertyId}`}
        >
          <ResponsiveTable className="mvp-table">
            <thead>
              <tr>
                <th>{managerUi.nav.tenants}</th>
                <th>{t.fields.unit}</th>
                <th>{t.fields.area}</th>
                <th>{ui.monthlyRent}</th>
                <th>{ui.nextExpiry}</th>
                <th>{t.metrics.openTickets}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {propertyScopedTenantRows.map((tenant) => (
                <tr key={tenant.id} onClick={() => openTenantDetail(tenant.id)}>
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
                  <td>{formatArea(tenant.totalArea, locale)}</td>
                  <td>{formatCompactMoney(tenant.monthlyRent, locale)}</td>
                  <td>{formatDate(tenant.nextExpiry, locale)}</td>
                  <td>{tenant.openTicketCount}</td>
                  <td>
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        openManagerTenantEdit(tenant);
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
                          void handleDelete(`/api/tenants/${tenant.id}`);
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
        {propertyScopedTenantRows.length === 0 ? (
          <div className="empty-state">{t.hints.noData}</div>
        ) : null}
      </article>
    </section>
  );
}
