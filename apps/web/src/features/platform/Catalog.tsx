import { useState } from "react";
import { Button, Input, Select, Textarea } from "../../ui";
import { usePlatform } from "./usePlatform";
import type { CatalogItem } from "../../../../../packages/contracts/src/operations-platform";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import type { Props } from "../operations/shared";
export function Catalog({
  kind,
  ...props
}: Props & { kind: "templates" | "materials" | "contractors" }) {
  const { data, error, busy, mutate } = usePlatform(props.token);
  const [draft, setDraft] = useState<CatalogItem | null>(null);
  const [query, setQuery] = useState("");
  const canWrite = hasPermission(
    props.user,
    kind === "templates" ? "maintenance.write" : "services.write",
  );
  const change = (key: string, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const body = {
      propertyId: draft.propertyId,
      name: draft.name,
      ...(draft.id ? { updatedAt: draft.updatedAt } : {}),
      ...(kind === "templates"
        ? { instructions: draft.instructions, checklist: draft.checklist }
        : kind === "materials"
          ? { unit: draft.unit, price: draft.price, active: draft.active }
          : { inn: draft.inn, contact: draft.contact, active: draft.active }),
    };
    if (
      await mutate(
        `/api/maintenance/${kind}${draft.id ? "/" + draft.id : ""}`,
        body,
        draft.id ? "PUT" : "POST",
      )
    )
      setDraft(null);
  };
  return (
    <div className="platform-section">
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="mvp-actions">
        <Input
          aria-label="Поиск в справочнике"
          placeholder="Название"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canWrite && (
          <Button
            variant="primary"
            onClick={() =>
              setDraft({
                id: "",
                propertyId: props.overview.properties[0]?.id ?? "",
                name: "",
                updatedAt: "",
                instructions: "",
                checklist: [""],
                unit: "шт.",
                price: 0,
                inn: "",
                contact: "",
                active: true,
              })
            }
          >
            Добавить
          </Button>
        )}
      </div>
      {draft && (
        <form className="mvp-card form-grid" onSubmit={save}>
          <h3 className="form-span-2">
            {draft.id ? "Редактирование" : "Новая запись"}
          </h3>
          <label>
            Название
            <Input
              required
              value={draft.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            Объект
            <Select
              disabled={!!draft.id}
              value={draft.propertyId}
              onChange={(e) => change("propertyId", e.target.value)}
            >
              {props.overview.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          {kind === "templates" ? (
            <>
              <label>
                Инструкция
                <Textarea
                  value={draft.instructions}
                  onChange={(e) => change("instructions", e.target.value)}
                />
              </label>
              <label>
                Чек-лист, по пункту на строку
                <Textarea
                  required
                  value={draft.checklist?.join("\n")}
                  onChange={(e) =>
                    change("checklist", e.target.value.split("\n"))
                  }
                />
              </label>
              <p className="field-hint">
                Изменение регламента создаёт новую версию. Существующие графики
                сохраняют утверждённый чек-лист; выберите регламент повторно в
                графике, чтобы обновить его.
              </p>
            </>
          ) : kind === "materials" ? (
            <>
              <label>
                Единица измерения
                <Input
                  required
                  value={draft.unit}
                  onChange={(e) => change("unit", e.target.value)}
                />
              </label>
              <label>
                Цена без НДС, ₽
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => change("price", Number(e.target.value))}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                ИНН
                <Input
                  required
                  pattern="[0-9]{10}|[0-9]{12}"
                  value={draft.inn}
                  onChange={(e) => change("inn", e.target.value)}
                />
              </label>
              <label>
                Контакт
                <Input
                  value={draft.contact}
                  onChange={(e) => change("contact", e.target.value)}
                />
              </label>
            </>
          )}
          {kind !== "templates" && (
            <label>
              <Input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => change("active", e.target.checked)}
              />
              Доступен в каталоге
            </label>
          )}
          <div className="mvp-actions">
            <Button type="submit" variant="primary" busy={busy}>
              Сохранить
            </Button>
            <Button disabled={busy} onClick={() => setDraft(null)}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      <div className="platform-list">
        {data[kind]
          .filter((r) =>
            r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .map((row) => (
            <article key={row.id} className="platform-row">
              <div>
                <strong>{row.name}</strong>
                <p>
                  {
                    props.overview.properties.find(
                      (p) => p.id === row.propertyId,
                    )?.name
                  }
                </p>
              </div>
              <span>
                {kind === "templates"
                  ? `Версия ${row.version} · ${row.checklist?.length} пунктов`
                  : kind === "materials"
                    ? `${row.price} ₽ / ${row.unit}`
                    : `ИНН ${row.inn}`}
              </span>
              <span>{row.active === false ? "Отключён" : row.contact}</span>
              {canWrite && (
                <Button disabled={busy} onClick={() => setDraft({ ...row })}>
                  Изменить
                </Button>
              )}
            </article>
          ))}
      </div>
      {!data[kind].length && <p className="empty-state">Записей пока нет</p>}
    </div>
  );
}
