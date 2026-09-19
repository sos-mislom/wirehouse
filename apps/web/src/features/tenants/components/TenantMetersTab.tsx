import { useWorkspace } from "../../../app/WorkspaceContext";
import { ResponsiveTable } from "../../../ResponsiveTable";
import { formatArea, formatDateTime, formatMoney } from "../../../shared/format";
import { type TenantMeter } from "../../../shared/types";
import { Button, Input, Select } from "../../../ui";

export function TenantMetersTab() {
  const {
    tenantDetail,
    handleMeterReadingSubmit,
    handleFieldChange,
    setMeterReadingForm,
    meterReadingForm,
    busyAction,
    locale,
    t,
    ui,
  } = useWorkspace();

  if (!tenantDetail) return null;

  const meterTypeLabels: Record<TenantMeter["meterType"], string> = {
    power: locale === "ru" ? "Энергопотребление" : "Power",
    electricity: locale === "ru" ? "Электроэнергия" : "Electricity",
    cold_chain: locale === "ru" ? "Холодильный контур" : "Cold chain",
    heating: locale === "ru" ? "Отопление" : "Heating",
    water: locale === "ru" ? "Вода" : "Water",
  };

  return (
    <article className="mvp-card">
      <form className="mvp-form" onSubmit={handleMeterReadingSubmit}>
        <label>
          <span>{t.fields.unit}</span>
          <Select
            name="unitId"
            onChange={handleFieldChange(setMeterReadingForm)}
            required
            value={meterReadingForm.unitId}
          >
            {tenantDetail.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.number} · {formatArea(unit.area, locale)}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>{locale === "ru" ? "Период" : "Period"}</span>
          <Input
            name="period"
            onChange={handleFieldChange(setMeterReadingForm)}
            required
            type="month"
            value={meterReadingForm.period}
          />
        </label>
        <label>
          <span>{locale === "ru" ? "Счетчик" : "Meter"}</span>
          <Select
            name="meterType"
            onChange={handleFieldChange(setMeterReadingForm)}
            value={meterReadingForm.meterType}
          >
            {Object.entries(meterTypeLabels).map(([meterType, label]) => (
              <option key={meterType} value={meterType}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>{locale === "ru" ? "Предыдущее" : "Previous"}</span>
          <Input
            name="previousValue"
            onChange={handleFieldChange(setMeterReadingForm)}
            type="number"
            value={meterReadingForm.previousValue}
          />
        </label>
        <label>
          <span>{locale === "ru" ? "Текущее" : "Current"}</span>
          <Input
            name="value"
            onChange={handleFieldChange(setMeterReadingForm)}
            required
            type="number"
            value={meterReadingForm.value}
          />
        </label>
        <label>
          <span>{locale === "ru" ? "Тариф" : "Tariff"}</span>
          <Input
            name="tariffRate"
            onChange={handleFieldChange(setMeterReadingForm)}
            type="number"
            value={meterReadingForm.tariffRate}
          />
        </label>
        <Button
          variant="primary"
          className="primary-button"
          disabled={busyAction === "meter-reading"}
          type="submit"
        >
          {locale === "ru" ? "Сохранить показание" : "Save reading"}
        </Button>
      </form>
      <div className="mvp-table-wrap">
        <ResponsiveTable className="mvp-table">
          <thead>
            <tr>
              <th>{locale === "ru" ? "Счетчик" : "Meter"}</th>
              <th>{t.fields.unit}</th>
              <th>{locale === "ru" ? "Период" : "Period"}</th>
              <th>{locale === "ru" ? "Показание" : "Reading"}</th>
              <th>{locale === "ru" ? "Расход" : "Consumption"}</th>
              <th>{locale === "ru" ? "Сумма" : "Charge"}</th>
              <th>{locale === "ru" ? "Динамика" : "Delta"}</th>
              <th>{t.fields.status}</th>
              <th>{t.fields.endDate}</th>
            </tr>
          </thead>
          <tbody>
            {tenantDetail.meters.map((meter) => (
              <tr key={meter.id}>
                <td>{meterTypeLabels[meter.meterType] ?? meter.name}</td>
                <td>{meter.unitNumber}</td>
                <td>{meter.period}</td>
                <td>{meter.lastValue}</td>
                <td>{meter.consumption}</td>
                <td>{formatMoney(meter.chargeAmount, locale)}</td>
                <td>{meter.deltaPct}%</td>
                <td>
                  {meter.status === "attention"
                    ? ui.riskSeverity.warning
                    : ui.paymentStatus.paid}
                </td>
                <td>{formatDateTime(meter.updatedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </div>
      {tenantDetail.meters.length === 0 ? (
        <div className="empty-state">{t.hints.noData}</div>
      ) : null}
    </article>
  );
}
