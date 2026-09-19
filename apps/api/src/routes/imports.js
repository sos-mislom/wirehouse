import { parseJsonBody } from "../http/body.js";
export function createImportsRoutes({
  requireAuth,
  forbidden,
  buildImportTemplateFile,
  notFound,
  validateRequired,
  badRequest,
  importApprovalThreshold,
  runImport,
  db,
  ok,
  normalizeImportApproval,
  conflict,
  normalizeImportBatch,
  buildImportBatchAuditFile,
}) {
  return async function importsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    const importTemplateMatch = pathname.match(
      /^\/api\/import-templates\/([a-zA-Z0-9-]+)$/,
    );

    if (importTemplateMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const file = await buildImportTemplateFile(importTemplateMatch[1]);
      if (!file) {
        notFound(response);
        return true;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }

    const importRunMatch = pathname.match(/^\/api\/imports\/([a-zA-Z0-9-]+)$/);

    if (importRunMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["fileName", "contentBase64"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const content = Buffer.from(String(body.contentBase64), "base64");
      if (content.length === 0) {
        badRequest(response, "Empty file");
        return true;
      }
      if (content.length > 10 * 1024 * 1024) {
        badRequest(response, "File is too large");
        return true;
      }

      try {
        if (
          !Boolean(body.dryRun) &&
          user.role === "manager" &&
          importApprovalThreshold > 0
        ) {
          const preview = await runImport({
            templateId: importRunMatch[1],
            filename: body.fileName,
            buffer: content,
            dryRun: true,
            mode: String(body.mode ?? "create"),
            user,
          });
          if (!preview) {
            notFound(response);
            return true;
          }

          const readyRows = Number(preview.summary.ready ?? 0);
          if (
            preview.summary.errors === 0 &&
            readyRows >= importApprovalThreshold
          ) {
            const approval = db.createImportApproval({
              templateId: importRunMatch[1],
              fileName: body.fileName,
              mode: String(body.mode ?? "create"),
              contentBase64: String(body.contentBase64),
              summary: preview.summary,
              rows: preview.rows,
              report: preview.report,
              requestedBy: user.id,
              requestedByName: user.full_name ?? user.fullName ?? null,
            });
            ok(response, {
              ...preview,
              requiresApproval: true,
              approval: normalizeImportApproval(approval),
            });
            return true;
          }
        }

        const result = await runImport({
          templateId: importRunMatch[1],
          filename: body.fileName,
          buffer: content,
          dryRun: Boolean(body.dryRun),
          mode: String(body.mode ?? "create"),
          user,
        });
        if (!result) {
          notFound(response);
          return true;
        }
        ok(response, result);
      } catch (error) {
        badRequest(
          response,
          error instanceof Error ? error.message : "Import failed",
        );
      }
      return true;
    }

    if (method === "GET" && pathname === "/api/import-approvals") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      ok(response, {
        items: db.listImportApprovals().map(normalizeImportApproval),
      });
      return true;
    }

    const importApprovalApproveMatch = pathname.match(
      /^\/api\/import-approvals\/([a-zA-Z0-9-]+)\/approve$/,
    );

    if (importApprovalApproveMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (user.role !== "admin") {
        forbidden(response);
        return true;
      }

      const approval = db.getImportApproval(importApprovalApproveMatch[1]);
      if (!approval) {
        notFound(response);
        return true;
      }
      if (approval.status !== "pending") {
        conflict(response, "Import approval is already closed");
        return true;
      }

      try {
        const content = Buffer.from(
          String(approval.content_base64 ?? ""),
          "base64",
        );
        const preview = await runImport({
          templateId: approval.template_id,
          filename: approval.file_name,
          buffer: content,
          dryRun: true,
          mode: approval.mode,
          user,
        });
        if (!preview || preview.summary.errors > 0) {
          badRequest(
            response,
            "Import approval has validation errors; upload a fresh file",
          );
          return true;
        }

        const result = await runImport({
          templateId: approval.template_id,
          filename: approval.file_name,
          buffer: content,
          dryRun: false,
          mode: approval.mode,
          user,
        });
        const updated = db.markImportApprovalApproved(
          approval.id,
          user.id,
          result?.batch?.id ?? null,
        );
        ok(response, {
          item: normalizeImportApproval(updated),
          result,
        });
      } catch (error) {
        badRequest(
          response,
          error instanceof Error ? error.message : "Import approval failed",
        );
      }
      return true;
    }

    const importApprovalRejectMatch = pathname.match(
      /^\/api\/import-approvals\/([a-zA-Z0-9-]+)\/reject$/,
    );

    if (importApprovalRejectMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (user.role !== "admin") {
        forbidden(response);
        return true;
      }

      try {
        const approval = db.rejectImportApproval(
          importApprovalRejectMatch[1],
          user.id,
        );
        if (!approval) {
          notFound(response);
          return true;
        }
        ok(response, { item: normalizeImportApproval(approval) });
      } catch (error) {
        conflict(
          response,
          error instanceof Error ? error.message : "Import approval failed",
        );
      }
      return true;
    }

    if (method === "GET" && pathname === "/api/import-batches") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      ok(response, {
        items: db.listImportBatches().map(normalizeImportBatch),
      });
      return true;
    }

    const importBatchRollbackMatch = pathname.match(
      /^\/api\/import-batches\/([a-zA-Z0-9-]+)\/rollback$/,
    );

    if (importBatchRollbackMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      try {
        const batch = db.rollbackImportBatch(
          importBatchRollbackMatch[1],
          user.id,
        );
        if (!batch) {
          notFound(response);
          return true;
        }
        ok(response, { item: normalizeImportBatch(batch) });
      } catch (error) {
        badRequest(
          response,
          error instanceof Error ? error.message : "Import rollback failed",
        );
      }
      return true;
    }

    const importBatchAuditMatch = pathname.match(
      /^\/api\/import-batches\/([a-zA-Z0-9-]+)\/audit-export$/,
    );

    if (importBatchAuditMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const batch = db.getImportBatch(importBatchAuditMatch[1]);
      if (!batch) {
        notFound(response);
        return true;
      }

      const file = await buildImportBatchAuditFile(batch);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }
    return false;
  };
}
