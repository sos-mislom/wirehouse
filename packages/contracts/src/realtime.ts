export const realtimeResources = [
  "workspace",
  "session",
  "operations",
  "structure",
  "maintenance",
  "accounting",
  "exchange",
  "documents",
  "readings",
  "access",
  "agenda",
  "audit",
  "imports",
] as const;
export type RealtimeResource = (typeof realtimeResources)[number];
export type RealtimeCursor = { epoch: string; revision: string };
export type RealtimeServerMessage =
  | {
      type: "ready";
      protocol: 1;
      cursor: RealtimeCursor;
      resources: RealtimeResource[];
    }
  | {
      type: "invalidate";
      cursor: RealtimeCursor;
      resources: RealtimeResource[];
    }
  | { type: "state"; cursor: RealtimeCursor };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function isRealtimeCursor(value: unknown): value is RealtimeCursor {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    typeof value.epoch === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.epoch,
    ) &&
    typeof value.revision === "string" &&
    /^\d{1,20}$/.test(value.revision)
  );
}
export function parseRealtimeServerMessage(
  value: unknown,
): RealtimeServerMessage | null {
  if (!record(value) || !isRealtimeCursor(value.cursor)) return null;
  if (value.type === "state")
    return Object.keys(value).length === 2
      ? (value as RealtimeServerMessage)
      : null;
  if (value.type !== "ready" && value.type !== "invalidate") return null;
  if (
    !Array.isArray(value.resources) ||
    value.resources.length > realtimeResources.length ||
    !value.resources.every((r) => realtimeResources.includes(r))
  )
    return null;
  if (
    value.type === "ready" &&
    (value.protocol !== 1 || Object.keys(value).length !== 4)
  )
    return null;
  if (value.type === "invalidate" && Object.keys(value).length !== 3)
    return null;
  return value as RealtimeServerMessage;
}

// Events contain invalidations only. HTTP remains the sole source of scoped data.
export function resourcesForPath(path: string): RealtimeResource[] {
  const pathname = path.split("?")[0];
  if (pathname === "/api/auth/me") return ["session"];
  if (pathname === "/api/audit") return ["audit"];
  if (pathname === "/api/accounting/exchange") return ["exchange"];
  if (pathname.startsWith("/api/accounting")) return ["accounting", "access"];
  if (pathname.startsWith("/api/access")) return ["access", "session"];
  if (pathname.startsWith("/api/documents")) return ["documents", "access"];
  if (pathname.startsWith("/api/readings")) return ["readings", "access"];
  if (pathname.startsWith("/api/maintenance")) return ["maintenance"];
  if (pathname.startsWith("/api/structure")) return ["structure"];
  if (pathname.startsWith("/api/operations")) return ["operations", "access"];
  if (pathname.startsWith("/api/agenda")) return ["agenda"];
  if (pathname.startsWith("/api/import-")) return ["imports"];
  return ["workspace"];
}
