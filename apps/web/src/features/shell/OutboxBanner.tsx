import { useSyncExternalStore } from "react";
import {
  dismissCommand,
  outboxStatus,
  rememberTicketNumber,
  tokenOwner,
  type OutboxEntry,
} from "../../platform/outbox";
import { IconButton } from "../../ui";
import { ActionIcon } from "../business/ActionIcon";

const decisionLabels: Record<string, string> = {
  start: "Начать работу",
  pause: "Приостановить работу",
  resume: "Продолжить работу",
  submit: "Сдать результат",
  refuse: "Отказаться от задания",
};

function describe(
  entry: OutboxEntry,
  ticketNumber: (id: string) => string | undefined,
) {
  const body = (entry.body ?? {}) as Record<string, unknown>;
  const links = body.links as { entityId?: string }[] | undefined;
  const ticketId =
    entry.path.match(/^\/api\/tickets\/([^/]+)/)?.[1] ?? links?.[0]?.entityId;
  const what = entry.path.endsWith("/comments")
    ? "Комментарий"
    : entry.path.endsWith("/attachments")
      ? `Файл «${String(body.fileName ?? "")}»`
      : entry.path === "/api/documents"
        ? `Фото «${String(body.fileName ?? "")}»`
        : entry.path.includes("/checklist/")
          ? body.completed
            ? "Отметка пункта чек-листа"
            : "Снятие отметки в чек-листе"
          : (decisionLabels[String(body.action)] ?? "Действие по заданию");
  const number = ticketId ? ticketNumber(ticketId) : undefined;
  if (number && entry.seq !== undefined)
    rememberTicketNumber(entry.seq, number);
  const label = number ?? entry.ticketNumber ?? (ticketId ? "Задание" : "");
  return label ? `${label} · ${what}` : what;
}

// Commands saved on the phone while the server was unreachable.
export function OutboxBanner({
  token,
  ticketNumber,
}: {
  token: string;
  ticketNumber: (id: string) => string | undefined;
}) {
  const all = useSyncExternalStore(outboxStatus.subscribe, outboxStatus.get);
  const owner = tokenOwner(token);
  const mine = all.filter((entry) => entry.owner === owner);
  if (!mine.length) return null;
  const pending = mine.filter((entry) => entry.status === "pending");
  const failed = mine.filter((entry) => entry.status === "failed");
  return (
    <div className="banner banner--outbox" role="status">
      {pending.length ? (
        <>
          <strong>Ожидают отправки: {pending.length}.</strong>
          <ul tabIndex={0} aria-label="Ожидающие отправки действия">
            {pending.map((entry) => (
              <li key={entry.seq}>{describe(entry, ticketNumber)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {failed.length ? (
        <>
          <strong>Не отправлено: {failed.length}.</strong> Сервер отклонил
          действие; проверьте задание и повторите при необходимости.
          <ul tabIndex={0} aria-label="Неотправленные действия">
            {failed.map((entry) => (
              <li key={entry.seq}>
                <span>
                  {describe(entry, ticketNumber)} — {entry.error}
                </span>
                <IconButton
                  label={`Убрать неотправленное действие: ${describe(entry, ticketNumber)}`}
                  type="button"
                  onClick={() => void dismissCommand(entry.seq!)}
                >
                  <ActionIcon name="close" />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
