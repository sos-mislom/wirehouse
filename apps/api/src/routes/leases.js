import crypto from "node:crypto";
import path from "node:path";
import { parseJsonBody } from "../http/body.js";
export function createLeasesRoutes({
  requireAuth,
  buildScopedCollections,
  ok,
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  requireUnitScope,
  db,
  created,
  normalizeLease,
  conflict,
  requireLeaseDocumentAccess,
  buildLeaseDocumentHtml,
  normalizeLeaseDocument,
  forbidden,
  sanitizeFilename,
  documentPathFor,
  ensureDocumentWithinStorage,
  fileStorage,
  notFound,
  requireLeaseScope,
}) {
  return async function leasesRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/leases") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.leases,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/leases") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "tenantId",
        "unitId",
        "contractNumber",
        "stage",
        "startDate",
        "endDate",
        "ratePerSqm",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (!requireUnitScope(user, response, body.unitId)) {
        return true;
      }

      try {
        const createdRecord = db.createLease(body);
        created(response, {
          item: normalizeLease(createdRecord),
        });
      } catch (error) {
        conflict(response, error);
      }
      return true;
    }

    const leaseDocumentMatch = pathname.match(
      /^\/api\/leases\/([a-zA-Z0-9-]+)\/document$/,
    );

    if (leaseDocumentMatch && method === "GET") {
      const leaseId = leaseDocumentMatch[1];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return true;
      }
      const lease = access.lease;

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${lease.contractNumber}.html"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(buildLeaseDocumentHtml(lease));
      return true;
    }

    const leaseDocumentsMatch = pathname.match(
      /^\/api\/leases\/([a-zA-Z0-9-]+)\/documents$/,
    );

    if (leaseDocumentsMatch) {
      const leaseId = leaseDocumentsMatch[1];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return true;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listLeaseDocuments(leaseId).map(normalizeLeaseDocument),
        });
        return true;
      }

      if (method === "POST") {
        if (!["admin", "manager"].includes(access.user.role)) {
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
        const storedName = `${crypto.randomUUID()}${extension || ".bin"}`;
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

        await fileStorage.put({
          key: filePath,
          content,
          contentType: String(body.mimeType || "application/octet-stream"),
        });
        try {
          const createdRecord = db.createLeaseDocument({
            leaseId,
            fileName,
            storedName,
            category: [
              "lease",
              "appendix",
              "invoice",
              "act",
              "payment",
              "receipt",
              "other",
            ].includes(body.category)
              ? body.category
              : "other",
            mimeType: String(body.mimeType || "application/octet-stream"),
            sizeBytes: content.length,
            uploadedBy: access.user.id,
          });
          created(response, {
            item: normalizeLeaseDocument(createdRecord),
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error);
        }
        return true;
      }
    }

    const leaseDocumentFileMatch = pathname.match(
      /^\/api\/leases\/([a-zA-Z0-9-]+)\/documents\/([a-zA-Z0-9-]+)$/,
    );

    if (leaseDocumentFileMatch) {
      const leaseId = leaseDocumentFileMatch[1];
      const documentId = leaseDocumentFileMatch[2];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return true;
      }

      const documentRecord = db.getLeaseDocument(documentId);
      if (!documentRecord || documentRecord.lease_id !== leaseId) {
        notFound(response);
        return true;
      }

      const filePath = documentPathFor(documentRecord.stored_name);
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

        response.writeHead(200, {
          "Content-Type":
            documentRecord.mime_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(documentRecord.file_name)}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition",
        });
        response.end(content);
        return true;
      }

      if (method === "DELETE") {
        if (!["admin", "manager"].includes(access.user.role)) {
          forbidden(response);
          return true;
        }

        const deleted = db.deleteLeaseDocument(documentId);
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

    const leaseMatch = pathname.match(/^\/api\/leases\/([a-zA-Z0-9-]+)$/);

    if (leaseMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const leaseId = leaseMatch[1];

      if (method === "PUT") {
        try {
          const body = await parseJsonBody(request);
          if (!requireLeaseScope(user, response, leaseId)) {
            return true;
          }
          if (body.unitId && !requireUnitScope(user, response, body.unitId)) {
            return true;
          }

          const updatedRecord = db.updateLease(leaseId, body);
          if (!updatedRecord) {
            notFound(response);
            return true;
          }
          ok(response, {
            item: normalizeLease(updatedRecord),
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }

      if (method === "DELETE") {
        if (!requireLeaseScope(user, response, leaseId)) {
          return true;
        }

        try {
          const documents = db.listLeaseDocuments(leaseId);
          const result = db.deleteLease(leaseId);
          if (result.changes === 0) {
            notFound(response);
            return true;
          }
          for (const documentRecord of documents) {
            const filePath = documentPathFor(documentRecord.stored_name);
            if (ensureDocumentWithinStorage(filePath)) {
              await fileStorage.delete({ key: filePath });
            }
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
