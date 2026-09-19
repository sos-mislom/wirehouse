import { startTransition } from "react";
import { apiRequest } from "../../api/client";
import { TOKEN_KEY } from "../../shared/navigation";
import {
  type BillingInvoice,
  type BillingReconciliation,
  type ImportApproval,
  type ImportBatch,
  type Overview,
  type SessionUser,
  type SystemReadiness,
  type Ticket,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
export function useDataActions(
  deps: Pick<
    WorkspaceBase,
    | "setOverview"
    | "setTickets"
    | "setSelectedTicketId"
    | "setBootstrapping"
    | "setError"
    | "setSession"
    | "setTicketComments"
    | "setTenantDetail"
    | "session"
    | "setImportBatches"
    | "setImportApprovals"
    | "setSystemReadiness"
    | "setBillingInvoices"
    | "setBillingReconciliation"
    | "setSelectedBillingInvoiceId"
  >,
) {
  const {
    setOverview,
    setTickets,
    setSelectedTicketId,
    setBootstrapping,
    setError,
    setSession,
    setTicketComments,
    setTenantDetail,
    session,
    setImportBatches,
    setImportApprovals,
    setSystemReadiness,
    setBillingInvoices,
    setBillingReconciliation,
    setSelectedBillingInvoiceId,
  } = deps;
  const applyWorkspaceData = (
    nextOverview: Overview,
    nextTickets: Ticket[],
    preferredTicketId?: string,
  ) => {
    startTransition(() => {
      setOverview(nextOverview);
      setTickets(nextTickets);
      setSelectedTicketId((current) => {
        const candidate = preferredTicketId ?? current;
        if (nextTickets.some((ticket) => ticket.id === candidate)) {
          return candidate;
        }

        return (
          nextTickets.find(
            (ticket) => !["billing", "lease"].includes(ticket.category),
          )?.id ?? ""
        );
      });
    });
  };

  const fetchWorkspaceData = async (token: string) => {
    const [me, nextOverview, nextTickets] = await Promise.all([
      apiRequest<{ user: SessionUser }>("/api/auth/me", { token }),
      apiRequest<Overview>("/api/dashboard/overview", { token }),
      apiRequest<{ items: Ticket[] }>("/api/tickets", { token }),
    ]);

    return {
      me,
      nextOverview,
      nextTickets: nextTickets.items,
    };
  };

  const hydrateSession = async (
    token: string,
    options: { silentAuthFailure?: boolean } = {},
  ) => {
    setBootstrapping(true);
    setError("");

    try {
      const { me, nextOverview, nextTickets } = await fetchWorkspaceData(token);
      window.localStorage.setItem(TOKEN_KEY, token);
      setSession({
        token,
        user: me.user,
      });
      applyWorkspaceData(nextOverview, nextTickets);
    } catch (caughtError) {
      window.localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setOverview(null);
      setTickets([]);
      setTicketComments([]);
      setTenantDetail(null);
      setError(
        options.silentAuthFailure
          ? ""
          : caughtError instanceof Error
            ? caughtError.message
            : "Auth failed",
      );
    } finally {
      setBootstrapping(false);
    }
  };

  const refreshWorkspace = async (preferredTicketId?: string) => {
    if (!session) {
      return;
    }

    const [{ nextOverview }, { items }] = await Promise.all([
      apiRequest<Overview>("/api/dashboard/overview", {
        token: session.token,
      }).then((payload) => ({ nextOverview: payload })),
      apiRequest<{ items: Ticket[] }>("/api/tickets", {
        token: session.token,
      }),
    ]);

    applyWorkspaceData(nextOverview, items, preferredTicketId);
  };

  const loadImportBatches = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setImportBatches([]);
      return;
    }

    const result = await apiRequest<{ items: ImportBatch[] }>(
      "/api/import-batches",
      {
        token: session.token,
      },
    );
    setImportBatches(result.items);
  };

  const loadImportApprovals = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setImportApprovals([]);
      return;
    }

    const result = await apiRequest<{ items: ImportApproval[] }>(
      "/api/import-approvals",
      {
        token: session.token,
      },
    );
    setImportApprovals(result.items);
  };

  const loadSystemReadiness = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setSystemReadiness(null);
      return;
    }

    const result = await apiRequest<SystemReadiness>("/api/system/readiness", {
      token: session.token,
    });
    setSystemReadiness(result);
  };

  const loadBillingInvoices = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setBillingInvoices([]);
      setBillingReconciliation(null);
      return;
    }

    const [result, reconciliation] = await Promise.all([
      apiRequest<{ items: BillingInvoice[] }>("/api/billing/invoices", {
        token: session.token,
      }),
      apiRequest<BillingReconciliation>("/api/billing/reconciliation", {
        token: session.token,
      }),
    ]);
    setBillingInvoices(result.items);
    setBillingReconciliation(reconciliation);
    setSelectedBillingInvoiceId((current) =>
      result.items.some((invoice) => invoice.id === current)
        ? current
        : (result.items[0]?.id ?? ""),
    );
  };
  return {
    applyWorkspaceData,
    fetchWorkspaceData,
    hydrateSession,
    refreshWorkspace,
    loadImportBatches,
    loadImportApprovals,
    loadSystemReadiness,
    loadBillingInvoices,
  };
}
