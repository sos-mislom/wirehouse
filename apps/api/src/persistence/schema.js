// Explicit storage mapping. Nested documents are JSONB; identities, relations,
// amounts, dates and searchable fields are ordinary typed SQL columns.
const snake = (value) =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
function table(
  fields,
  { key = ["id"], required = [], references = {}, checks = [] } = {},
) {
  const columns = Object.entries(fields).flatMap(([type, names]) =>
    names
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => ({
        name,
        sql: snake(name),
        type,
        required: key.includes(name) || required.includes(name),
        reference: references[name],
      })),
  );
  return { columns, key, checks };
}
export const tables = {
  properties: table(
    {
      text: "id name address warehouse_class description",
      numeric: "total_area rentable_area",
      timestamptz: "created_at updated_at",
    },
    {
      required: ["name", "address", "total_area", "rentable_area"],
      checks: [
        "total_area > 0",
        "rentable_area >= 0 AND rentable_area <= total_area",
      ],
    },
  ),
  tenants: table(
    {
      text: "id name inn contact_name phone email risk_level status",
      timestamptz: "created_at updated_at",
    },
    { required: ["name", "inn", "phone"] },
  ),
  units: table(
    {
      text: "id property_id floor_id number building entrance photo_url type status temperature_regime",
      numeric: "area ceiling_height plan_x plan_y",
      integer: "floor has_ramp has_gate",
      timestamptz: "created_at updated_at",
    },
    {
      required: ["property_id", "number", "area"],
      references: { property_id: "properties", floor_id: "floors" },
      checks: ["area > 0", "has_ramp IN (0,1)", "has_gate IN (0,1)"],
    },
  ),
  users: table(
    {
      text: "id email phone password_hash full_name role property_id tenant_id totp_secret totp_pending_secret specialty",
      integer: "is_active totp_enabled",
      jsonb: "permissions",
      timestamptz: "created_at last_login_at updated_at",
    },
    {
      required: ["full_name", "role", "is_active"],
      references: { property_id: "properties", tenant_id: "tenants" },
      checks: [
        "role IN ('admin','manager','worker','tenant')",
        "is_active IN (0,1)",
        "totp_enabled IN (0,1)",
      ],
    },
  ),
  leases: table(
    {
      text: "id tenant_id unit_id contract_number stage",
      date: "start_date end_date",
      numeric: "rate_per_sqm deposit indexation_pct",
      timestamptz: "created_at updated_at",
    },
    {
      required: [
        "tenant_id",
        "unit_id",
        "contract_number",
        "start_date",
        "end_date",
        "stage",
      ],
      references: { tenant_id: "tenants", unit_id: "units" },
      checks: [
        "end_date >= start_date",
        "rate_per_sqm >= 0",
        "deposit >= 0",
        "stage IN ('draft','formed','sent','signed','active','prolongation','terminated')",
      ],
    },
  ),
  tickets: table(
    {
      text: "id number unit_id property_id tenant_id created_by assigned_to category priority status source_channel title description equipment_id service_id lease_id maintenance_plan_id",
      numeric: "sla_hours",
      timestamptz: "sla_due_at created_at updated_at resolved_at closed_at",
      date: "maintenance_date",
      jsonb: "work_logs checklist_items",
    },
    {
      required: ["number", "unit_id", "property_id", "title", "status"],
      references: {
        unit_id: "units",
        property_id: "properties",
        tenant_id: "tenants",
        created_by: "users",
        assigned_to: "users",
        equipment_id: "equipment",
        service_id: "service_catalog",
        lease_id: "leases",
        maintenance_plan_id: "maintenance_plans",
      },
    },
  ),
  ticket_history: table(
    {
      text: "id ticket_id type from_status to_status reason created_by",
      timestamptz: "created_at",
    },
    {
      required: ["ticket_id"],
      references: { ticket_id: "tickets", created_by: "users" },
    },
  ),
  ticket_comments: table(
    {
      text: "id ticket_id author_id source_channel content",
      timestamptz: "created_at",
    },
    {
      required: ["ticket_id", "author_id", "content"],
      references: { ticket_id: "tickets", author_id: "users" },
    },
  ),
  ticket_attachments: table(
    {
      text: "id ticket_id file_name stored_name mime_type media_type note uploaded_by uploaded_by_name",
      integer: "size_bytes",
      timestamptz: "created_at",
    },
    {
      required: ["ticket_id", "stored_name"],
      references: { ticket_id: "tickets", uploaded_by: "users" },
      checks: ["size_bytes >= 0"],
    },
  ),
  tenant_notes: table(
    {
      text: "id tenant_id title content author_id author_name",
      timestamptz: "created_at updated_at",
    },
    {
      required: ["tenant_id"],
      references: { tenant_id: "tenants", author_id: "users" },
    },
  ),
  tenant_note_attachments: table(
    {
      text: "id note_id tenant_id file_name stored_name mime_type uploaded_by uploaded_by_name",
      integer: "size_bytes",
      timestamptz: "created_at",
    },
    {
      required: ["note_id", "tenant_id", "stored_name"],
      references: {
        note_id: "tenant_notes",
        tenant_id: "tenants",
        uploaded_by: "users",
      },
      checks: ["size_bytes >= 0"],
    },
  ),
  lease_documents: table(
    {
      text: "id lease_id file_name stored_name document_category mime_type uploaded_by uploaded_by_name",
      integer: "size_bytes",
      timestamptz: "created_at",
    },
    {
      required: ["lease_id", "stored_name"],
      references: { lease_id: "leases", uploaded_by: "users" },
      checks: ["size_bytes >= 0"],
    },
  ),
  lease_followups: table(
    {
      text: "leaseId status note updatedBy",
      integer: "version",
      timestamptz: "updatedAt",
    },
    {
      key: ["leaseId"],
      references: { leaseId: "leases", updatedBy: "users" },
      checks: [
        "version > 0",
        "status IN ('pending','contacted','renewing','leaving')",
      ],
    },
  ),
  billing_invoices: table(
    {
      text: "id lease_id tenant_id unit_id period status",
      numeric: "rent_amount variable_amount total_amount",
      date: "due_date",
      timestamptz: "created_at updated_at",
    },
    {
      required: ["lease_id", "tenant_id", "unit_id", "period", "total_amount"],
      references: {
        lease_id: "leases",
        tenant_id: "tenants",
        unit_id: "units",
      },
      checks: [
        "rent_amount >= 0",
        "variable_amount >= 0",
        "total_amount >= 0",
        "period ~ '^\\d{4}-(0[1-9]|1[0-2])$'",
      ],
    },
  ),
  billing_payments: table(
    {
      text: "id invoice_id tenant_id method reference",
      numeric: "amount",
      date: "paid_at",
      timestamptz: "created_at",
    },
    {
      required: ["invoice_id", "tenant_id", "amount"],
      references: { invoice_id: "billing_invoices", tenant_id: "tenants" },
      checks: ["amount > 0"],
    },
  ),
  meter_readings: table(
    {
      text: "id unit_id tenant_id period meter_type status",
      numeric: "value previous_value tariff_rate consumption charge_amount",
      timestamptz: "recorded_at created_at updated_at",
    },
    {
      required: ["unit_id", "tenant_id", "period"],
      references: { unit_id: "units", tenant_id: "tenants" },
      checks: [
        "value >= previous_value",
        "previous_value >= 0",
        "tariff_rate >= 0",
        "charge_amount >= 0",
      ],
    },
  ),
  notification_events: table(
    {
      text: "id type title message tone entity_type entity_id property_id tenant_id created_by",
      timestamptz: "created_at",
    },
    {
      references: {
        property_id: "properties",
        tenant_id: "tenants",
        created_by: "users",
      },
    },
  ),
  notification_deliveries: table(
    {
      text: "id notification_id channel recipient_user_id recipient_email status external_message_id error",
      integer: "attempts",
      timestamptz: "read_at delivered_at created_at updated_at",
    },
    {
      required: ["notification_id"],
      references: {
        notification_id: "notification_events",
        recipient_user_id: "users",
      },
      checks: ["attempts >= 0"],
    },
  ),
  otp_bindings: table(
    {
      text: "id channel phone tenant_id user_id recipient_id display_name",
      timestamptz: "created_at updated_at",
    },
    {
      required: ["channel", "phone", "user_id", "recipient_id"],
      references: { tenant_id: "tenants", user_id: "users" },
    },
  ),
  bot_link_codes: table(
    { text: "hash userId phone channel", timestamptz: "expiresAt" },
    { key: ["hash"], references: { userId: "users" } },
  ),
  password_resets: table(
    {
      text: "id user_id code_hash",
      integer: "attempts",
      timestamptz: "expires_at consumed_at created_at",
    },
    {
      required: ["user_id", "code_hash", "expires_at"],
      references: { user_id: "users" },
      checks: ["attempts >= 0"],
    },
  ),
  import_batches: table(
    {
      text: "id template_id file_name mode created_by created_by_name status rollback_error rolled_back_by",
      jsonb: "summary rows operations",
      timestamptz: "created_at rolled_back_at",
    },
    { references: { created_by: "users", rolled_back_by: "users" } },
  ),
  import_approvals: table(
    {
      text: "id template_id file_name mode content_base64 requested_by requested_by_name status decided_by batch_id",
      jsonb: "summary rows report",
      timestamptz: "created_at decided_at",
    },
    {
      references: {
        requested_by: "users",
        decided_by: "users",
        batch_id: "import_batches",
      },
    },
  ),
  notification_reads: table(
    { text: "userId notificationId version", timestamptz: "readAt" },
    { key: ["userId", "notificationId"], references: { userId: "users" } },
  ),
  // Audit identity is a historical snapshot and intentionally survives account deletion.
  audit_log: table({
    text: "id actorId actorName action entityType entityId",
    jsonb: "changes",
    timestamptz: "createdAt",
  }),
  floor_plans: table(
    {
      text: "id propertyId name createdBy image floorId kind sourceName",
      jsonb: "markers geometry layers",
      integer: "version",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId"],
      references: {
        propertyId: "properties",
        createdBy: "users",
        floorId: "floors",
      },
    },
  ),
  equipment: table(
    {
      text: "id propertyId name createdBy unitId responsibleId type serialNumber specifications photoUrl status",
      numeric: "cost",
      date: "warrantyUntil",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "unitId"],
      references: {
        propertyId: "properties",
        unitId: "units",
        createdBy: "users",
        responsibleId: "users",
      },
      checks: ["cost >= 0"],
    },
  ),
  service_catalog: table(
    {
      text: "id propertyId name createdBy description specialty",
      boolean: "paid active",
      numeric: "hourlyRate basePrice",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId"],
      references: { propertyId: "properties", createdBy: "users" },
      checks: ["hourly_rate >= 0", "base_price >= 0"],
    },
  ),
  maintenance_plans: table(
    {
      text: "id propertyId name createdBy unitId responsibleId equipmentId instructions templateId recurrence",
      integer: "intervalCount anchorDay templateVersion leadDays",
      date: "nextDate endDate",
      boolean: "active",
      jsonb: "checklist",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "unitId", "nextDate", "intervalCount"],
      references: {
        propertyId: "properties",
        unitId: "units",
        createdBy: "users",
        responsibleId: "users",
        equipmentId: "equipment",
        templateId: "maintenance_templates",
      },
      checks: ["interval_count BETWEEN 1 AND 3660"],
    },
  ),
  meters: table(
    {
      text: "id propertyId name createdBy unitId responsibleId scope resource serialNumber",
      numeric: "tariff initialValue",
      boolean: "active",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId"],
      references: {
        propertyId: "properties",
        unitId: "units",
        createdBy: "users",
        responsibleId: "users",
      },
      checks: ["tariff >= 0", "initial_value >= 0"],
    },
  ),
  resource_readings: table(
    {
      text: "id meterId propertyId period createdBy",
      numeric: "previous value consumption tariff amount unallocated",
      jsonb: "allocations",
      timestamptz: "createdAt",
    },
    {
      required: ["meterId", "propertyId", "period"],
      references: {
        meterId: "meters",
        propertyId: "properties",
        createdBy: "users",
      },
      checks: ["value >= previous", "previous >= 0", "amount >= 0"],
    },
  ),
  announcements: table(
    {
      text: "id propertyId name createdBy content tone audience",
      boolean: "published",
      date: "expiresAt",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId"],
      references: { propertyId: "properties", createdBy: "users" },
    },
  ),
  operating_expenses: table(
    {
      text: "id propertyId name createdBy category note",
      numeric: "amount",
      date: "date",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId"],
      references: { propertyId: "properties", createdBy: "users" },
      checks: ["amount >= 0"],
    },
  ),
  auth_challenges: table(
    { text: "key namespace", jsonb: "value", timestamptz: "expiresAt" },
    { key: ["namespace", "key"], required: ["value", "expiresAt"] },
  ),
  buildings: table(
    { text: "id propertyId name", timestamptz: "createdAt updatedAt" },
    {
      required: ["propertyId", "name"],
      references: { propertyId: "properties" },
    },
  ),
  entrances: table(
    {
      text: "id propertyId buildingId name",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "buildingId", "name"],
      references: { propertyId: "properties", buildingId: "buildings" },
    },
  ),
  floors: table(
    {
      text: "id propertyId entranceId name",
      integer: "number",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "entranceId", "number", "name"],
      references: { propertyId: "properties", entranceId: "entrances" },
    },
  ),
  maintenance_templates: table(
    {
      text: "id propertyId name instructions",
      integer: "version",
      jsonb: "checklist",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "name", "version"],
      references: { propertyId: "properties" },
    },
  ),
  contractors: table(
    {
      text: "id propertyId name inn contact",
      boolean: "active",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "name"],
      references: { propertyId: "properties" },
    },
  ),
  materials: table(
    {
      text: "id propertyId name unit",
      numeric: "price",
      boolean: "active",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "name", "unit", "price"],
      references: { propertyId: "properties" },
      checks: ["price >= 0"],
    },
  ),
  estimates: table(
    {
      text: "id propertyId ticketId contractorId status name createdBy submittedBy approvedBy rejectionReason",
      integer: "version",
      jsonb: "lines",
      numeric: "total",
      timestamptz: "createdAt updatedAt approvedAt",
    },
    {
      required: [
        "propertyId",
        "ticketId",
        "status",
        "version",
        "lines",
        "total",
      ],
      references: {
        propertyId: "properties",
        ticketId: "tickets",
        contractorId: "contractors",
        createdBy: "users",
        submittedBy: "users",
        approvedBy: "users",
      },
      checks: [
        "total >= 0",
        "status IN ('draft','submitted','approved','rejected','acted')",
      ],
    },
  ),
  service_acts: table(
    {
      text: "id propertyId estimateId ticketId number issuedBy",
      integer: "estimateVersion",
      jsonb: "snapshot",
      numeric: "total",
      date: "date",
      timestamptz: "createdAt",
    },
    {
      required: [
        "propertyId",
        "estimateId",
        "ticketId",
        "number",
        "snapshot",
        "total",
      ],
      references: {
        propertyId: "properties",
        estimateId: "estimates",
        ticketId: "tickets",
        issuedBy: "users",
      },
    },
  ),
};
export const emptyData = () =>
  Object.fromEntries(Object.keys(tables).map((name) => [name, []]));
export const quote = (name) => `"${name.replaceAll('"', '""')}"`;
export const relation = (name) => `warehouse.${quote(name)}`;
export const rowKey = (table, row) =>
  JSON.stringify(table.key.map((key) => row[key]));

export function encodeRow(name, row) {
  const table = tables[name];
  const unknown = Object.keys(row).filter(
    (key) => !table.columns.some((column) => column.name === key),
  );
  if (unknown.length)
    throw new Error(`Unknown storage fields: ${name}.${unknown.join(",")}`);
  return table.columns.map((column) => {
    const value = row[column.name];
    if (value == null) return null;
    if (
      ["numeric", "integer"].includes(column.type) &&
      (typeof value !== "number" || !Number.isFinite(value))
    )
      throw new Error(`Invalid numeric storage field: ${name}.${column.name}`);
    if (column.type === "jsonb") return JSON.stringify(value);
    if (column.type === "timestamptz") return new Date(value).toISOString();
    return value;
  });
}
export function decodeRow(name, row) {
  return Object.fromEntries(
    tables[name].columns.map((column) => [column.name, row[column.sql]]),
  );
}
