import { useEffect, useState, type FormEvent } from "react";
import type {
  AgendaDto,
  AgendaItemDto,
  AgendaKind,
  RenewalDto,
  RenewalStatus,
} from "../../../packages/contracts/src/agenda";
import "./agenda.css";
import { apiRequest, runtimeApiBase } from "./api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Textarea,
} from "./ui";
const kindLabels: Record<AgendaKind, string> = {
  lease: "Договоры",
  payment: "Оплаты",
  maintenance: "ППР",
  ticket: "Заявки",
  warranty: "Гарантии",
};
const renewalLabels: Record<RenewalStatus, string> = {
  pending: "Связаться с арендатором",
  contacted: "Обсуждаем условия",
  renewing: "Готовим продление",
  leaving: "Планируется выезд",
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
type Props = {
  token: string;
  properties: { id: string; name: string }[];
  onTicket: (id: string) => void;
  onLease: (id: string) => void;
  onOperations: () => void;
  onBilling: () => void;
};
export function Agenda({
  token,
  properties,
  onTicket,
  onLease,
  onOperations,
  onBilling,
}: Props) {
  const [days, setDays] = useState("30");
  const [property, setProperty] = useState("");
  const [kind, setKind] = useState<AgendaKind | "all">("all");
  const [data, setData] = useState<AgendaDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const query = new URLSearchParams({
    days,
    ...(property ? { propertyId: property } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    apiRequest<AgendaDto>(`/api/agenda?${query}`, {
      token,
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, query, reload]);
  async function download() {
    setExporting(true);
    setError("");
    try {
      const r = await fetch(
        `${runtimeApiBase}/api/agenda/export.ics?${query}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!r.ok) throw new Error("Не удалось выгрузить календарь");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "wirehouse-agenda.ics";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const rows =
    data?.items.filter((item) => kind === "all" || item.kind === kind) ?? [];
  const groups = new Map<string, AgendaItemDto[]>();
  for (const item of rows)
    groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  const open = (item: AgendaItemDto) => {
    if (item.kind === "ticket") onTicket(item.entityId);
    else if (item.kind === "lease") onLease(item.entityId);
    else if (item.kind === "payment") onBilling();
    else onOperations();
  };
  return (
    <section className="mvp-page agenda-page">
      <PageHeader
        title="Сроки и работы"
        actions={
          <Button
            busy={exporting}
            disabled={!data?.items.length}
            onClick={() => void download()}
          >
            Скачать календарь
          </Button>
        }
      />
      <div className="agenda-filters">
        <Field label="Период">
          {(props) => (
            <Select
              {...props}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              {["7", "30", "60", "90"].map((v) => (
                <option key={v} value={v}>
                  Ближайшие {v} дней
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Объект">
          {(props) => (
            <Select
              {...props}
              value={property}
              onChange={(e) => setProperty(e.target.value)}
            >
              <option value="">Все доступные объекты</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Тип события">
          {(props) => (
            <Select
              {...props}
              value={kind}
              onChange={(e) => setKind(e.target.value as AgendaKind | "all")}
            >
              <option value="all">Все события</option>
              {Object.entries(kindLabels).map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                  {data ? ` (${data.counts[id as AgendaKind]})` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <p className="field-hint">
        Просроченные обязательства включены. Файл календаря — снимок сроков без
        автоматической синхронизации.
      </p>
      {error && (
        <Alert>
          {error}{" "}
          <Button variant="text" onClick={() => setReload((n) => n + 1)}>
            Повторить
          </Button>
        </Alert>
      )}
      {loading && <p role="status">Загрузка сроков…</p>}
      {!loading && data && !rows.length && (
        <Card>
          <EmptyState title="На этот период событий нет">
            Измените период или тип события.
          </EmptyState>
        </Card>
      )}
      {[...groups].map(([date, items]) => (
        <section
          className="agenda-day"
          key={date}
          aria-label={formatDate(date)}
        >
          <h3>{formatDate(date)}</h3>
          <div className="agenda-items">
            {items.map((item) => (
              <Card className="agenda-item" key={item.id}>
                <div className="agenda-item-heading">
                  <Badge
                    tone={
                      item.overdue
                        ? "danger"
                        : item.daysLeft === 0
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {item.overdue
                      ? `Просрочено на ${Math.abs(item.daysLeft)} дн.`
                      : item.daysLeft === 0
                        ? "Сегодня"
                        : `Через ${item.daysLeft} дн.`}
                  </Badge>
                  <span className="agenda-kind">{kindLabels[item.kind]}</span>
                </div>
                <h4>{item.title}</h4>
                <p>
                  {item.propertyName}
                  {item.unitNumber ? ` · помещение ${item.unitNumber}` : ""}
                </p>
                {item.tenantName && <p>{item.tenantName}</p>}
                {item.amount !== null && (
                  <strong>
                    {new Intl.NumberFormat("ru-RU", {
                      style: "currency",
                      currency: "RUB",
                    }).format(item.amount)}{" "}
                    к оплате
                  </strong>
                )}
                <div className="ui-actions">
                  <Button variant="text" onClick={() => open(item)}>
                    Открыть{" "}
                    {item.kind === "lease"
                      ? "договор"
                      : item.kind === "ticket"
                        ? "заявку"
                        : "раздел"}
                  </Button>
                </div>
                {item.renewal && (
                  <RenewalEditor
                    token={token}
                    leaseId={item.entityId}
                    value={item.renewal}
                    onSaved={(value) =>
                      setData((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((row) =>
                                row.id === item.id
                                  ? { ...row, renewal: value }
                                  : row,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
function RenewalEditor({
  token,
  leaseId,
  value,
  onSaved,
}: {
  token: string;
  leaseId: string;
  value: RenewalDto;
  onSaved: (value: RenewalDto) => void;
}) {
  const [status, setStatus] = useState(value.status);
  const [note, setNote] = useState(value.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ item: RenewalDto }>(
        `/api/leases/${leaseId}/renewal`,
        {
          token,
          method: "PUT",
          body: { status, note, version: value.version },
        },
      );
      onSaved(result.item);
      setNotice("Решение сохранено");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="renewal-editor">
      <summary>Продление: {renewalLabels[value.status]}</summary>
      <form onSubmit={save}>
        <Field label="Следующий шаг">
          {(props) => (
            <Select
              {...props}
              value={status}
              onChange={(e) => setStatus(e.target.value as RenewalStatus)}
            >
              {Object.entries(renewalLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Заметка по продлению"
          hint="Изменение здесь не продлевает сам договор."
        >
          {(props) => (
            <Textarea
              {...props}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <div className="ui-actions">
          <Button variant="primary" type="submit" busy={busy}>
            Сохранить решение
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setStatus(value.status);
              setNote(value.note);
              setError("");
              setNotice("");
            }}
          >
            Отменить изменения
          </Button>
        </div>
        {value.updatedAt && (
          <small className="field-hint">
            {value.updatedByName} ·{" "}
            {new Date(value.updatedAt).toLocaleString("ru-RU")}
          </small>
        )}
      </form>
    </details>
  );
}
