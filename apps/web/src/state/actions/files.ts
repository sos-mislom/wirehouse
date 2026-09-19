import { runtimeApiBase } from "../../api/client";
import {
  type BillingInvoice,
  type ImportBatch,
  type ImportResult,
  type LeaseDocument,
  type Unit,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
export function useFilesActions(
  deps: Pick<
    WorkspaceBase,
    "session" | "setBusyAction" | "setError" | "locale"
  >,
) {
  const { session, setBusyAction, setError, locale } = deps;
  const downloadLeaseDocument = (
    leaseId: string,
    documentItem: LeaseDocument,
  ) =>
    downloadFile(
      `/api/leases/${leaseId}/documents/${documentItem.id}`,
      documentItem.fileName,
    );

  const downloadFile = async (path: string, fallbackName: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`download-${fallbackName}`);
    setError("");

    try {
      const response = await fetch(`${runtimeApiBase}${path}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const rawFilename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
      const filename = rawFilename.includes("%")
        ? decodeURIComponent(rawFilename)
        : rawFilename;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Download failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const openAuthenticatedFile = async (path: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`open-${path}`);
    setError("");

    try {
      const response = await fetch(`${runtimeApiBase}${path}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
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
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "File open failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const downloadExport = (exportId: string) =>
    downloadFile(`/api/exports/${exportId}`, `${exportId}.xlsx`);

  const downloadImportTemplate = (templateId: string) =>
    downloadFile(
      `/api/import-templates/${templateId}`,
      `template-${templateId}.xlsx`,
    );

  const downloadUnitExport = (unit: Unit) =>
    downloadFile(`/api/units/${unit.id}/export`, `unit-${unit.number}.xlsx`);

  const downloadBillingInvoice = (invoice: BillingInvoice) =>
    downloadFile(
      `/api/billing/invoices/${invoice.id}/export`,
      `invoice-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`,
    );

  const downloadBillingClosingPack = (invoice: BillingInvoice) =>
    downloadFile(
      `/api/billing/invoices/${invoice.id}/closing-pack`,
      `closing-pack-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`,
    );

  const downloadBillingReconciliation = () =>
    downloadFile(
      "/api/billing/reconciliation/export",
      "billing-reconciliation.xlsx",
    );

  const getDocumentCategoryLabel = (category: string) => {
    const labels: Record<string, { ru: string; en: string }> = {
      lease: { ru: "Договор", en: "Lease" },
      appendix: { ru: "Приложение", en: "Appendix" },
      invoice: { ru: "Счет", en: "Invoice" },
      act: { ru: "Акт", en: "Act" },
      payment: { ru: "Платежка", en: "Payment order" },
      receipt: { ru: "Чек", en: "Receipt" },
      other: { ru: "Другое", en: "Other" },
    };
    return labels[category]?.[locale] ?? labels.other[locale];
  };

  const getFileKind = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf"].includes(extension)) {
      return "PDF";
    }
    if (["doc", "docx"].includes(extension)) {
      return "DOC";
    }
    if (["xls", "xlsx", "csv"].includes(extension)) {
      return "XLS";
    }
    if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
      return "IMG";
    }
    if (["mp4", "mov", "webm"].includes(extension)) {
      return "VID";
    }
    return "FILE";
  };

  const downloadImportReport = (result: ImportResult) => {
    const bytes = Uint8Array.from(
      window.atob(result.report.contentBase64),
      (char) => char.charCodeAt(0),
    );
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.report.filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadImportBatchAudit = (batch: ImportBatch) =>
    downloadFile(
      `/api/import-batches/${batch.id}/audit-export`,
      `import-audit-${batch.id}.xlsx`,
    );
  return {
    downloadLeaseDocument,
    downloadFile,
    openAuthenticatedFile,
    downloadExport,
    downloadImportTemplate,
    downloadUnitExport,
    downloadBillingInvoice,
    downloadBillingClosingPack,
    downloadBillingReconciliation,
    getDocumentCategoryLabel,
    getFileKind,
    downloadImportReport,
    downloadImportBatchAudit,
  };
}
