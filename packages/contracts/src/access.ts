import { z } from "zod";
import { permissionKeys, rolePermissions } from "./permissions.ts";
import { identity, note } from "./accounting.ts";
export const businessRolePermissions = {
  owner: [
    "workspace.read",
    "tickets.write",
    "finance.read",
    "readings.submit",
    "work.approve",
    "tickets.accept",
    "documents.read",
  ],
  tenant: [
    "workspace.read",
    "tickets.write",
    "finance.read",
    "readings.submit",
    "work.approve",
    "tickets.accept",
    "documents.read",
  ],
  manager: rolePermissions.manager,
  worker: rolePermissions.worker,
} as const;
export const assignmentInput = z
  .strictObject({
    userId: identity,
    businessRole: z.enum(["owner", "tenant", "manager", "worker"]),
    scopeType: z.enum(["property", "unit", "lease", "account"]),
    scopeId: identity,
    permissions: z
      .array(z.enum(permissionKeys))
      .min(1)
      .max(permissionKeys.length)
      .refine((a) => new Set(a).size === a.length, "Повторное право"),
    validFrom: z.iso.date(),
    validTo: z.iso.date().nullable(),
    retainHistory: z.boolean(),
    reason: note.refine((v) => v.length > 0, "Укажите основание"),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (v) => !v.validTo || v.validTo >= v.validFrom,
    "Конец доступа раньше начала",
  );
export type Assignment = z.infer<typeof assignmentInput> & {
  id: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  createdBy: string | null;
  revokedBy: string | null;
};
export const accessContracts = [
  {
    method: "POST",
    path: /^\/api\/access\/assignments$/,
    schema: assignmentInput,
  },
  {
    method: "PUT",
    path: /^\/api\/access\/assignments\/[a-zA-Z0-9-]+$/,
    schema: assignmentInput,
  },
  {
    method: "POST",
    path: /^\/api\/access\/assignments\/[a-zA-Z0-9-]+\/revoke$/,
    schema: z.strictObject({
      reason: note.refine((v) => v.length > 0, "Укажите причину"),
    }),
  },
];
