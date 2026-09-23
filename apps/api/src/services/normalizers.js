import { permissionsFor } from "../../../../packages/contracts/src/permissions.ts";
export function createNormalizersService({}) {
  const coerceBoolean = (value) => {
    if (typeof value === "boolean") {
      return value;
    }
    return value === 1 || value === "1" || value === "true";
  };

  const normalizeProperty = (record) => ({
    id: record.id,
    name: record.name,
    address: record.address,
    totalArea: Number(record.total_area),
    rentableArea: Number(record.rentable_area),
    warehouseClass: record.warehouse_class,
    description: record.description,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });

  const normalizeUnit = (record) => ({
    floorId: record.floor_id,
    id: record.id,
    propertyId: record.property_id,
    number: record.number,
    building: record.building ?? "",
    entrance: record.entrance ?? "",
    photoUrl: record.photo_url ?? "",
    floor: Number(record.floor),
    area: Number(record.area),
    type: record.type,
    status: record.status,
    ceilingHeight: Number(record.ceiling_height),
    temperatureRegime: record.temperature_regime,
    description: record.description ?? "",
    hasRamp: coerceBoolean(record.has_ramp),
    hasGate: coerceBoolean(record.has_gate),
    propertyName: record.property_name ?? null,
    tenantName: record.tenant_name ?? null,
    leaseStage: record.lease_stage ?? null,
    leaseEndDate: record.lease_end_date ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });

  const normalizeTenant = (record) => ({
    id: record.id,
    name: record.name,
    inn: record.inn,
    contactName: record.contact_name,
    phone: record.phone,
    email: record.email,
    riskLevel: record.risk_level,
    status: record.status,
    leaseCount: Number(record.lease_count ?? 0),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });

  const normalizeTenantNote = (record) => ({
    id: record.id,
    tenantId: record.tenant_id,
    title: record.title,
    authorId: record.author_id ?? null,
    authorName: record.author_name ?? "Система",
    createdAt: record.created_at,
    content: record.content,
    attachments: Array.isArray(record.attachments)
      ? record.attachments.map(normalizeTenantNoteAttachment)
      : [],
  });

  const normalizeTenantNoteAttachment = (record) => ({
    id: record.id,
    noteId: record.note_id,
    tenantId: record.tenant_id,
    fileName: record.file_name,
    mimeType: record.mime_type,
    sizeBytes: Number(record.size_bytes),
    uploadedBy: record.uploaded_by,
    uploadedByName: record.uploaded_by_name ?? null,
    createdAt: record.created_at,
  });

  const normalizeLease = (record) => ({
    id: record.id,
    tenantId: record.tenant_id,
    unitId: record.unit_id,
    contractNumber: record.contract_number,
    stage: record.stage,
    startDate: record.start_date,
    endDate: record.end_date,
    ratePerSqm: Number(record.rate_per_sqm),
    deposit: Number(record.deposit),
    indexationPct: Number(record.indexation_pct),
    tenantName: record.tenant_name ?? null,
    unitNumber: record.unit_number ?? null,
    propertyName: record.property_name ?? null,
    documentName: record.document_name ?? `${record.contract_number}.html`,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });

  const normalizeTicket = (record) => ({
    id: record.id,
    number: record.number,
    unitId: record.unit_id,
    propertyId: record.property_id,
    tenantId: record.tenant_id,
    createdBy: record.created_by,
    assignedTo: record.assigned_to,
    category: record.category,
    priority: record.priority,
    status: record.status,
    equipmentId: record.equipment_id ?? null,
    serviceId: record.service_id ?? null,
    leaseId: record.lease_id ?? null,
    maintenancePlanId: record.maintenance_plan_id ?? null,
    workLogs: record.work_logs ?? [],
    sourceChannel: record.source_channel ?? "web",
    title: record.title,
    description: record.description,
    slaHours: Number(record.sla_hours ?? 0),
    slaDueAt: record.sla_due_at ?? null,
    checklistItems: Array.isArray(record.checklist_items)
      ? record.checklist_items.map((item) => ({
          id: item.id,
          label: item.label,
          required: Boolean(item.required),
          completed: Boolean(item.completed),
          completedAt: item.completed_at ?? null,
          completedBy: item.completed_by ?? null,
          completedByName: item.completed_by_name ?? null,
        }))
      : [],
    propertyName: record.property_name ?? null,
    unitNumber: record.unit_number ?? null,
    tenantName: record.tenant_name ?? null,
    createdByName: record.created_by_name ?? null,
    assignedToName: record.assigned_to_name ?? null,
    commentCount: Number(record.comment_count ?? 0),
    attachmentCount: Number(record.attachment_count ?? 0),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    resolvedAt: record.resolved_at,
    closedAt: record.closed_at,
  });

  const normalizeTicketComment = (record) => ({
    id: record.id,
    ticketId: record.ticket_id,
    authorId: record.author_id,
    authorName: record.author_name ?? null,
    authorRole: record.author_role ?? null,
    sourceChannel: record.source_channel ?? "web",
    content: record.content,
    createdAt: record.created_at,
  });

  const normalizeTicketHistory = (record) => ({
    id: record.id,
    ticketId: record.ticket_id,
    type: record.type,
    fromStatus: record.from_status,
    toStatus: record.to_status,
    reason: record.reason ?? null,
    createdBy: record.created_by,
    createdByName: record.created_by_name ?? null,
    createdAt: record.created_at,
  });

  const normalizeLeaseDocument = (record) => ({
    id: record.id,
    leaseId: record.lease_id,
    fileName: record.file_name,
    category: record.document_category ?? "other",
    mimeType: record.mime_type,
    sizeBytes: Number(record.size_bytes),
    uploadedBy: record.uploaded_by,
    uploadedByName: record.uploaded_by_name ?? null,
    createdAt: record.created_at,
  });

  const normalizeBillingInvoice = (record) => ({
    id: record.id,
    leaseId: record.lease_id,
    tenantId: record.tenant_id,
    unitId: record.unit_id,
    period: record.period,
    rentAmount: Number(record.rent_amount),
    variableAmount: Number(record.variable_amount),
    totalAmount: Number(record.total_amount),
    dueDate: record.due_date,
    status: record.status,
    tenantName: record.tenant_name ?? null,
    contractNumber: record.contract_number ?? null,
    propertyName: record.property_name ?? null,
    unitNumber: record.unit_number ?? null,
    paidAmount: Number(record.paid_amount ?? 0),
    paidAt: record.paid_at ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });

  const normalizeBillingPayment = (record) => ({
    id: record.id,
    invoiceId: record.invoice_id,
    tenantId: record.tenant_id,
    amount: Number(record.amount),
    paidAt: record.paid_at,
    method: record.method,
    reference: record.reference,
    tenantName: record.tenant_name ?? null,
    contractNumber: record.contract_number ?? null,
    period: record.period ?? null,
    invoiceStatus: record.invoice_status ?? null,
    createdAt: record.created_at,
    invoice: record.invoice ? normalizeBillingInvoice(record.invoice) : null,
  });

  const normalizeImportBatch = (record) => ({
    id: record.id,
    templateId: record.template_id,
    fileName: record.file_name,
    mode: record.mode,
    status: record.status,
    summary: record.summary ?? {},
    operationCount: Number(
      record.operation_count ?? record.operations?.length ?? 0,
    ),
    createdBy: record.created_by ?? null,
    createdByName: record.created_by_name ?? null,
    createdAt: record.created_at,
    rolledBackAt: record.rolled_back_at ?? null,
    rolledBackBy: record.rolled_back_by ?? null,
  });

  const normalizeImportApproval = (record) => ({
    id: record.id,
    templateId: record.template_id,
    fileName: record.file_name,
    mode: record.mode,
    status: record.status,
    summary: record.summary ?? {},
    rowCount: Number(record.row_count ?? record.rows?.length ?? 0),
    requestedBy: record.requested_by ?? null,
    requestedByName: record.requested_by_name ?? null,
    createdAt: record.created_at,
    decidedAt: record.decided_at ?? null,
    decidedBy: record.decided_by ?? null,
    batchId: record.batch_id ?? null,
  });

  const normalizeMeterReading = (record) => ({
    id: record.id,
    unitId: record.unit_id,
    tenantId: record.tenant_id,
    leaseId: record.lease_id ?? null,
    period: record.period,
    meterType: record.meter_type,
    value: Number(record.value),
    previousValue: Number(record.previous_value ?? 0),
    consumption: Number(
      record.consumption ??
        Math.max(0, Number(record.value) - Number(record.previous_value ?? 0)),
    ),
    tariffRate: Number(record.tariff_rate ?? 0),
    chargeAmount: Number(record.charge_amount ?? 0),
    status: record.status,
    unitNumber: record.unit_number ?? null,
    tenantName: record.tenant_name ?? null,
    contractNumber: record.contract_number ?? null,
    recordedAt: record.recorded_at,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    invoice: record.invoice ? normalizeBillingInvoice(record.invoice) : null,
  });

  const normalizeTicketAttachment = (record) => ({
    id: record.id,
    ticketId: record.ticket_id,
    fileName: record.file_name,
    mimeType: record.mime_type,
    mediaType: record.media_type,
    sizeBytes: Number(record.size_bytes),
    note: record.note ?? "",
    uploadedBy: record.uploaded_by,
    uploadedByName: record.uploaded_by_name ?? null,
    createdAt: record.created_at,
  });

  const sanitizeUser = (user) => ({
    permissions: permissionsFor(user),
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.full_name,
    role: user.role,
    propertyId: user.property_id,
    tenantId: user.tenant_id,
    lastLoginAt: user.last_login_at,
    totpEnabled: Boolean(user.totp_enabled),
  });

  const normalizeNotification = (record) => ({
    id: record.delivery_id ?? record.id,
    tone: record.tone ?? "info",
    title: record.title,
    message: record.message,
    createdAt: record.created_at,
    propertyName: record.property_name ?? null,
    entityType: record.entity_type,
    entityId: record.entity_id,
    unread: Boolean(record.unread),
    deliveryStatus: record.delivery_status ?? "delivered",
  });
  return {
    coerceBoolean,
    normalizeProperty,
    normalizeUnit,
    normalizeTenant,
    normalizeTenantNote,
    normalizeTenantNoteAttachment,
    normalizeLease,
    normalizeTicket,
    normalizeTicketComment,
    normalizeTicketHistory,
    normalizeLeaseDocument,
    normalizeBillingInvoice,
    normalizeBillingPayment,
    normalizeImportBatch,
    normalizeImportApproval,
    normalizeMeterReading,
    normalizeTicketAttachment,
    sanitizeUser,
    normalizeNotification,
  };
}
