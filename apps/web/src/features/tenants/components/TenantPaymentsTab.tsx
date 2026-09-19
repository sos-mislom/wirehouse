import { useWorkspace } from "../../../app/WorkspaceContext";
import { ResponsiveTable } from "../../../ResponsiveTable";
import { formatDate, formatMoney, paymentMethodLabel } from "../../../shared/format";

export function TenantPaymentsTab() {
  const { tenantDetail, ui, t, locale } = useWorkspace();

  if (!tenantDetail) return null;

  return (
    <article className="mvp-card">
      <div className="mvp-table-wrap">
        <ResponsiveTable className="mvp-table">
          <thead>
            <tr>
              <th>{ui.payments}</th>
              <th>{t.fields.status}</th>
              <th>{t.fields.endDate}</th>
            </tr>
          </thead>
          <tbody>
            {tenantDetail.payments.map((payment) => (
              <tr key={payment.id}>
                <td>
                  <strong>{payment.period}</strong>
                  <small>
                    {formatMoney(payment.amount, locale)} ·{" "}
                    {paymentMethodLabel(payment.method)}
                  </small>
                </td>
                <td>{ui.paymentStatus[payment.status]}</td>
                <td>
                  {formatDate(
                    payment.paidDate ?? payment.dueDate,
                    locale,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </div>
    </article>
  );
}
