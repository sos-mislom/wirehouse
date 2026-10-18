import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "../auth.js";
import { realtimeResources } from "../../../../packages/contracts/src/realtime.ts";
import { realtimeClientMessageSchema } from "../../../../packages/contracts/src/realtime-schema.ts";
import { allowedResources } from "./topics.js";
import { listenForChanges } from "./pg-listener.js";

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function allowedOrigin(request) {
  try {
    const origin = new URL(request.headers.origin);
    const host = new URL(`http://${request.headers.host}`);
    if (!["http:", "https:"].includes(origin.protocol)) return false;
    const forwarded = request.headers["x-forwarded-proto"];
    const protocol =
      request.socket.encrypted || forwarded === "https" ? "https:" : "http:";
    return (
      (origin.host === host.host && origin.protocol === protocol) ||
      (loopback.has(origin.hostname) &&
        loopback.has(host.hostname) &&
        origin.protocol === "http:")
    );
  } catch {
    return false;
  }
}

export function attachRealtime(
  server,
  { db, databaseUrl, jwtSecret, heartbeatMs = 25000, batchMs = 200 },
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  const peers = new Map();
  let batch,
    flushing = false,
    closed = false,
    cursor;
  const pending = new Set();
  const identity = async (token) => {
    let claims;
    try {
      claims = verifyToken(token, jwtSecret);
    } catch {
      return null;
    }
    if (
      !claims?.sub ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000
    )
      return null;
    const user = await db.realtimeIdentity(claims.sub);
    return user?.is_active ? user : null;
  };
  const send = (ws, message) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 256 * 1024) {
      ws.close(1013, "Slow connection");
      return;
    }
    ws.send(JSON.stringify(message));
  };
  const authorize = async (ws, peer, cache = new Map()) => {
    if (!cache.has(peer.token)) cache.set(peer.token, identity(peer.token));
    const user = await cache.get(peer.token);
    if (!user) {
      ws.close(4401, "Authentication required");
      return false;
    }
    peer.resources = allowedResources(user);
    if (!peer.resources.length) {
      ws.close(4403, "Workspace access denied");
      return false;
    }
    return true;
  };
  const flush = async () => {
    batch = null;
    if (flushing || closed) return;
    flushing = true;
    const resources = [...pending],
      currentCursor = cursor;
    pending.clear();
    const cache = new Map();
    try {
      await Promise.all(
        [...peers].map(async ([ws, peer]) => {
          if (!peer.ready) return;
          try {
            if (!(await authorize(ws, peer, cache))) return;
            const visible = resources.filter((r) => peer.resources.includes(r));
            // Even an empty batch advances the cursor without disclosing records.
            send(ws, {
              type: "invalidate",
              cursor: currentCursor,
              resources: visible,
            });
          } catch {
            ws.close(1013, "Storage unavailable");
          }
        }),
      );
    } finally {
      flushing = false;
      if (pending.size && !closed) batch = setTimeout(flush, batchMs);
    }
  };
  const enqueue = (event) => {
    if (
      !cursor ||
      cursor.epoch !== event.cursor.epoch ||
      BigInt(event.cursor.revision) >= BigInt(cursor.revision)
    )
      cursor = event.cursor;
    for (const resource of event.resources) pending.add(resource);
    if (!batch && !flushing && !closed) batch = setTimeout(flush, batchMs);
  };
  const stopListener = listenForChanges(databaseUrl, {
    onChange: enqueue,
    onReady: (cursor) => enqueue({ cursor, resources: realtimeResources }),
  });
  const upgrade = (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    const ip = request.headers["x-real-ip"] ?? request.socket.remoteAddress;
    const count = [...peers.values()].filter((p) => p.ip === ip).length;
    if (
      closed ||
      url.pathname !== "/api/realtime" ||
      url.search ||
      !allowedOrigin(request) ||
      count >= 128 ||
      peers.size >= 2048
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws, ip),
    );
  };
  server.on("upgrade", upgrade);
  wss.on("connection", (ws, ip) => {
    const peer = {
      ip,
      token: "",
      resources: [],
      ready: false,
      alive: true,
      processing: false,
      lastCheck: 0,
    };
    peers.set(ws, peer);
    const timeout = setTimeout(
      () => ws.close(4401, "Authentication timeout"),
      5000,
    );
    ws.on("error", () => {});
    ws.on("pong", () => {
      peer.alive = true;
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      peers.delete(ws);
    });
    ws.on("message", async (data, binary) => {
      if (peer.processing) {
        ws.close(1008, "Concurrent messages");
        return;
      }
      peer.processing = true;
      try {
        if (binary) throw new Error("Binary messages unsupported");
        const message = realtimeClientMessageSchema.parse(
          JSON.parse(data.toString()),
        );
        if (!peer.ready) {
          if (message.type !== "authenticate")
            throw new Error("Authenticate first");
          peer.token = message.token;
          if (!(await authorize(ws, peer))) return;
          const current = await db.realtimeState();
          peer.ready = true;
          clearTimeout(timeout);
          send(ws, {
            type: "ready",
            protocol: 1,
            cursor: current,
            resources: peer.resources,
          });
        } else {
          if (message.type !== "check" || Date.now() - peer.lastCheck < 1000)
            throw new Error("Invalid check rate");
          peer.lastCheck = Date.now();
          if (await authorize(ws, peer))
            send(ws, { type: "state", cursor: await db.realtimeState() });
        }
      } catch (error) {
        ws.close(
          error?.code ? 1013 : 1008,
          "Invalid request or unavailable storage",
        );
      } finally {
        peer.processing = false;
      }
    });
  });
  const heartbeat = setInterval(() => {
    const cache = new Map();
    for (const [ws, peer] of peers) {
      if (!peer.alive) {
        ws.terminate();
        continue;
      }
      peer.alive = false;
      ws.ping();
      if (peer.ready)
        void authorize(ws, peer, cache).catch(() =>
          ws.close(1013, "Storage unavailable"),
        );
    }
  }, heartbeatMs);
  heartbeat.unref();
  return {
    async state(token) {
      const user = await identity(token);
      if (!user)
        throw Object.assign(new Error("Требуется вход"), { status: 401 });
      if (!allowedResources(user).length)
        throw Object.assign(new Error("Нет доступа"), { status: 403 });
      return { cursor: await db.realtimeState() };
    },
    async close() {
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(batch);
      server.off("upgrade", upgrade);
      for (const [ws] of peers) {
        ws.close(1012, "Server restart");
        ws.terminate();
      }
      await stopListener();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
