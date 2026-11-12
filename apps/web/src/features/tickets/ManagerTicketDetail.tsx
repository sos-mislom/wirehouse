import { useEffect, useState } from "react";
import { ActionIcon } from "../business/ActionIcon";
import {
  TicketWorkflowView,
  useTicketWorkflowModel,
} from "../business/TicketWorkflowPanel";
import { DocumentRegistry } from "../business/DocumentRegistry";
import { useWorkspace } from "../../app/WorkspaceContext";
import { TicketOperations } from "../operations/TicketOperations";
import { formatDateTime, getTicketStatusLabel } from "../../shared/format";
import type { Ticket } from "../../shared/types";
import { Button, IconButton, Select, Textarea } from "../../ui";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { TicketAttachmentBlock } from "./TicketAttachmentBlock";
import { TicketOperationsBlock } from "./TicketOperationsBlock";
import { TicketPath } from "./TicketPath";
import "./workspace.css";
import "./mobile-service.css";

const views = [
  { id: "work", label: "Работа" },
  { id: "conditions", label: "Условия" },
  { id: "discussion", label: "Обсуждение" },
  { id: "files", label: "Фото и файлы" },
  { id: "documents", label: "Документы" },
  { id: "history", label: "История" },
  { id: "context", label: "Связи" },
  { id: "costs", label: "Затраты" },
] as const;
type View = (typeof views)[number]["id"];
function readView(key: string): View {
  try {
    const saved = sessionStorage.getItem(key);
    return views.some((view) => view.id === saved) ? (saved as View) : "work";
  } catch {
    return "work";
  }
}

export function ManagerTicketDetail() {
  const { selectedTicket, session, t } = useWorkspace();
  return selectedTicket ? (
    <TicketRecord
      key={`${session.user.id}:${selectedTicket.id}`}
      ticket={selectedTicket}
    />
  ) : (
    <section className="mvp-page ticket-record">
      <div className="empty-state">{t.hints.ticketEmpty}</div>
    </section>
  );
}

export function TicketRecord({
  ticket,
  onBack,
}: {
  ticket: Ticket;
  onBack?: () => void;
}) {
  const {
    setManagerScreen,
    ticketFrom,
    managerUi,
    session,
    overview,
    operations,
    refreshWorkspace,
    openUnitDetail,
    openTenantDetail,
    openTicketDetail,
    tickets,
    t,
    canUpdateTickets,
    busyAction,
    updateSelectedTicket,
    canAssignTickets,
    locale,
    setTicketAssigneeDraft,
    ticketAssigneeDraft,
    ticketAssigneeOptions,
    ticketHistory,
    ticketComments,
    handleCommentSubmit,
    handleFieldChange,
    setCommentForm,
    commentForm,
    ticketAttachments,
    isManagerShell,
    isWorker,
    isTenant,
    handleCancelTicket,
  } = useWorkspace();
  const model = useTicketWorkflowModel(ticket.id);
  const storageKey = `wirehouse.ticket.view.v2:${session.user.id}:${ticket.id}`;
  const [view, setView] = useState<View>(() => readView(storageKey));
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, view);
    } catch {
      /* Selection works without browser storage. */
    }
  }, [storageKey, view]);
  const idPrefix = `ticket-${ticket.id}`;
  const panel = (id: View) => ({
    id: `${idPrefix}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    hidden: view !== id,
    tabIndex: 0,
  });
  const orderedViews = isWorker
    ? [
        views[0],
        views[3],
        views[2],
        views[4],
        views[5],
        views[6],
        views[7],
        views[1],
      ]
    : isTenant
      ? [
          views[0],
          views[2],
          views[3],
          views[4],
          views[1],
          views[5],
          views[6],
          views[7],
        ]
      : views;
  const items = orderedViews
    .map((item) => ({
      ...item,
      ...(!isManagerShell && item.id === "discussion" ? { label: "Чат" } : {}),
      ...(!isManagerShell && item.id === "files" ? { label: "Фото" } : {}),
      ...(item.id === "discussion" && ticketComments.length
        ? { count: ticketComments.length }
        : {}),
      ...(item.id === "files"
        ? {
            count:
              ticketAttachments.length +
              model.docs.data.items.filter(
                (d) =>
                  d.category === "photo" &&
                  d.links.some(
                    (link) =>
                      link.entityType === "tickets" &&
                      link.entityId === ticket.id &&
                      ["before", "after"].includes(link.phase ?? ""),
                  ),
              ).length,
          }
        : {}),
      ...(item.id === "history"
        ? { count: ticketHistory.length + model.resource.data.decisions.length }
        : {}),
    }))
    .map((item) =>
      !isManagerShell && item.count === 0
        ? { ...item, count: undefined }
        : item,
    );
  return (
    <section
      className={`mvp-page ticket-record${!isManagerShell ? " ticket-record--personal" : ""}${isWorker ? " ticket-record--worker" : ""}`}
    >
      <header className="workspace-record-header ticket-record-header">
        <div className="ticket-record-heading">
          <IconButton
            label={managerUi.back}
            onClick={onBack ?? (() => setManagerScreen(ticketFrom))}
          >
            <ActionIcon name="back" />
          </IconButton>
          <div className="ticket-record-title">
            <div className="ticket-record-meta">
              <span className="record-number">{ticket.number}</span>
              <span className={`status-pill status-pill--${ticket.status}`}>
                {getTicketStatusLabel(ticket.status, locale)}
              </span>
            </div>
            <h2 title={ticket.title}>{ticket.title}</h2>
            {!isManagerShell && (
              <p className="ticket-record-location">
                {ticket.unitNumber
                  ? `Помещение ${ticket.unitNumber}`
                  : "Помещение не указано"}
                {ticket.propertyName ? ` · ${ticket.propertyName}` : ""}
              </p>
            )}
          </div>
        </div>
        <WorkspaceTabs
          idPrefix={idPrefix}
          label="Разделы заявки"
          items={items}
          value={view}
          onChange={(id) => {
            setView(id as View);
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        />
      </header>

      <section {...panel("work")} className="ticket-work-panel">
        <TicketPath
          key={ticket.id}
          ticket={ticket}
          history={ticketHistory}
          locale={locale}
        />
        <div className="ticket-work-layout">
          <article className="workspace-surface ticket-work-main">
            {ticket.description && (
              <p className="ticket-description">{ticket.description}</p>
            )}
            <TicketWorkflowView
              model={model}
              section="work"
              workFooter={
                isWorker ? (
                  <section className="ticket-work-checklist">
                    <h3>Срок и чек-лист</h3>
                    <TicketOperationsBlock
                      ticket={ticket}
                      includeContext={false}
                    />
                  </section>
                ) : undefined
              }
            />
            {isTenant &&
              ["new", "accepted", "waiting_tenant"].includes(ticket.status) && (
                <Button
                  variant="danger"
                  busy={busyAction === `ticket-cancel-${ticket.id}`}
                  onClick={() => void handleCancelTicket(ticket)}
                >
                  {locale === "ru" ? "Отменить заявку" : "Cancel ticket"}
                </Button>
              )}
          </article>
          <aside className="workspace-surface ticket-work-context">
            <h3>Контекст заявки</h3>
            <dl className="ticket-context-facts">
              <div>
                <dt>{t.fields.property}</dt>
                <dd>{ticket.propertyName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t.fields.unit}</dt>
                <dd>{ticket.unitNumber ?? "—"}</dd>
              </div>
              <div>
                <dt>{t.fields.tenant}</dt>
                <dd>{ticket.tenantName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t.fields.priority}</dt>
                <dd>
                  {
                    t.ticketPriorities[
                      ticket.priority as keyof typeof t.ticketPriorities
                    ]
                  }
                </dd>
              </div>
              {!canAssignTickets && (
                <div>
                  <dt>{locale === "ru" ? "Исполнитель" : "Assignee"}</dt>
                  <dd>{ticket.assignedToName || "Не назначен"}</dd>
                </div>
              )}
            </dl>
            {canUpdateTickets && canAssignTickets && (
              <label className="ticket-assignee-field">
                <span>{locale === "ru" ? "Исполнитель" : "Assignee"}</span>
                <Select
                  disabled={busyAction === "ticket-update"}
                  onChange={(event) => {
                    const assignedTo = event.target.value;
                    setTicketAssigneeDraft(assignedTo);
                    void model.resource.run(
                      () =>
                        updateSelectedTicket({
                          assignedTo: assignedTo || null,
                        }),
                      "",
                    );
                  }}
                  value={ticketAssigneeDraft}
                >
                  <option value="">
                    {locale === "ru" ? "Не назначен" : "Unassigned"}
                  </option>
                  {ticketAssigneeOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {!isWorker && (
              <>
                <h3>Срок и чек-лист</h3>
                <TicketOperationsBlock ticket={ticket} includeContext={false} />
              </>
            )}
          </aside>
        </div>
      </section>

      <section
        {...panel("conditions")}
        className="workspace-surface ticket-conditions-panel"
      >
        <TicketWorkflowView model={model} section="conditions" />
      </section>

      <section
        {...panel("discussion")}
        className="workspace-surface ticket-discussion-panel"
      >
        <h3>Обсуждение заявки</h3>
        <form
          className="comment-form ticket-comment-compose"
          onSubmit={handleCommentSubmit}
        >
          <Textarea
            name="content"
            aria-label={locale === "ru" ? "Комментарий" : "Comment"}
            onChange={handleFieldChange(setCommentForm)}
            rows={3}
            value={commentForm.content}
          />
          <IconButton
            label={t.actions.addComment}
            busy={busyAction === "ticket-comment"}
            disabled={!commentForm.content.trim()}
            type="submit"
          >
            <ActionIcon name="send" />
          </IconButton>
        </form>
        <div className="comment-list">
          {ticketComments.length ? (
            ticketComments.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <div className="comment-meta">
                  <strong>{comment.authorName ?? "—"}</strong>
                  <time dateTime={comment.createdAt}>
                    {formatDateTime(comment.createdAt, locale)}
                  </time>
                </div>
                <p>{comment.content}</p>
              </article>
            ))
          ) : (
            <div className="empty-state">{t.hints.commentEmpty}</div>
          )}
        </div>
      </section>

      <section
        {...panel("files")}
        className="workspace-surface ticket-files-panel"
      >
        <TicketWorkflowView model={model} section="photos" />
        <TicketAttachmentBlock ticket={ticket} title="Вложения заявки" />
      </section>

      <section
        {...panel("documents")}
        className="workspace-surface ticket-documents-panel"
      >
        <DocumentRegistry entityType="tickets" entityId={ticket.id} />
      </section>

      <section
        {...panel("history")}
        className="workspace-surface ticket-history-panel"
      >
        <TicketWorkflowView model={model} section="history" />
        <section className="ticket-status-history">
          <h3>{locale === "ru" ? "Изменения заявки" : "Ticket changes"}</h3>
          <div className="comment-list">
            {ticketHistory.length ? (
              ticketHistory.map((event) => (
                <article className="comment-card" key={event.id}>
                  <div className="comment-meta">
                    <strong>
                      {(
                        {
                          assignment_changed:
                            locale === "ru"
                              ? "Назначение исполнителя"
                              : "Assignee changed",
                          category_changed:
                            locale === "ru"
                              ? "Изменение категории"
                              : "Category changed",
                          priority_changed:
                            locale === "ru"
                              ? "Изменение приоритета"
                              : "Priority changed",
                          sla_changed:
                            locale === "ru"
                              ? "Изменение срока"
                              : "Deadline changed",
                        } as Record<string, string>
                      )[event.type] ??
                        (event.fromStatus
                          ? `${getTicketStatusLabel(event.fromStatus, locale)} → ${getTicketStatusLabel(event.toStatus, locale)}`
                          : getTicketStatusLabel(event.toStatus, locale))}
                    </strong>
                    <time dateTime={event.createdAt}>
                      {formatDateTime(event.createdAt, locale)}
                    </time>
                  </div>
                  <p>
                    {event.createdByName ?? "Система"}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </p>
                </article>
              ))
            ) : (
              <div className="empty-state">История пока пустая.</div>
            )}
          </div>
        </section>
      </section>

      <section
        {...panel("context")}
        className="workspace-surface ticket-links-panel"
      >
        <TicketOperations
          token={session.token}
          ticket={ticket}
          overview={overview}
          operations={operations}
          onRefresh={refreshWorkspace}
          onUnit={openUnitDetail}
          onTenant={openTenantDetail}
          onTicket={openTicketDetail}
          tickets={tickets}
          readOnly={!canUpdateTickets}
          canEditLinks={isManagerShell}
          canNavigateContext={isManagerShell}
          section="links"
        />
      </section>
      <section
        {...panel("costs")}
        className="workspace-surface ticket-costs-panel"
      >
        <TicketOperations
          token={session.token}
          ticket={ticket}
          overview={overview}
          operations={operations}
          onRefresh={refreshWorkspace}
          onUnit={openUnitDetail}
          onTenant={openTenantDetail}
          onTicket={openTicketDetail}
          tickets={tickets}
          readOnly={!canUpdateTickets}
          canEditLinks={isManagerShell}
          canNavigateContext={isManagerShell}
          section="work"
        />
      </section>
    </section>
  );
}
