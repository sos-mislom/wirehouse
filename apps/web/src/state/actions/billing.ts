import { type FormEvent } from "react";
import { apiRequest } from "../../api/client";
import { type TenantDetail } from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
export function useBillingActions(
  deps: Pick<
    WorkspaceBase,
    | "session"
    | "selectedBillingInvoice"
    | "setBusyAction"
    | "setError"
    | "pendingPaymentProofTickets"
    | "billingPaymentForm"
    | "setBillingPaymentForm"
    | "setNotice"
    | "locale"
    | "tenantDetail"
    | "meterReadingForm"
    | "setTenantDetail"
    | "setMeterReadingForm"
  > &
    Pick<
      ReturnType<typeof useDataActions>,
      "loadBillingInvoices" | "refreshWorkspace"
    >,
) {
  const {
    session,
    selectedBillingInvoice,
    setBusyAction,
    setError,
    pendingPaymentProofTickets,
    billingPaymentForm,
    setBillingPaymentForm,
    loadBillingInvoices,
    refreshWorkspace,
    setNotice,
    locale,
    tenantDetail,
    meterReadingForm,
    setTenantDetail,
    setMeterReadingForm,
  } = deps;
  const handleBillingPaymentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedBillingInvoice) {
      return;
    }

    setBusyAction("billing-payment");
    setError("");

    try {
      const relatedProofTicket = pendingPaymentProofTickets.find(
        (ticket) => ticket.number === billingPaymentForm.reference,
      );
      await apiRequest(
        `/api/billing/invoices/${selectedBillingInvoice.id}/payments`,
        {
          method: "POST",
          token: session.token,
          body: {
            amount: Number(billingPaymentForm.amount),
            paidAt: billingPaymentForm.paidAt,
            method: billingPaymentForm.method,
            reference: billingPaymentForm.reference || undefined,
          },
        },
      );
      if (relatedProofTicket) {
        await apiRequest(`/api/tickets/${relatedProofTicket.id}`, {
          method: "PUT",
          token: session.token,
          body: {
            status: "completed",
          },
        });
      }
      setBillingPaymentForm({
        amount: "",
        paidAt: new Date().toISOString().slice(0, 10),
        method: "bank_transfer",
        reference: "",
      });
      await Promise.all([loadBillingInvoices(), refreshWorkspace()]);
      setNotice(locale === "ru" ? "Оплата проведена" : "Payment posted");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Payment failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleMeterReadingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !tenantDetail) {
      return;
    }

    setBusyAction("meter-reading");
    setError("");

    try {
      await apiRequest("/api/meter-readings", {
        method: "POST",
        token: session.token,
        body: {
          tenantId: tenantDetail.tenant.id,
          unitId: meterReadingForm.unitId,
          period: meterReadingForm.period,
          meterType: meterReadingForm.meterType,
          value: Number(meterReadingForm.value),
          previousValue:
            meterReadingForm.previousValue === ""
              ? undefined
              : Number(meterReadingForm.previousValue),
          tariffRate:
            meterReadingForm.tariffRate === ""
              ? undefined
              : Number(meterReadingForm.tariffRate),
        },
      });

      const refreshedTenant = await apiRequest<TenantDetail>(
        `/api/tenants/${tenantDetail.tenant.id}/detail`,
        {
          token: session.token,
        },
      );
      setTenantDetail(refreshedTenant);
      setMeterReadingForm((current) => ({
        ...current,
        value: "",
        previousValue: "",
        tariffRate: "",
      }));
      await Promise.all([loadBillingInvoices(), refreshWorkspace()]);
      setNotice(
        locale === "ru"
          ? "Показание сохранено, переменная часть счета пересчитана"
          : "Reading saved and invoice variable charge recalculated",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Meter reading failed",
      );
    } finally {
      setBusyAction("");
    }
  };
  return { handleBillingPaymentSubmit, handleMeterReadingSubmit };
}
