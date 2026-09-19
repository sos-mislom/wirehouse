import { useWorkspace } from "../../app/WorkspaceContext";
import {
  formatDateTime,
  formatFileSize,
  supportedFileHint,
} from "../../shared/format";
import { Button, Input } from "../../ui";
export function DocumentPanel() {
  const {
    documentPanelLease,
    setDocumentPanelLease,
    setLeaseDocuments,
    locale,
    canManageDocuments,
    busyAction,
    handleLeaseDocumentUpload,
    leaseDocuments,
    getFileKind,
    getDocumentCategoryLabel,
    downloadLeaseDocument,
    managerUi,
    deleteLeaseDocument,
    t,
    openLeaseDocument,
  } = useWorkspace();
  return documentPanelLease ? (
    <div className="document-overlay" role="dialog" aria-modal="true">
      <section className="document-panel">
        <div className="document-panel-head">
          <div>
            <h3>{documentPanelLease.contractNumber}</h3>
            <p>
              {documentPanelLease.tenantName ?? "—"} ·{" "}
              {documentPanelLease.propertyName ?? "—"} ·{" "}
              {documentPanelLease.unitNumber ?? "—"}
            </p>
          </div>
          <Button
            variant="secondary"
            className="secondary-button secondary-button--compact"
            onClick={() => {
              setDocumentPanelLease(null);
              setLeaseDocuments([]);
            }}
            type="button"
          >
            {locale === "ru" ? "Закрыть" : "Close"}
          </Button>
        </div>

        {canManageDocuments ? (
          <label className="document-upload">
            <span>
              {locale === "ru"
                ? "Загрузить файл договора или приложение"
                : "Upload lease file or appendix"}
            </span>
            <span className="file-picker-control">
              <span className="file-picker-button">
                {locale === "ru" ? "Выбрать файл" : "Choose file"}
              </span>
              <span className="file-picker-name">
                {busyAction === `lease-document-upload-${documentPanelLease.id}`
                  ? locale === "ru"
                    ? "Загрузка..."
                    : "Uploading..."
                  : locale === "ru"
                    ? "PDF, DOC, XLS или изображение"
                    : "PDF, DOC, XLS, or image"}
              </span>
            </span>
            <Input
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              disabled={
                busyAction === `lease-document-upload-${documentPanelLease.id}`
              }
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                void handleLeaseDocumentUpload(documentPanelLease.id, file);
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <small className="attachment-hint">
              {supportedFileHint(locale)} · до 100 МБ на файл
            </small>
          </label>
        ) : null}

        <div className="document-list">
          {leaseDocuments.length > 0 ? (
            leaseDocuments.map((item) => (
              <div className="document-row" key={item.id}>
                <div>
                  <div className="document-row-title">
                    <span className="file-kind-pill">
                      {getFileKind(item.fileName)}
                    </span>
                    <span className="document-category-pill">
                      {getDocumentCategoryLabel(item.category)}
                    </span>
                    <strong>{item.fileName}</strong>
                  </div>
                  <small>
                    {formatFileSize(item.sizeBytes, locale)} ·{" "}
                    {formatDateTime(item.createdAt, locale)} ·{" "}
                    {item.uploadedByName ?? "—"}
                  </small>
                </div>
                <div className="document-actions">
                  <Button
                    variant="secondary"
                    className="secondary-button secondary-button--compact"
                    onClick={() =>
                      void downloadLeaseDocument(documentPanelLease.id, item)
                    }
                    type="button"
                  >
                    {managerUi.open}
                  </Button>
                  {canManageDocuments ? (
                    <Button
                      variant="text"
                      className="text-button text-button--danger"
                      onClick={() =>
                        void deleteLeaseDocument(documentPanelLease.id, item.id)
                      }
                      type="button"
                    >
                      {t.actions.delete}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              {locale === "ru"
                ? "Файлы по договору еще не загружены."
                : "No files uploaded for this lease yet."}
            </div>
          )}
        </div>

        <Button
          variant="text"
          className="text-button text-button--neutral"
          onClick={() => void openLeaseDocument(documentPanelLease.id)}
          type="button"
        >
          {locale === "ru"
            ? "Открыть системную карточку договора"
            : "Open generated lease card"}
        </Button>
      </section>
    </div>
  ) : null;
}
