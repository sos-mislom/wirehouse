import { startTransition, type FormEvent } from "react";
import {
  isOpenTicket,
  MAX_ATTACHMENT_BYTES,
} from "../../../../../packages/contracts/src/domain";
import { apiRequest } from "../../api/client";
import { arrayBufferToBase64, formatDeliveryNotice } from "../../shared/format";
import {
  type CommentDelivery,
  type Ticket,
  type TicketAttachment,
  type TicketChecklistItem,
  type TicketComment,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
import type { useFilesActions } from "./files";
export function useTicketsActions(
  deps: Pick<
    WorkspaceBase,
    | "session"
    | "overview"
    | "setBusyAction"
    | "setError"
    | "ticketForm"
    | "setTicketForm"
    | "setNotice"
    | "t"
    | "isManagerShell"
    | "setManagerScreen"
    | "setSelectedSection"
    | "isTenant"
    | "paymentProofForm"
    | "locale"
    | "paymentProofFile"
    | "setPaymentProofForm"
    | "setPaymentProofFile"
    | "selectedTicket"
    | "ticketStatusDraft"
    | "ticketAssigneeDraft"
    | "canAssignTickets"
    | "canUpdateTickets"
    | "commentForm"
    | "setCommentForm"
    | "setTicketComments"
    | "setTicketAttachments"
    | "documentUploadCategory"
    | "selectedChatTargetTicket"
    | "chatDraft"
    | "managerUi"
    | "setChatDraft"
    | "tickets"
    | "busyAction"
  > &
    Pick<ReturnType<typeof useDataActions>, "refreshWorkspace"> &
    Pick<ReturnType<typeof useFilesActions>, "openAuthenticatedFile">,
) {
  const {
    session,
    overview,
    setBusyAction,
    setError,
    ticketForm,
    setTicketForm,
    setNotice,
    t,
    isManagerShell,
    setManagerScreen,
    setSelectedSection,
    refreshWorkspace,
    isTenant,
    paymentProofForm,
    locale,
    paymentProofFile,
    setPaymentProofForm,
    setPaymentProofFile,
    selectedTicket,
    ticketStatusDraft,
    ticketAssigneeDraft,
    canAssignTickets,
    canUpdateTickets,
    commentForm,
    setCommentForm,
    setTicketComments,
    setTicketAttachments,
    documentUploadCategory,
    openAuthenticatedFile,
    selectedChatTargetTicket,
    chatDraft,
    managerUi,
    setChatDraft,
    tickets,
    busyAction,
  } = deps;
  const handleCreateTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !overview) {
      return;
    }

    setBusyAction("ticket-create");
    setError("");

    const relatedLease = overview.leases.find(
      (lease) =>
        lease.unitId === ticketForm.unitId && lease.stage !== "terminated",
    );

    try {
      const result = await apiRequest<{ item: Ticket }>("/api/tickets", {
        method: "POST",
        token: session.token,
        body: {
          ...ticketForm,
          tenantId:
            session.user.role === "tenant"
              ? session.user.tenantId
              : (relatedLease?.tenantId ?? null),
        },
      });
      setTicketForm((current) => ({
        ...current,
        title: "",
        description: "",
        category: "maintenance",
        priority: "medium",
      }));
      setNotice(t.messages.ticketCreated);
      if (isManagerShell) {
        setManagerScreen("ticket-detail");
      } else {
        setSelectedSection("service");
      }
      await refreshWorkspace(result.item.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ticket create failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handlePaymentProofSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !overview || !isTenant) {
      return;
    }

    const lease =
      overview.leases.find((item) => item.id === paymentProofForm.leaseId) ??
      overview.leases[0];
    if (!lease) {
      setError(locale === "ru" ? "Договор не найден" : "Lease not found");
      return;
    }

    setBusyAction("payment-proof");
    setError("");

    try {
      const result = await apiRequest<{ item: Ticket }>("/api/tickets", {
        method: "POST",
        token: session.token,
        body: {
          unitId: lease.unitId,
          category: "billing",
          priority: "medium",
          title:
            locale === "ru"
              ? `Подтверждение оплаты ${lease.contractNumber}`
              : `Payment proof ${lease.contractNumber}`,
          description:
            `${locale === "ru" ? "Арендатор отправил оплату на проверку." : "Tenant submitted payment for review."}\n` +
            `${locale === "ru" ? "Договор" : "Contract"}: ${lease.contractNumber}\n` +
            `${locale === "ru" ? "Сумма" : "Amount"}: ${paymentProofForm.amount || "—"}\n` +
            `${locale === "ru" ? "Дата оплаты" : "Paid at"}: ${paymentProofForm.paidAt || "—"}\n` +
            `${locale === "ru" ? "Референс" : "Reference"}: ${paymentProofForm.reference || "—"}`,
        },
      });

      if (paymentProofFile) {
        const buffer = await paymentProofFile.arrayBuffer();
        await apiRequest(`/api/tickets/${result.item.id}/attachments`, {
          method: "POST",
          token: session.token,
          body: {
            fileName: paymentProofFile.name,
            mimeType: paymentProofFile.type || "application/octet-stream",
            contentBase64: arrayBufferToBase64(buffer),
          },
        });
      }

      setPaymentProofForm((current) => ({
        ...current,
        amount: "",
        paidAt: new Date().toISOString().slice(0, 10),
        reference: "",
      }));
      setPaymentProofFile(null);
      setNotice(
        locale === "ru"
          ? "Оплата отправлена менеджеру на проверку"
          : "Payment proof sent for manager review",
      );
      await refreshWorkspace();
      setSelectedSection("leases");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Payment proof failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const updateSelectedTicket = async (
    draft: { status?: string; assignedTo?: string | null } = {},
  ) => {
    if (!session || !selectedTicket) {
      return;
    }

    const nextStatus = draft.status ?? ticketStatusDraft;
    const nextAssignee =
      draft.assignedTo !== undefined
        ? draft.assignedTo
        : ticketAssigneeDraft || null;

    setBusyAction("ticket-update");
    setError("");

    try {
      const reopening =
        ["resolved", "closed"].includes(selectedTicket.status) &&
        !["resolved", "closed", "rejected"].includes(nextStatus);
      const reopenReason = reopening
        ? window.prompt(
            locale === "ru" ? "Причина переоткрытия заявки" : "Reopen reason",
          )
        : "";
      if (reopening && !reopenReason?.trim()) {
        setError(
          locale === "ru"
            ? "Нужна причина переоткрытия"
            : "Reopen reason is required",
        );
        setBusyAction("");
        return;
      }

      await apiRequest(`/api/tickets/${selectedTicket.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          status: nextStatus,
          reopenReason,
          ...(canAssignTickets ? { assignedTo: nextAssignee } : {}),
        },
      });
      setNotice(t.messages.statusUpdated);
      await refreshWorkspace(selectedTicket.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ticket update failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleCancelTicket = async (ticket: Ticket) => {
    if (!session || !isTenant) {
      return;
    }

    setBusyAction(`ticket-cancel-${ticket.id}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticket.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          status: "rejected",
        },
      });
      setNotice(locale === "ru" ? "Заявка отменена" : "Ticket cancelled");
      await refreshWorkspace(ticket.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ticket cancel failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const toggleChecklistItem = async (
    ticketId: string,
    item: TicketChecklistItem,
  ) => {
    if (!session || !canUpdateTickets) {
      return;
    }

    setBusyAction(`ticket-checklist-${item.id}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticketId}/checklist/${item.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          completed: !item.completed,
        },
      });
      await refreshWorkspace(ticketId);
      setNotice(locale === "ru" ? "Чек-лист обновлен" : "Checklist updated");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Checklist update failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleCommentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedTicket) {
      return;
    }

    setBusyAction("ticket-comment");
    setError("");

    try {
      const result = await apiRequest<{
        item: TicketComment;
        delivery?: CommentDelivery;
      }>(`/api/tickets/${selectedTicket.id}/comments`, {
        method: "POST",
        token: session.token,
        body: commentForm,
      });
      setCommentForm({
        content: "",
      });
      setNotice(
        formatDeliveryNotice(t.messages.commentAdded, result.delivery, locale),
      );
      await refreshWorkspace(selectedTicket.id);
      const refreshedComments = await apiRequest<{ items: TicketComment[] }>(
        `/api/tickets/${selectedTicket.id}/comments`,
        {
          token: session.token,
        },
      );
      startTransition(() => {
        setTicketComments(refreshedComments.items);
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Comment create failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const reloadTicketAttachments = async (ticketId: string) => {
    if (!session) {
      return;
    }

    const result = await apiRequest<{ items: TicketAttachment[] }>(
      `/api/tickets/${ticketId}/attachments`,
      {
        token: session.token,
      },
    );
    setTicketAttachments(result.items);
  };

  const handleTicketAttachmentUpload = async (
    ticketId: string,
    file: File | null,
  ) => {
    if (!session || !file) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Максимальный размер файла — 100 МБ");
      return;
    }
    setBusyAction(`ticket-attachment-upload-${ticketId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      await apiRequest(`/api/tickets/${ticketId}/attachments`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          category: documentUploadCategory,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer),
        },
      });
      await reloadTicketAttachments(ticketId);
      await refreshWorkspace(ticketId);
      setNotice(locale === "ru" ? "Файл прикреплён" : "File attached");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Attachment upload failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const openTicketAttachment = (
    ticketId: string,
    attachment: TicketAttachment,
  ) =>
    openAuthenticatedFile(
      `/api/tickets/${ticketId}/attachments/${attachment.id}`,
    );

  const deleteTicketAttachment = async (
    ticketId: string,
    attachmentId: string,
  ) => {
    if (!session) {
      return;
    }

    setBusyAction(`ticket-attachment-delete-${attachmentId}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
        method: "DELETE",
        token: session.token,
      });
      await reloadTicketAttachments(ticketId);
      await refreshWorkspace(ticketId);
      setNotice(t.messages.deleted);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Attachment delete failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedChatTargetTicket || !chatDraft.content.trim()) {
      if (!selectedChatTargetTicket) {
        setError(managerUi.noThreadTarget);
      }
      return;
    }

    setBusyAction("chat-submit");
    setError("");

    try {
      const result = await apiRequest<{
        item: TicketComment;
        delivery?: CommentDelivery;
      }>(`/api/tickets/${selectedChatTargetTicket.id}/comments`, {
        method: "POST",
        token: session.token,
        body: {
          content: chatDraft.content.trim(),
        },
      });
      setChatDraft({
        content: "",
      });
      setNotice(
        formatDeliveryNotice(t.messages.commentAdded, result.delivery, locale),
      );
      await refreshWorkspace(selectedChatTargetTicket.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Chat send failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const moveBoardTicket = async (ticketId: string, status: string) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!session || !ticket || ticket.status === status || busyAction) return;
    const reopenReason =
      !isOpenTicket(ticket.status) && isOpenTicket(status)
        ? window.prompt("Причина возобновления заявки")
        : undefined;
    if (reopenReason === null || reopenReason === "") return;
    setBusyAction("kanban");
    setError("");
    try {
      await apiRequest(`/api/tickets/${ticketId}`, {
        token: session.token,
        method: "PUT",
        body: { status, reopenReason },
      });
      await refreshWorkspace();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось изменить статус",
      );
    } finally {
      setBusyAction("");
    }
  };
  return {
    handleCreateTicket,
    handlePaymentProofSubmit,
    updateSelectedTicket,
    handleCancelTicket,
    toggleChecklistItem,
    handleCommentSubmit,
    reloadTicketAttachments,
    handleTicketAttachmentUpload,
    openTicketAttachment,
    deleteTicketAttachment,
    handleChatSubmit,
    moveBoardTicket,
  };
}
