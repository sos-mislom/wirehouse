import { useEffect, useState } from "react";
import { Button, Input } from "../../ui";
import { apiRequest } from "../../api/client";
type Event = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  changes: unknown;
};
export function AuditLog({ token }: { token: string }) {
  const [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [error, setError] = useState("");
  const [result, setResult] = useState<{ items: Event[]; total: number }>({
    items: [],
    total: 0,
  });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        apiRequest<typeof result>(
          `/api/audit?q=${encodeURIComponent(q)}&offset=${offset}`,
          { token },
        )
          .then((r) => {
            if (active) {
              setResult(r);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, offset, token]);
  return (
    <div className="platform-section">
      <Input
        placeholder="Автор, сущность или идентификатор"
        aria-label="Поиск в аудите"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOffset(0);
        }}
      />
      {error && <p role="alert">{error}</p>}
      <p>Событий: {result.total}. Время указано в вашем часовом поясе.</p>
      {result.items.map((row) => (
        <details className="audit-event" key={row.id}>
          <summary>
            <time>{new Date(row.createdAt).toLocaleString("ru-RU")}</time>
            <strong>{row.actorName}</strong>
            <span>
              {{ created: "Создано", updated: "Изменено", deleted: "Удалено" }[
                row.action
              ] ?? row.action}{" "}
              · {row.entityType}
            </span>
          </summary>
          <p>ID: {row.entityId}</p>
          <pre>{JSON.stringify(row.changes, null, 2)}</pre>
        </details>
      ))}
      <div className="mvp-actions">
        <Button
          disabled={!offset}
          onClick={() => setOffset((v) => Math.max(0, v - 50))}
        >
          Назад
        </Button>
        <span>
          {result.total ? offset + 1 : 0}–{Math.min(offset + 50, result.total)}
        </span>
        <Button
          disabled={offset + 50 >= result.total}
          onClick={() => setOffset((v) => v + 50)}
        >
          Далее
        </Button>
      </div>
    </div>
  );
}
