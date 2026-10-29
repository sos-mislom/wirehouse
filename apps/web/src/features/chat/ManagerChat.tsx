import { useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import {
  formatChannel,
  formatDateTime,
  getChatRoleLabel,
} from "../../shared/format";
import { Button, Select, Textarea } from "../../ui";
export function ManagerChat() {
  const {
    managerUi,
    chatThreads,
    selectedChatTenantId,
    setSelectedChatTenantId,
    t,
    selectedChatThread,
    chatBusy,
    chatMessages,
    locale,
    isTenant,
    handleChatSubmit,
    selectedChatTickets,
    setSelectedChatTicketId,
    selectedChatTargetTicket,
    handleFieldChange,
    setChatDraft,
    chatDraft,
    busyAction,
  } = useWorkspace();
  const [conversationOpen, setConversationOpen] = useState(
    Boolean(selectedChatTenantId),
  );
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.chat}</h2>
        </div>
      </div>

      <div
        className={`mvp-chat-layout ${conversationOpen ? "chat-conversation-open" : ""}`}
      >
        <article className="mvp-card chat-thread-pane">
          <div className="mvp-thread-list">
            {chatThreads.length > 0 ? (
              chatThreads.map((thread) => (
                <Button
                  variant="plain"
                  className={
                    selectedChatTenantId === thread.tenantId
                      ? "mvp-thread mvp-thread--active"
                      : "mvp-thread"
                  }
                  key={thread.tenantId}
                  onClick={() => {
                    setSelectedChatTenantId(thread.tenantId);
                    setConversationOpen(true);
                  }}
                  type="button"
                >
                  <div className="mvp-thread-head">
                    <strong>{thread.tenantName}</strong>
                    {thread.unreadCount > 0 ? (
                      <span>{thread.unreadCount}</span>
                    ) : null}
                  </div>
                  <p>{thread.preview}</p>
                  <small>
                    {thread.propertyName ?? "—"} · {thread.ticketCount}{" "}
                    {managerUi.chatThreadMeta}
                  </small>
                </Button>
              ))
            ) : (
              <div className="empty-state">{t.hints.noData}</div>
            )}
          </div>
        </article>

        <article className="mvp-card chat-conversation-pane">
          <Button
            variant="text"
            className="chat-back"
            onClick={() => setConversationOpen(false)}
          >
            К списку чатов
          </Button>
          <div className="mvp-card-head">
            <div>
              <h3>{selectedChatThread?.tenantName ?? managerUi.nav.chat}</h3>
            </div>
            <small>{selectedChatThread?.propertyName ?? "—"}</small>
          </div>

          <div className="mvp-chat-body">
            {chatBusy && chatMessages.length === 0 ? (
              <div className="empty-state">{t.loading}</div>
            ) : chatMessages.length > 0 ? (
              chatMessages.map((message) => (
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
              ))
            ) : (
              <div className="empty-state">{managerUi.emptyChat}</div>
            )}
          </div>

          <form className="mvp-chat-form" onSubmit={handleChatSubmit}>
            {selectedChatTickets.length > 1 ? (
              <Select
                aria-label="Заявка для сообщения"
                onChange={(event) =>
                  setSelectedChatTicketId(event.target.value)
                }
                value={selectedChatTargetTicket?.id ?? ""}
              >
                {selectedChatTickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"} ·{" "}
                    {ticket.number}
                  </option>
                ))}
              </Select>
            ) : null}
            <Textarea
              aria-label="Сообщение арендатору"
              name="content"
              onChange={handleFieldChange(setChatDraft)}
              placeholder={managerUi.chatPlaceholder}
              rows={3}
              value={chatDraft.content}
            />
            <Button
              variant="primary"
              className="primary-button"
              disabled={
                busyAction === "chat-submit" || !selectedChatTargetTicket
              }
              type="submit"
            >
              {managerUi.send}
            </Button>
          </form>
        </article>
      </div>
    </section>
  );
}
