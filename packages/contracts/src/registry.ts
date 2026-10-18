import { z } from "zod";

export const pageQuery = z.strictObject({
  q: z.string().trim().max(200).default(""),
  offset: z.coerce.number().int().min(0).max(10_000_000).default(0),
  limit: z.coerce
    .number()
    .refine((n) => [10, 25, 50, 100].includes(n))
    .default(25),
});
export const exchangePageQuery = pageQuery.extend({
  direction: z.enum(["", "inbox", "outbox"]).default(""),
  status: z.enum(["", "pending", "applied", "failed"]).default(""),
  sourceId: z
    .string()
    .max(100)
    .regex(/^[a-zA-Z0-9-]*$/)
    .default(""),
});
export type PageQuery = z.infer<typeof pageQuery>;
export type Page<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};
export type AuditEvent = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  changes: unknown;
};
