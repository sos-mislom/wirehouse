import crypto from "node:crypto";
import path from "node:path";
import {
  isOpenTicket,
  MAX_ATTACHMENT_BYTES,
} from "../../../../packages/contracts/src/domain.js";
import { parseJsonBody } from "../http/body.js";
import { validateTicketLinks } from "../operations.js";
export function createTicketsRoutes({
  requireAuth,
  getScopedTickets,
  ok,
  validateRequired,
  badRequest,
  canUseUnit,
  forbidden,
  db,
  hydrateTicket,
  normalizeTicket,
  notifyTicketEvent,
  priorityWeights,
  created,
  conflict,
  getTicketForUser,
  notFound,
  normalizeTicketComment,
  deliverTicketCommentToTenant,
  hydrateTicketComment,
  normalizeTicketAttachment,
  sanitizeFilename,
  ticketAttachmentPathFor,
  ensureTicketAttachmentWithinStorage,
  fileStorage,
  inferMediaType,
  normalizeTicketHistory,
  translateStatus,
}) {
  return async function ticketsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/tickets") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scopedTickets = getScopedTickets(user);
      const status = url.searchParams.get("status");
      ok(response, {
        items: status
          ? scopedTickets.filter((ticket) => ticket.status === status)
          : scopedTickets,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/tickets") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "unitId",
        "category",
        "priority",
        "title",
        "description",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (!canUseUnit(user, body.unitId)) {
        forbidden(response);
        return true;
      }

      if (user.role === "tenant" && !user.tenant_id) {
        forbidden(response);
        return true;
      }

      const payload = {
        ...body,
        createdBy: user.id,
        tenantId:
          user.role === "tenant" ? user.tenant_id : (body.tenantId ?? null),
        assignedTo: user.role === "tenant" ? null : (body.assignedTo ?? null),
        status: user.role === "tenant" ? "new" : (body.status ?? "new"),
        sourceChannel: body.sourceChannel ?? "web",
      };

      try {
        validateTicketLinks(db, user, payload);
        const createdRecord = db.createTicket(payload);
        const ticket =
          hydrateTicket(createdRecord.id) ?? normalizeTicket(createdRecord);
        await notifyTicketEvent({
          ticket,
          type: "ticket_created",
          title: `${ticket.number} · ${ticket.title}`,
          message: `${ticket.propertyName ?? "Объект"} · ${ticket.unitNumber ?? "—"} · ${ticket.tenantName ?? "Без арендатора"}`,
          tone: priorityWeights[ticket.priority] >= 3 ? "warning" : "info",
          actor: user,
          includeTenant: user.role !== "tenant",
        });
        created(response, {
          item: ticket,
        });
      } catch (error) {
        conflict(response, error);
      }
      return true;
    }

    const ticketCommentsMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/comments$/,
    );

    if (ticketCommentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const ticketId = ticketCommentsMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listTicketComments(ticketId).map(normalizeTicketComment),
        });
        return true;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["content"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return true;
        }

        try {
          const createdRecord = db.createTicketComment({
            ticketId,
            authorId: user.id,
            content: body.content,
          });
          const delivery = await deliverTicketCommentToTenant({
            ticket,
            author: user,
            content: String(body.content),
          });
          await notifyTicketEvent({
            ticket,
            type: "ticket_comment_added",
            title: `${ticket.number} · новый комментарий`,
            message: String(body.content).slice(0, 240),
            tone: "info",
            actor: user,
            includeTenant: user.role !== "tenant",
          });
          created(response, {
            item:
              hydrateTicketComment(ticketId, createdRecord.id) ??
              normalizeTicketComment(createdRecord),
            delivery,
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }
    }

    const ticketAttachmentsMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/attachments$/,
    );

    if (ticketAttachmentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const ticketId = ticketAttachmentsMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      if (method === "GET") {
        ok(response, {
          items: db
            .listTicketAttachments(ticketId)
            .map(normalizeTicketAttachment),
        });
        return true;
      }

      if (method === "POST") {
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
        const filePath = ticketAttachmentPathFor(storedName);
        if (!ensureTicketAttachmentWithinStorage(filePath)) {
          forbidden(response);
          return true;
        }

        const content = Buffer.from(String(body.contentBase64), "base64");
        if (content.length === 0) {
          badRequest(response, "Empty file");
          return true;
        }

        if (content.length > MAX_ATTACHMENT_BYTES) {
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
          const createdRecord = db.createTicketAttachment({
            ticketId,
            fileName,
            storedName,
            mimeType,
            mediaType: inferMediaType(mimeType),
            sizeBytes: content.length,
            note: body.note ?? "",
            uploadedBy: user.id,
          });
          created(response, {
            item: normalizeTicketAttachment(createdRecord),
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error);
        }
        return true;
      }
    }

    const ticketAttachmentFileMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)$/,
    );

    if (ticketAttachmentFileMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const ticketId = ticketAttachmentFileMatch[1];
      const attachmentId = ticketAttachmentFileMatch[2];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      const attachmentRecord = db.getTicketAttachment(attachmentId);
      if (!attachmentRecord || attachmentRecord.ticket_id !== ticketId) {
        notFound(response);
        return true;
      }

      const filePath = ticketAttachmentPathFor(attachmentRecord.stored_name);
      if (!ensureTicketAttachmentWithinStorage(filePath)) {
        forbidden(response);
        return true;
      }

      if (method === "GET") {
        const content = await fileStorage.get({ key: filePath });
        if (!content) {
          notFound(response);
          return true;
        }

        const disposition = ["image", "video"].includes(
          attachmentRecord.media_type,
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

        const deleted = db.deleteTicketAttachment(attachmentId);
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

    const ticketHistoryMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/history$/,
    );

    if (ticketHistoryMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const ticketId = ticketHistoryMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      ok(response, {
        items: db.listTicketHistory(ticketId).map(normalizeTicketHistory),
      });
      return true;
    }

    const ticketChecklistMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/checklist\/([a-zA-Z0-9-]+)$/,
    );

    if (ticketChecklistMatch && method === "PUT") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager", "worker"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const ticketId = ticketChecklistMatch[1];
      const itemId = ticketChecklistMatch[2];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      const body = await parseJsonBody(request);
      const updatedItem = db.updateTicketChecklistItem(ticketId, itemId, {
        completed: body.completed,
        completedBy: user.id,
      });
      if (!updatedItem) {
        notFound(response);
        return true;
      }

      ok(response, {
        item: updatedItem,
        ticket: hydrateTicket(ticketId),
      });
      return true;
    }

    const ticketMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)$/);

    if (ticketMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const ticketId = ticketMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return true;
      }

      if (method === "GET") {
        ok(response, {
          item: ticket,
        });
        return true;
      }

      if (method === "PUT") {
        const body = await parseJsonBody(request);
        if (user.role === "tenant") {
          if (
            body.status !== "rejected" ||
            ticket.tenantId !== user.tenant_id ||
            !["new", "accepted", "waiting_tenant"].includes(ticket.status)
          ) {
            forbidden(response);
            return true;
          }
        }
        if (
          user.role === "worker" &&
          body.status &&
          !["in_progress", "completed"].includes(String(body.status))
        ) {
          forbidden(response);
          return true;
        }
        const nextPayload =
          user.role === "tenant"
            ? {
                status: "rejected",
              }
            : user.role === "worker"
              ? {
                  status: body.status,
                }
              : body;

        if (nextPayload.unitId && !canUseUnit(user, nextPayload.unitId)) {
          forbidden(response);
          return true;
        }

        if (
          nextPayload.status &&
          !isOpenTicket(ticket.status) &&
          isOpenTicket(nextPayload.status) &&
          !String(body.reopenReason ?? "").trim()
        ) {
          badRequest(response, "Reopen reason is required");
          return true;
        }

        try {
          validateTicketLinks(
            db,
            user,
            nextPayload,
            db.getById("tickets", ticketId),
          );
          const updatedRecord = db.updateTicket(ticketId, {
            ...nextPayload,
            reopenReason: body.reopenReason,
            updatedBy: user.id,
          });
          if (!updatedRecord) {
            notFound(response);
            return true;
          }
          const updatedTicket =
            hydrateTicket(ticketId) ?? normalizeTicket(updatedRecord);
          await notifyTicketEvent({
            ticket: updatedTicket,
            type: "ticket_updated",
            title: `${updatedTicket.number} · ${updatedTicket.title}`,
            message: `Статус: ${translateStatus(updatedTicket.status)}. Ответственный: ${updatedTicket.assignedToName ?? "не назначен"}`,
            tone: !isOpenTicket(updatedTicket.status) ? "success" : "info",
            actor: user,
          });
          ok(response, {
            item: updatedTicket,
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
