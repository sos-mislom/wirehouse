import { useWorkspace } from "../../app/WorkspaceContext";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  formatDateTime,
  getImportApprovalStatusLabel,
} from "../../shared/format";
import { Button, Input, Select } from "../../ui";
export function ManagerImport() {
  const {
    managerUi,
    locale,
    setImportMode,
    importMode,
    importDrafts,
    downloadImportTemplate,
    busyAction,
    handleImportUpload,
    handleImportCommit,
    importResults,
    downloadImportReport,
    importApprovals,
    session,
    handleImportApprovalApprove,
    handleImportApprovalReject,
    importBatches,
    downloadImportBatchAudit,
    handleImportRollback,
    ui,
    t,
    overview,
    downloadExport,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.import}</h2>
        </div>
      </div>

      <div className="mvp-grid">
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>{managerUi.templates}</h3>
            </div>
            <label className="import-mode">
              <span>{locale === "ru" ? "Режим" : "Mode"}</span>
              <Select
                onChange={(event) =>
                  setImportMode(
                    event.currentTarget.value as "create" | "update" | "upsert",
                  )
                }
                value={importMode}
              >
                <option value="create">
                  {locale === "ru" ? "Только новые" : "Create only"}
                </option>
                <option value="update">
                  {locale === "ru" ? "Только обновить" : "Update only"}
                </option>
                <option value="upsert">
                  {locale === "ru" ? "Создать / обновить" : "Create / update"}
                </option>
              </Select>
            </label>
          </div>
          <div className="mvp-stack">
            {(["tenants", "units", "leases", "payments"] as const).map(
              (templateId) => {
                const draft = importDrafts.find(
                  (item) => item.templateId === templateId,
                );
                return (
                  <div className="mvp-list-row import-row" key={templateId}>
                    <div>
                      <strong>{managerUi.nav[templateId]}</strong>
                      <p>
                        XLS ·{" "}
                        {locale === "ru"
                          ? "шаблон, проверка и применение"
                          : "template, preview, and apply"}
                        {draft
                          ? ` · ${draft.mode} · ${locale === "ru" ? "ожидает применения" : "pending apply"}`
                          : ""}
                      </p>
                    </div>
                    <div className="mvp-list-aside import-actions">
                      <Button
                        variant="secondary"
                        className="secondary-button"
                        onClick={() => void downloadImportTemplate(templateId)}
                        type="button"
                      >
                        {locale === "ru" ? "Шаблон" : "Template"}
                      </Button>
                      <label className="secondary-button import-file-button">
                        <span>{locale === "ru" ? "Проверить" : "Preview"}</span>
                        <Input
                          accept=".xls,.xlsx,.csv"
                          disabled={busyAction === `import-${templateId}`}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0] ?? null;
                            void handleImportUpload(templateId, file);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      {draft ? (
                        <Button
                          variant="primary"
                          className="primary-button primary-button--compact"
                          disabled={
                            busyAction === `import-commit-${templateId}`
                          }
                          onClick={() => void handleImportCommit(templateId)}
                          type="button"
                        >
                          {locale === "ru" ? "Применить" : "Apply"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </article>

        {importResults.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <h3>{locale === "ru" ? "Отчеты импорта" : "Import reports"}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importResults.map((result) => (
                <div
                  className="mvp-list-row"
                  key={`${result.templateId}-${result.fileName}`}
                >
                  <div>
                    <strong>{result.fileName}</strong>
                    <p>
                      {
                        managerUi.nav[
                          result.templateId as keyof typeof managerUi.nav
                        ]
                      }{" "}
                      · {locale === "ru" ? "готово" : "ready"}{" "}
                      {result.summary.ready ?? 0} ·{" "}
                      {locale === "ru" ? "создано" : "created"}{" "}
                      {result.summary.created} ·{" "}
                      {locale === "ru" ? "обновлено" : "updated"}{" "}
                      {result.summary.updated ?? 0} ·{" "}
                      {locale === "ru" ? "ошибок" : "errors"}{" "}
                      {result.summary.errors}
                    </p>
                    <div className="import-diff-list">
                      {result.rows.slice(0, 5).map((row) => (
                        <div
                          className={`import-diff-row import-diff-row--${row.status}`}
                          key={`${result.templateId}-${result.fileName}-${row.row}`}
                        >
                          <span>
                            {locale === "ru" ? "Строка" : "Row"} {row.row} ·{" "}
                            {row.action || row.status}
                          </span>
                          <strong>{row.changes || row.message}</strong>
                        </div>
                      ))}
                      {result.rows.length > 5 ? (
                        <small>
                          {locale === "ru"
                            ? `Ещё строк: ${result.rows.length - 5}`
                            : `More rows: ${result.rows.length - 5}`}
                        </small>
                      ) : null}
                    </div>
                  </div>
                  <div className="mvp-list-aside">
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={() => downloadImportReport(result)}
                      type="button"
                    >
                      {locale === "ru" ? "Отчет" : "Report"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {importApprovals.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <h3>
                  {locale === "ru"
                    ? "Согласование импорта"
                    : "Import approvals"}
                </h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importApprovals.slice(0, 6).map((approval) => (
                <div className="mvp-list-row" key={approval.id}>
                  <div>
                    <strong>{approval.fileName}</strong>
                    <p>
                      {approval.templateId} · {approval.mode} ·{" "}
                      {approval.rowCount} {locale === "ru" ? "строк" : "rows"} ·{" "}
                      {getImportApprovalStatusLabel(approval.status, locale)}
                    </p>
                    <small>
                      {approval.requestedByName ?? "—"} ·{" "}
                      {formatDateTime(approval.createdAt, locale)}
                    </small>
                  </div>
                  <div className="mvp-list-aside">
                    {session?.user.role === "admin" &&
                    approval.status === "pending" ? (
                      <>
                        <Button
                          variant="secondary"
                          className="secondary-button secondary-button--compact"
                          disabled={
                            busyAction ===
                            `import-approval-approve-${approval.id}`
                          }
                          onClick={() =>
                            void handleImportApprovalApprove(approval)
                          }
                          type="button"
                        >
                          {locale === "ru" ? "Подтвердить" : "Approve"}
                        </Button>
                        <Button
                          variant="secondary"
                          className="secondary-button secondary-button--compact"
                          disabled={
                            busyAction ===
                            `import-approval-reject-${approval.id}`
                          }
                          onClick={() =>
                            void handleImportApprovalReject(approval)
                          }
                          type="button"
                        >
                          {locale === "ru" ? "Отклонить" : "Reject"}
                        </Button>
                      </>
                    ) : (
                      <span
                        className={`status-pill status-pill--${approval.status === "approved" ? "success" : approval.status === "rejected" ? "critical" : "warning"}`}
                      >
                        {getImportApprovalStatusLabel(approval.status, locale)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {importBatches.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <h3>{locale === "ru" ? "Партии импорта" : "Import batches"}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importBatches.slice(0, 6).map((batch) => (
                <div className="mvp-list-row" key={batch.id}>
                  <div>
                    <strong>{batch.fileName}</strong>
                    <p>
                      {batch.templateId} · {batch.mode} · {batch.operationCount}{" "}
                      {locale === "ru" ? "операций" : "operations"} ·{" "}
                      {batch.status === "rolled_back"
                        ? locale === "ru"
                          ? "отменено"
                          : "rolled back"
                        : locale === "ru"
                          ? "применено"
                          : "applied"}
                    </p>
                    <small>{formatDateTime(batch.createdAt, locale)}</small>
                  </div>
                  <div className="mvp-list-aside">
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={() => void downloadImportBatchAudit(batch)}
                      type="button"
                    >
                      {locale === "ru" ? "Аудит XLSX" : "Audit XLSX"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      disabled={
                        batch.status === "rolled_back" ||
                        busyAction === `import-rollback-${batch.id}`
                      }
                      onClick={() => void handleImportRollback(batch)}
                      type="button"
                    >
                      {locale === "ru" ? "Откатить" : "Rollback"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>{managerUi.readyExports}</h3>
            </div>
          </div>
          <div className="mvp-table-wrap">
            <ResponsiveTable className="mvp-table">
              <thead>
                <tr>
                  <th>{ui.exports}</th>
                  <th>{ui.scope}</th>
                  <th>{ui.cadence}</th>
                  <th>Status</th>
                  <th>{locale === "ru" ? "Обновлено" : "Updated"}</th>
                  <th>{t.fields.document}</th>
                </tr>
              </thead>
              <tbody>
                {overview.exports.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.format}</small>
                    </td>
                    <td>{item.scope}</td>
                    <td>{item.cadence}</td>
                    <td>{ui.exportStatus[item.status]}</td>
                    <td>{formatDateTime(item.updatedAt, locale)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        className="secondary-button secondary-button--compact"
                        onClick={() => void downloadExport(item.id)}
                        type="button"
                      >
                        {managerUi.open}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        </article>
      </div>
    </section>
  );
}
