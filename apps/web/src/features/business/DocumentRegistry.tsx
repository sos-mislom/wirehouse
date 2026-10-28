import { useState, type FormEvent } from "react";
import type { EntityDocument } from "../../../../../packages/contracts/src/business-workflows";
import type { AccountingWorkspace } from "../../../../../packages/contracts/src/accounting";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { Button, Input, Select } from "../../ui";
import {
  Disclosure,
  Feedback,
  Register,
  date,
  downloadDocument,
  uploadDocument,
  useResource,
} from "./shared";
const entities = {
  properties: "Объект",
  buildings: "Корпус / строение",
  units: "Помещение",
  equipment: "Оборудование",
  leases: "Договор",
  personal_accounts: "Лицевой счет",
  tickets: "Заявка",
  meters: "Прибор учета",
};
const categories = {
  contract: "Договор",
  act: "Акт",
  instruction: "Инструкция",
  photo: "Фотография",
  other: "Прочее",
};
export function DocumentRegistry({
  entityType,
  entityId,
}: {
  entityType?: keyof typeof entities;
  entityId?: string;
}) {
  const { session, overview, operations, tickets } = useWorkspace(),
    { token, user } = session;
  const path =
    "/api/documents" +
    (entityType ? `?entityType=${entityType}&entityId=${entityId}` : "");
  const resource = useResource<{ items: EntityDocument[] }>(token, path, {
      items: [],
    }),
    accounts = useResource<AccountingWorkspace>(token, "/api/accounting", {
      sources: [],
      accounts: [],
      statements: [],
      links: [],
    });
  const structure = useResource<{
    buildings: { id: string; propertyId: string; name: string }[];
  }>(token, "/api/documents/contexts", { buildings: [] });
  const [category, setCategory] = useState(""),
    [type, setType] = useState<keyof typeof entities>(
      entityType ?? "properties",
    ),
    [links, setLinks] = useState<
      { entityType: keyof typeof entities; entityId: string }[]
    >(entityType && entityId ? [{ entityType, entityId }] : []),
    [selected, setSelected] = useState("");
  const choices = (kind: keyof typeof entities) =>
    kind === "properties"
      ? overview.properties.map((r) => ({ id: r.id, label: r.name }))
      : kind === "buildings"
        ? structure.data.buildings.map((r) => ({
            id: r.id,
            label: `${overview.properties.find((p) => p.id === r.propertyId)?.name ?? ""} · ${r.name}`,
          }))
        : kind === "units"
          ? overview.units.map((r) => ({
              id: r.id,
              label: `${r.propertyName} · ${r.number}`,
            }))
          : kind === "leases"
            ? overview.leases.map((r) => ({
                id: r.id,
                label: r.contractNumber,
              }))
            : kind === "personal_accounts"
              ? accounts.data.accounts.map((r) => ({
                  id: r.id,
                  label: r.number,
                }))
              : kind === "tickets"
                ? tickets.map((r) => ({
                    id: r.id,
                    label: `${r.number} · ${r.title}`,
                  }))
                : (
                    operations?.[
                      kind === "equipment" ? "equipment" : "meters"
                    ] ?? []
                  ).map((r) => ({ id: r.id, label: String(r.name) }));
  const linkLabel = (l: {
    entityType: keyof typeof entities;
    entityId: string;
  }) =>
    `${entities[l.entityType]} · ${choices(l.entityType).find((r) => r.id === l.entityId)?.label ?? l.entityId}`;
  const doc = resource.data.items.find((d) => d.id === selected);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form),
      file = v.get("file");
    if (!(file instanceof File) || !file.size) return;
    void resource.run(async () => {
      await uploadDocument(token, file, links, String(v.get("category")));
      form.reset();
    }, "Документ добавлен");
  };
  return (
    <div className="business-stack">
      <Feedback {...resource} />
      <Register
        title="Документы"
        rows={resource.data.items.filter(
          (d) => !category || d.category === category,
        )}
        searchText={(d) => `${d.name} ${d.links.map(linkLabel).join(" ")}`}
        selectedId={selected}
        onSelect={(d) => setSelected(d.id)}
        columns={[
          {
            key: "name",
            label: "Название",
            render: (d) => <strong>{d.name}</strong>,
          },
          {
            key: "category",
            label: "Категория",
            render: (d) =>
              categories[d.category as keyof typeof categories] ?? d.category,
            optional: true,
          },
          {
            key: "links",
            label: "Связи",
            render: (d) =>
              d.links.map((l) => <small key={l.id}>{linkLabel(l)}</small>),
          },
          {
            key: "date",
            label: "Добавлен",
            render: (d) => date(d.createdAt),
            optional: true,
          },
        ]}
        filters={
          <label>
            Категория
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Все</option>
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
        }
      />
      {doc && (
        <section className="business-detail">
          <div className="register-heading">
            <h3>{doc.name}</h3>
            <Button onClick={() => setSelected("")}>Закрыть детали</Button>
          </div>
          <p>{doc.links.map(linkLabel).join("; ")}</p>
          <p className="field-hint">
            {doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(1)} КБ · ` : ""}
            {date(doc.createdAt)}
          </p>
          <Button
            busy={resource.busy}
            onClick={() =>
              void resource.run(
                () => downloadDocument(token, doc.id, doc.name),
                "Файл скачан",
              )
            }
          >
            Скачать файл
          </Button>
        </section>
      )}
      {hasPermission(user, "documents.write") && (
        <Disclosure title="Добавить документ">
          <form className="form-grid" onSubmit={submit}>
            {!entityType && (
              <>
                <label>
                  Привязать к
                  <Select
                    value={type}
                    onChange={(e) =>
                      setType(e.target.value as keyof typeof entities)
                    }
                  >
                    {Object.entries(entities).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  Запись
                  <Select
                    value=""
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        !links.some(
                          (l) =>
                            l.entityType === type &&
                            l.entityId === e.target.value,
                        )
                      )
                        setLinks([
                          ...links,
                          { entityType: type, entityId: e.target.value },
                        ]);
                    }}
                  >
                    <option value="">Добавить связь</option>
                    {choices(type).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </>
            )}
            <div className="form-span-full">
              {links.map((l, i) => (
                <div className="mvp-actions" key={l.entityType + l.entityId}>
                  <span>{linkLabel(l)}</span>
                  {!entityType && (
                    <Button
                      variant="text"
                      onClick={() => setLinks(links.filter((_, j) => i !== j))}
                    >
                      Убрать связь
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <label>
              Категория
              <Select name="category">
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
            <label className="business-file">
              Файл, до 12 МБ
              <Input
                name="file"
                type="file"
                required
                accept=".pdf,.docx,.xlsx,.txt,.dxf,image/jpeg,image/png,image/webp"
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              busy={resource.busy}
              disabled={!links.length}
            >
              Добавить документ
            </Button>
          </form>
        </Disclosure>
      )}
    </div>
  );
}
