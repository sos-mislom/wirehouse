import { type FormEvent } from "react";
import { apiRequest } from "../../api/client";
import { arrayBufferToBase64 } from "../../shared/format";
import {
  type TenantDetail,
  type TenantNote,
  type TenantNoteAttachment,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useFilesActions } from "./files";
export function useTenantNotesActions(
  deps: Pick<
    WorkspaceBase,
    | "session"
    | "tenantDetail"
    | "canManagePortfolio"
    | "setBusyAction"
    | "setError"
    | "tenantNoteForm"
    | "tenantNoteFile"
    | "setTenantDetail"
    | "setTenantNoteForm"
    | "setTenantNoteFile"
    | "setExpandedTenantNoteIds"
    | "setNotice"
    | "locale"
    | "t"
  > &
    Pick<ReturnType<typeof useFilesActions>, "openAuthenticatedFile">,
) {
  const {
    session,
    tenantDetail,
    canManagePortfolio,
    setBusyAction,
    setError,
    tenantNoteForm,
    tenantNoteFile,
    setTenantDetail,
    setTenantNoteForm,
    setTenantNoteFile,
    setExpandedTenantNoteIds,
    setNotice,
    locale,
    openAuthenticatedFile,
    t,
  } = deps;
  const handleTenantNoteSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !tenantDetail || !canManagePortfolio) {
      return;
    }

    setBusyAction("tenant-note");
    setError("");

    try {
      const createdNote = await apiRequest<{ item: TenantNote }>(
        `/api/tenants/${tenantDetail.tenant.id}/notes`,
        {
          method: "POST",
          token: session.token,
          body: {
            title: tenantNoteForm.title,
            content: tenantNoteForm.content,
          },
        },
      );

      if (tenantNoteFile) {
        const buffer = await tenantNoteFile.arrayBuffer();
        await apiRequest(
          `/api/tenant-notes/${createdNote.item.id}/attachments`,
          {
            method: "POST",
            token: session.token,
            body: {
              fileName: tenantNoteFile.name,
              mimeType: tenantNoteFile.type || "application/octet-stream",
              contentBase64: arrayBufferToBase64(buffer),
            },
          },
        );
      }

      const refreshedTenant = await apiRequest<TenantDetail>(
        `/api/tenants/${tenantDetail.tenant.id}/detail`,
        {
          token: session.token,
        },
      );
      setTenantDetail(refreshedTenant);
      setTenantNoteForm({
        title: "",
        content: "",
      });
      setTenantNoteFile(null);
      setExpandedTenantNoteIds((current) => ({
        ...current,
        [createdNote.item.id]: true,
      }));
      setNotice(
        locale === "ru"
          ? "Запись переговоров сохранена"
          : "Negotiation note saved",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Tenant note failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const refreshTenantDetailById = async (tenantId: string) => {
    if (!session) {
      return;
    }

    const refreshedTenant = await apiRequest<TenantDetail>(
      `/api/tenants/${tenantId}/detail`,
      {
        token: session.token,
      },
    );
    setTenantDetail(refreshedTenant);
  };

  const toggleTenantNoteExpanded = (noteId: string) => {
    setExpandedTenantNoteIds((current) => ({
      ...current,
      [noteId]: !current[noteId],
    }));
  };

  const uploadTenantNoteAttachment = async (
    noteId: string,
    file: File | null,
  ) => {
    if (!session || !tenantDetail || !file) {
      return;
    }

    setBusyAction(`tenant-note-attachment-${noteId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      await apiRequest(`/api/tenant-notes/${noteId}/attachments`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer),
        },
      });
      await refreshTenantDetailById(tenantDetail.tenant.id);
      setExpandedTenantNoteIds((current) => ({
        ...current,
        [noteId]: true,
      }));
      setNotice(locale === "ru" ? "Файл прикреплён" : "File attached");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Tenant note attachment failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const openTenantNoteAttachment = (
    noteId: string,
    attachment: TenantNoteAttachment,
  ) =>
    openAuthenticatedFile(
      `/api/tenant-notes/${noteId}/attachments/${attachment.id}`,
    );

  const deleteTenantNoteAttachment = async (
    noteId: string,
    attachmentId: string,
  ) => {
    if (!session || !tenantDetail) {
      return;
    }

    setBusyAction(`tenant-note-attachment-delete-${attachmentId}`);
    setError("");

    try {
      await apiRequest(
        `/api/tenant-notes/${noteId}/attachments/${attachmentId}`,
        {
          method: "DELETE",
          token: session.token,
        },
      );
      await refreshTenantDetailById(tenantDetail.tenant.id);
      setExpandedTenantNoteIds((current) => ({
        ...current,
        [noteId]: true,
      }));
      setNotice(t.messages.deleted);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Tenant note attachment delete failed",
      );
    } finally {
      setBusyAction("");
    }
  };
  return {
    handleTenantNoteSubmit,
    refreshTenantDetailById,
    toggleTenantNoteExpanded,
    uploadTenantNoteAttachment,
    openTenantNoteAttachment,
    deleteTenantNoteAttachment,
  };
}
