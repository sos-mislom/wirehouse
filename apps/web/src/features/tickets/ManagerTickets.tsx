import { useWorkspace } from "../../app/WorkspaceContext";
import { useState } from "react";
import { DispatchWorkspace } from "../business/DispatchWorkspace";
import { filterTickets } from "../../../../../packages/contracts/src/ticket-search";
import { ticketCategoryOptions } from "../../projectData";
import { ticketStatusOptions } from "../../projectData";
import { ResponsiveTable } from "../../ResponsiveTable";
import { getSlaState, getTicketStatusLabel } from "../../shared/format";
import { type TicketFilter } from "../../shared/types";
import { Button, Checkbox, Select, Input } from "../../ui";
export function ManagerTickets() {
  const [query, setQuery] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [category, setCategory] = useState(""),
    [unitId, setUnitId] = useState(""),
    [applicant, setApplicant] = useState(""),
    [archive, setArchive] = useState(false);
  const {
    managerUi,
    setTicketView,
    ticketView,
    setTicketFilter,
    ticketFilter,
    locale,
    t,
    setManagerScreen,
    moveBoardTicket,
    filteredTickets: availableTickets,
    openTicketDetail,
    busyAction,
  } = useWorkspace();
  const filteredTickets = filterTickets(
    availableTickets,
    new URLSearchParams({
      q: query,
      from,
      to,
      category,
      unitId,
      createdBy: applicant,
      archive: String(archive),
    }),
  );
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.tickets}</h2>
        </div>
        <div className="mvp-actions">
          <div className="view-switch" role="group" aria-label="Вид заявок">
            <Button
              variant="plain"
              aria-pressed={ticketView === "table"}
              onClick={() => setTicketView("table")}
            >
              Список
            </Button>
            <Button
              variant="plain"
              aria-pressed={ticketView === "board"}
              onClick={() => setTicketView("board")}
            >
              Канбан
            </Button>
          </div>
          <Select
            className="filter-select"
            aria-label="Статус заявки"
            onChange={(event) =>
              setTicketFilter(event.target.value as TicketFilter)
            }
            value={ticketFilter}
          >
            <option value="all">
              {locale === "ru" ? "Все статусы" : "All"}
            </option>
            {ticketStatusOptions.map((status) => (
              <option key={status} value={status}>
                {t.ticketStatuses[status]}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            className="primary-button"
            onClick={() => setManagerScreen("ticket-create")}
            type="button"
          >
            Создать заявку
          </Button>
        </div>
      </div>

      <div className="business-form">
        <label>
          Поиск по номеру, тексту, помещению, заявителю
          <Input
            type="search"
            value={query}
            maxLength={300}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Создана с
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          По
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Категория
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Все категории</option>
            {ticketCategoryOptions.map((c) => (
              <option key={c} value={c}>
                {t.ticketCategories[c as keyof typeof t.ticketCategories]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Помещение
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Все помещения</option>
            {[
              ...new Map(
                availableTickets.map((t) => [
                  t.unitId,
                  {
                    id: t.unitId,
                    label: `${t.propertyName ?? ""} · ${t.unitNumber ?? ""}`,
                  },
                ]),
              ).values(),
            ].map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Заявитель
          <Select
            value={applicant}
            onChange={(e) => setApplicant(e.target.value)}
          >
            <option value="">Все заявители</option>
            {[
              ...new Map(
                availableTickets.map((t) => [
                  t.createdBy,
                  { id: t.createdBy, name: t.createdByName ?? t.createdBy },
                ]),
              ).values(),
            ].map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </label>
        <Checkbox
          checked={archive}
          onChange={(e) => setArchive(e.target.checked)}
        >
          Только выполненные и архив
        </Checkbox>
      </div>
      {ticketView === "board" ? (
        <div className="kanban-board">
          {[
            { id: "new", label: "Новые", statuses: ["new", "accepted"] },
            { id: "in_progress", label: "В работе", statuses: ["in_progress"] },
            {
              id: "waiting_tenant",
              label: "Ожидание",
              statuses: ["waiting_tenant"],
            },
            { id: "deferred", label: "Отложены", statuses: ["deferred"] },
            {
              id: "completed",
              label: "Выполнены",
              statuses: ["completed", "resolved"],
            },
            {
              id: "closed",
              label: "Закрыты",
              statuses: ["closed", "rejected"],
            },
          ].map((column) => (
            <section
              className="kanban-column"
              key={column.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void moveBoardTicket(
                  event.dataTransfer.getData("text/plain"),
                  column.id,
                );
              }}
            >
              <h3>
                {column.label}{" "}
                <small>
                  {
                    filteredTickets.filter((t) =>
                      column.statuses.includes(t.status),
                    ).length
                  }
                </small>
              </h3>
              {filteredTickets
                .filter((t) => column.statuses.includes(t.status))
                .map((ticket) => (
                  <article
                    className="kanban-ticket"
                    draggable
                    key={ticket.id}
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", ticket.id)
                    }
                  >
                    <Button
                      variant="text"
                      type="button"
                      className="text-button"
                      onClick={() => openTicketDetail(ticket.id)}
                    >
                      {ticket.number} · {ticket.title}
                    </Button>
                    <p>
                      {ticket.propertyName} · {ticket.unitNumber}
                    </p>
                    <small>{ticket.assignedToName || "Не назначен"}</small>
                    <span
                      className={`status-pill status-pill--${getSlaState(ticket, locale).tone}`}
                    >
                      {getSlaState(ticket, locale).label}
                    </span>
                    <Select
                      aria-label={`Статус ${ticket.number}`}
                      value={ticket.status}
                      disabled={Boolean(busyAction)}
                      onChange={(event) =>
                        void moveBoardTicket(ticket.id, event.target.value)
                      }
                    >
                      {ticketStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {getTicketStatusLabel(status, locale)}
                        </option>
                      ))}
                    </Select>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <article className="mvp-card">
          <div className="mvp-table-wrap">
            <ResponsiveTable className="mvp-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>{t.fields.title}</th>
                  <th>{t.fields.tenant}</th>
                  <th>{t.fields.priority}</th>
                  <th>{t.fields.status}</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => openTicketDetail(ticket.id)}
                  >
                    <td>{ticket.number}</td>
                    <td>
                      <strong>{ticket.title}</strong>
                      <small>
                        {ticket.propertyName ?? "—"} ·{" "}
                        {ticket.unitNumber ?? "—"}
                      </small>
                    </td>
                    <td>{ticket.tenantName ?? "—"}</td>
                    <td>
                      {
                        t.ticketPriorities[
                          ticket.priority as keyof typeof t.ticketPriorities
                        ]
                      }
                    </td>
                    <td>
                      {
                        t.ticketStatuses[
                          ticket.status as keyof typeof t.ticketStatuses
                        ]
                      }
                    </td>
                    <td>
                      <span
                        className={`status-pill status-pill--${getSlaState(ticket, locale).tone}`}
                      >
                        {getSlaState(ticket, locale).label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
          {filteredTickets.length === 0 ? (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          ) : null}
        </article>
      )}
      <DispatchWorkspace />
    </section>
  );
}
