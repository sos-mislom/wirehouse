import { useEffect } from "react";
import { Select } from "../../ui";
import { Feedback, useResource } from "../business/shared";

type AccountChoice = {
  id: string;
  number: string;
  unitId: string;
  sourceName: string;
};

export function MeterAccountField({
  token,
  unitId,
  value,
  onChange,
}: {
  token: string;
  unitId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const resource = useResource<{ accounts: AccountChoice[] }>(
    token,
    "/api/readings",
    { accounts: [] },
  );
  const eligible = resource.data.accounts.filter((a) => a.unitId === unitId);
  useEffect(() => {
    if (!resource.loading && value && !eligible.some((a) => a.id === value))
      onChange("");
  }, [unitId, value, resource.loading, resource.data.accounts]);
  return (
    <div className="form-span-full">
      <label>
        Лицевой счёт для обмена с 1С
        <Select
          aria-label="Лицевой счёт для обмена с 1С"
          value={value}
          disabled={!unitId || resource.loading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Учитывать только на сайте</option>
          {eligible.map((account) => (
            <option key={account.id} value={account.id}>
              {account.number} · {account.sourceName}
            </option>
          ))}
        </Select>
      </label>
      <Feedback error={resource.error} loading={resource.loading} />
      <p className="field-hint">
        {value
          ? "Прибор будет зарегистрирован в 1С. После подтверждения регистрации можно принять первое показание."
          : unitId && !resource.loading && !eligible.length
            ? "Для этого помещения нет доступного лицевого счёта. Его привязку настраивает администратор."
            : "Для передачи показаний в 1С выберите лицевой счёт помещения."}
      </p>
    </div>
  );
}
