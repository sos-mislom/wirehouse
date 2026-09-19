import crypto from "node:crypto";
import path from "node:path";
import { parseJsonBody } from "../http/body.js";
export function createTenantsRoutes({
  requireAuth,
  buildScopedCollections,
  ok,
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  db,
  created,
  normalizeTenant,
  conflict,
  getTenantForUser,
  notFound,
  buildTenantDetailResponse,
  normalizeTenantNote,
  normalizeTenantNoteAttachment,
  forbidden,
  sanitizeFilename,
  documentPathFor,
  ensureDocumentWithinStorage,
  fileStorage,
  requireTenantScope,
}) {
  return async function tenantsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/tenants") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.tenants,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/tenants") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "name",
        "inn",
        "contactName",
        "phone",
        "email",
        "riskLevel",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      try {
        const createdRecord = db.createTenant(body);
        created(response, {
          item: normalizeTenant(createdRecord),
        });
      } catch (error) {
        conflict(response, error);
      }
      return true;
    }

    const tenantDetailMatch = pathname.match(
      /^\/api\/tenants\/([a-zA-Z0-9-]+)\/detail$/,
    );

    if (tenantDetailMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const tenantId = tenantDetailMatch[1];
      const tenant = getTenantForUser(user, tenantId);
      if (!tenant) {
        notFound(response);
        return true;
      }

      if (method === "GET") {
        ok(response, buildTenantDetailResponse(user, tenantId));
        return true;
      }
    }

    const tenantNotesMatch = pathname.match(
      /^\/api\/tenants\/([a-zA-Z0-9-]+)\/notes$/,
    );

    if (tenantNotesMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const tenantId = tenantNotesMatch[1];
      const tenant = getTenantForUser(user, tenantId);
      if (!tenant) {
        notFound(response);
        return true;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["title", "content"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return true;
        }

        try {
          const createdRecord = db.createTenantNote({
            tenantId,
            title: body.title,
            content: body.content,
            authorId: user.id,
          });
          created(response, {
            item: normalizeTenantNote(createdRecord),
          });
        } catch (error) {
          badRequest(response, error.message);
        }
        return true;
      }
    }

    const tenantNoteAttachmentsMatch = pathname.match(
      /^\/api\/tenant-notes\/([a-zA-Z0-9-]+)\/attachments$/,
    );

    if (tenantNoteAttachmentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const noteId = tenantNoteAttachmentsMatch[1];
      const note = db.getTenantNote(noteId);
      if (!note || !getTenantForUser(user, note.tenant_id)) {
        notFound(response);
        return true;
      }

      if (method === "GET") {
        ok(response, {
          items: db
            .listTenantNoteAttachments(noteId)
            .map(normalizeTenantNoteAttachment),
        });
        return true;
      }

      if (method === "POST") {
        if (!["admin", "manager"].includes(user.role)) {
          forbidden(response);
          return true;
        }

        const body = await parseJsonBody(request);
        const missing = validateRequired(body, [
          "fileName",
          "mimeType",
          "contentBase64",
        ]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return true;
        }

        const fileName = sanitizeFilename(body.fileName);
        const extension = path.extname(fileName);
        const storedName = `tenant-note-${crypto.randomUUID()}${extension || ".bin"}`;
        const filePath = documentPathFor(storedName);
        if (!ensureDocumentWithinStorage(filePath)) {
          forbidden(response);
          return true;
        }

        const content = Buffer.from(String(body.contentBase64), "base64");
        if (content.length === 0) {
          badRequest(response, "Empty file");
          return true;
        }

        if (content.length > 25 * 1024 * 1024) {
          badRequest(response, "File is too large");
          return true;
        }

        const mimeType = String(body.mimeType || "application/octet-stream");
        await fileStorage.put({
          key: filePath,
          content,
          contentType: mimeType,
        });
        try {
          const createdRecord = db.createTenantNoteAttachment({
            noteId,
            fileName,
            storedName,
            mimeType,
            sizeBytes: content.length,
            uploadedBy: user.id,
          });
          created(response, {
            item: normalizeTenantNoteAttachment(createdRecord),
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error);
        }
        return true;
      }
    }

    const tenantNoteAttachmentFileMatch = pathname.match(
      /^\/api\/tenant-notes\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)$/,
    );

    if (tenantNoteAttachmentFileMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const noteId = tenantNoteAttachmentFileMatch[1];
      const attachmentId = tenantNoteAttachmentFileMatch[2];
      const note = db.getTenantNote(noteId);
      if (!note || !getTenantForUser(user, note.tenant_id)) {
        notFound(response);
        return true;
      }

      const attachmentRecord = db.getTenantNoteAttachment(attachmentId);
      if (!attachmentRecord || attachmentRecord.note_id !== noteId) {
        notFound(response);
        return true;
      }

      const filePath = documentPathFor(attachmentRecord.stored_name);
      if (!ensureDocumentWithinStorage(filePath)) {
        forbidden(response);
        return true;
      }

      if (method === "GET") {
        const content = await fileStorage.get({ key: filePath });
        if (!content) {
          notFound(response);
          return true;
        }

        const disposition = String(attachmentRecord.mime_type).startsWith(
          "image/",
        )
          ? "inline"
          : "attachment";
        response.writeHead(200, {
          "Content-Type":
            attachmentRecord.mime_type || "application/octet-stream",
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachmentRecord.file_name)}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition",
        });
        response.end(content);
        return true;
      }

      if (method === "DELETE") {
        const canDeleteAttachment =
          ["admin", "manager"].includes(user.role) ||
          attachmentRecord.uploaded_by === user.id;
        if (!canDeleteAttachment) {
          forbidden(response);
          return true;
        }

        const deleted = db.deleteTenantNoteAttachment(attachmentId);
        if (deleted.result.changes === 0) {
          notFound(response);
          return true;
        }
        await fileStorage.delete({ key: filePath });
        ok(response, {
          success: true,
        });
        return true;
      }
    }

    const tenantMatch = pathname.match(/^\/api\/tenants\/([a-zA-Z0-9-]+)$/);

    if (tenantMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const tenantId = tenantMatch[1];

      if (method === "PUT") {
        if (!requireTenantScope(user, response, tenantId)) {
          return true;
        }

        try {
          const body = await parseJsonBody(request);
          const updatedRecord = db.updateTenant(tenantId, body);
          if (!updatedRecord) {
            notFound(response);
            return true;
          }
          ok(response, {
            item: normalizeTenant(updatedRecord),
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }

      if (method === "DELETE") {
        if (!requireTenantScope(user, response, tenantId)) {
          return true;
        }

        try {
          const result = db.deleteTenant(tenantId);
          if (result.changes === 0) {
            notFound(response);
            return true;
          }
          ok(response, {
            success: true,
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }
    }
    return false;
  };
}
