import { apiRequest } from "../../api/client";
import { arrayBufferToBase64 } from "../../shared/format";
import {
  type ImportApproval,
  type ImportBatch,
  type ImportResult,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
export function useImportsActions(
  deps: Pick<
    WorkspaceBase,
    | "session"
    | "setBusyAction"
    | "setError"
    | "importMode"
    | "setImportDrafts"
    | "setImportResults"
    | "setNotice"
    | "locale"
    | "importDrafts"
    | "setImportApprovals"
    | "setImportBatches"
  > &
    Pick<
      ReturnType<typeof useDataActions>,
      "loadImportApprovals" | "refreshWorkspace" | "loadImportBatches"
    >,
) {
  const {
    session,
    setBusyAction,
    setError,
    importMode,
    setImportDrafts,
    setImportResults,
    setNotice,
    locale,
    importDrafts,
    setImportApprovals,
    loadImportApprovals,
    setImportBatches,
    refreshWorkspace,
    loadImportBatches,
  } = deps;
  const handleImportUpload = async (templateId: string, file: File | null) => {
    if (!session || !file) {
      return;
    }

    setBusyAction(`import-${templateId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);
      const result = await apiRequest<
        Omit<ImportResult, "templateId" | "fileName">
      >(`/api/imports/${templateId}`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          contentBase64,
          dryRun: true,
          mode: importMode,
        },
      });
      setImportDrafts((current) => [
        {
          templateId,
          fileName: file.name,
          contentBase64,
          mode: importMode,
        },
        ...current.filter((item) => item.templateId !== templateId),
      ]);
      setImportResults((current) => [
        {
          ...result,
          templateId,
          fileName: file.name,
        },
        ...current.filter((item) => item.templateId !== templateId),
      ]);
      setNotice(
        locale === "ru"
          ? `Файл проверен: готово ${result.summary.ready ?? 0}, ошибок ${result.summary.errors}. После проверки нажмите «Применить».`
          : `File checked: ready ${result.summary.ready ?? 0}, errors ${result.summary.errors}. Apply it after review.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Import failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleImportCommit = async (templateId: string) => {
    if (!session) {
      return;
    }

    const draft = importDrafts.find((item) => item.templateId === templateId);
    if (!draft) {
      return;
    }

    setBusyAction(`import-commit-${templateId}`);
    setError("");

    try {
      const result = await apiRequest<
        Omit<ImportResult, "templateId" | "fileName">
      >(`/api/imports/${templateId}`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: draft.fileName,
          contentBase64: draft.contentBase64,
          dryRun: false,
          mode: draft.mode,
        },
      });
      setImportResults((current) => [
        {
          ...result,
          templateId,
          fileName: draft.fileName,
        },
        ...current.filter((item) => item.templateId !== templateId),
      ]);
      if (result.requiresApproval && result.approval) {
        setImportApprovals((current) => [
          result.approval as ImportApproval,
          ...current.filter((item) => item.id !== result.approval?.id),
        ]);
        setImportDrafts((current) =>
          current.filter((item) => item.templateId !== templateId),
        );
        setNotice(
          locale === "ru"
            ? "Большой импорт отправлен администратору на подтверждение."
            : "Large import sent for admin approval.",
        );
        await loadImportApprovals();
        return;
      }
      setImportDrafts((current) =>
        current.filter((item) => item.templateId !== templateId),
      );
      if (result.batch) {
        setImportBatches((current) => [
          result.batch as ImportBatch,
          ...current.filter((item) => item.id !== result.batch?.id),
        ]);
      }
      setNotice(
        locale === "ru"
          ? `Импорт применен: создано ${result.summary.created}, обновлено ${result.summary.updated ?? 0}, ошибок ${result.summary.errors}`
          : `Import applied: created ${result.summary.created}, updated ${result.summary.updated ?? 0}, errors ${result.summary.errors}`,
      );
      await refreshWorkspace();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Import failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleImportRollback = async (batch: ImportBatch) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-rollback-${batch.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: ImportBatch }>(
        `/api/import-batches/${batch.id}/rollback`,
        {
          method: "POST",
          token: session.token,
        },
      );
      setImportBatches((current) =>
        current.map((item) => (item.id === batch.id ? result.item : item)),
      );
      setNotice(
        locale === "ru"
          ? "Импортная партия откатилась."
          : "Import batch rolled back.",
      );
      await refreshWorkspace();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Import rollback failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleImportApprovalApprove = async (approval: ImportApproval) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-approval-approve-${approval.id}`);
    setError("");

    try {
      const result = await apiRequest<{
        item: ImportApproval;
        result: Omit<ImportResult, "templateId" | "fileName">;
      }>(`/api/import-approvals/${approval.id}/approve`, {
        method: "POST",
        token: session.token,
      });
      setImportApprovals((current) =>
        current.map((item) => (item.id === approval.id ? result.item : item)),
      );
      if (result.result.batch) {
        setImportBatches((current) => [
          result.result.batch as ImportBatch,
          ...current.filter((item) => item.id !== result.result.batch?.id),
        ]);
      }
      setNotice(
        locale === "ru"
          ? "Импорт подтвержден и применен."
          : "Import approved and applied.",
      );
      await Promise.all([
        loadImportApprovals(),
        loadImportBatches(),
        refreshWorkspace(),
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Import approval failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleImportApprovalReject = async (approval: ImportApproval) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-approval-reject-${approval.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: ImportApproval }>(
        `/api/import-approvals/${approval.id}/reject`,
        {
          method: "POST",
          token: session.token,
        },
      );
      setImportApprovals((current) =>
        current.map((item) => (item.id === approval.id ? result.item : item)),
      );
      setNotice(locale === "ru" ? "Импорт отклонен." : "Import rejected.");
      await loadImportApprovals();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Import approval failed",
      );
    } finally {
      setBusyAction("");
    }
  };
  return {
    handleImportUpload,
    handleImportCommit,
    handleImportRollback,
    handleImportApprovalApprove,
    handleImportApprovalReject,
  };
}
