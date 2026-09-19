import { useEffect, useState } from "react";
import { isOpenTicket } from "../../../../../packages/contracts/src/domain.js";
import { Button, Input, Select } from "../../ui";
import { OperationsData, Row, Ticket, Unit, request } from "./shared";
export function UnitStructure({
  token,
  properties,
  units,
  tickets,
  equipment,
  onUnit,
}: {
  token: string;
  properties: { id: string; name: string }[];
  units: Unit[];
  tickets: Ticket[];
  equipment: Row[];
  onUnit: (id: string) => void;
}) {
  const [tenant, setTenant] = useState("");
  const [mode, setMode] = useState("tree");
  const [plans, setPlans] = useState<Row[]>([]);
  const [planId, setPlanId] = useState("");
  const [placing, setPlacing] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request<OperationsData>("/api/operations", token)
      .then((d) => {
        if (active) setPlans(d.floorplans || []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const visible = units.filter((u) => !tenant || u.tenantName === tenant);
  const groups = new Map<string, Unit[]>();
  visible.forEach((u) => {
    const key = `${properties.find((p) => p.id === u.propertyId)?.name} → ${u.building || "Основной корпус"} → ${u.entrance || "Общая секция"} → Этаж ${u.floor}`;
    groups.set(key, [...(groups.get(key) || []), u]);
  });
  const visiblePlans = plans.filter((p) =>
    units.some((u) => u.propertyId === p.propertyId),
  );
  const plan = visiblePlans.find((p) => p.id === planId) || visiblePlans[0];
  const caption = (unit: Unit) =>
    `${unit.number} · ${unit.area} м² · ${unit.tenantName || (unit.status === "maintenance" ? "Обслуживание" : "Свободно")} · оборудование: ${equipment.filter((e) => e.unitId === unit.id).length} · заявки: ${tickets.filter((t) => t.unitId === unit.id && isOpenTicket(t.status)).length}`;
  return (
    <article className="mvp-card unit-structure">
      <div className="mvp-card-head">
        <div>
          <h3>Структура объекта</h3>
          <p>Объект → корпус → подъезд → этаж → помещение</p>
        </div>
        <div className="mvp-actions">
          <Select
            aria-label="Фильтр по арендатору"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
          >
            <option value="">Все арендаторы</option>
            {[...new Set(units.map((u) => u.tenantName).filter(Boolean))].map(
              (name) => (
                <option key={name} value={name!}>
                  {name}
                </option>
              ),
            )}
          </Select>
          <Button
            variant="secondary"
            className="secondary-button"
            type="button"
            onClick={() => setMode(mode === "tree" ? "plan" : "tree")}
          >
            {mode === "tree" ? "Планы объекта" : "Дерево помещений"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      {mode === "tree" ? (
        [...groups]
          .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
          .map(([name, rows]) => (
            <details key={name} open>
              <summary>
                {name} · {rows.length}
              </summary>
              <div className="unit-map-grid">
                {rows.map((u) => (
                  <Button
                    variant="plain"
                    type="button"
                    key={u.id}
                    className={`unit-map-cell unit-map-cell--${u.status}`}
                    onClick={() => onUnit(u.id)}
                    title={caption(u)}
                  >
                    <strong>{u.number}</strong>
                    <span>
                      {u.area} м² ·{" "}
                      {u.tenantName ||
                        (u.status === "maintenance"
                          ? "Обслуживание"
                          : "Свободно")}
                    </span>
                    <small>
                      {equipment.filter((e) => e.unitId === u.id).length}{" "}
                      оборудования ·{" "}
                      {
                        tickets.filter(
                          (t) => t.unitId === u.id && isOpenTicket(t.status),
                        ).length
                      }{" "}
                      заявок
                    </small>
                  </Button>
                ))}
              </div>
            </details>
          ))
      ) : (
        <>
          <p className="field-hint">
            Загрузите генеральный или поэтажный план, затем выберите помещение и
            укажите его положение на изображении. Карточки помещений открываются
            по меткам.
          </p>
          <div className="mvp-actions">
            <Select
              aria-label="План"
              value={plan?.id || ""}
              onChange={(e) => {
                setPlanId(e.target.value);
                setPlacing("");
              }}
            >
              {visiblePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <label className="secondary-button">
              Загрузить план (PNG / JPEG, до 2 МБ)
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || !units.length}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    setError("План должен быть не больше 2 МБ");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const result = await request<{ item: Row }>(
                        "/api/operations/floorplans",
                        token,
                        "POST",
                        {
                          name: file.name,
                          propertyId: units[0].propertyId,
                          image: reader.result,
                          markers: [],
                        },
                      );
                      setPlans((p) => [...p, result.item]);
                      setPlanId(result.item.id);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {plan && (
              <Select
                aria-label="Разместить помещение"
                value={placing}
                onChange={(e) => setPlacing(e.target.value)}
              >
                <option value="">Разместить / переместить помещение</option>
                {units
                  .filter((u) => u.propertyId === plan.propertyId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.building} · {u.floor} этаж · {u.number}
                    </option>
                  ))}
              </Select>
            )}
          </div>
          {plan ? (
            <div
              className={`floor-plan ${placing ? "floor-plan--placing" : ""}`}
              onClick={async (e) => {
                if (!placing || busy) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const markers = [
                  ...(plan.markers || []).filter(
                    (m: Row) => m.unitId !== placing,
                  ),
                  {
                    unitId: placing,
                    x: ((e.clientX - rect.left) / rect.width) * 100,
                    y: ((e.clientY - rect.top) / rect.height) * 100,
                  },
                ];
                setBusy(true);
                try {
                  const result = await request<{ item: Row }>(
                    `/api/operations/floorplans/${plan.id}`,
                    token,
                    "PUT",
                    { markers, updatedAt: plan.updatedAt },
                  );
                  setPlans((rows) =>
                    rows.map((p) => (p.id === plan.id ? result.item : p)),
                  );
                  setPlacing("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <img alt={plan.name} src={plan.image} />
              {(plan.markers || []).map((marker: Row) => {
                const unit = visible.find((u) => u.id === marker.unitId);
                return unit ? (
                  <Button
                    variant="plain"
                    key={unit.id}
                    type="button"
                    className={`plan-marker unit-map-cell--${unit.status}`}
                    style={{
                      left: `clamp(40px, ${marker.x}%, calc(100% - 40px))`,
                      top: `clamp(16px, ${marker.y}%, calc(100% - 16px))`,
                    }}
                    title={caption(unit)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!placing) onUnit(unit.id);
                    }}
                  >
                    {unit.number}
                  </Button>
                ) : null;
              })}
            </div>
          ) : (
            <div className="empty-state">
              Планы ещё не загружены. Дерево помещений доступно в соседнем
              режиме.
            </div>
          )}
        </>
      )}
    </article>
  );
}
