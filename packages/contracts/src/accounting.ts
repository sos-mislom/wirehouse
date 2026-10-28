import { z } from "zod";
export const identity = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
export const label = z.string().trim().min(1).max(300);
export const note = z.string().trim().max(10000);
export const environment = z.enum(["test", "production"]);
export const entityType = z.enum([
  "properties",
  "units",
  "tenants",
  "leases",
  "meters",
  "personal_accounts",
]);
const stamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
export const sourceInput = z.strictObject({
  name: label,
  environment,
  active: z.boolean(),
  updatedAt: stamp.optional(),
});
export const accountInput = z
  .strictObject({
    sourceId: identity,
    externalId: label,
    leaseId: identity,
    number: label,
    validFrom: date,
    validTo: date.nullable(),
    status: z.enum(["active", "closed"]),
    updatedAt: stamp.optional(),
  })
  .refine(
    (v) => !v.validTo || v.validTo >= v.validFrom,
    "Конец периода раньше начала",
  );
export const linkInput = z.strictObject({
  sourceId: identity,
  entityType,
  externalId: label,
  localId: identity,
  version: z.number().int().nonnegative(),
});
export const statementInput = z
  .strictObject({
    externalId: label,
    accountExternalId: label,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    opening: z.number().finite().min(-1e12).max(1e12),
    charged: z.number().finite().min(-1e12).max(1e12),
    paid: z.number().finite().min(-1e12).max(1e12),
    closing: z.number().finite().min(-1e12).max(1e12),
    lines: z
      .array(
        z.strictObject({
          service: label,
          amount: z.number().finite().min(-1e12).max(1e12),
        }),
      )
      .max(500),
    asOf: stamp,
    version: z.number().int().positive(),
  })
  .refine(
    (v) => Math.abs(v.opening + v.charged - v.paid - v.closing) < 0.011,
    "Остаток не сходится с начислениями и оплатами",
  );
export const accountExchangeInput = z.strictObject({
  externalId: label,
  leaseExternalId: label,
  number: label,
  validFrom: date,
  validTo: date.nullable(),
  status: z.enum(["active", "closed"]),
  version: z.number().int().positive(),
});
// Only source-owned fields are accepted. Layout, availability and access rights
// stay in the operational contour. References always use this source's IDs.
const area = z.number().finite().positive().max(1e12);
export const propertyExchangeInput = z
  .strictObject({
    externalId: label,
    version: z.number().int().positive(),
    name: label,
    address: label,
    totalArea: area,
    rentableArea: z.number().finite().nonnegative().max(1e12),
    warehouseClass: z.enum(["A+", "A", "B+", "B", "C", "D"]),
  })
  .refine(
    (v) => v.rentableArea <= v.totalArea,
    "Арендуемая площадь больше общей",
  );
export const unitExchangeInput = z.strictObject({
  externalId: label,
  version: z.number().int().positive(),
  propertyExternalId: label,
  number: label,
  floor: z.number().int().min(-10).max(300),
  area,
  type: z.enum(["warm", "cold", "freezer", "open", "office"]),
  building: z.string().trim().max(300),
  entrance: z.string().trim().max(300),
});
export const tenantExchangeInput = z.strictObject({
  externalId: label,
  version: z.number().int().positive(),
  name: label,
  inn: z.string().regex(/^(\d{10}|\d{12})?$/),
  contactName: z.string().trim().max(300),
  phone: z.string().trim().max(100),
  email: z.union([z.literal(""), z.email()]),
});
export const leaseExchangeInput = z
  .strictObject({
    externalId: label,
    version: z.number().int().positive(),
    tenantExternalId: label,
    unitExternalId: label,
    contractNumber: label,
    startDate: date,
    endDate: date,
    stage: z.enum([
      "draft",
      "formed",
      "sent",
      "signed",
      "active",
      "prolongation",
      "terminated",
    ]),
    ratePerSqm: z.number().finite().nonnegative().max(1e12),
    deposit: z.number().finite().nonnegative().max(1e12),
    indexationPct: z.number().finite().min(0).max(100),
  })
  .refine((v) => v.endDate >= v.startDate, "Конец договора раньше начала");
export const meterExchangeInput = z
  .strictObject({
    externalId: label,
    version: z.number().int().positive(),
    propertyExternalId: label,
    unitExternalId: label.nullable(),
    name: label,
    resource: z.enum(["electricity", "water", "heating"]),
    scope: z.enum(["individual", "common"]),
    serialNumber: z.string().trim().max(300),
    initialValue: z.number().finite().nonnegative().max(1e12),
    tariff: z.number().finite().nonnegative().max(1e12),
    active: z.boolean(),
  })
  .refine(
    (v) => v.scope === "common" || v.unitExternalId !== null,
    "Укажите помещение прибора",
  );
export const exchangeMessage = z.strictObject({
  messageId: identity,
  environment,
  schemaVersion: z.literal(1),
  kind: z.enum([
    "properties",
    "units",
    "tenants",
    "leases",
    "meters",
    "accounts",
    "statements",
  ]),
  items: z.array(z.unknown()).min(1).max(500),
});
export type AccountingSource = z.infer<typeof sourceInput> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  tokenConfigured: boolean;
  lastSeenAt?: string | null;
  lastSuccessfulAt?: string | null;
  lastError?: string | null;
};
export type PersonalAccount = z.infer<typeof accountInput> & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};
export type AccountStatement = z.infer<typeof statementInput> & {
  id: string;
  accountId: string;
  sourceId: string;
  updatedAt: string;
};
export type ExternalLink = z.infer<typeof linkInput> & {
  id: string;
  updatedAt: string;
};
export type ExchangeEvent = {
  id: string;
  sourceId: string;
  messageId: string;
  kind: string;
  status: "pending" | "applied" | "failed";
  attempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string | null;
  result: { created: number; updated: number; skipped: number } | null;
};
export type AccountingWorkspace = {
  sources: AccountingSource[];
  accounts: PersonalAccount[];
  statements: AccountStatement[];
  links: ExternalLink[];
};
export type ExchangeJournalItem = ExchangeEvent & {
  direction: "inbox" | "outbox";
  sourceName: string;
};
export const accountingContracts = [
  {
    method: "POST",
    path: /^\/api\/integrations\/accounting\/[a-zA-Z0-9-]+\/runs$/,
    schema: z.strictObject({
      runId: identity,
      status: z.enum(["ok", "failed"]),
      error: z
        .string()
        .regex(/^[A-Z0-9_]{1,100}$/)
        .nullable(),
      sent: z.number().int().nonnegative().max(10000),
      received: z.number().int().nonnegative().max(10000),
      rejected: z.number().int().nonnegative().max(10000),
    }),
  },
  { method: "POST", path: /^\/api\/accounting\/sources$/, schema: sourceInput },
  {
    method: "PUT",
    path: /^\/api\/accounting\/sources\/[a-zA-Z0-9-]+$/,
    schema: sourceInput,
  },
  {
    method: "POST",
    path: /^\/api\/accounting\/accounts$/,
    schema: accountInput,
  },
  {
    method: "PUT",
    path: /^\/api\/accounting\/accounts\/[a-zA-Z0-9-]+$/,
    schema: accountInput,
  },
  { method: "POST", path: /^\/api\/accounting\/links$/, schema: linkInput },
  {
    method: "POST",
    path: /^\/api\/accounting\/sources\/[a-zA-Z0-9-]+\/messages$/,
    schema: exchangeMessage,
  },
  {
    method: "POST",
    path: /^\/api\/accounting\/sources\/[a-zA-Z0-9-]+\/token$/,
    schema: z.strictObject({}),
  },
  {
    method: "POST",
    path: /^\/api\/accounting\/(inbox|outbox)\/[a-zA-Z0-9-]+\/retry$/,
    schema: z.strictObject({}),
  },
  {
    method: "POST",
    path: /^\/api\/integrations\/accounting\/[a-zA-Z0-9-]+\/outbox\/claim$/,
    schema: z.strictObject({
      limit: z.number().int().min(1).max(100),
      kinds: z
        .array(
          z.enum(["readings", "work_results", "work_reopened", "service_acts"]),
        )
        .min(1)
        .max(4)
        .optional(),
    }),
  },
  {
    method: "POST",
    path: /^\/api\/integrations\/accounting\/[a-zA-Z0-9-]+\/outbox\/[a-zA-Z0-9-]+\/ack$/,
    schema: z.strictObject({ accepted: z.boolean(), error: note.optional() }),
  },
  {
    method: "POST",
    path: /^\/api\/integrations\/accounting\/[a-zA-Z0-9-]+\/messages$/,
    schema: exchangeMessage,
  },
];
