import { useWorkspace } from "../../app/WorkspaceContext";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatMoney,
  reconciliationLabel,
} from "../../shared/format";
import { Button, Input, Select } from "../../ui";
export function ManagerBilling() {
  const {
    selectedBillingInvoice,
    managerUi,
    downloadBillingReconciliation,
    locale,
    downloadExport,
    billingTotals,
    billingInvoices,
    ui,
    pendingPaymentProofTickets,
    t,
    setSelectedBillingInvoiceId,
    setBillingPaymentForm,
    openTicketDetail,
    billingReconciliation,
    selectedBillingInvoiceId,
    handleBillingPaymentSubmit,
    handleFieldChange,
    billingPaymentForm,
    busyAction,
    downloadBillingInvoice,
    downloadBillingClosingPack,
    selectedBillingLease,
    loadLeaseDocuments,
  } = useWorkspace();

  const remaining = selectedBillingInvoice
    ? Math.max(
        0,
        selectedBillingInvoice.totalAmount - selectedBillingInvoice.paidAmount,
      )
    : 0;

  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.billing}</h2>
        </div>
        <div className="mvp-actions">
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => void downloadBillingReconciliation()}
            type="button"
          >
            {locale === "ru" ? "Сверка XLSX" : "Reconciliation XLSX"}
          </Button>
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => void downloadExport("billing-ledger")}
            type="button"
          >
            {locale === "ru" ? "Реестр XLSX" : "Ledger XLSX"}
          </Button>
        </div>
      </div>

      <div className="mvp-metrics">
        <article className="mvp-metric">
          <span>{locale === "ru" ? "Начислено" : "Billed"}</span>
          <strong>{formatCompactMoney(billingTotals.billed, locale)}</strong>
          <small>
            {billingInvoices.length} {locale === "ru" ? "счетов" : "invoices"}
          </small>
        </article>
        <article className="mvp-metric">
          <span>{locale === "ru" ? "Оплачено" : "Paid"}</span>
          <strong>{formatCompactMoney(billingTotals.paid, locale)}</strong>
          <small>
            {billingTotals.billed > 0
              ? Math.round((billingTotals.paid / billingTotals.billed) * 100)
              : 0}
            %
          </small>
        </article>
        <article className="mvp-metric">
          <span>{ui.arrears}</span>
          <strong>{formatCompactMoney(billingTotals.overdue, locale)}</strong>
          <small>{locale === "ru" ? "к взысканию" : "outstanding"}</small>
        </article>
        <article className="mvp-metric">
          <span>{locale === "ru" ? "На проверке" : "In review"}</span>
          <strong>{pendingPaymentProofTickets.length}</strong>
          <small>
            {locale === "ru" ? "чеков от арендаторов" : "tenant proofs"}
          </small>
        </article>
      </div>

      {pendingPaymentProofTickets.length > 0 ? (
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>
                {locale === "ru"
                  ? "Оплаты арендаторов на проверке"
                  : "Tenant payment proofs in review"}
              </h3>
            </div>
            <span className="status-pill status-pill--warning">
              {pendingPaymentProofTickets.length} подтверждений оплаты
            </span>
          </div>
          <div className="mvp-stack">
            {pendingPaymentProofTickets.slice(0, 5).map((ticket) => {
              const linkedInvoice = billingInvoices.find(
                (invoice) =>
                  invoice.tenantId === ticket.tenantId &&
                  invoice.unitId === ticket.unitId &&
                  invoice.status !== "paid",
              );

              return (
                <div className="mvp-list-row" key={ticket.id}>
                  <div>
                    <strong>{ticket.title}</strong>
                    <p>
                      {ticket.tenantName ?? "—"} · {ticket.propertyName ?? "—"}{" "}
                      · {ticket.unitNumber ?? "—"}
                    </p>
                    <small>
                      {ticket.number} ·{" "}
                      {formatDateTime(ticket.createdAt, locale)} ·{" "}
                      {ticket.attachmentCount}{" "}
                      {locale === "ru" ? "файл." : "files"}
                    </small>
                  </div>
                  <div className="mvp-list-aside">
                    <span
                      className={`status-pill status-pill--${ticket.status}`}
                    >
                      {
                        t.ticketStatuses[
                          ticket.status as keyof typeof t.ticketStatuses
                        ]
                      }
                    </span>
                    {linkedInvoice ? (
                      <small>
                        {linkedInvoice.period} ·{" "}
                        {formatMoney(
                          linkedInvoice.totalAmount - linkedInvoice.paidAmount,
                          locale,
                        )}
                      </small>
                    ) : null}
                    {linkedInvoice ? (
                      <Button
                        variant="secondary"
                        className="secondary-button secondary-button--compact"
                        onClick={() => {
                          setSelectedBillingInvoiceId(linkedInvoice.id);
                          setBillingPaymentForm({
                            amount: String(
                              Math.max(
                                0,
                                linkedInvoice.totalAmount -
                                  linkedInvoice.paidAmount,
                              ),
                            ),
                            paidAt: new Date().toISOString().slice(0, 10),
                            method: "bank_transfer",
                            reference: ticket.number,
                          });
                        }}
                        type="button"
                      >
                        {locale === "ru" ? "Принять оплату" : "Post payment"}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      className="secondary-button secondary-button--compact"
                      onClick={() => openTicketDetail(ticket.id)}
                      type="button"
                    >
                      {locale === "ru" ? "Проверить" : "Review"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}

      {billingReconciliation ? (
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>
                {locale === "ru" ? "Сверка оплат" : "Payment reconciliation"}
              </h3>
              <p className="field-hint">
                Все счета с неоплаченным остатком или переплатой перечислены
                ниже. Ожидающие оплаты счета ещё могут быть в срок.
              </p>
            </div>
            <span
              className={`status-pill status-pill--${billingReconciliation.summary.issues > 0 ? "warning" : "success"}`}
            >
              {billingReconciliation.summary.issues > 0
                ? locale === "ru"
                  ? `${billingReconciliation.summary.issues} расхожд.`
                  : `${billingReconciliation.summary.issues} issues`
                : locale === "ru"
                  ? "сошлось"
                  : "matched"}
            </span>
          </div>
          <div className="mvp-metrics mvp-metrics--compact">
            <article className="mvp-metric">
              <span>{locale === "ru" ? "Собираемость" : "Collection"}</span>
              <strong>{billingReconciliation.summary.collectionRate}%</strong>
            </article>
            <article className="mvp-metric">
              <span>{locale === "ru" ? "Остаток" : "Outstanding"}</span>
              <strong>
                {formatCompactMoney(
                  billingReconciliation.summary.outstanding,
                  locale,
                )}
              </strong>
            </article>
            <article className="mvp-metric">
              <span>{locale === "ru" ? "Переплата" : "Overpaid"}</span>
              <strong>
                {formatCompactMoney(
                  billingReconciliation.summary.overpaid,
                  locale,
                )}
              </strong>
            </article>
          </div>
          <div className="mvp-stack">
            {billingReconciliation.rows
              .filter((row) => row.reconciliationStatus !== "matched")
              .map((row) => (
                <div className="mvp-list-row" key={row.invoiceId}>
                  <div>
                    <strong>
                      {row.tenantName} · {row.period}
                    </strong>
                    <p>
                      {row.contractNumber || "—"} ·{" "}
                      {row.issue || row.reconciliationStatus}
                    </p>
                  </div>
                  <div className="mvp-list-aside">
                    <strong>
                      {formatMoney(
                        row.outstandingAmount || row.overpaidAmount,
                        locale,
                      )}
                    </strong>
                    <small>
                      {reconciliationLabel(row.reconciliationStatus)}
                    </small>
                  </div>
                </div>
              ))}
            {billingReconciliation.rows.every(
              (row) => row.reconciliationStatus === "matched",
            ) ? (
              <div className="empty-state">
                {locale === "ru"
                  ? "Все счета сходятся с оплатами."
                  : "All invoices match payments."}
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      <div className="mvp-grid">
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <h3>
                {locale === "ru" ? "Счета арендаторов" : "Tenant invoices"}
              </h3>
            </div>
          </div>
          <div className="mvp-table-wrap">
            <ResponsiveTable className="mvp-table">
              <thead>
                <tr>
                  <th>{locale === "ru" ? "Период" : "Period"}</th>
                  <th>{locale === "ru" ? "Арендатор" : "Tenant"}</th>
                  <th>{locale === "ru" ? "Договор" : "Contract"}</th>
                  <th>{locale === "ru" ? "Сумма" : "Total"}</th>
                  <th>{locale === "ru" ? "Оплачено" : "Paid"}</th>
                  <th>{locale === "ru" ? "Срок" : "Due"}</th>
                  <th>{locale === "ru" ? "Статус" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {billingInvoices.map((invoice) => (
                  <tr
                    className={
                      invoice.id === selectedBillingInvoiceId
                        ? "mvp-row-active"
                        : undefined
                    }
                    key={invoice.id}
                    onClick={() => setSelectedBillingInvoiceId(invoice.id)}
                  >
                    <td>{invoice.period}</td>
                    <td>{invoice.tenantName ?? "—"}</td>
                    <td>{invoice.contractNumber ?? "—"}</td>
                    <td>{formatMoney(invoice.totalAmount, locale)}</td>
                    <td>{formatMoney(invoice.paidAmount, locale)}</td>
                    <td>{formatDate(invoice.dueDate, locale)}</td>
                    <td>{ui.paymentStatus[invoice.status]}</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Принять платеж" : "Post payment"}</h3>
            </div>
          </div>
          {selectedBillingInvoice ? (
            <form className="mvp-form" onSubmit={handleBillingPaymentSubmit}>
              <label>
                <span>{locale === "ru" ? "Счет" : "Invoice"}</span>
                <Input
                  readOnly
                  value={`${selectedBillingInvoice.period} · ${selectedBillingInvoice.tenantName ?? ""}`}
                />
              </label>
              <label>
                <span>{locale === "ru" ? "Остаток" : "Remaining"}</span>
                <Input readOnly value={formatMoney(remaining, locale)} />
              </label>
              <label>
                <span>
                  {locale === "ru" ? "Сумма оплаты" : "Payment amount"}
                </span>
                <Input
                  min="1"
                  name="amount"
                  onChange={handleFieldChange(setBillingPaymentForm)}
                  type="number"
                  value={billingPaymentForm.amount}
                />
              </label>
              <label>
                <span>{locale === "ru" ? "Дата оплаты" : "Paid at"}</span>
                <Input
                  name="paidAt"
                  onChange={handleFieldChange(setBillingPaymentForm)}
                  type="date"
                  value={billingPaymentForm.paidAt}
                />
              </label>
              <label>
                <span>{locale === "ru" ? "Способ" : "Method"}</span>
                <Select
                  name="method"
                  onChange={handleFieldChange(setBillingPaymentForm)}
                  value={billingPaymentForm.method}
                >
                  <option value="bank_transfer">
                    {locale === "ru" ? "Безналичный перевод" : "Bank transfer"}
                  </option>
                  <option value="cash">
                    {locale === "ru" ? "Наличные" : "Cash"}
                  </option>
                  <option value="offset">
                    {locale === "ru" ? "Взаимозачет" : "Offset"}
                  </option>
                </Select>
              </label>
              <label>
                <span>
                  {locale === "ru" ? "Назначение / референс" : "Reference"}
                </span>
                <Input
                  name="reference"
                  onChange={handleFieldChange(setBillingPaymentForm)}
                  value={billingPaymentForm.reference}
                />
              </label>
              <Button
                variant="primary"
                className="primary-button"
                disabled={busyAction === "billing-payment" || remaining <= 0}
                type="submit"
              >
                {locale === "ru" ? "Провести оплату" : "Post payment"}
              </Button>
              <Button
                variant="secondary"
                className="secondary-button"
                onClick={() =>
                  void downloadBillingInvoice(selectedBillingInvoice)
                }
                type="button"
              >
                {locale === "ru"
                  ? "Скачать счет XLSX"
                  : "Download invoice XLSX"}
              </Button>
              <Button
                variant="secondary"
                className="secondary-button"
                onClick={() =>
                  void downloadBillingClosingPack(selectedBillingInvoice)
                }
                type="button"
              >
                {locale === "ru" ? "Закрывающие XLSX" : "Closing pack XLSX"}
              </Button>
              {selectedBillingLease ? (
                <Button
                  variant="secondary"
                  className="secondary-button"
                  onClick={() => void loadLeaseDocuments(selectedBillingLease)}
                  type="button"
                >
                  {locale === "ru" ? "Документы договора" : "Lease documents"}
                </Button>
              ) : null}
            </form>
          ) : (
            <div className="empty-state">
              {locale === "ru"
                ? "Счета пока не найдены."
                : "No invoices found."}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
