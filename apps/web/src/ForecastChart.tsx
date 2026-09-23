import type { FinancePoint } from "./shared/types";
import { currency } from "./features/operations/shared";
export function ForecastChart({ series }: { series: FinancePoint[] }) {
  return (
    <div className="forecast-months">
      {series.map((month) => (
        <section key={month.id} className="forecast-detail">
          <h4>{month.label}</h4>
          <dl>
            <div>
              <dt>Выставленные счета</dt>
              <dd>{currency(month.invoiceAmount)}</dd>
            </div>
            <div>
              <dt>Остальные договоры</dt>
              <dd>{currency(month.contractAmount)}</dd>
            </div>
            <div className="forecast-subtotal">
              <dt>Ожидаемые начисления</dt>
              <dd>{currency(month.billed)}</dd>
            </div>
            <div>
              <dt>Внесённые расходы</dt>
              <dd>− {currency(month.expenses)}</dd>
            </div>
            <div className="forecast-result">
              <dt>Расчётный остаток</dt>
              <dd>{currency(month.forecast)}</dd>
            </div>
          </dl>
          <p className="field-hint">
            Оплачено по счетам: {currency(month.collected)}
          </p>
          <details>
            <summary>Из чего складывается сумма</summary>
            {month.details.length ? (
              <ul>
                {month.details.map((row) => (
                  <li key={row.leaseId}>
                    <span>
                      Договор {row.contractNumber}, помещение {row.unitNumber}
                    </span>
                    <strong>{currency(row.amount)}</strong>
                    <small>
                      {row.basis === "invoice"
                        ? "По выставленному счёту"
                        : `По ставке договора за ${row.days} дн.`}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Нет действующих договоров и счетов</p>
            )}
          </details>
        </section>
      ))}
      <p className="field-hint forecast-note">
        Начисления берутся из счетов. Для договоров без счёта — ставка × площадь
        × доля дней аренды в месяце. Учтены только внесённые расходы; будущие
        платежи и новые договоры в расчёт не входят.
      </p>
    </div>
  );
}
