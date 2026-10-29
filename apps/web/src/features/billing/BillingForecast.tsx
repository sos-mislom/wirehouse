import { Disclosure } from "../../ui/Disclosure";
import { useWorkspace } from "../../app/WorkspaceContext";
import { ForecastChart } from "../../ForecastChart";
import { formatCompactMoney } from "../../shared/format";
export function BillingForecast() {
  const { overview, locale, ui } = useWorkspace();
  return (
    <Disclosure
      title="План доходов и расходов"
      className="workspace-disclosure billing-forecast"
    >
      <div className="disclosure-content">
        <div className="mvp-card-head">
          <div>
            <h3>{ui.cashflow}</h3>
            <p className="field-hint">
              План начислений минус внесённые расходы. Будущая оплата не
              гарантирована.
            </p>
          </div>
        </div>
        <dl className="forecast-summary">
          <div>
            <dt>Доля операционных расходов</dt>
            <dd>{overview.finance.opexRatio}%</dd>
          </div>
          <div>
            <dt>Чистый операционный доход</dt>
            <dd>{formatCompactMoney(overview.finance.noi, locale)}</dd>
          </div>
          <div>
            <dt>Плановый остаток за 3 месяца</dt>
            <dd>
              {formatCompactMoney(overview.finance.forecastQuarter, locale)}
            </dd>
          </div>
        </dl>
        <ForecastChart series={overview.finance.series} />
      </div>
    </Disclosure>
  );
}
