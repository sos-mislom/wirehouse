import { type CSSProperties } from "react";
import { slaState } from "../../../../../packages/contracts/src/domain";
import { getSlaState, getTicketStatusLabel } from "../../shared/format";
import type { Locale } from "../../projectData";
import "./ticket-path.css";

type PathTicket = {
  status: string;
  createdAt: string;
  slaDueAt: string | null;
};
type PathEvent = {
  id: string;
  toStatus: string | null;
  createdAt: string;
};

// Основная ветка пути; «Решена» стоит на той же станции, что «Выполнена».
const STATIONS = [
  { id: "new", match: ["new"] },
  { id: "accepted", match: ["accepted"] },
  { id: "in_progress", match: ["in_progress"] },
  { id: "completed", match: ["completed", "resolved"] },
  { id: "closed", match: ["closed"] },
] as const;
const PAUSES = ["waiting_tenant", "deferred"];

const stepOf = (status: string) =>
  STATIONS.findIndex((station) =>
    (station.match as readonly string[]).includes(status),
  );

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Путь одной заявки: станции с датами из истории статусов.
 * При открытии линия прорисовывается до текущей станции (один раз).
 * Паузы — ветка от последней станции, отмена обрывает линию.
 */
export function TicketPath({
  ticket,
  history,
  locale,
}: {
  ticket: PathTicket;
  history: PathEvent[];
  locale: Locale;
}) {
  const events = [...history].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const reachedAt = STATIONS.map((station, index) =>
    index === 0
      ? ticket.createdAt
      : (events.find(
          (event) =>
            event.toStatus &&
            (station.match as readonly string[]).includes(event.toStatus),
        )?.createdAt ?? null),
  );

  const rejected = ticket.status === "rejected";
  const paused = PAUSES.includes(ticket.status);
  // После возврата в работу берём последнюю станцию по времени,
  // а не самую дальнюю из когда-либо достигнутых.
  const lastStatus = [...events]
    .reverse()
    .find((event) => event.toStatus && stepOf(event.toStatus) >= 0)?.toStatus;
  const current = paused || rejected
    ? Math.max(stepOf(lastStatus ?? "new"), 0)
    : Math.max(stepOf(ticket.status), 0);
  const finished = ticket.status === "closed";
  const overdue = slaState(ticket).state === "overdue";
  const sla = getSlaState(ticket as Parameters<typeof getSlaState>[0], locale);

  const pauseEvents = events.filter(
    (event) => event.toStatus && PAUSES.includes(event.toStatus),
  );
  const lastPause = pauseEvents[pauseEvents.length - 1];

  return (
    <section
      className="ticket-path"
      data-overdue={overdue || undefined}
      data-rejected={rejected || undefined}
      data-paused={paused || undefined}
      aria-label={`Путь заявки: ${getTicketStatusLabel(ticket.status, locale)}`}
      style={{ "--current": current } as CSSProperties}
    >
      <ol className="ticket-path__line">
        {STATIONS.map((station, index) => {
          const state =
            index < current || (finished && index === current)
              ? "done"
              : index === current
                ? "current"
                : "todo";
          return (
            <li
              key={station.id}
              className="ticket-path__station"
              data-state={state}
              style={{ "--i": index } as CSSProperties}
            >
              <span className="ticket-path__dot" aria-hidden="true" />
              <span className="ticket-path__label">
                {getTicketStatusLabel(station.id, locale)}
              </span>
              <time
                className="ticket-path__time"
                dateTime={reachedAt[index] ?? undefined}
              >
                {reachedAt[index] ? when(reachedAt[index]!) : "—"}
              </time>
            </li>
          );
        })}
      </ol>

      {(paused || lastPause) && (
        <p className="ticket-path__branch" data-active={paused || undefined}>
          <span className="ticket-path__branch-dot" aria-hidden="true" />
          {paused
            ? `${getTicketStatusLabel(ticket.status, locale)} с ${when(lastPause?.createdAt ?? ticket.createdAt)}`
            : `Была пауза: ${getTicketStatusLabel(lastPause!.toStatus, locale)}, ${when(lastPause!.createdAt)}`}
        </p>
      )}

      <p className="ticket-path__sla" data-tone={sla.tone}>
        {rejected ? "Заявка отменена" : finished ? "Заявка закрыта" : sla.label}
        {ticket.slaDueAt && !finished && !rejected && (
          <span> · срок {when(ticket.slaDueAt)}</span>
        )}
      </p>
    </section>
  );
}
