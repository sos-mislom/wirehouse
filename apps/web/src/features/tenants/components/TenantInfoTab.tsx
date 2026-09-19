import { formatArea, formatCompactMoney } from "../../../shared/format";
import { useWorkspace } from "../../../app/WorkspaceContext";

export function TenantInfoTab() {
  const { tenantDetail, t, ui, locale } = useWorkspace();

  if (!tenantDetail) return null;

  return (
    <div className="mvp-grid">
      <article className="mvp-card">
        <div className="mvp-card-head">
          <div>
            <h3>{tenantDetail.tenant.name}</h3>
          </div>
        </div>
        <div className="mvp-info-list">
          <div className="mvp-info-row">
            <span>{t.fields.inn}</span>
            <strong>{tenantDetail.tenant.inn}</strong>
          </div>
          <div className="mvp-info-row">
            <span>{t.fields.contactName}</span>
            <strong>{tenantDetail.tenant.contactName}</strong>
          </div>
          <div className="mvp-info-row">
            <span>{t.fields.phone}</span>
            <strong>{tenantDetail.tenant.phone}</strong>
          </div>
          <div className="mvp-info-row">
            <span>{t.fields.email}</span>
            <strong>{tenantDetail.tenant.email}</strong>
          </div>
          <div className="mvp-info-row">
            <span>{t.fields.riskLevel}</span>
            <strong>
              {
                t.riskLevels[
                  tenantDetail.tenant
                    .riskLevel as keyof typeof t.riskLevels
                ]
              }
            </strong>
          </div>
        </div>
      </article>

      <article className="mvp-card">
        <div className="mvp-card-head">
          <div>
            <h3>{ui.tenantPassport}</h3>
          </div>
        </div>
        <div className="mvp-metrics mvp-metrics--compact">
          <article
            className="mvp-metric"
            title="Сумма площадей связанных помещений без повторного учёта одного помещения."
          >
            <span>{t.fields.area} ⓘ</span>
            <strong>
              {formatArea(tenantDetail.summary.totalArea, locale)}
            </strong>
          </article>
          <article
            className="mvp-metric"
            title="Площадь × месячная ставка по действующим договорам."
          >
            <span>{ui.monthlyRent} ⓘ</span>
            <strong>
              {formatCompactMoney(
                tenantDetail.summary.monthlyRent,
                locale,
              )}
            </strong>
          </article>
          <article
            className="mvp-metric"
            title="Фактически оплачено / начислено по счетам арендатора × 100%. Частичные оплаты учитываются."
          >
            <span>{ui.paymentDiscipline} ⓘ</span>
            <strong>{tenantDetail.summary.paymentDiscipline}%</strong>
          </article>
          <article
            className="mvp-metric"
            title="Неоплаченный остаток счетов с истёкшим сроком оплаты."
          >
            <span>{ui.arrears} ⓘ</span>
            <strong>
              {formatCompactMoney(
                tenantDetail.summary.arrearsAmount,
                locale,
              )}
            </strong>
          </article>
        </div>
      </article>
    </div>
  );
}
