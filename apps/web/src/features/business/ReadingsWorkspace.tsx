import { Fragment, useEffect, useState, type FormEvent } from "react";
import type {
  ReadingPeriod,
  ReadingSubmission,
} from "../../../../../packages/contracts/src/business-workflows";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest } from "../../api/client";
import { Button, Checkbox, Input, Select, Textarea } from "../../ui";
import {
  Disclosure,
  Feedback,
  Register,
  date,
  downloadDocument,
  uploadDocument,
  useResource,
} from "./shared";
type Meter = {
  id: string;
  propertyId: string;
  unitId: string | null;
  name: string;
  initialValue: number;
  active: boolean;
  responsibleId: string | null;
};
type Data = {
  meters: Meter[];
  periods: ReadingPeriod[];
  submissions: ReadingSubmission[];
  readings: {
    id: string;
    meterId: string;
    period: string;
    value: number;
    consumption: number;
  }[];
  accounts: {
    id: string;
    number: string;
    unitId: string;
    sourceName: string;
  }[];
};
export function ReadingsWorkspace({
  workerId,
  initialMeterId = "",
}: {
  workerId?: string;
  initialMeterId?: string;
}) {
  const { session, overview, refreshWorkspace } = useWorkspace(),
    { token, user } = session;
  const resource = useResource<Data>(token, "/api/readings", {
    meters: [],
    periods: [],
    submissions: [],
    readings: [],
    accounts: [],
  });
  const [selected, setSelected] = useState(""),
    [meterId, setMeterId] = useState(initialMeterId),
    [periodId, setPeriodId] = useState(""),
    [reviewAccepted, setReviewAccepted] = useState(true),
    [status, setStatus] = useState("");
  useEffect(() => setReviewAccepted(true), [selected]);
  useEffect(() => {
    if (initialMeterId) setMeterId(initialMeterId);
  }, [initialMeterId]);
  const { data } = resource,
    meter = data.meters.find((m) => m.id === meterId),
    period = data.periods.find((p) => p.id === periodId),
    current = data.submissions.find((s) => s.id === selected),
    today = new Date().toISOString().slice(0, 10);
  const meters = data.meters.filter(
    (m) => m.active && (!workerId || m.responsibleId === workerId),
  );
  const latest = meter
    ? data.readings
        .filter((r) => r.meterId === meter.id)
        .sort((a, b) => b.period.localeCompare(a.period))[0]
    : null;
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form);
    void resource.run(async () => {
      const file = v.get("photo");
      let photoDocumentId = null;
      if (file instanceof File && file.size)
        photoDocumentId = (
          await uploadDocument(
            token,
            file,
            [{ entityType: "meters", entityId: meterId }],
            "photo",
          )
        ).item.id;
      await apiRequest("/api/readings/submissions", {
        token,
        method: "POST",
        body: {
          meterId,
          periodId,
          accountId: v.get("accountId") || null,
          value: Number(v.get("value")),
          photoDocumentId,
        },
      });
      form.reset();
    }, "Показание отправлено инженеру на проверку");
  };
  return (
    <section className="business-stack">
      <Feedback {...resource} />
      {hasPermission(user, "readings.submit") && (
        <Disclosure title="Передать показание">
          <form className="form-grid" onSubmit={send}>
            <label>
              Прибор
              <Select
                required
                value={meterId}
                onChange={(e) => {
                  setMeterId(e.target.value);
                  setPeriodId("");
                }}
              >
                <option value="">Выберите прибор</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ·{" "}
                    {overview.units.find((u) => u.id === m.unitId)?.number ??
                      "Общий"}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Период ввода
              <Select
                required
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                <option value="">Выберите период</option>
                {data.periods
                  .filter(
                    (p) =>
                      p.propertyId === meter?.propertyId &&
                      p.startsOn <= today &&
                      p.endsOn >= today,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · до {date(p.endsOn)}
                    </option>
                  ))}
              </Select>
            </label>
            {meter && (
              <Fragment key={meter.id}>
                <p className="field-hint">
                  Предыдущее показание: {latest?.value ?? meter.initialValue}.{" "}
                  {period?.photoRequired ? "Фотография обязательна." : ""}
                </p>
                <label>
                  Лицевой счет
                  <Select name="accountId" required={user.role === "tenant"}>
                    <option value="">
                      {user.role === "tenant"
                        ? "Выберите ЛС"
                        : "Без ЛС: внутренний учет"}
                    </option>
                    {data.accounts
                      .filter((a) => a.unitId === meter.unitId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.number} · {a.sourceName}
                        </option>
                      ))}
                  </Select>
                </label>
                <label>
                  Новое показание
                  <Input
                    name="value"
                    type="number"
                    min={latest?.value ?? meter.initialValue}
                    required
                    step="any"
                  />
                </label>
                <label className="business-file">
                  Фотография прибора
                  <Input
                    name="photo"
                    type="file"
                    required={period?.photoRequired}
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                  />
                </label>
              </Fragment>
            )}
            <Button
              variant="primary"
              type="submit"
              busy={resource.busy}
              disabled={!meter || !period}
            >
              Отправить на проверку
            </Button>
          </form>
          {meter &&
            !data.periods.some(
              (p) =>
                p.propertyId === meter.propertyId &&
                p.startsOn <= today &&
                p.endsOn >= today,
            ) && (
              <p className="field-hint">
                Сейчас нет открытого периода ввода. Его открывает управляющий.
              </p>
            )}
        </Disclosure>
      )}
      <Register
        title="Показания"
        rows={data.submissions.filter(
          (s) =>
            (!status || s.status === status) &&
            (!workerId || meters.some((m) => m.id === s.meterId)),
        )}
        selectedId={selected}
        onSelect={(s) => setSelected(s.id)}
        searchText={(s) =>
          `${data.meters.find((m) => m.id === s.meterId)?.name} ${data.periods.find((p) => p.id === s.periodId)?.name}`
        }
        columns={[
          {
            key: "meter",
            label: "Прибор / период",
            render: (s) => (
              <>
                {data.meters.find((m) => m.id === s.meterId)?.name}
                <small>
                  {data.periods.find((p) => p.id === s.periodId)?.name}
                </small>
              </>
            ),
          },
          {
            key: "value",
            label: "Показание",
            render: (s) => (
              <>
                {s.previous} → {s.value}
                <small>
                  Расход: {Number((s.value - s.previous).toFixed(3))}
                </small>
              </>
            ),
          },
          {
            key: "status",
            label: "Проверка",
            render: (s) => (
              <>
                {
                  {
                    pending: "На проверке",
                    accepted: "Принято",
                    rejected: "Отклонено",
                  }[s.status]
                }
                {s.anomaly && <small>Отклонение расхода</small>}
              </>
            ),
          },
          {
            key: "date",
            label: "Отправлено",
            render: (s) => date(s.createdAt),
            optional: true,
          },
        ]}
        filters={
          <label>
            Решение
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все</option>
              <option value="pending">На проверке</option>
              <option value="accepted">Принято</option>
              <option value="rejected">Отклонено</option>
            </Select>
          </label>
        }
      />
      {current && (
        <section className="business-detail">
          <div className="register-heading">
            <h3>{data.meters.find((m) => m.id === current.meterId)?.name}</h3>
            <Button onClick={() => setSelected("")}>Закрыть детали</Button>
          </div>
          <dl className="business-stats">
            <div>
              <dt>Предыдущее</dt>
              <dd>{current.previous}</dd>
            </div>
            <div>
              <dt>Новое</dt>
              <dd>{current.value}</dd>
            </div>
            <div>
              <dt>Расход</dt>
              <dd>{Number((current.value - current.previous).toFixed(3))}</dd>
            </div>
          </dl>
          {current.anomaly && (
            <p className="notice">
              Расход отличается от предыдущего периода больше допустимого
              порога. Решение требует обоснования инженера.
            </p>
          )}
          {current.photoDocumentId && (
            <Button
              onClick={() =>
                void resource.run(
                  () =>
                    downloadDocument(
                      token,
                      current.photoDocumentId!,
                      "Показание.jpg",
                    ),
                  "Фото скачано",
                )
              }
            >
              Фотография прибора
            </Button>
          )}
          {current.reason && <p>Решение: {current.reason}</p>}
          {current.status === "pending" &&
            hasPermission(user, "readings.review") && (
              <form
                key={current.id}
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget);
                  void resource.run(async () => {
                    await apiRequest(
                      `/api/readings/submissions/${current.id}/review`,
                      {
                        token,
                        method: "POST",
                        body: {
                          updatedAt: current.updatedAt,
                          accepted: reviewAccepted,
                          reason: v.get("reason"),
                        },
                      },
                    );
                    await refreshWorkspace();
                  }, "Решение сохранено");
                }}
              >
                <label>
                  Решение инженера
                  <Select
                    name="accepted"
                    value={String(reviewAccepted)}
                    onChange={(e) =>
                      setReviewAccepted(e.target.value === "true")
                    }
                  >
                    <option value="true">Принять</option>
                    <option value="false">
                      Отклонить и запросить повторный ввод
                    </option>
                  </Select>
                </label>
                <label>
                  Обоснование
                  <Textarea
                    name="reason"
                    required={current.anomaly || !reviewAccepted}
                    maxLength={10000}
                  />
                </label>
                <Button variant="primary" type="submit" busy={resource.busy}>
                  Сохранить решение
                </Button>
              </form>
            )}
        </section>
      )}
      {hasPermission(user, "meters.write") && user.role !== "worker" && (
        <Disclosure title="Открыть период ввода">
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                v = new FormData(form);
              void resource.run(async () => {
                await apiRequest("/api/readings/periods", {
                  token,
                  method: "POST",
                  body: {
                    propertyId: v.get("propertyId"),
                    name: v.get("name"),
                    startsOn: v.get("startsOn"),
                    endsOn: v.get("endsOn"),
                    photoRequired: v.get("photoRequired") === "on",
                    thresholdPercent: Number(v.get("thresholdPercent")),
                  },
                });
                form.reset();
              }, "Период ввода открыт");
            }}
          >
            <label>
              Объект
              <Select name="propertyId" required>
                <option value="">Выберите</option>
                {overview.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Название
              <Input name="name" required placeholder="Октябрь 2026" />
            </label>
            <label>
              Начало
              <Input
                name="startsOn"
                type="date"
                required
                defaultValue={today.slice(0, 7) + "-01"}
              />
            </label>
            <label>
              Окончание
              <Input name="endsOn" type="date" required defaultValue={today} />
            </label>
            <label>
              Порог изменения расхода, %
              <Input
                name="thresholdPercent"
                type="number"
                min="1"
                max="10000"
                defaultValue="50"
                required
              />
            </label>
            <Checkbox name="photoRequired" defaultChecked>
              Обязательная фотография
            </Checkbox>
            <Button variant="primary" type="submit" busy={resource.busy}>
              Открыть период
            </Button>
          </form>
        </Disclosure>
      )}
    </section>
  );
}
