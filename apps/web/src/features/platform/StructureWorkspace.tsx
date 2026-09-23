import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { Button, Input, Select } from "../../ui";
import type {
  Structure,
  Building,
  Entrance,
  Floor,
} from "../../../../../packages/contracts/src/operations-platform";
import type { Unit, Ticket, Row } from "../operations/shared";
import { PlanEditor } from "./plans/PlanEditor";
type Props = {
  token: string;
  properties: { id: string; name: string }[];
  units: Unit[];
  tickets: Ticket[];
  equipment: Row[];
  onUnit: (id: string) => void;
  onTicket?: (id: string) => void;
  canWrite?: boolean;
  embedded?: boolean;
};
type Node = Partial<Building & Entrance & Floor>;
export function StructureWorkspace(props: Props) {
  const [data, setData] = useState<Structure>({
    buildings: [],
    entrances: [],
    floors: [],
  });
  const [mode, setMode] = useState("tree"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<keyof Structure>("buildings"),
    [draft, setDraft] = useState<Node | null>(null);
  const [property, setProperty] = useState(props.properties[0]?.id ?? "");
  const reload = async () =>
    setData(
      await apiRequest<Structure>("/api/structure", { token: props.token }),
    );
  useEffect(() => {
    let active = true;
    apiRequest<Structure>("/api/structure", { token: props.token })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.token]);
  const change = (key: string, value: string | number) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        `/api/structure/${kind}${draft.id ? "/" + draft.id : ""}`,
        {
          token: props.token,
          method: draft.id ? "PUT" : "POST",
          body: {
            propertyId: property,
            name: draft.name,
            ...(draft.id ? { updatedAt: draft.updatedAt } : {}),
            ...(kind === "entrances"
              ? { buildingId: draft.buildingId }
              : kind === "floors"
                ? { entranceId: draft.entranceId, number: draft.number }
                : {}),
          },
        },
      );
      await reload();
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (k: keyof Structure, row: Node) => {
    setKind(k);
    setDraft({ ...row });
  };
  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await apiRequest(`/api/structure/${kind}/${draft.id}`, {
        token: props.token,
        method: "DELETE",
      });
      await reload();
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article
      className={
        props.embedded ? "platform-section" : "mvp-card platform-section"
      }
    >
      <div className="mvp-card-head">
        <h3>Структура и планы</h3>
        <div className="mvp-actions">
          <Button
            aria-pressed={mode === "tree"}
            onClick={() => setMode("tree")}
          >
            Структура
          </Button>
          <Button
            aria-pressed={mode === "plans"}
            onClick={() => setMode("plans")}
          >
            Планы
          </Button>
        </div>
      </div>
      <label>
        Объект
        <Select
          value={property}
          onChange={(e) => {
            setProperty(e.target.value);
            setDraft(null);
          }}
        >
          {props.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      {mode === "plans" ? (
        <PlanEditor {...props} propertyId={property} structure={data} />
      ) : (
        <>
          {props.canWrite && (
            <div className="mvp-actions">
              {(["buildings", "entrances", "floors"] as const).map((k) => (
                <Button
                  key={k}
                  onClick={() => {
                    setKind(k);
                    setDraft({
                      name: "",
                      propertyId: property,
                      number: 1,
                      buildingId: "",
                      entranceId: "",
                    });
                  }}
                >
                  {
                    {
                      buildings: "Добавить корпус",
                      entrances: "Добавить подъезд",
                      floors: "Добавить этаж",
                    }[k]
                  }
                </Button>
              ))}
            </div>
          )}
          {draft && (
            <form className="form-grid" onSubmit={save}>
              <label>
                Название
                <Input
                  required
                  value={draft.name ?? ""}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              {kind === "entrances" && (
                <label>
                  Корпус
                  <Select
                    required
                    value={draft.buildingId ?? ""}
                    onChange={(e) => change("buildingId", e.target.value)}
                  >
                    <option value="">Выберите корпус</option>
                    {data.buildings
                      .filter((b) => b.propertyId === property)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </Select>
                </label>
              )}
              {kind === "floors" && (
                <>
                  <label>
                    Подъезд
                    <Select
                      required
                      value={draft.entranceId ?? ""}
                      onChange={(e) => change("entranceId", e.target.value)}
                    >
                      <option value="">Выберите подъезд</option>
                      {data.entrances
                        .filter((b) => b.propertyId === property)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {
                              data.buildings.find((v) => v.id === b.buildingId)
                                ?.name
                            }{" "}
                            / {b.name}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label>
                    Номер этажа
                    <Input
                      type="number"
                      required
                      min="-10"
                      max="300"
                      value={draft.number}
                      onChange={(e) => change("number", Number(e.target.value))}
                    />
                  </label>
                </>
              )}
              <div className="mvp-actions">
                <Button variant="primary" type="submit" busy={busy}>
                  Сохранить
                </Button>
                <Button disabled={busy} onClick={() => setDraft(null)}>
                  Отмена
                </Button>
                {draft.id && (
                  <Button disabled={busy} onClick={remove}>
                    Удалить пустой узел
                  </Button>
                )}
              </div>
            </form>
          )}
          <div className="structure-tree">
            {data.buildings
              .filter((b) => b.propertyId === property)
              .map((b) => (
                <details key={b.id} open>
                  <summary>{b.name || "Корпус не указан"}</summary>
                  {props.canWrite && (
                    <Button variant="text" onClick={() => edit("buildings", b)}>
                      Изменить корпус
                    </Button>
                  )}
                  {data.entrances
                    .filter((e) => e.buildingId === b.id)
                    .map((e) => (
                      <details key={e.id} open>
                        <summary>{e.name || "Подъезд не указан"}</summary>
                        {props.canWrite && (
                          <Button
                            variant="text"
                            onClick={() => edit("entrances", e)}
                          >
                            Изменить подъезд
                          </Button>
                        )}
                        {data.floors
                          .filter((f) => f.entranceId === e.id)
                          .sort((a, b) => a.number - b.number)
                          .map((f) => (
                            <details key={f.id} open>
                              <summary>
                                {f.name} ·{" "}
                                {
                                  props.units.filter((u) => u.floorId === f.id)
                                    .length
                                }{" "}
                                помещений
                              </summary>
                              {props.canWrite && (
                                <Button
                                  variant="text"
                                  onClick={() => edit("floors", f)}
                                >
                                  Изменить этаж
                                </Button>
                              )}
                              <div className="structure-units">
                                {props.units
                                  .filter((u) => u.floorId === f.id)
                                  .map((u) => (
                                    <Button
                                      key={u.id}
                                      onClick={() => props.onUnit(u.id)}
                                    >
                                      <strong>{u.number}</strong>
                                      <span>
                                        {u.area} м² ·{" "}
                                        {u.tenantName || "Без арендатора"}
                                      </span>
                                    </Button>
                                  ))}
                              </div>
                            </details>
                          ))}
                      </details>
                    ))}
                </details>
              ))}
          </div>
          {!data.buildings.some((b) => b.propertyId === property) && (
            <p>Структура пока не заполнена. Добавьте корпус, подъезд и этаж.</p>
          )}
        </>
      )}
    </article>
  );
}
