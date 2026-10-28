import { z } from "zod";
import { identity, label, note } from "./accounting.ts";
import { MAX_WORK_AMOUNT } from "./operations-platform.ts";
const timestamp = z.iso.datetime({ offset: true });
const reason = note.refine((v) => v.length > 0, "Укажите причину");
const dispatchCategory = z.enum([
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
export const teamInput = z.strictObject({
  propertyId: identity,
  name: label,
  memberIds: z
    .array(identity)
    .max(100)
    .refine((v) => new Set(v).size === v.length),
  active: z.boolean(),
  updatedAt: timestamp.nullable(),
});
export const dispatchRuleInput = z.strictObject({
  propertyId: identity,
  category: dispatchCategory,
  teamId: identity,
  reviewerId: identity,
  active: z.boolean(),
  updatedAt: timestamp.nullable(),
});
export type ServiceTeam = z.infer<typeof teamInput> & {
  id: string;
  updatedAt: string;
  createdAt: string;
};
export type DispatchRule = z.infer<typeof dispatchRuleInput> & {
  id: string;
  updatedAt: string;
  createdAt: string;
};
export const documentEntity = z.enum([
  "properties",
  "buildings",
  "units",
  "equipment",
  "leases",
  "personal_accounts",
  "tickets",
  "meters",
]);
export const documentLink = z.strictObject({
  entityType: documentEntity,
  entityId: identity,
  phase: z.enum(["general", "before", "after"]).default("general"),
});
export const documentInput = z.strictObject({
  name: label,
  category: z.enum(["contract", "act", "instruction", "photo", "other"]),
  links: z.array(documentLink).min(1).max(20),
  fileName: label,
  mimeType: label,
  contentBase64: z.string().min(4).max(17_000_000),
});
export const termsInput = z
  .strictObject({
    updatedAt: timestamp,
    paid: z.boolean(),
    amount: z.number().finite().min(0).max(MAX_WORK_AMOUNT),
    accountId: identity.nullable(),
    requireBeforePhoto: z.boolean(),
    requireAfterPhoto: z.boolean(),
  })
  .refine(
    (v) => (v.paid ? v.amount > 0 && v.accountId !== null : v.amount === 0),
    "Для платной работы нужны сумма и ЛС; для бесплатной сумма должна быть нулевой",
  );
export const decisionInput = z
  .strictObject({
    updatedAt: timestamp,
    action: z.enum([
      "approve",
      "decline",
      "start",
      "pause",
      "resume",
      "submit",
      "accept",
      "return",
      "close",
      "refuse",
    ]),
    reason: note.default(""),
  })
  .refine(
    (v) =>
      !["decline", "pause", "return", "refuse"].includes(v.action) ||
      v.reason.length > 0,
    "Укажите причину",
  );
export type TicketTermsInput = z.infer<typeof termsInput>;
export const readingPeriodInput = z
  .strictObject({
    propertyId: identity,
    name: label,
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    photoRequired: z.boolean(),
    thresholdPercent: z.number().finite().min(1).max(10000),
  })
  .refine(
    (v) =>
      v.endsOn >= v.startsOn && v.startsOn.slice(0, 7) === v.endsOn.slice(0, 7),
    "Период ввода должен быть внутри одного месяца",
  );
export const readingInput = z.strictObject({
  meterId: identity,
  periodId: identity,
  accountId: identity.nullable(),
  photoDocumentId: identity.nullable(),
  value: z.number().finite().min(0).max(1e12),
});
export const readingReviewInput = z.strictObject({
  updatedAt: timestamp,
  accepted: z.boolean(),
  reason: note,
});
export const maintenanceChangeInput = z.strictObject({
  updatedAt: timestamp,
  toDate: timestamp.nullable(),
  reason,
  remark: note,
});
export const participantInput = z.strictObject({
  fullName: label,
  email: z.email(),
  phone: z.string().regex(/^\+?[\d ()-]{10,25}$/),
  password: z.string().min(10).max(256),
});
export type DocumentLink = {
  id: string;
  documentId: string;
  entityType: z.infer<typeof documentEntity>;
  entityId: string;
  phase: "general" | "before" | "after";
  revision: number | null;
  createdAt: string;
};
export type EntityDocument = {
  id: string;
  propertyId: string;
  name: string;
  category: string;
  mimeType: string;
  sizeBytes: number | null;
  url: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  links: DocumentLink[];
};
export type TicketWorkflow = {
  teamId: string | null;
  reviewerId: string | null;
  ticketId: string;
  accountId: string | null;
  estimateId: string | null;
  paid: boolean;
  amount: number;
  requireBeforePhoto: boolean;
  requireAfterPhoto: boolean;
  termsVersion: number;
  approvedVersion: number | null;
  resultVersion: number;
  state: string;
  pauseReason: string | null;
  approvalBy: string | null;
  acceptanceBy: string | null;
  updatedAt: string;
};
export type TicketDecision = {
  id: string;
  ticketId: string;
  action: string;
  actorId: string;
  reason: string;
  termsVersion: number;
  resultVersion: number;
  createdAt: string;
};
export type ReadingPeriod = z.infer<typeof readingPeriodInput> & {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
export type ReadingSubmission = z.infer<typeof readingInput> & {
  id: string;
  propertyId: string;
  submittedBy: string;
  reviewedBy: string | null;
  status: "pending" | "accepted" | "rejected";
  reason: string | null;
  previous: number;
  anomaly: boolean;
  sourceId: string | null;
  outboxId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};
export const businessWorkflowContracts = [
  {
    method: "POST",
    path: /^\/api\/dispatch\/teams(?:\/[a-zA-Z0-9-]+)?$/,
    schema: teamInput,
  },
  {
    method: "POST",
    path: /^\/api\/dispatch\/rules(?:\/[a-zA-Z0-9-]+)?$/,
    schema: dispatchRuleInput,
  },
  { method: "POST", path: /^\/api\/documents$/, schema: documentInput },
  {
    method: "POST",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+\/workflow\/terms$/,
    schema: termsInput,
  },
  {
    method: "POST",
    path: /^\/api\/tickets\/[a-zA-Z0-9-]+\/workflow\/decision$/,
    schema: decisionInput,
  },
  {
    method: "POST",
    path: /^\/api\/readings\/periods$/,
    schema: readingPeriodInput,
  },
  {
    method: "POST",
    path: /^\/api\/readings\/submissions$/,
    schema: readingInput,
  },
  {
    method: "POST",
    path: /^\/api\/readings\/submissions\/[a-zA-Z0-9-]+\/review$/,
    schema: readingReviewInput,
  },
  {
    method: "POST",
    path: /^\/api\/maintenance\/tickets\/[a-zA-Z0-9-]+\/change$/,
    schema: maintenanceChangeInput,
  },
  {
    method: "POST",
    path: /^\/api\/access\/participants$/,
    schema: participantInput,
  },
];
