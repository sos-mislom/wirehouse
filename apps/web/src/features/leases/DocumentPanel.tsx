import { useWorkspace } from "../../app/WorkspaceContext";
import {
  formatDateTime,
  formatFileSize,
  supportedFileHint,
} from "../../shared/format";
import { Button, IconButton, Input } from "../../ui";
import { ActionIcon } from "../business/ActionIcon";
import { SidePanel } from "../../ui/SidePanel";
import { useState } from "react";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { DocumentTemplateLibrary } from "../business/DocumentTemplateLibrary";
export function DocumentPanel() {
  const [view, setView] = useState("files");
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
    <SidePanel
      title={`Документы договора ${documentPanelLease.contractNumber}`}
      description={`${documentPanelLease.tenantName ?? "—"} · ${documentPanelLease.propertyName ?? "—"} · ${documentPanelLease.unitNumber ?? "—"}`}
      busy={busyAction === `lease-document-upload-${documentPanelLease.id}`}
      onClose={() => {
        setDocumentPanelLease(null);
        setLeaseDocuments([]);
      }}
    >
      <WorkspaceTabs
        label="Документы договора"
        items={[
          { id: "files", label: "Файлы", count: leaseDocuments.length },
          { id: "templates", label: "Шаблоны" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "templates" ? (
        <DocumentTemplateLibrary
          entityType="leases"
          onAttached={() => setView("files")}
        />
      ) : (
        <>
          <section className="document-panel">
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
                    {busyAction ===
                    `lease-document-upload-${documentPanelLease.id}`
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
                    busyAction ===
                    `lease-document-upload-${documentPanelLease.id}`
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
                      <IconButton
                        label={
                          locale === "ru" ? "Скачать файл" : "Download file"
                        }
                        onClick={() =>
                          void downloadLeaseDocument(
                            documentPanelLease.id,
                            item,
                          )
                        }
                        type="button"
                      >
                        <ActionIcon name="download" />
                      </IconButton>
                      {canManageDocuments ? (
                        <IconButton
                          label={t.actions.delete}
                          className="text-button text-button--danger"
                          onClick={() =>
                            void deleteLeaseDocument(
                              documentPanelLease.id,
                              item.id,
                            )
                          }
                          type="button"
                        >
                          <ActionIcon name="delete" />
                        </IconButton>
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

            <IconButton
              label={
                locale === "ru"
                  ? "Открыть системную карточку договора"
                  : "Open generated lease card"
              }
              onClick={() => void openLeaseDocument(documentPanelLease.id)}
              type="button"
            >
              <ActionIcon name="document" />
            </IconButton>
          </section>
        </>
      )}
    </SidePanel>
  ) : null;
}
