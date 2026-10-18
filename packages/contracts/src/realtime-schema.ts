import { z } from "zod";
export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("authenticate"),
      protocol: z.literal(1),
      token: z.string().min(1).max(3500),
    })
    .strict(),
  z.object({ type: z.literal("check") }).strict(),
]);
