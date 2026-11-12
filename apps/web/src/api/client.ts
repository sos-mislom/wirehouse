import type { ApiErrorDto } from "../../../../packages/contracts/src/requests.ts";
import {
  ApiError,
  normalizeRequestError,
  validationMessage,
} from "./read-errors";
import {
  isCacheablePath,
  markServerReachable,
  markShownFromCache,
  readSavedResponse,
  saveResponse,
} from "../platform/offline-cache";
import {
  QUEUED_MESSAGE,
  enqueueCommand,
  flushOutbox,
  hasPendingCommands,
  isQueueable,
} from "../platform/outbox";
export { ApiError } from "./read-errors";
export const runtimeApiBase =
  import.meta.env.VITE_WAREHOUSE_API_BASE_URL ||
  (["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:3001"
    : "");
// Commands whose outcome is unknown: the connection dropped or timed out
// before the server answered, so it may or may not have run. Sending the same
// command again within 15 minutes reuses its Idempotency-Key and the server
// returns the first result instead of running it twice (no duplicate photo,
// comment or status change after a retry on a weak connection).
const unsettledCommands = new Map<string, { key: string; at: number }>();
const unsettledForMs = 15 * 60 * 1000;

const commandFingerprint = (method: string, path: string, body: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++)
    hash = Math.imul(hash ^ body.charCodeAt(i), 0x01000193);
  return `${method} ${path} ${body.length}:${(hash >>> 0).toString(36)}`;
};

const newIdempotencyKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

function commandAttempt(method: string, path: string, body: string) {
  // Sign-in and code requests stay outside: a repeated code request must send
  // a new code rather than replay the first answer.
  if (method === "GET" || method === "HEAD" || path.startsWith("/api/auth/"))
    return null;
  const now = Date.now();
  for (const [id, entry] of unsettledCommands)
    if (now - entry.at > unsettledForMs) unsettledCommands.delete(id);
  const id = commandFingerprint(method, path, body);
  return { id, key: unsettledCommands.get(id)?.key ?? newIdempotencyKey() };
}

export async function apiRequest<T>(
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    // Set by the offline queue when it resends a saved command.
    idempotencyKey?: string;
    fromOutbox?: boolean;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  const attempt = commandAttempt(method, path, body ?? "");
  if (attempt && options.idempotencyKey) attempt.key = options.idempotencyKey;
  const queue =
    attempt && options.token && !options.fromOutbox
      ? (reason: unknown, sendNow: boolean) =>
          queueCommand(
            { token: options.token!, method, path, body: options.body },
            attempt.key,
            reason,
            sendNow,
          )
      : null;
  // While earlier commands wait in the queue, a new one waits behind them so
  // a "submit" can never overtake the "start" it follows.
  if (
    queue &&
    isQueueable(method, path, options.body) &&
    (await hasPendingCommands(options.token))
  )
    await queue(null, true);
  try {
    const response = await fetch(`${runtimeApiBase}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(attempt ? { "Idempotency-Key": attempt.key } : {}),
      },
      body,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    // A Wi-Fi login page answers with HTML; the server itself has not replied.
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(
        "Сервер вернул неожиданный ответ. Повторите запрос.",
        response.status,
        "INVALID_RESPONSE",
      );
    const payload = await response.json();
    markServerReachable();
    // The server answered, so the outcome is known; a new command gets a new key.
    if (attempt) unsettledCommands.delete(attempt.id);
    if (!response.ok) {
      const error = payload as ApiErrorDto;
      const details = validationMessage(error.fields);
      throw new ApiError(
        details || error.error || `Ошибка запроса (${response.status})`,
        response.status,
        error.code || "REQUEST_ERROR",
        error.fields,
      );
    }
    if (method === "GET") saveResponse(path, options.token, payload);
    return payload as T;
  } catch (error) {
    const failure = normalizeRequestError(error, options.signal);
    if (
      attempt &&
      failure instanceof ApiError &&
      ["NETWORK_ERROR", "REQUEST_TIMEOUT", "INVALID_RESPONSE"].includes(
        failure.code,
      )
    )
      unsettledCommands.set(attempt.id, { key: attempt.key, at: Date.now() });
    if (
      queue &&
      failure instanceof ApiError &&
      ["NETWORK_ERROR", "REQUEST_TIMEOUT", "INVALID_RESPONSE"].includes(
        failure.code,
      ) &&
      isQueueable(method, path, options.body)
    )
      await queue(failure, false);
    // In the mobile app an unreachable server falls back to the last saved
    // copy of a read. Server answers (4xx/5xx) and cancellations still throw.
    if (
      method === "GET" &&
      failure instanceof ApiError &&
      ["NETWORK_ERROR", "REQUEST_TIMEOUT", "INVALID_RESPONSE"].includes(
        failure.code,
      ) &&
      isCacheablePath(path)
    ) {
      const saved = await readSavedResponse(path, options.token);
      if (saved) {
        markShownFromCache(saved.savedAt);
        return saved.payload as T;
      }
    }
    throw failure;
  }
}

// Saves the command for later and reports it as queued; if the phone cannot
// store it, the original failure is reported instead.
async function queueCommand(
  command: { token: string; method: string; path: string; body: unknown },
  key: string,
  failure: unknown,
  sendNow: boolean,
): Promise<never> {
  try {
    await enqueueCommand({ ...command, key });
  } catch {
    throw (
      failure ??
      new ApiError(
        "Не удалось сохранить действие на телефоне. Повторите попытку.",
        0,
        "QUEUE_UNAVAILABLE",
      )
    );
  }
  if (sendNow) void sendQueuedCommands(command.token);
  throw new ApiError(QUEUED_MESSAGE, 0, "QUEUED_OFFLINE");
}

export function sendQueuedCommands(token: string) {
  return flushOutbox(token, (entry, body) =>
    apiRequest(entry.path, {
      method: entry.method,
      token,
      body,
      idempotencyKey: entry.key,
      fromOutbox: true,
    }),
  );
}
