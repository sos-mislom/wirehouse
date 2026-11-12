import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { BotLinkPanel } from "../../MessengerButtons";
import { WorkerMeters } from "../operations/WorkerMeters";
import { ticketStatusOptions } from "../../projectData";
import {
  formatDateTime,
  getSlaState,
  getTicketStatusLabel,
} from "../../shared/format";
import { type TicketFilter } from "../../shared/types";
import { Button, IconButton, Select } from "../../ui";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { Register } from "../business/Register";
import { ActionIcon } from "../business/ActionIcon";
import { TicketRecord } from "./ManagerTicketDetail";
import { TicketCreateFields } from "./TicketCreateFields";
import "./workspace.css";
import "./mobile-service.css";

type ServiceView =
  "list" | "create" | "readings" | "messengers" | "notifications";
export function Service() {
  const {
    isWorker,
    session,
    t,
    handleCreateTicket,
    locale,
    busyAction,
    setTicketFilter,
    ticketFilter,
    filteredTickets,
    selectedTicketId,
    setSelectedTicketId,
    tickets,
    ui,
    overview,
    openNotification,
    serviceRecordId,
    setServiceRecordId,
    openTicketDetail,
  } = useWorkspace();
  const key = `wirehouse.service.view.v2:${session.user.id}`;
  const listScroll = useRef(0);
  const [view, setView] = useState<ServiceView>(() => {
    try {
      return (sessionStorage.getItem(key) as ServiceView) || "list";
    } catch {
      return "list";
    }
  });
  const canCreate = !isWorker && hasPermission(session.user, "tickets.write");
  const canReadings =
    isWorker && hasPermission(session.user, "readings.submit");
  const items = [
    {
      id: "list",
      label: isWorker ? "Задания" : "Мои заявки",
      count: filteredTickets.length,
    },
    ...(canCreate ? [{ id: "create", label: "Создать заявку" }] : []),
    ...(canReadings ? [{ id: "readings", label: "Показания" }] : []),
    {
      id: "notifications",
      label: "Уведомления",
      count: overview.notifications.filter((item) => item.unread).length,
    },
    ...(isWorker ? [{ id: "messengers", label: "Связь" }] : []),
  ];
  const activeView = items.some((item) => item.id === view) ? view : "list";
  useEffect(() => {
    try {
      sessionStorage.setItem(key, activeView);
    } catch {
      /* Selection still works without browser storage. */
    }
  }, [key, activeView]);
  const record = tickets.find((ticket) => ticket.id === serviceRecordId);
  useEffect(() => {
    if (record && record.id !== selectedTicketId)
      setSelectedTicketId(record.id);
  }, [record?.id, selectedTicketId, setSelectedTicketId]);
  const backToList = () => {
    setServiceRecordId("");
    setView("list");
    requestAnimationFrame(() =>
      window.scrollTo({ top: listScroll.current, behavior: "instant" }),
    );
  };
  const prefix = `service-${session.user.id}`;
  const panel = (id: ServiceView) => ({
    id: `${prefix}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${prefix}-tab-${id}`,
    hidden: activeView !== id,
    tabIndex: 0,
  });
  return (
    <section
      className={`mvp-page service-workspace${isWorker ? " service-workspace--worker" : ""}`}
    >
      <div hidden={Boolean(serviceRecordId)}>
        <WorkspaceTabs
          idPrefix={prefix}
          label="Мои заявки: разделы"
          items={items}
          value={activeView}
          onChange={(id) => {
            setView(id as ServiceView);
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        />
        <section
          {...panel("list")}
          className="workspace-surface service-list-panel"
        >
          <Register
            title={isWorker ? "Мои задания" : "Мои заявки"}
            rows={filteredTickets}
            searchText={(ticket) =>
              `${ticket.number} ${ticket.title} ${ticket.propertyName ?? ""} ${ticket.unitNumber ?? ""}`
            }
            selectedId={selectedTicketId}
            onSelect={(ticket) => {
              listScroll.current = window.scrollY;
              openTicketDetail(ticket.id);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
            empty={
              locale === "ru"
                ? isWorker
                  ? "Назначенных заданий нет."
                  : "Заявок пока нет."
                : isWorker
                  ? "No assigned tasks."
                  : "No requests yet."
            }
            filtersActive={ticketFilter !== "all"}
            filters={
              <Select
                aria-label="Статус заявки"
                value={ticketFilter}
                onChange={(event) =>
                  setTicketFilter(event.target.value as TicketFilter)
                }
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
            }
            action={
              canCreate ? (
                <IconButton
                  label="Создать заявку"
                  onClick={() => setView("create")}
                >
                  <ActionIcon name="plus" />
                </IconButton>
              ) : undefined
            }
            columns={[
              {
                key: "ticket",
                label: "Заявка",
                render: (ticket) => (
                  <div className="service-ticket-title">
                    <small>{ticket.number}</small>
                    <strong>{ticket.title}</strong>
                    <div className="service-ticket-mobile-summary">
                      <span>
                        {ticket.unitNumber
                          ? `Помещение ${ticket.unitNumber}`
                          : "Помещение не указано"}
                        {ticket.propertyName ? ` · ${ticket.propertyName}` : ""}
                      </span>
                      <div className="service-ticket-mobile-status">
                        <span
                          className={`status-pill status-pill--${ticket.status}`}
                        >
                          {getTicketStatusLabel(ticket.status, locale)}
                        </span>
                        <span
                          className={`status-pill status-pill--${getSlaState(ticket, locale).tone}`}
                        >
                          {getSlaState(ticket, locale).label}
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "location",
                label: "Объект / помещение",
                render: (ticket) =>
                  `${ticket.propertyName ?? "—"} · ${ticket.unitNumber ?? "—"}`,
                optional: true,
              },
              {
                key: "status",
                label: "Статус",
                render: (ticket) => (
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {getTicketStatusLabel(ticket.status, locale)}
                  </span>
                ),
              },
              {
                key: "deadline",
                label: "Срок",
                render: (ticket) => getSlaState(ticket, locale).label,
                optional: true,
              },
            ]}
          />
        </section>
        {canCreate && (
          <section
            {...panel("create")}
            className="workspace-surface service-create-panel"
          >
            <h3>{t.sections.ticketCreate}</h3>
            <form className="ticket-create-form" onSubmit={handleCreateTicket}>
              <TicketCreateFields showChecklist />
              <div className="ui-actions ticket-create-actions">
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "ticket-create"}
                  type="submit"
                >
                  {t.actions.create}
                </Button>
              </div>
            </form>
          </section>
        )}
        {canReadings && (
          <section {...panel("readings")}>
            <WorkerMeters token={session.token} userId={session.user.id} />
          </section>
        )}
        {isWorker && (
          <section {...panel("messengers")} className="workspace-surface">
            <BotLinkPanel token={session.token} />
          </section>
        )}
        {
          <section
            {...panel("notifications")}
            className="workspace-surface service-notifications"
          >
            <h3>{ui.notifications}</h3>
            <div className="notification-stack">
              {overview.notifications.length > 0 ? (
                overview.notifications.map((item) => (
                  <Button
                    variant="plain"
                    className={`notification-card notification-card--${item.tone}`}
                    key={item.id}
                    onClick={() => void openNotification(item)}
                    type="button"
                  >
                    <div className="notification-card-top">
                      <span className="notification-dot" />
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.message}</p>
                    <small>
                      {formatDateTime(item.createdAt, locale)} ·{" "}
                      {item.unread ? "Не прочитано" : "Прочитано"}
                    </small>
                  </Button>
                ))
              ) : (
                <div className="empty-state">{ui.noNotifications}</div>
              )}
            </div>
          </section>
        }
      </div>
      {serviceRecordId &&
        (record ? (
          selectedTicketId === record.id ? (
            <TicketRecord
              key={`${session.user.id}:${record.id}`}
              ticket={record}
              onBack={backToList}
            />
          ) : (
            <p role="status">Открываем заявку…</p>
          )
        ) : (
          <section className="workspace-surface">
            <p role="alert">
              Заявка недоступна. Вернитесь к списку своих заявок.
            </p>
            <IconButton label="Вернуться к моим заявкам" onClick={backToList}>
              <ActionIcon name="back" />
            </IconButton>
          </section>
        ))}
    </section>
  );
}
