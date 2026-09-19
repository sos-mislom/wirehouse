import { apiRequest, runtimeApiBase } from "../../api/client";
import { arrayBufferToBase64 } from "../../shared/format";
import { type Lease, type LeaseDocument } from "../../shared/types";
import type { WorkspaceBase } from "../types";
export function useDocumentsActions(
  deps: Pick<
    WorkspaceBase,
    | "session"
    | "setBusyAction"
    | "setError"
    | "setDocumentPanelLease"
    | "setLeaseDocuments"
    | "documentPanelLease"
    | "overview"
    | "setNotice"
    | "locale"
    | "t"
  >,
) {
  const {
    session,
    setBusyAction,
    setError,
    setDocumentPanelLease,
    setLeaseDocuments,
    documentPanelLease,
    overview,
    setNotice,
    locale,
    t,
  } = deps;
  const openLeaseDocument = async (leaseId: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-document-${leaseId}`);
    setError("");

    try {
      const response = await fetch(
        `${runtimeApiBase}/api/leases/${leaseId}/document`,
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      if (
        /^(application\/pdf|image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+|video\/[\w.+-]+)$/.test(
          blob.type,
        )
      ) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const link = document.createElement("a");
        link.href = url;
        const encoded = response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1];
        try {
          link.download = encoded ? decodeURIComponent(encoded) : "document";
        } catch {
          link.download = "document";
        }
        link.click();
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Document open failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const loadLeaseDocuments = async (lease: Lease) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-documents-${lease.id}`);
    setError("");

    try {
      const result = await apiRequest<{ items: LeaseDocument[] }>(
        `/api/leases/${lease.id}/documents`,
        {
          token: session.token,
        },
      );
      setDocumentPanelLease(lease);
      setLeaseDocuments(result.items);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Documents load failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleLeaseDocumentUpload = async (
    leaseId: string,
    file: File | null,
  ) => {
    if (!session || !file) {
      return;
    }

    setBusyAction(`lease-document-upload-${leaseId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      await apiRequest(`/api/leases/${leaseId}/documents`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer),
        },
      });
      const lease =
        documentPanelLease ??
        overview?.leases.find((item) => item.id === leaseId);
      if (lease) {
        await loadLeaseDocuments(lease);
      }
      setNotice(locale === "ru" ? "Документ загружен" : "Document uploaded");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Document upload failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const deleteLeaseDocument = async (leaseId: string, documentId: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-document-delete-${documentId}`);
    setError("");

    try {
      await apiRequest(`/api/leases/${leaseId}/documents/${documentId}`, {
        method: "DELETE",
        token: session.token,
      });
      const lease =
        documentPanelLease ??
        overview?.leases.find((item) => item.id === leaseId);
      if (lease) {
        await loadLeaseDocuments(lease);
      }
      setNotice(t.messages.deleted);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Document delete failed",
      );
    } finally {
      setBusyAction("");
    }
  };
  return {
    openLeaseDocument,
    loadLeaseDocuments,
    handleLeaseDocumentUpload,
    deleteLeaseDocument,
  };
}
