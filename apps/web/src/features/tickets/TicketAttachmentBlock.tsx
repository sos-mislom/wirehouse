import { useWorkspace } from "../../app/WorkspaceContext";
import {
  formatDateTime,
  formatFileSize,
  supportedFileHint,
} from "../../shared/format";
import { type Ticket } from "../../shared/types";
import { Button, Input } from "../../ui";
export function TicketAttachmentBlock({ ticket }: { ticket: Ticket }) {
  const {
    locale,
    ticketAttachments,
    busyAction,
    handleTicketAttachmentUpload,
    openTicketAttachment,
    session,
    deleteTicketAttachment,
    t,
  } = useWorkspace();
  return (
    <div className="attachment-block">
      <div className="attachment-head">
        <div>
          <h4>{locale === "ru" ? "Фото и файлы заявки" : "Ticket files"}</h4>
          <span>
            {ticketAttachments.length} ·{" "}
            {formatFileSize(
              ticketAttachments.reduce(
                (total, item) => total + item.sizeBytes,
                0,
              ),
              locale,
            )}
          </span>
          <small className="attachment-hint">
            {supportedFileHint(locale)} · до 100 МБ на файл
          </small>
        </div>
        <label className="secondary-button secondary-button--compact attachment-upload">
          {locale === "ru" ? "Прикрепить" : "Attach"}
          <Input
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            disabled={busyAction === `ticket-attachment-upload-${ticket.id}`}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleTicketAttachmentUpload(ticket.id, file);
            }}
            type="file"
          />
        </label>
      </div>
      {ticketAttachments.length > 0 ? (
        <div className="attachment-grid">
          {ticketAttachments.map((item) => (
            <article
              className={`attachment-card attachment-card--${item.mediaType}`}
              key={item.id}
            >
              <Button
                variant="plain"
                className="attachment-preview"
                onClick={() => void openTicketAttachment(ticket.id, item)}
                type="button"
              >
                <span>
                  {item.mediaType === "image"
                    ? "IMG"
                    : item.mediaType === "video"
                      ? "VID"
                      : "FILE"}
                </span>
              </Button>
              <div>
                <strong>{item.fileName}</strong>
                <small>
                  {formatFileSize(item.sizeBytes, locale)} ·{" "}
                  {formatDateTime(item.createdAt, locale)}
                </small>
                <small>{item.uploadedByName ?? "—"}</small>
              </div>
              {session &&
              (["admin", "manager"].includes(session.user.role) ||
                item.uploadedBy === session.user.id) ? (
                <Button
                  variant="text"
                  className="text-button text-button--danger"
                  onClick={() =>
                    void deleteTicketAttachment(ticket.id, item.id)
                  }
                  type="button"
                >
                  {t.actions.delete}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          {locale === "ru"
            ? "Файлы к заявке еще не прикреплены."
            : "No ticket files yet."}
        </div>
      )}
    </div>
  );
}
