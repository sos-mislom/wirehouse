import { useWorkspace } from "../../app/WorkspaceContext";
import { TicketOperations } from "../../Operations";
import { ticketStatusOptions } from "../../projectData";
import { formatDateTime, getTicketStatusLabel } from "../../shared/format";
import { Button, Select, Textarea } from "../../ui";
import { TicketAttachmentBlock } from "./TicketAttachmentBlock";
import { TicketOperationsBlock } from "./TicketOperationsBlock";
export function ManagerTicketDetail() {
  const {
    setManagerScreen,
    managerUi,
    selectedTicket,
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
    setTicketStatusDraft,
    updateSelectedTicket,
    ticketStatusDraft,
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
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => setManagerScreen("tickets")}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>{selectedTicket?.title ?? managerUi.titles.ticketDetail}</h2>
        </div>
      </div>

      {selectedTicket ? (
        <div className="mvp-grid">
          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <div className="record-number">{selectedTicket.number}</div>
                <h3>{selectedTicket.title}</h3>
              </div>
            </div>
            <p>{selectedTicket.description}</p>
            <TicketOperations
              token={session.token}
              ticket={selectedTicket}
              overview={overview}
              operations={operations}
              onRefresh={refreshWorkspace}
              onUnit={openUnitDetail}
              onTenant={openTenantDetail}
              onTicket={openTicketDetail}
              tickets={tickets}
            />
            <div className="mvp-info-list">
              <div className="mvp-info-row">
                <span>{t.fields.property}</span>
                <strong>{selectedTicket.propertyName ?? "—"}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.unit}</span>
                <strong>{selectedTicket.unitNumber ?? "—"}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.tenant}</span>
                <strong>{selectedTicket.tenantName ?? "—"}</strong>
              </div>
              <div className="mvp-info-row">
                <span>{t.fields.priority}</span>
                <strong>
                  {
                    t.ticketPriorities[
                      selectedTicket.priority as keyof typeof t.ticketPriorities
                    ]
                  }
                </strong>
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
                    {ticketStatusOptions.map((status) => (
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
          </article>

          <article className="mvp-card mvp-card--wide">
            {<TicketOperationsBlock ticket={selectedTicket} />}
            {<TicketAttachmentBlock ticket={selectedTicket} />}

            <div className="mvp-card-head">
              <div>
                <h3>{locale === "ru" ? "История заявки" : "Ticket history"}</h3>
              </div>
            </div>
            <div className="comment-list">
              {ticketHistory.length > 0 ? (
                ticketHistory.map((event) => (
                  <div className="comment-card" key={event.id}>
                    <div className="comment-meta">
                      <strong>
                        {event.fromStatus
                          ? `${getTicketStatusLabel(event.fromStatus, locale)} → ${getTicketStatusLabel(event.toStatus, locale)}`
                          : getTicketStatusLabel(event.toStatus, locale)}
                      </strong>
                      <span>{formatDateTime(event.createdAt, locale)}</span>
                    </div>
                    <p>
                      {event.createdByName ?? "Система"}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  {locale === "ru" ? "История пока пустая." : "No history yet."}
                </div>
              )}
            </div>

            <div className="mvp-card-head">
              <div>
                <h3>{t.fields.content}</h3>
              </div>
            </div>
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
          </article>
        </div>
      ) : (
        <div className="mvp-card">
          <div className="empty-state">{t.hints.ticketEmpty}</div>
        </div>
      )}
    </section>
  );
}
