import { useEffect, useState } from "react";
import { Select } from "../../ui";
import { apiRequest } from "../../api/client";
import type { Structure } from "../../../../../packages/contracts/src/operations-platform";
export function FloorSelect({
  token,
  propertyId,
  value,
  onChange,
}: {
  token: string;
  propertyId: string;
  value: string;
  onChange: (location: {
    floorId: string;
    floor: string;
    building: string;
    entrance: string;
  }) => void;
}) {
  const [data, setData] = useState<Structure>({
      buildings: [],
      entrances: [],
      floors: [],
    }),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<Structure>("/api/structure", { token })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const floors = data.floors.filter((f) => f.propertyId === propertyId);
  return (
    <label>
      <span>Корпус / подъезд / этаж</span>
      <Select
        required
        value={value}
        onChange={(e) => {
          const f = data.floors.find((v) => v.id === e.target.value);
          if (!f) {
            onChange({ floorId: "", floor: "", building: "", entrance: "" });
            return;
          }
          const entrance = data.entrances.find((v) => v.id === f.entranceId)!;
          const building = data.buildings.find(
            (v) => v.id === entrance.buildingId,
          )!;
          onChange({
            floorId: f.id,
            floor: String(f.number),
            building: building.name,
            entrance: entrance.name,
          });
        }}
      >
        <option value="">Выберите расположение</option>
        {floors.map((f) => {
          const e = data.entrances.find((e) => e.id === f.entranceId),
            b = data.buildings.find((b) => b.id === e?.buildingId);
          return (
            <option key={f.id} value={f.id}>
              {b?.name || "Корпус не указан"} / {e?.name || "Подъезд не указан"}{" "}
              / {f.name}
            </option>
          );
        })}
      </Select>
      {error && <span role="alert">{error}</span>}
      {!floors.length && (
        <small>Сначала добавьте этаж в разделе «Помещения → Структура».</small>
      )}
    </label>
  );
}
