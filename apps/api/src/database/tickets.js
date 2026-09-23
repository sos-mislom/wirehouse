import { LeasesDatabase } from "./leases.js";
import {
  addHours,
  buildChecklistItems,
  clone,
  compareComments,
  compareTickets,
  createChangeResult,
  isOpenTicket,
  createId,
  nowIso,
  ticketSlaHoursByPriority,
} from "./constants.js";

export class TicketsDatabase extends LeasesDatabase {
  listTickets(filters = {}) {
    const rows = this.data.tickets
      .filter((ticket) =>
        filters.propertyId ? ticket.property_id === filters.propertyId : true,
      )
      .filter((ticket) =>
        filters.status ? ticket.status === filters.status : true,
      )
      .filter((ticket) =>
        filters.tenantId ? ticket.tenant_id === filters.tenantId : true,
      )
      .map((ticket) => {
        const property = this.getPropertyById(ticket.property_id);
        const unit = this.getUnitById(ticket.unit_id);
        const tenant = ticket.tenant_id
          ? this.getTenantById(ticket.tenant_id)
          : null;
        const createdBy = this.getById("users", ticket.created_by);
        const assignedTo = ticket.assigned_to
          ? this.getById("users", ticket.assigned_to)
          : null;
        const commentCount = this.data.ticket_comments.filter(
          (comment) => comment.ticket_id === ticket.id,
        ).length;
        const attachmentCount = this.data.ticket_attachments.filter(
          (attachment) => attachment.ticket_id === ticket.id,
        ).length;

        return {
          ...ticket,
          property_name: property?.name ?? null,
          unit_number: unit?.number ?? null,
          tenant_name: tenant?.name ?? null,
          created_by_name: createdBy?.full_name ?? null,
          assigned_to_name: assignedTo?.full_name ?? null,
          comment_count: commentCount,
          attachment_count: attachmentCount,
        };
      })
      .sort(compareTickets);

    return clone(rows);
  }

  getTicket(id) {
    const ticket = this.getById("tickets", id);
    return ticket ? clone(ticket) : null;
  }

  createTicket(payload) {
    const unit = this.requireUnit(payload.unitId);
    const property = this.requireProperty(unit.property_id);
    const createdAt = nowIso();
    const slaHours =
      ticketSlaHoursByPriority[payload.priority] ??
      ticketSlaHoursByPriority.medium;

    if (payload.tenantId) {
      this.requireTenant(payload.tenantId);
    }

    if (payload.assignedTo) {
      const assignee = this.getById("users", payload.assignedTo);
      if (!assignee) {
        throw new Error("Assigned user not found");
      }
    }

    const record = {
      id: createId(),
      number: this.buildTicketNumber(),
      unit_id: unit.id,
      property_id: property.id,
      tenant_id: payload.tenantId ?? null,
      created_by: payload.createdBy,
      assigned_to: payload.assignedTo ?? null,
      category: payload.category,
      priority: payload.priority,
      status: payload.status ?? "new",
      source_channel: payload.sourceChannel ?? "web",
      title: payload.title,
      description: payload.description,
      sla_hours: slaHours,
      sla_due_at: payload.slaDueAt ?? addHours(new Date(createdAt), slaHours),
      equipment_id: payload.equipmentId ?? null,
      service_id: payload.serviceId ?? null,
      lease_id: payload.leaseId ?? null,
      maintenance_plan_id: payload.maintenancePlanId ?? null,
      work_logs: [],
      checklist_items:
        payload.checklistItems ?? buildChecklistItems(payload.category),
      created_at: createdAt,
      updated_at: createdAt,
      resolved_at: null,
      closed_at: null,
    };

    this.validateTicketPayload(record);
    this.data.tickets.push(record);
    this.data.ticket_history.push({
      id: createId(),
      ticket_id: record.id,
      type: "created",
      from_status: null,
      to_status: record.status,
      reason: payload.reason ?? null,
      created_by: payload.createdBy,
      created_at: createdAt,
    });
    return clone(record);
  }

  updateTicket(id, payload) {
    const current = this.getById("tickets", id);
    if (!current) {
      return null;
    }

    const nextUnitId = payload.unitId ?? current.unit_id;
    const unit = this.requireUnit(nextUnitId);
    const property = this.requireProperty(unit.property_id);
    const nextTenantId =
      payload.tenantId !== undefined ? payload.tenantId : current.tenant_id;

    if (nextTenantId) {
      this.requireTenant(nextTenantId);
    }

    if (payload.assignedTo !== undefined && payload.assignedTo !== null) {
      const assignee = this.getById("users", payload.assignedTo);
      if (!assignee) {
        throw new Error("Assigned user not found");
      }
    }

    const previousStatus = current.status;
    const nextStatus = payload.status ?? current.status;
    const nextCategory = payload.category ?? current.category;
    const next = {
      ...current,
      unit_id: unit.id,
      property_id: property.id,
      tenant_id: nextTenantId,
      assigned_to:
        payload.assignedTo !== undefined
          ? payload.assignedTo
          : current.assigned_to,
      category: nextCategory,
      priority: payload.priority ?? current.priority,
      status: nextStatus,
      equipment_id:
        payload.equipmentId !== undefined
          ? payload.equipmentId
          : current.equipment_id,
      service_id:
        payload.serviceId !== undefined
          ? payload.serviceId
          : current.service_id,
      lease_id:
        payload.leaseId !== undefined ? payload.leaseId : current.lease_id,
      source_channel: payload.sourceChannel ?? current.source_channel,
      title: payload.title ?? current.title,
      description: payload.description ?? current.description,
      sla_hours:
        payload.slaHours !== undefined
          ? Number(payload.slaHours)
          : (current.sla_hours ??
            ticketSlaHoursByPriority[payload.priority ?? current.priority] ??
            ticketSlaHoursByPriority.medium),
      sla_due_at:
        payload.slaDueAt ??
        current.sla_due_at ??
        addHours(
          new Date(current.created_at),
          ticketSlaHoursByPriority[payload.priority ?? current.priority] ??
            ticketSlaHoursByPriority.medium,
        ),
      checklist_items:
        payload.resetChecklist === true ||
        !Array.isArray(current.checklist_items)
          ? buildChecklistItems(nextCategory)
          : current.checklist_items,
      updated_at: nowIso(),
      resolved_at: !isOpenTicket(nextStatus)
        ? (current.resolved_at ?? nowIso())
        : nextStatus === "closed"
          ? (current.resolved_at ?? nowIso())
          : null,
      closed_at:
        nextStatus === "closed" ? (current.closed_at ?? nowIso()) : null,
    };

    if (
      next.maintenance_plan_id &&
      ["completed", "resolved", "closed"].includes(next.status) &&
      next.checklist_items.some((item) => item.required && !item.completed)
    )
      throw new Error("Завершите обязательный чек-лист ППР");
    this.validateTicketPayload(next);
    Object.assign(current, next);
    if (current.status !== previousStatus) {
      this.data.ticket_history.push({
        id: createId(),
        ticket_id: current.id,
        type: payload.reopenReason ? "reopened" : "status_changed",
        from_status: previousStatus,
        to_status: current.status,
        reason: payload.reopenReason ?? payload.reason ?? null,
        created_by: payload.updatedBy ?? null,
        created_at: nowIso(),
      });
    }
    return clone(current);
  }

  listTicketHistory(ticketId) {
    const rows = this.data.ticket_history
      .filter((event) => event.ticket_id === ticketId)
      .map((event) => {
        const author = event.created_by
          ? this.getById("users", event.created_by)
          : null;
        return {
          ...event,
          created_by_name: author?.full_name ?? null,
        };
      })
      .sort(compareComments);

    return clone(rows);
  }

  updateTicketChecklistItem(ticketId, itemId, payload) {
    const ticket = this.getById("tickets", ticketId);
    if (!ticket) {
      return null;
    }

    if (!Array.isArray(ticket.checklist_items)) {
      ticket.checklist_items = buildChecklistItems(ticket.category);
    }

    const item = ticket.checklist_items.find((entry) => entry.id === itemId);
    if (!item) {
      return null;
    }

    const completed = Boolean(payload.completed);
    item.completed = completed;
    item.completed_at = completed ? nowIso() : null;
    item.completed_by = completed ? payload.completedBy : null;
    item.completed_by_name = completed
      ? (this.getById("users", payload.completedBy)?.full_name ?? null)
      : null;
    ticket.updated_at = nowIso();

    return clone(item);
  }

  listTicketComments(ticketId) {
    const rows = this.data.ticket_comments
      .filter((comment) => comment.ticket_id === ticketId)
      .map((comment) => {
        const author = this.getById("users", comment.author_id);
        return {
          ...comment,
          author_name: author?.full_name ?? null,
          author_role: author?.role ?? null,
        };
      })
      .sort(compareComments);

    return clone(rows);
  }

  createTicketComment(payload) {
    const ticket = this.getTicket(payload.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const author = this.getById("users", payload.authorId);
    if (!author) {
      throw new Error("Author not found");
    }

    const record = {
      id: createId(),
      ticket_id: payload.ticketId,
      author_id: payload.authorId,
      source_channel: payload.sourceChannel ?? "web",
      content: payload.content,
      created_at: nowIso(),
    };

    this.data.ticket_comments.push(record);

    const storedTicket = this.getById("tickets", payload.ticketId);
    if (storedTicket) {
      storedTicket.updated_at = nowIso();
    }

    return clone(record);
  }

  listTicketAttachments(ticketId) {
    return clone(
      this.data.ticket_attachments
        .filter((attachment) => attachment.ticket_id === ticketId)
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ),
    );
  }

  getTicketAttachment(id) {
    const attachment = this.getById("ticket_attachments", id);
    return attachment ? clone(attachment) : null;
  }

  createTicketAttachment(payload) {
    const ticket = this.getTicket(payload.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const uploader = this.getById("users", payload.uploadedBy);
    if (!uploader) {
      throw new Error("Uploader not found");
    }

    const record = {
      id: createId(),
      ticket_id: payload.ticketId,
      file_name: payload.fileName,
      stored_name: payload.storedName,
      mime_type: payload.mimeType,
      size_bytes: Number(payload.sizeBytes),
      media_type: payload.mediaType,
      note: payload.note ?? "",
      uploaded_by: payload.uploadedBy,
      uploaded_by_name: uploader.full_name,
      created_at: nowIso(),
    };

    this.data.ticket_attachments.push(record);

    const storedTicket = this.getById("tickets", payload.ticketId);
    if (storedTicket) {
      storedTicket.updated_at = nowIso();
    }

    return clone(record);
  }

  deleteTicketAttachment(id) {
    const current = this.getById("ticket_attachments", id);
    if (!current) {
      return { result: createChangeResult(0), attachment: null };
    }

    this.data.ticket_attachments = this.data.ticket_attachments.filter(
      (attachment) => attachment.id !== id,
    );
    const ticket = this.getById("tickets", current.ticket_id);
    if (ticket) {
      ticket.updated_at = nowIso();
    }
    return { result: createChangeResult(1), attachment: clone(current) };
  }
}
