import { useWorkspace } from "../../../app/WorkspaceContext";
import { ResponsiveTable } from "../../../ResponsiveTable";
import { daysUntil, formatDate, formatMoney } from "../../../shared/format";
import { Button } from "../../../ui";

export function TenantContractsTab() {
  const {
    tenantDetail,
    t,
    managerUi,
    adminEditLabel,
    loadLeaseDocuments,
    openManagerLeaseEdit,
    locale,
  } = useWorkspace();

  if (!tenantDetail) return null;

  return (
    <article className="mvp-card">
      <div className="mvp-table-wrap">
        <ResponsiveTable className="mvp-table">
          <thead>
            <tr>
              <th>{t.fields.contractNumber}</th>
              <th>{t.fields.unit}</th>
              <th>{t.fields.stage}</th>
              <th>{t.fields.ratePerSqm}</th>
              <th>{t.fields.endDate}</th>
              <th>{t.fields.document}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenantDetail.leases.map((lease) => (
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
                <td>{lease.unitNumber ?? "—"}</td>
                <td>
                  {
                    t.leaseStages[
                      lease.stage as keyof typeof t.leaseStages
                    ]
                  }
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
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </div>
    </article>
  );
}
