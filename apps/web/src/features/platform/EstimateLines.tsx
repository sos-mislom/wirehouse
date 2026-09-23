import { Button, Input, Select } from "../../ui";
import type {
  EstimateInput,
  CatalogItem,
} from "../../../../../packages/contracts/src/operations-platform";
import type { Row } from "../operations/shared";
export function EstimateLines({
  lines,
  propertyId,
  services,
  materials,
  onChange,
}: {
  lines: EstimateInput["lines"];
  propertyId: string;
  services: Row[];
  materials: CatalogItem[];
  onChange: (lines: EstimateInput["lines"]) => void;
}) {
  const line = (
    index: number,
    patch: Partial<EstimateInput["lines"][number]>,
  ) => onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  return (
    <>
      {lines.map((l, i) => (
        <fieldset className="estimate-line" key={i}>
          <legend>Позиция {i + 1}</legend>
          <label>
            Тип
            <Select
              value={l.kind}
              onChange={(e) =>
                line(i, {
                  kind: e.target.value as typeof l.kind,
                  catalogId: null,
                })
              }
            >
              <option value="labor">Работа</option>
              <option value="material">Материал</option>
              <option value="service">Услуга</option>
            </Select>
          </label>
          {l.kind !== "material" && (
            <label>
              Из каталога услуг
              <Select
                value={l.catalogId ?? ""}
                onChange={(e) => {
                  const s = services.find((s) => s.id === e.target.value);
                  line(i, {
                    catalogId: s?.id ?? null,
                    ...(s
                      ? {
                          description: s.name!,
                          unit: l.kind === "labor" ? "ч" : "усл.",
                          unitPrice: s.paid
                            ? l.kind === "labor"
                              ? s.hourlyRate
                              : s.basePrice
                            : 0,
                        }
                      : {}),
                  });
                }}
              >
                <option value="">Собственная позиция</option>
                {services
                  .filter((s) => s.propertyId === propertyId && s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </label>
          )}
          {l.kind === "material" && (
            <label>
              Из каталога
              <Select
                value={l.catalogId ?? ""}
                onChange={(e) => {
                  const m = materials.find((m) => m.id === e.target.value);
                  line(i, {
                    catalogId: m?.id ?? null,
                    ...(m
                      ? {
                          description: m.name,
                          unit: m.unit!,
                          unitPrice: m.price!,
                        }
                      : {}),
                  });
                }}
              >
                <option value="">Собственная позиция</option>
                {materials
                  .filter((m) => m.propertyId === propertyId && m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </label>
          )}
          <label className="estimate-description">
            Наименование
            <Input
              required
              value={l.description}
              onChange={(e) => line(i, { description: e.target.value })}
            />
          </label>
          <label>
            Ед.
            <Input
              required
              value={l.unit}
              onChange={(e) => line(i, { unit: e.target.value })}
            />
          </label>
          <label>
            Количество
            <Input
              required
              type="number"
              min="0.001"
              max="1000000"
              step="0.001"
              value={l.quantity}
              onChange={(e) => line(i, { quantity: Number(e.target.value) })}
            />
          </label>
          <label>
            Цена, ₽
            <Input
              required
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              value={l.unitPrice}
              onChange={(e) => line(i, { unitPrice: Number(e.target.value) })}
            />
          </label>
          <label>
            НДС, %
            <Select
              value={l.vatRate}
              onChange={(e) =>
                line(i, { vatRate: e.target.value as typeof l.vatRate })
              }
            >
              {["0", "5", "7", "10", "20", "22"].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </label>
          <Button
            aria-label={`Удалить позицию ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((_, j) => i !== j))}
          >
            Удалить
          </Button>
        </fieldset>
      ))}
    </>
  );
}
