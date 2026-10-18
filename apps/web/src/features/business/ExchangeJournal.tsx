import { useRef, useState } from "react";
import type {
  AccountingSource,
  ExchangeJournalItem,
} from "../../../../../packages/contracts/src/accounting";
import { apiRequest } from "../../api/client";
import { Button, Select } from "../../ui";
import { Feedback, date } from "./shared";
import { Register } from "./Register";
import { usePagedResource } from "./usePagedResource";

export function ExchangeJournal({
  token,
  sources,
}: {
  token: string;
  sources: AccountingSource[];
}) {
  const [direction, setDirection] = useState(""),
    [status, setStatus] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const path =
    "/api/accounting/exchange?" +
    new URLSearchParams({ direction, status, sourceId });
  const resource = usePagedResource<ExchangeJournalItem>(
    token,
    path,
    "Сообщения",
  );
  async function retry(row: ExchangeJournalItem) {
    if (pending.current) return;
    pending.current = true;
    setBusy(row.direction + row.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/accounting/${row.direction}/${row.id}/retry`, {
        token,
        method: "POST",
        body: {},
      });
      resource.reload();
      setNotice("Повторная обработка запрошена. Результат появится в журнале.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  return (
    <div className="business-stack">
      <Feedback error={error || resource.error} notice={notice} />
      <Register
        title="Сообщения"
        rows={resource.items.map((row) => ({
          ...row,
          eventId: row.id,
          id: row.direction + ":" + row.id,
        }))}
        pagination={resource}

        filters={
          <>
            <label>
              Направление
              <Select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  resource.setOffset(0);
                }}
              >
                <option value="">Все</option>
                <option value="inbox">Входящие</option>
                <option value="outbox">Исходящие</option>
              </Select>
            </label>
            <label>
              Результат
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  resource.setOffset(0);
                }}
              >
                <option value="">Все</option>
                <option value="pending">В очереди</option>
                <option value="applied">Обработано</option>
                <option value="failed">Ошибка</option>
              </Select>
            </label>
            <label>
              Источник
              <Select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  resource.setOffset(0);
                }}
              >
                <option value="">Все</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          </>
        }
        columns={[
          {
            key: "message",
            label: "Сообщение",
            render: (r) => (
              <>
                <strong>{r.messageId}</strong>
                <small>
                  {r.direction === "inbox" ? "Входящее" : "Исходящее"} ·{" "}
                  {r.sourceName}
                </small>
              </>
            ),
          },
          {
            key: "status",
            label: "Результат",
            render: (r) => (
              <>
                {
                  {
                    applied: "Обработано",
                    failed: "Ошибка",
                    pending: "В очереди",
                  }[r.status]
                }
                {r.error && <small>{r.error}</small>}
              </>
            ),
          },
          {
            key: "date",
            label: "Получено",
            render: (r) => date(r.createdAt),
            optional: true,
          },
          {
            key: "tries",
            label: "Попытки",
            render: (r) => r.attempts,
            optional: true,
          },
          {
            key: "retry",
            label: "Действие",
            render: (r) =>
              r.status === "failed" ? (
                <Button
                  disabled={Boolean(busy)}
                  busy={busy === r.direction + r.eventId}
                  onClick={() => void retry({ ...r, id: r.eventId })}
                >
                  Повторить
                </Button>
              ) : r.nextAttemptAt ? (
                date(r.nextAttemptAt)
              ) : (
                "—"
              ),
          },
        ]}
        empty="Сообщений по выбранным условиям нет. Измените поиск или фильтры."
      />
    </div>
  );
}
