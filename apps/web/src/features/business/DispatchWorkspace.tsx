import { useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest } from "../../api/client";
import { Button, Input, Select } from "../../ui";
import { Disclosure, Feedback, useResource } from "./shared";
import { ticketCategoryOptions } from "../../projectData";
import type {
  ServiceTeam,
  DispatchRule,
} from "../../../../../packages/contracts/src/business-workflows";

export function DispatchWorkspace() {
  const { session, overview, t } = useWorkspace();
  const resource = useResource<{ teams: ServiceTeam[]; rules: DispatchRule[] }>(
    session.token,
    "/api/dispatch",
    { teams: [], rules: [] },
  );
  const [property, setProperty] = useState(overview.properties[0]?.id ?? ""),
    [teamId, setTeamId] = useState(""),
    [category, setCategory] = useState<string>("other");
  if (!["admin", "manager"].includes(session.user.role)) return null;
  const team = resource.data.teams.find((r) => r.id === teamId),
    rules = resource.data.rules.filter((r) => r.propertyId === property),
    rule = rules.find((r) => r.category === category);
  const people = overview.team.filter(
    (p) => p.role !== "tenant" && (!p.propertyId || p.propertyId === property),
  );
  const save = (kind: string, id: string | undefined, body: unknown) =>
    resource.run(
      () =>
        apiRequest(`/api/dispatch/${kind}${id ? "/" + id : ""}`, {
          token: session.token,
          method: "POST",
          body,
        }),
      "Настройка сохранена. Новые заявки получат актуальный маршрут.",
    );
  return (
    <Disclosure title="Службы и маршруты приемки">
      <Feedback {...resource} />
      <label>
        Объект
        <Select
          value={property}
          onChange={(e) => {
            setProperty(e.target.value);
            setTeamId("");
          }}
        >
          {overview.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="business-columns">
        <section>
          <h3>Служба исполнителей</h3>
          <label>
            Редактировать
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Новая служба</option>
              {resource.data.teams
                .filter((r) => r.propertyId === property)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.active ? "" : " · отключена"}
                  </option>
                ))}
            </Select>
          </label>
          <form
            className="business-form"
            key={`${property}-${teamId}-${team?.updatedAt}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("teams", team?.id, {
                propertyId: property,
                name: String(f.get("name")),
                memberIds: f.getAll("members"),
                active: f.get("active") === "on",
                updatedAt: team?.updatedAt ?? null,
              });
            }}
          >
            <label>
              Название
              <Input
                name="name"
                required
                maxLength={300}
                defaultValue={team?.name ?? ""}
              />
            </label>
            <fieldset>
              <legend>Состав службы</legend>
              {people.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    name="members"
                    value={p.id}
                    defaultChecked={team?.memberIds.includes(p.id) ?? false}
                  />
                  {p.fullName}
                </label>
              ))}
            </fieldset>
            <label>
              <input
                type="checkbox"
                name="active"
                defaultChecked={team?.active ?? true}
              />
              Служба активна
            </label>
            <Button type="submit" busy={resource.busy}>
              Сохранить службу
            </Button>
          </form>
        </section>
        <section>
          <h3>Маршрут по категории</h3>
          <label>
            Категория
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {ticketCategoryOptions.map((c) => (
                <option key={c} value={c}>
                  {t.ticketCategories[c as keyof typeof t.ticketCategories]}
                </option>
              ))}
            </Select>
          </label>
          <form
            className="business-form"
            key={`${property}-${category}-${rule?.updatedAt}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("rules", rule?.id, {
                propertyId: property,
                category,
                teamId: String(f.get("teamId")),
                reviewerId: String(f.get("reviewerId")),
                active: f.get("active") === "on",
                updatedAt: rule?.updatedAt ?? null,
              });
            }}
          >
            <label>
              Служба
              <Select name="teamId" required defaultValue={rule?.teamId ?? ""}>
                <option value="" disabled>
                  Выберите службу
                </option>
                {resource.data.teams
                  .filter((r) => r.propertyId === property && r.active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              Результат принимает
              <Select
                name="reviewerId"
                required
                defaultValue={rule?.reviewerId ?? ""}
              >
                <option value="" disabled>
                  Выберите принимающего
                </option>
                {people
                  .filter((p) => ["admin", "manager"].includes(p.role))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              <input
                type="checkbox"
                name="active"
                defaultChecked={rule?.active ?? true}
              />
              Маршрут активен
            </label>
            <Button type="submit" busy={resource.busy}>
              Сохранить маршрут
            </Button>
          </form>
          <p className="field-hint">
            Маршрут фиксируется при классификации заявки. Изменение настройки не
            меняет приемку уже выданных заданий.
          </p>
        </section>
      </div>
    </Disclosure>
  );
}
