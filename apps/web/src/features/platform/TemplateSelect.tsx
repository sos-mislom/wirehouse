import { Select } from "../../ui";
import { usePlatform } from "./usePlatform";
import type { CatalogItem } from "../../../../../packages/contracts/src/operations-platform";
export function TemplateSelect({
  token,
  propertyId,
  value,
  onSelect,
}: {
  token: string;
  propertyId: string;
  value: string;
  onSelect: (item: CatalogItem | undefined) => void;
}) {
  const { data, error } = usePlatform(token);
  return (
    <label>
      Регламент{error && <span role="alert">{error}</span>}
      <Select
        value={value}
        onChange={(e) =>
          onSelect(data.templates.find((t) => t.id === e.target.value))
        }
      >
        <option value="">Собственный чек-лист</option>
        {data.templates
          .filter((t) => t.propertyId === propertyId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · версия {t.version}
            </option>
          ))}
      </Select>
    </label>
  );
}
