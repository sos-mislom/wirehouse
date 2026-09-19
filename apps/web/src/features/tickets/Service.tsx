import { useWorkspace } from "../../app/WorkspaceContext";
import { BotLinkPanel } from "../../MessengerButtons";
import { WorkerMeters } from "../../Operations";
import {
  ticketCategoryOptions,
  ticketPriorityOptions,
  ticketStatusOptions,
} from "../../projectData";
import { formatDate, formatDateTime } from "../../shared/format";
import { type TicketFilter } from "../../shared/types";
import { Button, Input, Select, Textarea } from "../../ui";
import { TicketAttachmentBlock } from "./TicketAttachmentBlock";
import { TicketOperationsBlock } from "./TicketOperationsBlock";
export function Service() {
  const {
    isWorker,
    session,
    t,
    handleCreateTicket,
    handleFieldChange,
    setTicketForm,
    ticketForm,
    ticketUnits,
    selectedChecklistTemplate,
    locale,
    busyAction,
    setTicketFilter,
    ticketFilter,
    filteredTickets,
    selectedTicketId,
    setSelectedTicketId,
    selectedTicket,
    canUpdateTickets,
    setTicketStatusDraft,
    updateSelectedTicket,
    ticketStatusDraft,
    canAssignTickets,
    setTicketAssigneeDraft,
    ticketAssigneeDraft,
    ticketAssigneeOptions,
    isTenant,
    handleCancelTicket,
    ticketComments,
    handleCommentSubmit,
    setCommentForm,
    commentForm,
    ui,
    overview,
    openNotification,
  } = useWorkspace();
  return (
    <section className="section-grid service-grid">
      {isWorker && session && (
        <>
          <article className="surface">
            <BotLinkPanel token={session.token} />
          </article>
          <WorkerMeters token={session.token} userId={session.user.id} />
        </>
      )}
      {!isWorker ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <h3>{t.sections.ticketCreate}</h3>
            </div>
          </div>
          <form
            className="form-grid form-grid--single"
            onSubmit={handleCreateTicket}
          >
            <label>
              <span>{t.fields.unit}</span>
              <Select
                name="unitId"
                onChange={handleFieldChange(setTicketForm)}
                value={ticketForm.unitId}
              >
                {ticketUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.propertyName} · {unit.number}
                  </option>
                ))}
              </Select>
            </label>
            <div className="split-grid">
              <label>
                <span>{t.fields.category}</span>
                <Select
                  name="category"
                  onChange={handleFieldChange(setTicketForm)}
                  value={ticketForm.category}
                >
                  {ticketCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {t.ticketCategories[option]}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                <span>{t.fields.priority}</span>
                <Select
                  name="priority"
                  onChange={handleFieldChange(setTicketForm)}
                  value={ticketForm.priority}
                >
                  {ticketPriorityOptions.map((option) => (
                    <option key={option} value={option}>
                      {t.ticketPriorities[option]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {selectedChecklistTemplate ? (
              <div className="checklist-template-preview">
                <strong>
                  {locale === "ru" ? "Шаблон чек-листа" : "Checklist template"}
                </strong>
                {selectedChecklistTemplate.items.map((item) => (
                  <span key={item.id}>{item.label}</span>
                ))}
              </div>
            ) : null}
            <label>
              <span>{t.fields.title}</span>
              <Input
                name="title"
                onChange={handleFieldChange(setTicketForm)}
                value={ticketForm.title}
              />
            </label>
            <label>
              <span>{t.fields.description}</span>
              <Textarea
                name="description"
                onChange={handleFieldChange(setTicketForm)}
                rows={5}
                value={ticketForm.description}
              />
            </label>
            <Button
              variant="primary"
              className="primary-button"
              disabled={busyAction === "ticket-create"}
              type="submit"
            >
              {t.actions.create}
            </Button>
          </form>
        </article>
      ) : null}

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>
              {isWorker
                ? locale === "ru"
                  ? "Мои заявки на обслуживание"
                  : "My service jobs"
                : t.sections.serviceFeed}
            </h3>
          </div>
          <Select
            className="filter-select"
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
        </div>
        <div className="ticket-list">
          {filteredTickets.length > 0 ? (
            filteredTickets.map((ticket) => (
              <Button
                variant="plain"
                className={
                  selectedTicketId === ticket.id
                    ? "ticket-card ticket-card--active"
                    : "ticket-card"
                }
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                type="button"
              >
                <div className="ticket-card-top">
                  <span
                    className={`priority-pill priority-pill--${ticket.priority}`}
                  >
                    {
                      t.ticketPriorities[
                        ticket.priority as keyof typeof t.ticketPriorities
                      ]
                    }
                  </span>
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {
                      t.ticketStatuses[
                        ticket.status as keyof typeof t.ticketStatuses
                      ]
                    }
                  </span>
                </div>
                <strong>{ticket.title}</strong>
                <p>
                  {ticket.number} · {ticket.propertyName ?? "—"} ·{" "}
                  {ticket.unitNumber ?? "—"}
                </p>
                <small>
                  {isWorker
                    ? formatDate(ticket.updatedAt, locale)
                    : `${ticket.tenantName ?? t.hints.noData} · ${formatDate(ticket.updatedAt, locale)}`}
                </small>
              </Button>
            ))
          ) : (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          )}
        </div>
      </article>

      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <h3>{selectedTicket?.title ?? t.sections.ticketDetail}</h3>
          </div>
        </div>

        {selectedTicket ? (
          <div className="ticket-detail">
            <div className="detail-grid">
              <div>
                <strong>{selectedTicket.number}</strong>
                <p>{selectedTicket.description}</p>
              </div>
              <div className="detail-meta">
                <span>{selectedTicket.propertyName ?? "—"}</span>
                <span>{selectedTicket.unitNumber ?? "—"}</span>
                {!isWorker ? (
                  <span>{selectedTicket.tenantName ?? "—"}</span>
                ) : null}
                {!isWorker ? (
                  <span>{selectedTicket.createdByName ?? "—"}</span>
                ) : null}
                <span>{selectedTicket.assignedToName ?? "—"}</span>
              </div>
            </div>

            {canUpdateTickets ? (
              <div className="inline-form">
                <label>
                  <span>{t.fields.status}</span>
                  <Select
                    disabled={busyAction === "ticket-update"}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      setTicketStatusDraft(nextStatus);
                      void updateSelectedTicket({ status: nextStatus });
                    }}
                    value={ticketStatusDraft}
                  >
                    {(isWorker
                      ? ticketStatusOptions.filter((status) =>
                          ["in_progress", "completed"].includes(status),
                        )
                      : ticketStatusOptions
                    ).map((status) => (
                      <option key={status} value={status}>
                        {t.ticketStatuses[status]}
                      </option>
                    ))}
                  </Select>
                </label>
                {canAssignTickets ? (
                  <label>
                    <span>
                      {locale === "ru"
                        ? "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c"
                        : "Assignee"}
                    </span>
                    <Select
                      disabled={busyAction === "ticket-update"}
                      onChange={(event) => {
                        const nextAssignee = event.target.value;
                        setTicketAssigneeDraft(nextAssignee);
                        void updateSelectedTicket({
                          assignedTo: nextAssignee || null,
                        });
                      }}
                      value={ticketAssigneeDraft}
                    >
                      <option value="">
                        {locale === "ru"
                          ? "\u041d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d"
                          : "Unassigned"}
                      </option>
                      {ticketAssigneeOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
                <small className="inline-save-hint">
                  {busyAction === "ticket-update"
                    ? locale === "ru"
                      ? "Сохраняем..."
                      : "Saving..."
                    : locale === "ru"
                      ? "Сохраняется сразу"
                      : "Saves automatically"}
                </small>
              </div>
            ) : null}
            {isTenant &&
            ["new", "accepted", "waiting_tenant"].includes(
              selectedTicket.status,
            ) ? (
              <Button
                variant="secondary"
                className="secondary-button"
                disabled={busyAction === `ticket-cancel-${selectedTicket.id}`}
                onClick={() => void handleCancelTicket(selectedTicket)}
                type="button"
              >
                {locale === "ru" ? "Отменить заявку" : "Cancel ticket"}
              </Button>
            ) : null}

            {<TicketOperationsBlock ticket={selectedTicket} />}
            {<TicketAttachmentBlock ticket={selectedTicket} />}

            <div className="comment-block">
              <h4>{t.fields.content}</h4>
              <div className="comment-list">
                {ticketComments.length > 0 ? (
                  ticketComments.map((comment) => (
                    <div className="comment-card" key={comment.id}>
                      <div className="comment-meta">
                        <strong>{comment.authorName ?? "—"}</strong>
                        <span>{formatDateTime(comment.createdAt, locale)}</span>
                      </div>
                      <p>{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">{t.hints.commentEmpty}</div>
                )}
              </div>
              <form className="comment-form" onSubmit={handleCommentSubmit}>
                <Textarea
                  name="content"
                  onChange={handleFieldChange(setCommentForm)}
                  rows={4}
                  value={commentForm.content}
                />
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "ticket-comment"}
                  type="submit"
                >
                  {t.actions.addComment}
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="empty-state">{t.hints.ticketEmpty}</div>
        )}
      </article>

      {!isWorker ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <h3>{ui.notifications}</h3>
            </div>
          </div>
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
        </article>
      ) : null}
    </section>
  );
}
