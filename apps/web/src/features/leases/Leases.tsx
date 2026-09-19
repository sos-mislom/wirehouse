import { useWorkspace } from "../../app/WorkspaceContext";
import { BotLinkPanel } from "../../MessengerButtons";
import { TenantServices } from "../../Operations";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  daysUntil,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  getCollectionBasisLabel,
  supportedFileHint,
} from "../../shared/format";
import { documentCategoryOptions } from "../../shared/navigation";
import { Button, Input, Select } from "../../ui";
export function Leases() {
  const {
    isTenant,
    operations,
    session,
    t,
    overview,
    loadLeaseDocuments,
    locale,
    handlePaymentProofSubmit,
    handleFieldChange,
    setPaymentProofForm,
    paymentProofForm,
    paymentProofFile,
    setDocumentUploadCategory,
    documentUploadCategory,
    getDocumentCategoryLabel,
    setPaymentProofFile,
    getFileKind,
    busyAction,
    canManagePortfolio,
    ui,
    downloadExport,
    managerUi,
    leaseWatch,
  } = useWorkspace();
  return (
    <section className="section-grid">
      {isTenant ? (
        <>
          <TenantServices data={operations} />
          <article className="surface">
            <BotLinkPanel token={session.token} />
          </article>
        </>
      ) : null}
      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.leases}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.leases.map((lease) => (
            <div className="list-row" key={lease.id}>
              <div>
                <strong>{lease.contractNumber}</strong>
                <p>
                  {lease.tenantName ?? "—"} · {lease.propertyName ?? "—"} ·{" "}
                  {lease.unitNumber ?? "—"}
                </p>
                <Button
                  variant="secondary"
                  className="secondary-button secondary-button--compact"
                  onClick={() => void loadLeaseDocuments(lease)}
                  type="button"
                >
                  {t.fields.document}
                </Button>
              </div>
              <div className="list-aside">
                <span className={`status-pill status-pill--${lease.stage}`}>
                  {t.leaseStages[lease.stage as keyof typeof t.leaseStages]}
                </span>
                <small>{formatDate(lease.endDate, locale)}</small>
              </div>
            </div>
          ))}
        </div>
      </article>

      {isTenant ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <h3>
                {locale === "ru"
                  ? "Отправить оплату на проверку"
                  : "Send payment for review"}
              </h3>
            </div>
          </div>
          <form
            className="form-grid form-grid--single"
            onSubmit={handlePaymentProofSubmit}
          >
            <label>
              <span>{t.fields.contractNumber}</span>
              <Select
                name="leaseId"
                onChange={handleFieldChange(setPaymentProofForm)}
                value={paymentProofForm.leaseId}
              >
                {overview.leases.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.contractNumber} · {lease.unitNumber ?? "—"}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>{locale === "ru" ? "Сумма" : "Amount"}</span>
              <Input
                name="amount"
                onChange={handleFieldChange(setPaymentProofForm)}
                type="number"
                value={paymentProofForm.amount}
              />
            </label>
            <label>
              <span>{locale === "ru" ? "Дата оплаты" : "Paid at"}</span>
              <Input
                name="paidAt"
                onChange={handleFieldChange(setPaymentProofForm)}
                type="date"
                value={paymentProofForm.paidAt}
              />
            </label>
            <label>
              <span>
                {locale === "ru"
                  ? "Номер платежки / комментарий"
                  : "Payment reference / comment"}
              </span>
              <Input
                name="reference"
                onChange={handleFieldChange(setPaymentProofForm)}
                value={paymentProofForm.reference}
              />
            </label>
            <label
              className={
                paymentProofFile
                  ? "document-upload document-upload--ready"
                  : "document-upload"
              }
            >
              <span>
                {locale === "ru"
                  ? "Чек, платежка или скрин"
                  : "Receipt, payment order, or screenshot"}
              </span>
              <Select
                className="document-category-select"
                onChange={(event) =>
                  setDocumentUploadCategory(
                    event.target
                      .value as (typeof documentCategoryOptions)[number],
                  )
                }
                value={documentUploadCategory}
              >
                {documentCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {getDocumentCategoryLabel(category)}
                  </option>
                ))}
              </Select>
              <span className="file-picker-control">
                <span className="file-picker-button">
                  {paymentProofFile
                    ? locale === "ru"
                      ? "Заменить файл"
                      : "Replace file"
                    : locale === "ru"
                      ? "Прикрепить файл"
                      : "Attach file"}
                </span>
                <span className="file-picker-name">
                  {paymentProofFile
                    ? paymentProofFile.name
                    : locale === "ru"
                      ? "Файл не выбран"
                      : "No file selected"}
                </span>
              </span>
              <Input
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(event) => {
                  setPaymentProofFile(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
              <small className="attachment-hint">
                {supportedFileHint(locale)} · до 100 МБ на файл
              </small>
            </label>
            {paymentProofFile ? (
              <div className="file-picked-summary">
                <span>{getFileKind(paymentProofFile.name)}</span>
                <strong>{paymentProofFile.name}</strong>
                <Button
                  variant="text"
                  className="text-button"
                  onClick={() => setPaymentProofFile(null)}
                  type="button"
                >
                  {t.actions.delete}
                </Button>
              </div>
            ) : null}
            <Button
              variant="primary"
              className="primary-button"
              disabled={busyAction === "payment-proof"}
              type="submit"
            >
              {locale === "ru" ? "Отправить менеджеру" : "Send to manager"}
            </Button>
          </form>
        </article>
      ) : canManagePortfolio ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <h3>{ui.finance}</h3>
            </div>
          </div>
          <div className="summary-strip summary-strip--vertical">
            <div className="summary-chip">
              <span>
                {ui.collectionRate} · {overview.finance.collectionPeriodLabel}
              </span>
              <strong>{overview.finance.collectionRate}%</strong>
              <small title="Фактически оплачено / начислено за указанный месяц">
                {getCollectionBasisLabel(overview.finance, locale)}
              </small>
            </div>
            <div className="summary-chip">
              <span>{ui.arrears}</span>
              <strong>
                {formatCompactMoney(overview.finance.arrearsAmount, locale)}
              </strong>
            </div>
            <div className="summary-chip">
              <span>{ui.noi}</span>
              <strong>
                {formatCompactMoney(overview.finance.noi, locale)}
              </strong>
            </div>
            <div className="summary-chip">
              <span>{ui.forecast}</span>
              <strong>
                {formatCompactMoney(overview.finance.forecastQuarter, locale)}
              </strong>
              <small>{overview.finance.forecastPeriodLabel}</small>
            </div>
          </div>
        </article>
      ) : null}

      {canManagePortfolio ? (
        <article className="surface surface--wide">
          <div className="surface-head">
            <div>
              <h3>{ui.exports}</h3>
            </div>
          </div>
          <div className="table-shell">
            <ResponsiveTable className="industrial-table">
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
                    <td>
                      <span
                        className={`status-pill status-pill--${item.status}`}
                      >
                        {ui.exportStatus[item.status]}
                      </span>
                    </td>
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
      ) : null}

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{t.sections.watchlist}</h3>
          </div>
        </div>
        <div className="lease-rail">
          {leaseWatch.length > 0 ? (
            leaseWatch.map((lease) => {
              const remainingDays = daysUntil(lease.endDate);
              const tone =
                remainingDays !== null && remainingDays <= 15
                  ? "critical"
                  : remainingDays !== null && remainingDays <= 45
                    ? "warning"
                    : "calm";

              return (
                <article
                  className={`lease-node lease-node--${tone}`}
                  key={lease.id}
                >
                  <small>{lease.propertyName ?? "—"}</small>
                  <strong>{lease.contractNumber}</strong>
                  <p>
                    {lease.tenantName ?? "—"} · {lease.unitNumber ?? "—"}
                  </p>
                  <span>{formatDate(lease.endDate, locale)}</span>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>
    </section>
  );
}
