import { z } from "zod";

// Wire DTOs are strict: IDs and dates are strings, quantities are JSON numbers.
// Form-string conversion belongs to the browser, never to the API boundary.
const text = z.string().trim().max(10000);
const name = text.min(1).max(300);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9-]+$/);
const optionalId = id.nullable().optional();
const number = z.number().finite().min(0).max(1e12);
const date = z.iso.date();
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const timestamp = z.iso.datetime({ offset: true });
const email = z.email().max(254);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d ()-]{10,25}$/);
const password = z.string().min(10).max(256);
const role = z.enum(["admin", "manager", "worker", "tenant"]);
const resource = z.enum(["electricity", "water", "heating"]);
const specialty = z.enum([
  "",
  "plumber",
  "electrician",
  "technician",
  "builder",
  "cleaner",
  "contractor",
  "engineer",
  "dispatcher",
]);
const status = z.enum([
  "new",
  "accepted",
  "in_progress",
  "completed",
  "closed",
  "rejected",
  "deferred",
  "waiting_tenant",
  "resolved",
]);
const category = z.enum([
  "gates_ramps",
  "electrical",
  "plumbing",
  "heating",
  "security",
  "territory",
  "loading_equipment",
  "ventilation",
  "maintenance",
  "billing",
  "access",
  "damage",
  "cleaning",
  "other",
]);
const source = z.enum(["web", "android", "desktop", "telegram", "vk", "phone"]);
const photo = z
  .string()
  .max(12 * 1024 * 1024)
  .refine(
    (v) =>
      !v ||
      /^https:\/\//.test(v) ||
      /^data:image\/(png|jpeg|webp);base64,/.test(v),
    "Укажите HTTPS-ссылку или изображение",
  );
const optionalDate = date.nullable().optional();
const stamp = { updatedAt: timestamp.optional() };
const base = { propertyId: id, name, ...stamp };

export const propertyCreate = z.strictObject({
  name,
  address: name,
  totalArea: number.positive(),
  rentableArea: number,
  warehouseClass: z.enum(["A+", "A", "B+", "B", "C", "D"]),
  description: text.optional(),
});
export const unitCreate = z.strictObject({
  propertyId: id,
  number: name,
  floor: z.number().int().min(-10).max(300),
  area: number.positive(),
  type: z.enum(["warm", "cold", "freezer", "open", "office"]),
  status: z.enum(["vacant", "occupied", "maintenance"]),
  building: text.optional(),
  entrance: text.optional(),
  planX: number.max(100).optional(),
  planY: number.max(100).optional(),
  photoUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ })]).optional(),
  ceilingHeight: number.optional(),
  temperatureRegime: text.optional(),
  hasRamp: z.boolean().optional(),
  hasGate: z.boolean().optional(),
});
export const tenantCreate = z.strictObject({
  name,
  inn: z.string().regex(/^(\d{10}|\d{12})$/),
  contactName: name,
  phone,
  email,
  riskLevel: z.enum(["low", "medium", "high"]),
  legalAddress: text.optional(),
  actualAddress: text.optional(),
  bankDetails: text.optional(),
  notes: text.optional(),
});
export const leaseCreate = z.strictObject({
  tenantId: id,
  unitId: id,
  contractNumber: name,
  stage: z.enum([
    "draft",
    "formed",
    "sent",
    "signed",
    "active",
    "prolongation",
    "terminated",
  ]),
  startDate: date,
  endDate: date,
  ratePerSqm: number,
  deposit: number.optional(),
  indexationPct: number.max(100).optional(),
});
export const ticketCreate = z.strictObject({
  unitId: id,
  tenantId: optionalId,
  assignedTo: optionalId,
  category,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: status.optional(),
  sourceChannel: source.optional(),
  title: name,
  description: text.min(1),
  equipmentId: optionalId,
  serviceId: optionalId,
  leaseId: optionalId,
  slaHours: number.positive().max(8760).optional(),
  slaDueAt: timestamp.optional(),
});
export const ticketUpdate = ticketCreate
  .partial()
  .extend({
    reopenReason: text.optional(),
    resetChecklist: z.boolean().optional(),
  });
export const userCreate = z.strictObject({
  fullName: name,
  email,
  password,
  phone: phone.nullable().optional(),
  role: z.enum(["admin", "manager", "worker"]),
  propertyId: optionalId,
});
export const userUpdate = z.strictObject({
  fullName: name.optional(),
  email: email.or(z.literal("")).nullable().optional(),
  password: password.optional(),
  phone: phone.or(z.literal("")).nullable().optional(),
  role: role.optional(),
  propertyId: optionalId,
  specialty: specialty.optional(),
  isActive: z.boolean().optional(),
});

export const operationSchemas = {
  equipment: z.strictObject({
    ...base,
    unitId: id,
    responsibleId: optionalId,
    type: name,
    serialNumber: text.optional(),
    specifications: text.optional(),
    warrantyUntil: optionalDate,
    cost: number.optional(),
    photoUrl: photo.optional(),
    status: z.enum(["active", "maintenance", "retired"]).optional(),
  }),
  services: z.strictObject({
    ...base,
    paid: z.boolean().optional(),
    hourlyRate: number.optional(),
    basePrice: number.optional(),
    description: text.optional(),
    specialty: specialty.optional(),
    active: z.boolean().optional(),
  }),
  plans: z.strictObject({
    ...base,
    unitId: id,
    responsibleId: optionalId,
    equipmentId: optionalId,
    nextDate: date,
    intervalDays: z.number().int().min(1).max(3660),
    checklist: z.array(name).min(1).max(100),
    instructions: text.optional(),
    active: z.boolean().optional(),
  }),
  meters: z.strictObject({
    ...base,
    unitId: optionalId,
    scope: z.enum(["individual", "common"]).optional(),
    resource,
    serialNumber: text.optional(),
    tariff: number,
    initialValue: number.optional(),
    responsibleId: optionalId,
    active: z.boolean().optional(),
  }),
  news: z.strictObject({
    ...base,
    content: text.min(1),
    tone: z.enum(["info", "warning", "critical", "success"]).optional(),
    audience: z.enum(["all", "staff", "tenants"]).optional(),
    published: z.boolean().optional(),
    expiresAt: optionalDate,
  }),
  expenses: z.strictObject({
    ...base,
    amount: number.positive(),
    date,
    category: name.optional(),
  }),
  floorplans: z.strictObject({
    ...base,
    image: photo,
    markers: z
      .array(
        z.strictObject({ unitId: id, x: number.max(100), y: number.max(100) }),
      )
      .max(2000),
  }),
};
export const readingCreate = z.strictObject({ period, value: number });
export const workLogCreate = z.strictObject({
  description: text.min(1),
  hours: number.max(744).optional(),
  materialCost: number.optional(),
});
export const linkCodeCreate = z.strictObject({
  channel: z.enum(["telegram", "vk"]),
  userId: id.optional(),
});
export const renewalUpdate = z.strictObject({
  status: z.enum(["pending", "contacted", "renewing", "leaving"]),
  note: text.max(2000),
  version: z.number().int().min(0),
});
export const agendaQuery = z.strictObject({
  days: z.enum(["7", "30", "60", "90"]).optional(),
  propertyId: id.optional(),
});
const attachment = z.strictObject({
  fileName: name,
  mimeType: name,
  contentBase64: z
    .string()
    .min(1)
    .max(140 * 1024 * 1024),
});
const empty = z.strictObject({});
const otp = z.string().regex(/^\d{4,8}$/);
export const requestContracts: {
  method: string;
  path: RegExp;
  schema: z.ZodType;
}[] = [
  {
    method: "POST",
    path: /^\/api\/auth\/staff\/login$/,
    schema: z.strictObject({ email, password: z.string().min(1).max(256) }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/staff\/verify-2fa$/,
    schema: z.strictObject({
      mfaToken: z.string().min(1).max(1000),
      code: otp,
    }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/password-reset\/request$/,
    schema: z.strictObject({ email }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/password-reset\/confirm$/,
    schema: z.strictObject({ email, code: otp, password }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/tenant\/request-otp$/,
    schema: z.strictObject({ phone }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/tenant\/verify-otp$/,
    schema: z.strictObject({ phone, otp }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/2fa\/confirm$/,
    schema: z.strictObject({ code: otp }),
  },
  {
    method: "POST",
    path: /^\/api\/auth\/2fa\/disable$/,
    schema: z.strictObject({ password: z.string().min(1).max(256), code: otp }),
  },
  {
    method: "POST",
    path: /^\/api\/integrations\/link-code$/,
    schema: linkCodeCreate,
  },
  ...Object.entries({
    properties: propertyCreate,
    units: unitCreate,
    tenants: tenantCreate,
    leases: leaseCreate,
  }).flatMap(([collection, schema]) => [
    { method: "POST", path: new RegExp(`^/api/${collection}$`), schema },
    {
      method: "PUT",
      path: new RegExp(`^/api/${collection}/[a-zA-Z0-9-]+$`),
      schema: schema.partial(),
    },
  ]),
  { method: "POST", path: /^\/api\/users$/, schema: userCreate },
  { method: "PUT", path: /^\/api\/users\/[a-zA-Z0-9-]+$/, schema: userUpdate },
  ...Object.entries(operationSchemas).flatMap(([kind, schema]) => [
    { method: "POST", path: new RegExp(`^/api/operations/${kind}$`), schema },
    {
      method: "PUT",
      path: new RegExp(`^/api/operations/${kind}/[a-zA-Z0-9-]+$`),
      schema: schema.partial(),
    },
  ]),
  {
    method: "POST",
    path: /^\/api\/operations\/meters\/[a-zA-Z0-9-]+\/readings$/,
    schema: readingCreate,
  },
  {
    method: "POST",
    path: /^\/api\/operations\/tickets\/[a-zA-Z0-9-]+\/work$/,
    schema: workLogCreate,
  },
  {
    method: "PUT",
    path: /^\/api\/leases\/[a-zA-Z0-9-]+\/renewal$/,
    schema: renewalUpdate,
  },
  {
    method: "POST",
    path: /^\/api\/units\/[a-zA-Z0-9-]+\/split$/,
    schema: z.strictObject({
      number: name,
      area: number.positive(),
      type: unitCreate.shape.type.optional(),
      status: unitCreate.shape.status.optional(),
    }),
  },
  { method: "POST", path: /^\/api\/tickets$/, schema: ticketCreate },
  {
    method: "PUT",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+$/,
    schema: ticketUpdate,
  },
  {
    method: "POST",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+\/comments$/,
    schema: z.strictObject({ content: text.min(1) }),
  },
  {
    method: "PUT",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+\/checklist\/[a-zA-Z0-9-]+$/,
    schema: z.strictObject({ completed: z.boolean() }),
  },
  {
    method: "POST",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+\/attachments$/,
    schema: attachment.extend({ note: text.optional() }),
  },
  {
    method: "POST",
    path: /^\/api\/leases\/[a-zA-Z0-9-]+\/documents$/,
    schema: attachment.extend({ category: text.optional() }),
  },
  {
    method: "POST",
    path: /^\/api\/tenant-notes\/[a-zA-Z0-9-]+\/attachments$/,
    schema: attachment,
  },
  {
    method: "POST",
    path: /^\/api\/tenants\/[a-zA-Z0-9-]+\/notes$/,
    schema: z.strictObject({ title: name, content: text.min(1) }),
  },
  {
    method: "POST",
    path: /^\/api\/billing\/invoices$/,
    schema: z.strictObject({
      leaseId: id,
      period,
      dueDate: date,
      rentAmount: number.optional(),
      variableAmount: number.optional(),
      totalAmount: number.optional(),
    }),
  },
  {
    method: "POST",
    path: /^\/api\/billing\/invoices\/[a-zA-Z0-9-]+\/payments$/,
    schema: z.strictObject({
      amount: number.positive(),
      paidAt: date,
      method: z.enum(["bank_transfer", "cash", "card", "other"]),
      reference: text.optional(),
    }),
  },
  {
    method: "POST",
    path: /^\/api\/meter-readings$/,
    schema: z.strictObject({
      unitId: id,
      tenantId: id.optional(),
      period,
      meterType: resource,
      value: number,
      previousValue: number.optional(),
      tariffRate: number.optional(),
      chargeAmount: number.optional(),
      recordedAt: timestamp.optional(),
    }),
  },
  {
    method: "POST",
    path: /^\/api\/imports\/[a-zA-Z0-9-]+$/,
    schema: z.strictObject({
      fileName: name,
      contentBase64: z
        .string()
        .min(1)
        .max(140 * 1024 * 1024),
      dryRun: z.boolean().optional(),
      mode: z.enum(["create", "update", "upsert"]).optional(),
    }),
  },
  { method: "POST", path: /^\/api\/auth\/2fa\/setup$/, schema: empty },
];
export type PropertyCreateDto = z.infer<typeof propertyCreate>;
export type UnitCreateDto = z.infer<typeof unitCreate>;
export type TenantCreateDto = z.infer<typeof tenantCreate>;
export type LeaseCreateDto = z.infer<typeof leaseCreate>;
export type TicketCreateDto = z.infer<typeof ticketCreate>;
export type UserUpdateDto = z.infer<typeof userUpdate>;
export type OperationKind = keyof typeof operationSchemas;
export type OperationDto<K extends OperationKind> = z.infer<
  (typeof operationSchemas)[K]
>;
export type RenewalUpdateDto = z.infer<typeof renewalUpdate>;
export type ApiErrorDto = {
  error: string;
  code: string;
  fields?: { path: string; message: string }[];
};
