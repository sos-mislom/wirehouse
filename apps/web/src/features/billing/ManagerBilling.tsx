import { useState } from "react";
import { AccountingWorkspace } from "../business/AccountingWorkspace";
import { Register } from "../business/shared";
import { BillingForecast } from "./BillingForecast";
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
  const [ledgerView, setLedgerView] = useState("invoices");
  const [invoiceState, setInvoiceState] = useState("");
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
    <section className="mvp-page billing-page">
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

      <div className="business-tabs" aria-label="Платежи: представление">
        <Button
          aria-pressed={ledgerView === "invoices"}
          onClick={() => setLedgerView("invoices")}
        >
          Счета
        </Button>
        <Button
          aria-pressed={ledgerView === "accounts"}
          onClick={() => setLedgerView("accounts")}
        >
          Лицевые счета
        </Button>
      </div>
      {ledgerView === "accounts" ? (
        <AccountingWorkspace />
      ) : (
        <>
          <div className="mvp-metrics">
            <article className="mvp-metric">
              <span>{locale === "ru" ? "Начислено" : "Billed"}</span>
              <strong>
                {formatCompactMoney(billingTotals.billed, locale)}
              </strong>
              <small>
                {billingInvoices.length}{" "}
                {locale === "ru" ? "счетов" : "invoices"}
              </small>
            </article>
            <article className="mvp-metric">
              <span>{locale === "ru" ? "Оплачено" : "Paid"}</span>
              <strong>{formatCompactMoney(billingTotals.paid, locale)}</strong>
              <small>
                {billingTotals.billed > 0
                  ? Math.round(
                      (billingTotals.paid / billingTotals.billed) * 100,
                    )
                  : 0}
                %
              </small>
            </article>
            <article className="mvp-metric">
              <span>{ui.arrears}</span>
              <strong>
                {formatCompactMoney(billingTotals.overdue, locale)}
              </strong>
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
                          {ticket.tenantName ?? "—"} ·{" "}
                          {ticket.propertyName ?? "—"} ·{" "}
                          {ticket.unitNumber ?? "—"}
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
                              linkedInvoice.totalAmount -
                                linkedInvoice.paidAmount,
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
                            {locale === "ru"
                              ? "Принять оплату"
                              : "Post payment"}
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
            <details className="work-disclosure billing-reconciliation">
              <summary>
                Сверка оплат ·{" "}
                {billingReconciliation.summary.issues > 0
                  ? `${billingReconciliation.summary.issues} расхождений`
                  : "Все счета сходятся"}
              </summary>
              <div className="work-disclosure-body">
                <div className="mvp-metrics mvp-metrics--compact">
                  <article className="mvp-metric">
                    <span>
                      {locale === "ru" ? "Собираемость" : "Collection"}
                    </span>
                    <strong>
                      {billingReconciliation.summary.collectionRate}%
                    </strong>
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
              </div>
            </details>
          ) : null}

          <div className="mvp-grid billing-grid">
            <article className="mvp-card mvp-card--wide">
              <div className="mvp-card-head">
                <div>
                  <h3>
                    {locale === "ru" ? "Счета арендаторов" : "Tenant invoices"}
                  </h3>
                </div>
              </div>
              <Register
                title="Реестр счетов"
                rows={billingInvoices.filter(
                  (i) =>
                    !invoiceState ||
                    (invoiceState === "overdue"
                      ? ["overdue", "late"].includes(i.status)
                      : i.status === invoiceState),
                )}
                selectedId={selectedBillingInvoiceId}
                onSelect={(i) => setSelectedBillingInvoiceId(i.id)}
                searchText={(i) =>
                  `${i.period} ${i.tenantName} ${i.contractNumber}`
                }
                columns={[
                  { key: "period", label: "Период", render: (i) => i.period },
                  {
                    key: "tenant",
                    label: "Арендатор",
                    render: (i) => i.tenantName ?? "—",
                  },
                  {
                    key: "lease",
                    label: "Договор",
                    render: (i) => i.contractNumber ?? "—",
                    optional: true,
                  },
                  {
                    key: "amount",
                    label: "Сумма",
                    render: (i) => formatMoney(i.totalAmount, locale),
                  },
                  {
                    key: "paid",
                    label: "Оплачено",
                    render: (i) => formatMoney(i.paidAmount, locale),
                    optional: true,
                  },
                  {
                    key: "date",
                    label: "Срок",
                    render: (i) => formatDate(i.dueDate, locale),
                    optional: true,
                  },
                  {
                    key: "status",
                    label: "Статус",
                    render: (i) =>
                      ui.paymentStatus[
                        i.status as keyof typeof ui.paymentStatus
                      ],
                  },
                ]}
                filters={
                  <label>
                    Оплата
                    <Select
                      value={invoiceState}
                      onChange={(e) => setInvoiceState(e.target.value)}
                    >
                      <option value="">Все счета</option>
                      <option value="paid">Оплачены</option>
                      <option value="partial">Частично оплачены</option>
                      <option value="overdue">Просрочены</option>
                      <option value="upcoming">Ожидают оплаты</option>
                    </Select>
                  </label>
                }
              />
            </article>

            <article className="mvp-card">
              <div className="mvp-card-head">
                <div>
                  <h3>{locale === "ru" ? "Принять платеж" : "Post payment"}</h3>
                </div>
              </div>
              {selectedBillingInvoice ? (
                <form
                  className="mvp-form"
                  onSubmit={handleBillingPaymentSubmit}
                >
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
                        {locale === "ru"
                          ? "Безналичный перевод"
                          : "Bank transfer"}
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
                    disabled={
                      busyAction === "billing-payment" || remaining <= 0
                    }
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
                      onClick={() =>
                        void loadLeaseDocuments(selectedBillingLease)
                      }
                      type="button"
                    >
                      {locale === "ru"
                        ? "Документы договора"
                        : "Lease documents"}
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
          <BillingForecast />
        </>
      )}
    </section>
  );
}
