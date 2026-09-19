type Point = { id: string; label: string; forecast: number };
const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
export function ForecastChart({ series }: { series: Point[] }) {
  const maximum = Math.max(
    1,
    ...series.map((point) => Math.abs(point.forecast)),
  );
  return (
    <div className="forecast-comparison">
      {series.map((point) => (
        <div className="forecast-month" key={point.id}>
          <span>{point.label}</span>
          <strong>{money(point.forecast)}</strong>
          <div className="forecast-track" aria-hidden="true">
            <i
              className={point.forecast < 0 ? "forecast-negative" : ""}
              style={{
                width: `${(Math.abs(point.forecast) / maximum) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
