import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { attachRealtime } from "../../apps/api/src/realtime/server.js";
import { createToken } from "../../apps/api/src/auth.js";
test("Slow authentication storage asks for reconnect without invalidating a valid user session", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const pg = await postgresFixture(f.db.data);
  t.after(pg.cleanup);
  const db = await openDatabase({ databaseUrl: pg.url });
  t.after(() => db.close());
  const original = db.realtimeIdentity;
  db.realtimeIdentity = async (id) => {
    await new Promise((r) => setTimeout(r, 200));
    return original(id);
  };
  const server = http.createServer();
  const realtime = attachRealtime(server, {
    db,
    databaseUrl: pg.url,
    jwtSecret: "test-ws-delay",
    authTimeoutMs: 50,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await realtime.close();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ws = new WebSocket(base.replace("http:", "ws:") + "/api/realtime", {
    origin: base,
  });
  ws.on("error", () => {});
  t.after(() => ws.terminate());
  await once(ws, "open");
  ws.send(
    JSON.stringify({
      type: "authenticate",
      protocol: 1,
      token: createToken({ sub: f.admin.id }, "test-ws-delay"),
    }),
  );
  const [code] = await once(ws, "close");
  assert.equal(code, 1013);
  await new Promise((r) => setTimeout(r, 250));
  db.realtimeIdentity = original;
});
