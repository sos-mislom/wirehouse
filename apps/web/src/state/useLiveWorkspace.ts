import { useEffect, useRef } from "react";
import {
  useLiveBatch,
  useLiveQuery,
  useQueryClient,
  useRealtimeSession,
} from "../realtime/RealtimeContext";
import type { WorkspaceModel } from "./useWorkspaceModel";
import type { OperationsData } from "../features/operations/shared";
import type {
  Overview,
  Ticket,
  SessionUser,
  TicketComment,
  TicketAttachment,
  TicketHistoryEvent,
  TenantDetail,
  ChecklistTemplate,
  BillingInvoice,
  BillingReconciliation,
  ImportBatch,
  ImportApproval,
  SystemReadiness,
  ChatMessage,
} from "../shared/types";

function useResult<T>(
  token: string | undefined,
  path: string,
  enabled: boolean,
  onData: (data: T) => void,
  onError: (error: string) => void,
) {
  const query = useLiveQuery<T | null>(token, path, null, { enabled });
  const callbacks = useRef({ onData, onError });
  callbacks.current = { onData, onError };
  useEffect(() => {
    if (query.data !== null) callbacks.current.onData(query.data);
  }, [query.data]);
  useEffect(() => {
    if (query.error) callbacks.current.onError(query.error);
  }, [query.error]);
  return query;
}
export function useLiveWorkspace(m: WorkspaceModel) {
  const token = m.session?.token,
    client = useQueryClient();
  useRealtimeSession(token, m.handleLogout);
  useResult<{ user: SessionUser }>(
    token,
    "/api/auth/me",
    true,
    ({ user }) => {
      m.setSession((session) =>
        session && JSON.stringify(session.user) !== JSON.stringify(user)
          ? { ...session, user }
          : session,
      );
    },
    m.setError,
  );
  useResult<Overview>(
    token,
    "/api/dashboard/overview",
    true,
    m.setOverview,
    m.setError,
  );
  useResult<{ items: Ticket[] }>(
    token,
    "/api/tickets",
    true,
    (v) => m.setTickets(v.items),
    m.setError,
  );
  useResult<OperationsData>(
    token,
    "/api/operations",
    true,
    m.setOperations,
    m.setError,
  );
  const threadOpen = m.isManagerShell
    ? m.managerScreen === "ticket-detail"
    : ["service", "chat"].includes(m.activeWorkspaceSection);
  useEffect(() => {
    m.setTicketComments([]);
    m.setTicketAttachments([]);
    m.setTicketHistory([]);
  }, [m.selectedTicketId]);
  useResult<{ items: TicketComment[] }>(
    token,
    `/api/tickets/${m.selectedTicketId}/comments`,
    !!m.selectedTicketId && threadOpen,
    (v) => m.setTicketComments(v.items),
    m.setError,
  );
  useResult<{ items: TicketAttachment[] }>(
    token,
    `/api/tickets/${m.selectedTicketId}/attachments`,
    !!m.selectedTicketId && threadOpen,
    (v) => m.setTicketAttachments(v.items),
    m.setError,
  );
  useResult<{ items: TicketHistoryEvent[] }>(
    token,
    `/api/tickets/${m.selectedTicketId}/history`,
    !!m.selectedTicketId && threadOpen,
    (v) => m.setTicketHistory(v.items),
    m.setError,
  );
  useEffect(() => m.setTenantDetail(null), [m.selectedTenantId]);
  const tenant = useResult<TenantDetail>(
    token,
    `/api/tenants/${m.selectedTenantId}/detail`,
    !!m.selectedTenantId &&
      !!m.overview?.tenants.length &&
      (m.isManagerShell
        ? m.managerScreen === "tenant-detail"
        : m.activeWorkspaceSection === "portfolio"),
    m.setTenantDetail,
    m.setError,
  );
  useEffect(
    () => m.setTenantDetailBusy(tenant.loading && !tenant.data),
    [tenant.loading, tenant.data],
  );
  useEffect(() => {
    if (!m.selectedTicketId) {
      m.setTicketComments([]);
      m.setTicketAttachments([]);
      m.setTicketHistory([]);
    }
    if (!m.selectedTenantId) m.setTenantDetail(null);
  }, [m.selectedTicketId, m.selectedTenantId]);
  useResult<{ items: ChecklistTemplate[] }>(
    token,
    "/api/checklist-templates",
    !!m.session && ["admin", "manager", "worker"].includes(m.session.user.role),
    (v) => m.setChecklistTemplates(v.items),
    m.setError,
  );
  const billing = m.isManagerShell && m.managerScreen === "billing";
  useResult<{ items: BillingInvoice[] }>(
    token,
    "/api/billing/invoices",
    billing,
    (v) => {
      m.setBillingInvoices(v.items);
      m.setSelectedBillingInvoiceId((current) =>
        v.items.some((i) => i.id === current)
          ? current
          : (v.items[0]?.id ?? ""),
      );
    },
    m.setError,
  );
  useResult<BillingReconciliation>(
    token,
    "/api/billing/reconciliation",
    billing,
    m.setBillingReconciliation,
    m.setError,
  );
  useResult<{ items: ImportBatch[] }>(
    token,
    "/api/import-batches",
    m.isManagerShell && m.managerScreen === "import",
    (v) => m.setImportBatches(v.items),
    m.setError,
  );
  useResult<{ items: ImportApproval[] }>(
    token,
    "/api/import-approvals",
    m.isManagerShell && m.managerScreen === "import",
    (v) => m.setImportApprovals(v.items),
    m.setError,
  );
  useResult<SystemReadiness>(
    token,
    "/api/system/readiness",
    m.isManagerShell && m.managerScreen === "import",
    m.setSystemReadiness,
    m.setError,
  );
  const chatEnabled =
    (m.isManagerShell
      ? m.managerScreen === "chat"
      : m.isTenant && m.activeWorkspaceSection === "chat") &&
    !!m.selectedChatTenantId;
  const paths = chatEnabled
    ? m.selectedChatTickets.map((t) => `/api/tickets/${t.id}/comments`)
    : [];
  const revision = useLiveBatch(token, paths),
    pathsKey = JSON.stringify(paths);
  useEffect(() => {
    if (!token || !paths.length) {
      m.setChatMessages([]);
      m.setChatBusy(false);
      return;
    }
    const snapshots = paths.map((path) =>
      client.snapshot<{ items: TicketComment[] }>(token, path),
    );
    m.setChatBusy(snapshots.some((s) => !s.data && s.loading));
    if (snapshots.some((s) => !s.data)) return;
    const messages: ChatMessage[] = snapshots.flatMap((snapshot, i) =>
      snapshot.data!.items.map((comment) => ({
        id: comment.id,
        ticketId: m.selectedChatTickets[i].id,
        ticketNumber: m.selectedChatTickets[i].number,
        authorName: comment.authorName ?? "—",
        authorRole: comment.authorRole,
        sourceChannel: comment.sourceChannel,
        content: comment.content,
        createdAt: comment.createdAt,
        direction: m.isTenant
          ? comment.authorRole === "tenant"
            ? "outgoing"
            : "incoming"
          : comment.authorRole === "tenant"
            ? "incoming"
            : "outgoing",
      })),
    );
    m.setChatMessages(
      messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    );
  }, [token, pathsKey, revision, m.isTenant]);
}
