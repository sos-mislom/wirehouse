import { useWorkspace } from "../../../app/WorkspaceContext";
import { formatDateTime, formatFileSize, supportedFileHint } from "../../../shared/format";
import { Button, Input, Textarea } from "../../../ui";

export function TenantNotesTab() {
  const {
    tenantDetail,
    canManagePortfolio,
    handleTenantNoteSubmit,
    locale,
    handleFieldChange,
    setTenantNoteForm,
    tenantNoteForm,
    tenantNoteFile,
    setTenantNoteFile,
    getFileKind,
    t,
    busyAction,
    expandedTenantNoteIds,
    toggleTenantNoteExpanded,
    openTenantNoteAttachment,
    deleteTenantNoteAttachment,
    uploadTenantNoteAttachment,
  } = useWorkspace();

  if (!tenantDetail) return null;

  return (
    <div className="mvp-stack">
      {canManagePortfolio ? (
        <form
          className="mvp-card mvp-form"
          onSubmit={handleTenantNoteSubmit}
        >
          <div className="mvp-card-head">
            <div>
              <h3>
                {locale === "ru"
                  ? "Добавить запись переговоров"
                  : "Add negotiation note"}
              </h3>
            </div>
          </div>
          <label>
            <span>{locale === "ru" ? "Тема" : "Subject"}</span>
            <Input
              name="title"
              onChange={handleFieldChange(setTenantNoteForm)}
              placeholder={
                locale === "ru"
                  ? "Например: условия пролонгации"
                  : "For example: renewal terms"
              }
              value={tenantNoteForm.title}
            />
          </label>
          <label>
            <span>
              {locale === "ru" ? "Что обсудили" : "Discussion summary"}
            </span>
            <Textarea
              name="content"
              onChange={handleFieldChange(setTenantNoteForm)}
              placeholder={
                locale === "ru"
                  ? "Фиксируйте договоренности, риски, следующий шаг и ответственного."
                  : "Capture agreements, risks, next step, and owner."
              }
              rows={4}
              value={tenantNoteForm.content}
            />
          </label>
          <label
            className={
              tenantNoteFile
                ? "document-upload document-upload--ready"
                : "document-upload"
            }
          >
            <span>
              {locale === "ru"
                ? "Файл к переговорам"
                : "Negotiation file"}
            </span>
            <span className="file-picker-control">
              <span className="file-picker-button">
                {tenantNoteFile
                  ? locale === "ru"
                    ? "Заменить файл"
                    : "Replace file"
                  : locale === "ru"
                    ? "Прикрепить файл"
                    : "Attach file"}
              </span>
              <span className="file-picker-name">
                {tenantNoteFile
                  ? tenantNoteFile.name
                  : locale === "ru"
                    ? "Файл не выбран"
                    : "No file selected"}
              </span>
            </span>
            <Input
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(event) => {
                setTenantNoteFile(
                  event.currentTarget.files?.[0] ?? null,
                );
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <small className="attachment-hint">
              {supportedFileHint(locale)} · до 100 МБ на файл
            </small>
          </label>
          {tenantNoteFile ? (
            <div className="file-picked-summary">
              <span>{getFileKind(tenantNoteFile.name)}</span>
              <strong>{tenantNoteFile.name}</strong>
              <Button
                variant="text"
                className="text-button"
                onClick={() => setTenantNoteFile(null)}
                type="button"
              >
                {t.actions.delete}
              </Button>
            </div>
          ) : null}
          <Button
            variant="primary"
            className="primary-button"
            disabled={
              busyAction === "tenant-note" ||
              !tenantNoteForm.title.trim() ||
              !tenantNoteForm.content.trim()
            }
            type="submit"
          >
            {busyAction === "tenant-note"
              ? locale === "ru"
                ? "Сохраняем..."
                : "Saving..."
              : t.actions.save}
          </Button>
        </form>
      ) : null}
      {tenantDetail.notes.length > 0 ? (
        tenantDetail.notes.map((note) => {
          const isExpanded = Boolean(expandedTenantNoteIds[note.id]);
          const isManualNote = !note.id.startsWith("note-");
          const noteAttachments = note.attachments ?? [];
          const shortContent =
            note.content.length > 170
              ? `${note.content.slice(0, 170).trim()}...`
              : note.content;

          return (
            <article
              className="mvp-card tenant-note-card"
              key={note.id}
            >
              <div className="tenant-note-top">
                <div>
                  <strong>{note.title}</strong>
                  <small>
                    {note.authorName} ·{" "}
                    {formatDateTime(note.createdAt, locale)}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  className="secondary-button secondary-button--compact"
                  onClick={() => toggleTenantNoteExpanded(note.id)}
                  type="button"
                >
                  {isExpanded
                    ? locale === "ru"
                      ? "Свернуть"
                      : "Collapse"
                    : locale === "ru"
                      ? "Развернуть"
                      : "Expand"}
                </Button>
              </div>
              <p>{isExpanded ? note.content : shortContent}</p>
              {!isExpanded && noteAttachments.length > 0 ? (
                <small className="attachment-hint">
                  {noteAttachments.length}{" "}
                  {locale === "ru" ? "файл." : "files"}
                </small>
              ) : null}
              {isExpanded ? (
                <div className="tenant-note-expanded">
                  {noteAttachments.length > 0 ? (
                    <div className="attachment-grid">
                      {noteAttachments.map((attachment) => (
                        <article
                          className="attachment-card"
                          key={attachment.id}
                        >
                          <Button
                            variant="plain"
                            className="attachment-preview"
                            onClick={() =>
                              void openTenantNoteAttachment(
                                note.id,
                                attachment,
                              )
                            }
                            type="button"
                          >
                            <span>
                              {getFileKind(attachment.fileName)}
                            </span>
                          </Button>
                          <div>
                            <strong>{attachment.fileName}</strong>
                            <small>
                              {formatFileSize(
                                attachment.sizeBytes,
                                locale,
                              )}{" "}
                              ·{" "}
                              {formatDateTime(
                                attachment.createdAt,
                                locale,
                              )}
                            </small>
                            <small>
                              {attachment.uploadedByName ?? "—"}
                            </small>
                          </div>
                          {canManagePortfolio ? (
                            <Button
                              variant="text"
                              className="text-button text-button--danger"
                              onClick={() =>
                                void deleteTenantNoteAttachment(
                                note.id,
                                attachment.id,
                              )
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
                      ? "Файлы к записи не прикреплены."
                      : "No files attached to this note."}
                  </div>
                )}
                {canManagePortfolio && isManualNote ? (
                  <label className="secondary-button secondary-button--compact attachment-upload tenant-note-upload">
                    {busyAction ===
                    `tenant-note-attachment-${note.id}`
                      ? locale === "ru"
                        ? "Загружаем..."
                        : "Uploading..."
                      : locale === "ru"
                        ? "Прикрепить файл"
                        : "Attach file"}
                    <Input
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                      disabled={
                        busyAction ===
                        `tenant-note-attachment-${note.id}`
                      }
                      onChange={(event) => {
                        const file =
                          event.currentTarget.files?.[0] ?? null;
                        event.currentTarget.value = "";
                        void uploadTenantNoteAttachment(
                          note.id,
                          file,
                        );
                      }}
                      type="file"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })
    ) : (
      <div className="mvp-card">
        <div className="empty-state">{t.hints.noData}</div>
      </div>
    )}
  </div>
  );
}
