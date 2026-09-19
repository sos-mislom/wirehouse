import { useWorkspace } from "../../app/WorkspaceContext";
import { leaseStageOptions } from "../../projectData";
import { ResponsiveTable } from "../../ResponsiveTable";
import { daysUntil, formatDate, formatMoney } from "../../shared/format";
import { Button, Select } from "../../ui";
export function ManagerLeases() {
  const {
    managerUi,
    setLeaseStageFilter,
    leaseStageFilter,
    locale,
    t,
    setLeaseTermFilter,
    leaseTermFilter,
    cancelAdminEdit,
    setAdminPanel,
    setManagerScreen,
    managerLeaseRows,
    loadLeaseDocuments,
    openManagerLeaseEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.leases}</h2>
        </div>
        <div className="mvp-actions">
          <Select
            className="filter-select"
            onChange={(event) => setLeaseStageFilter(event.target.value)}
            value={leaseStageFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0441\u0442\u0430\u0434\u0438\u0438"
                : "All stages"}
            </option>
            {leaseStageOptions.map((option) => (
              <option key={option} value={option}>
                {t.leaseStages[option]}
              </option>
            ))}
          </Select>
          <Select
            className="filter-select"
            onChange={(event) => setLeaseTermFilter(event.target.value)}
            value={leaseTermFilter}
          >
            <option value="all">
              {locale === "ru"
                ? "\u0412\u0441\u0435 \u0441\u0440\u043e\u043a\u0438"
                : "All terms"}
            </option>
            <option value="30">
              {locale === "ru"
                ? "\u0414\u043e 30 \u0434\u043d\u0435\u0439"
                : "Within 30 days"}
            </option>
            <option value="90">
              {locale === "ru"
                ? "\u0414\u043e 90 \u0434\u043d\u0435\u0439"
                : "Within 90 days"}
            </option>
            <option value="expired">
              {locale === "ru"
                ? "\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u044b"
                : "Expired"}
            </option>
          </Select>
          <Button
            variant="primary"
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("lease");
              setAdminPanel("lease");
              setManagerScreen("lease-add");
            }}
            type="button"
          >
            {managerUi.add}
          </Button>
        </div>
      </div>

      <article className="mvp-card">
        <div className="mvp-table-wrap">
          <ResponsiveTable className="mvp-table">
            <thead>
              <tr>
                <th>{t.fields.contractNumber}</th>
                <th>{t.fields.tenant}</th>
                <th>{t.fields.unit}</th>
                <th>{t.fields.stage}</th>
                <th>{t.fields.ratePerSqm}</th>
                <th>{t.fields.endDate}</th>
                <th>{t.fields.document}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {managerLeaseRows.map((lease) => (
                <tr
                  key={lease.id}
                  className={
                    lease.stage !== "terminated" &&
                    (daysUntil(lease.endDate) ?? 1) < 0
                      ? "lease-expired"
                      : ""
                  }
                >
                  <td>{lease.contractNumber}</td>
                  <td>{lease.tenantName ?? "—"}</td>
                  <td>
                    {lease.propertyName ?? "—"} · {lease.unitNumber ?? "—"}
                  </td>
                  <td>
                    {t.leaseStages[lease.stage as keyof typeof t.leaseStages]}
                  </td>
                  <td>{formatMoney(lease.ratePerSqm, locale)}</td>
                  <td>
                    {formatDate(lease.endDate, locale)}
                    {lease.stage !== "terminated" &&
                    (daysUntil(lease.endDate) ?? 1) < 0 ? (
                      <small>Срок истёк</small>
                    ) : null}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={() => void loadLeaseDocuments(lease)}
                      type="button"
                    >
                      {managerUi.open}
                    </Button>
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={() => openManagerLeaseEdit(lease)}
                      type="button"
                    >
                      {adminEditLabel}
                    </Button>
                    {canDeletePortfolioItems ? (
                      <Button
                        variant="text"
                        className="text-button text-button--danger"
                        onClick={() =>
                          void handleDelete(`/api/leases/${lease.id}`)
                        }
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
        {managerLeaseRows.length === 0 ? (
          <div className="empty-state">{t.hints.noData}</div>
        ) : null}
      </article>
    </section>
  );
}
