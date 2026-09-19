import { PortfolioDatabase } from "./portfolio.js";
import {
  clone,
  compareCreatedAtDesc,
  createChangeResult,
  createId,
  nowIso,
} from "./constants.js";

export class TenantsDatabase extends PortfolioDatabase {
  listTenants() {
    const rows = this.data.tenants
      .map((tenant) => ({
        ...tenant,
        lease_count: this.data.leases.filter(
          (lease) =>
            lease.tenant_id === tenant.id && lease.stage !== "terminated",
        ).length,
      }))
      .sort(compareCreatedAtDesc);

    return clone(rows);
  }

  getTenant(id) {
    const tenant = this.getById("tenants", id);
    return tenant ? clone(tenant) : null;
  }

  getTenantPortalUser(tenantId) {
    const user = this.getUserByPredicate(
      (item) => item.tenant_id === tenantId && item.role === "tenant",
    );
    return user ? clone(user) : null;
  }

  syncTenantPortalUser(tenantRecord) {
    const existingUser = this.getUserByPredicate(
      (item) => item.tenant_id === tenantRecord.id && item.role === "tenant",
    );

    this.ensureUnique(
      this.data.users,
      (user) =>
        user.phone === tenantRecord.phone && user.id !== existingUser?.id,
      "User phone must be unique",
    );

    if (existingUser) {
      existingUser.phone = tenantRecord.phone;
      existingUser.full_name = tenantRecord.contact_name;
      existingUser.tenant_id = tenantRecord.id;
      // Editing tenant contact details must not reactivate a blocked account.
      return existingUser.id;
    }

    const userId = createId();
    this.data.users.push({
      id: userId,
      email: null,
      phone: tenantRecord.phone,
      password_hash: null,
      full_name: tenantRecord.contact_name,
      role: "tenant",
      property_id: null,
      tenant_id: tenantRecord.id,
      is_active: 1,
      created_at: tenantRecord.created_at ?? nowIso(),
      last_login_at: null,
    });

    return userId;
  }

  createTenant(payload) {
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.inn === payload.inn,
      "Tenant INN must be unique",
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.phone === payload.phone,
      "Tenant phone must be unique",
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.email === payload.email,
      "Tenant email must be unique",
    );

    const record = {
      id: createId(),
      name: payload.name,
      inn: payload.inn,
      contact_name: payload.contactName,
      phone: payload.phone,
      email: payload.email,
      risk_level: payload.riskLevel,
      status: payload.status ?? "active",
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    this.validateTenantPayload(record);
    this.data.tenants.push(record);
    this.syncTenantPortalUser(record);
    return clone(record);
  }

  updateTenant(id, payload) {
    const current = this.getById("tenants", id);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      name: payload.name ?? current.name,
      inn: payload.inn ?? current.inn,
      contact_name: payload.contactName ?? current.contact_name,
      phone: payload.phone ?? current.phone,
      email: payload.email ?? current.email,
      risk_level: payload.riskLevel ?? current.risk_level,
      status: payload.status ?? current.status,
      updated_at: nowIso(),
    };

    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.id !== id && tenant.inn === next.inn,
      "Tenant INN must be unique",
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.id !== id && tenant.phone === next.phone,
      "Tenant phone must be unique",
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.id !== id && tenant.email === next.email,
      "Tenant email must be unique",
    );

    this.validateTenantPayload(next);
    Object.assign(current, next);
    this.syncTenantPortalUser(current);
    return clone(current);
  }

  deleteTenant(id) {
    if (
      this.data.leases.some((l) => l.tenant_id === id) ||
      this.data.tickets.some((t) => t.tenant_id === id)
    )
      throw new Error(
        "Нельзя удалить арендатора с договорами или заявками; измените его статус",
      );
    const current = this.getById("tenants", id);
    if (!current) {
      return createChangeResult(0);
    }

    const relatedLeases = this.data.leases.filter(
      (lease) => lease.tenant_id === id,
    );
    for (const lease of relatedLeases) {
      this.setUnitStatus(lease.unit_id, "vacant");
    }

    this.data.users = this.data.users
      .filter((user) => !(user.tenant_id === id && user.role === "tenant"))
      .map((user) =>
        user.tenant_id === id
          ? {
              ...user,
              tenant_id: null,
            }
          : user,
      );
    this.data.tickets = this.data.tickets.map((ticket) =>
      ticket.tenant_id === id
        ? {
            ...ticket,
            tenant_id: null,
            updated_at: nowIso(),
          }
        : ticket,
    );
    this.data.leases = this.data.leases.filter(
      (lease) => lease.tenant_id !== id,
    );
    const tenantNoteIds = new Set(
      this.data.tenant_notes
        .filter((note) => note.tenant_id === id)
        .map((note) => note.id),
    );
    this.data.tenant_note_attachments =
      this.data.tenant_note_attachments.filter(
        (attachment) => !tenantNoteIds.has(attachment.note_id),
      );
    this.data.tenant_notes = this.data.tenant_notes.filter(
      (note) => note.tenant_id !== id,
    );
    this.data.tenants = this.data.tenants.filter((tenant) => tenant.id !== id);
    return createChangeResult(1);
  }

  listTenantNotes(tenantId) {
    const rows = this.data.tenant_notes
      .filter((note) => note.tenant_id === tenantId)
      .map((note) => {
        const author = note.author_id
          ? this.getById("users", note.author_id)
          : null;
        return {
          ...note,
          author_name: author?.full_name ?? note.author_name ?? "Система",
          attachments: this.listTenantNoteAttachments(note.id),
        };
      })
      .sort(compareCreatedAtDesc);

    return clone(rows);
  }

  getTenantNote(id) {
    const note = this.getById("tenant_notes", id);
    return note ? clone(note) : null;
  }

  createTenantNote(payload) {
    this.requireTenant(payload.tenantId);
    const author = payload.authorId
      ? this.getById("users", payload.authorId)
      : null;
    const record = {
      id: createId(),
      tenant_id: payload.tenantId,
      title: String(payload.title ?? "").trim(),
      content: String(payload.content ?? "").trim(),
      author_id: payload.authorId ?? null,
      author_name: author?.full_name ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (!record.title || !record.content) {
      throw new Error("Tenant note title and content are required");
    }

    this.data.tenant_notes.push(record);
    return clone({
      ...record,
      author_name: author?.full_name ?? "Система",
      attachments: [],
    });
  }

  listTenantNoteAttachments(noteId) {
    const rows = this.data.tenant_note_attachments
      .filter((attachment) => attachment.note_id === noteId)
      .map((attachment) => {
        const uploader = attachment.uploaded_by
          ? this.getById("users", attachment.uploaded_by)
          : null;
        return {
          ...attachment,
          uploaded_by_name:
            uploader?.full_name ?? attachment.uploaded_by_name ?? null,
        };
      })
      .sort(compareCreatedAtDesc);

    return clone(rows);
  }

  getTenantNoteAttachment(id) {
    const attachment = this.getById("tenant_note_attachments", id);
    return attachment ? clone(attachment) : null;
  }

  createTenantNoteAttachment(payload) {
    const note = this.getTenantNote(payload.noteId);
    if (!note) {
      throw new Error("Tenant note not found");
    }

    const uploader = this.getById("users", payload.uploadedBy);
    if (!uploader) {
      throw new Error("Uploader not found");
    }

    const record = {
      id: createId(),
      note_id: payload.noteId,
      tenant_id: note.tenant_id,
      file_name: payload.fileName,
      stored_name: payload.storedName,
      mime_type: payload.mimeType,
      size_bytes: Number(payload.sizeBytes),
      uploaded_by: payload.uploadedBy,
      uploaded_by_name: uploader.full_name,
      created_at: nowIso(),
    };

    this.data.tenant_note_attachments.push(record);
    const currentNote = this.getById("tenant_notes", payload.noteId);
    if (currentNote) {
      currentNote.updated_at = nowIso();
    }
    return clone(record);
  }

  deleteTenantNoteAttachment(id) {
    const current = this.getById("tenant_note_attachments", id);
    if (!current) {
      return { result: createChangeResult(0), attachment: null };
    }

    this.data.tenant_note_attachments =
      this.data.tenant_note_attachments.filter(
        (attachment) => attachment.id !== id,
      );
    const note = this.getById("tenant_notes", current.note_id);
    if (note) {
      note.updated_at = nowIso();
    }
    return { result: createChangeResult(1), attachment: clone(current) };
  }

}
