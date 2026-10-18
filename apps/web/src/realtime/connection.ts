import {
  isRealtimeCursor,
  parseRealtimeServerMessage,
  type RealtimeCursor,
} from "../../../../packages/contracts/src/realtime.ts";
import type { QueryClient } from "./query-client";

export function connectRealtime({
  token,
  url,
  queries,
  checkpoint,
  unauthorized,
}: {
  token: string;
  url: string;
  queries: QueryClient;
  checkpoint: (signal: AbortSignal) => Promise<{ cursor: RealtimeCursor }>;
  unauthorized: () => void;
}) {
  let stopped = false,
    ws: WebSocket | undefined,
    cursor: RealtimeCursor | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined,
    handshake: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0,
    checking = false,
    checkAbort: AbortController | undefined,
    lastCheck = 0,
    lastResync = 0,
    lastWake = 0,
    acknowledged = Date.now();
  const accept = (next: RealtimeCursor, full = false) => {
    if (
      !full &&
      cursor?.epoch === next.epoch &&
      BigInt(next.revision) < BigInt(cursor.revision)
    )
      return false;
    const changed =
      !cursor ||
      cursor.epoch !== next.epoch ||
      cursor.revision !== next.revision;
    cursor = next;
    if (full || changed) {
      queries.invalidate(token);
      lastResync = Date.now();
    }
    return changed;
  };
  const check = async () => {
    if (stopped || checking || Date.now() - lastCheck < 1000) return;
    checking = true;
    lastCheck = Date.now();
    checkAbort = new AbortController();
    try {
      const state = await checkpoint(checkAbort.signal);
      if (!stopped) {
        if (!isRealtimeCursor(state.cursor))
          throw new Error("Invalid realtime checkpoint");
        accept(state.cursor, Date.now() - lastResync > 60000);
      }
    } catch (error) {
      if (
        (error as { status?: number }).status === 401 ||
        (error as { status?: number }).status === 403
      )
        unauthorized();
      // An unavailable socket still gets automatic HTTP convergence on recovery.
    } finally {
      checking = false;
    }
  };
  const connect = () => {
    if (stopped) return;
    const current = new WebSocket(url);
    ws = current;
    handshake = setTimeout(() => current.close(), 10000);
    let ready = false;
    current.onopen = () =>
      current.send(
        JSON.stringify({ type: "authenticate", protocol: 1, token }),
      );
    current.onmessage = ({ data }) => {
      if (stopped || current !== ws) return;
      const message = parseRealtimeServerMessage(
        typeof data === "string"
          ? (() => {
              try {
                return JSON.parse(data);
              } catch {
                return null;
              }
            })()
          : null,
      );
      if (!message) {
        current.close(1008, "Unsupported protocol");
        return;
      }
      acknowledged = Date.now();
      if (message.type === "ready") {
        ready = true;
        attempt = 0;
        clearTimeout(handshake);
        accept(message.cursor, true);
        current.send(JSON.stringify({ type: "check" }));
        void check(); // Independent post-connect check closes the startup race.
      } else if (!ready) {
        current.close(1008, "Ready required");
      } else if (message.type === "state") accept(message.cursor);
      else {
        const previous = cursor;
        if (
          previous?.epoch === message.cursor.epoch &&
          BigInt(message.cursor.revision) <= BigInt(previous.revision)
        )
          return;
        cursor = message.cursor;
        if (
          !previous ||
          previous.epoch !== cursor.epoch ||
          BigInt(cursor.revision) > BigInt(previous.revision) + 1n
        )
          queries.invalidate(token);
        else if (message.resources.length)
          queries.invalidate(token, message.resources);
      }
    };
    current.onerror = () => {}; // close owns backoff; no duplicate reconnect timer.
    current.onclose = ({ code }) => {
      clearTimeout(handshake);
      if (stopped) return;
      if (code === 4401 || code === 4403) {
        unauthorized();
        return;
      }
      retry = setTimeout(
        connect,
        Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) *
          (0.8 + Math.random() * 0.4),
      );
    };
  };
  const wake = () => {
    if (document.visibilityState === "hidden") return;
    if (Date.now() - lastWake > 5000) {
      queries.invalidate(token);
      lastWake = Date.now();
    }
    void check();
    if (ws?.readyState === WebSocket.OPEN && Date.now() - acknowledged > 60000)
      ws.close();
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      clearTimeout(retry);
      connect();
    }
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "hidden") return;
    if (ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - acknowledged > 60000) ws.close();
      else ws.send(JSON.stringify({ type: "check" }));
    }
    void check();
  }, 30000);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  connect();
  void check();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(handshake);
    clearInterval(timer);
    checkAbort?.abort();
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}
