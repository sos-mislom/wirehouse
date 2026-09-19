import { useWorkspace } from "../../app/WorkspaceContext";
import {
  formatChannel,
  formatDateTime,
  getChatRoleLabel,
  getTicketStatusLabel,
} from "../../shared/format";
import { Button, Textarea } from "../../ui";
export function TenantChat() {
  const {
    locale,
    selectedChatTickets,
    selectedChatTargetTicket,
    setSelectedChatTicketId,
    t,
    chatMessages,
    chatBusy,
    managerUi,
    isTenant,
    handleChatSubmit,
    handleFieldChange,
    setChatDraft,
    chatDraft,
    busyAction,
  } = useWorkspace();
  return (
    <section className="section-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{locale === "ru" ? "Диалог по заявкам" : "Ticket chat"}</h3>
          </div>
        </div>
        <div className="stack-list">
          {selectedChatTickets.length > 0 ? (
            selectedChatTickets.map((ticket) => (
              <Button
                variant="plain"
                className={
                  selectedChatTargetTicket?.id === ticket.id
                    ? "list-row table-row-active"
                    : "list-row"
                }
                key={ticket.id}
                onClick={() => setSelectedChatTicketId(ticket.id)}
                type="button"
              >
                <div>
                  <strong>
                    {ticket.number} · {ticket.title}
                  </strong>
                  <p>
                    {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}
                  </p>
                </div>
                <div className="list-aside">
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {getTicketStatusLabel(ticket.status, locale)}
                  </span>
                </div>
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
            <div className="record-number">
              {selectedChatTargetTicket?.number ?? t.nav.chat}
            </div>
            <h3>{selectedChatTargetTicket?.title ?? t.nav.chat}</h3>
          </div>
          <small>
            {selectedChatTargetTicket?.propertyName ?? "—"} ·{" "}
            {selectedChatTargetTicket?.unitNumber ?? "—"}
          </small>
        </div>

        <div className="mvp-chat-body">
          {(() => {
            const visibleMessages = selectedChatTargetTicket
              ? chatMessages.filter(
                  (message) => message.ticketId === selectedChatTargetTicket.id,
                )
              : chatMessages;

            if (chatBusy) {
              return <div className="empty-state">{t.loading}</div>;
            }

            if (visibleMessages.length === 0) {
              return <div className="empty-state">{managerUi.emptyChat}</div>;
            }

            return visibleMessages.map((message) => (
              <div
                className={
                  message.direction === "incoming"
                    ? "mvp-chat-message"
                    : "mvp-chat-message mvp-chat-message--outgoing"
                }
                key={message.id}
              >
                <strong>
                  <span>
                    {getChatRoleLabel(message.authorRole, locale, isTenant)}
                  </span>
                  <span
                    className={`channel-pill channel-pill--${message.sourceChannel}`}
                  >
                    {formatChannel(message.sourceChannel, locale)}
                  </span>
                </strong>
                <p>{message.content}</p>
                <small>
                  {message.ticketNumber} ·{" "}
                  {formatDateTime(message.createdAt, locale)}
                </small>
              </div>
            ));
          })()}
        </div>

        <form className="mvp-chat-form" onSubmit={handleChatSubmit}>
          <Textarea
            name="content"
            onChange={handleFieldChange(setChatDraft)}
            placeholder={managerUi.chatPlaceholder}
            rows={3}
            value={chatDraft.content}
          />
          <Button
            variant="primary"
            className="primary-button"
            disabled={busyAction === "chat-submit" || !selectedChatTargetTicket}
            type="submit"
          >
            {managerUi.send}
          </Button>
        </form>
      </article>
    </section>
  );
}
