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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn) => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await sleep(20);
  }
  assert.fail("Realtime condition timeout");
};

test("WebSocket invalidations cross replicas, survive listener loss and respect transactions and live authorization", async (t) => {
  const f = fixture(),
    pg = await postgresFixture(f.db.data),
    servers = [],
    databases = [],
    sockets = [];
  const secret = "realtime-test-secret";
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const item of servers) {
      await item.realtime.close();
      await new Promise((resolve) => item.server.close(resolve));
    }
    for (const db of databases) await db.close();
    await pg.cleanup();
    f.cleanup();
  });
  for (let i = 0; i < 2; i++) {
    const db = await openDatabase({ databaseUrl: pg.url });
    databases.push(db);
    const server = http.createServer();
    const realtime = attachRealtime(server, {
      db,
      databaseUrl: pg.url,
      jwtSecret: secret,
      heartbeatMs: 200,
      batchMs: 40,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    servers.push({
      server,
      realtime,
      base: `http://127.0.0.1:${server.address().port}`,
    });
  }
  const connect = async (
    user,
    token = createToken({ sub: user.id }, secret),
  ) => {
    const ws = new WebSocket(
      servers[0].base.replace("http:", "ws:") + "/api/realtime",
      { origin: servers[0].base },
    );
    sockets.push(ws);
    const messages = [];
    ws.on("message", (value) => messages.push(JSON.parse(value)));
    ws.on("error", () => {});
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "authenticate", protocol: 1, token }));
    return { ws, messages, token };
  };
  const admin = await connect(f.admin),
    worker = await connect(f.worker);
  await until(
    () =>
      admin.messages.some((m) => m.type === "ready") &&
      worker.messages.some((m) => m.type === "ready"),
  );
  assert(
    !worker.messages
      .find((m) => m.type === "ready")
      .resources.includes("audit"),
  );
  admin.ws.send(JSON.stringify({ type: "check" }));
  await until(() => admin.messages.some((m) => m.type === "state"));
  await sleep(100);
  admin.messages.length = 0;
  worker.messages.length = 0;
  const before = await databases[1].realtimeState();
  await databases[1].requestScope({}, () =>
    databases[1].updateProperty(f.property.id, {
      name: "Обновление из другой реплики",
    }),
  );
  await until(() => admin.messages.some((m) => m.type === "invalidate"));
  const change = admin.messages.find((m) => m.type === "invalidate");
  assert.equal(BigInt(change.cursor.revision), BigInt(before.revision) + 1n);
  assert(change.resources.includes("workspace"));
  assert(
    !JSON.stringify(change).includes(f.property.id),
    "No entity records or IDs on the socket",
  );
  assert(worker.messages.every((m) => !m.resources?.includes("audit")));
  await sleep(100);
  admin.messages.length = 0;
  await databases[1].requestScope({}, () => {});
  assert.deepEqual(
    await databases[1].realtimeState(),
    change.cursor,
    "No-op transaction does not advance revision",
  );
  await pg.pool
    .query(`CREATE FUNCTION warehouse.test_realtime_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'commit failure' USING ERRCODE='23514'; END; $$;
    CREATE CONSTRAINT TRIGGER test_realtime_commit_failure AFTER UPDATE ON warehouse.properties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION warehouse.test_realtime_commit_failure();`);
  await assert.rejects(
    databases[1].requestScope({}, () =>
      databases[1].updateProperty(f.property.id, { name: "Must roll back" }),
    ),
  );
  await sleep(150);
  assert.deepEqual(
    await databases[1].realtimeState(),
    change.cursor,
    "Rollback does not advance revision",
  );
  assert.equal(admin.messages.length, 0, "Rollback does not broadcast");
  await pg.pool.query(
    "DROP TRIGGER test_realtime_commit_failure ON warehouse.properties; DROP FUNCTION warehouse.test_realtime_commit_failure()",
  );
  // Re-establishing LISTEN sends a full invalidation after its durable checkpoint.
  await pg.pool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name='wirehouse-realtime'",
  );
  await until(() => admin.messages.some((m) => m.type === "invalidate"));
  const recovered = admin.messages.find((m) => m.type === "invalidate");
  assert(recovered.resources.includes("audit"));
  // Existing connections must observe a blocked user, not just validate at login.
  const closing = once(worker.ws, "close");
  await databases[1].requestScope({}, () => {
    databases[1].data.users.find((u) => u.id === f.worker.id).is_active = 0;
  });
  assert.equal((await closing)[0], 4401);
  const invalid = await connect(f.admin, "invalid");
  assert.equal((await once(invalid.ws, "close"))[0], 4401);
  const expired = await connect(
    f.admin,
    createToken({ sub: f.admin.id }, secret, -1),
  );
  assert.equal((await once(expired.ws, "close"))[0], 4401);
  await assert.rejects(servers[0].realtime.state("invalid"), { status: 401 });
  const silent = new WebSocket(
    servers[0].base.replace("http:", "ws:") + "/api/realtime",
    { origin: servers[0].base, autoPong: false },
  );
  sockets.push(silent);
  silent.on("error", () => {});
  await once(silent, "open");
  silent.send(
    JSON.stringify({ type: "authenticate", protocol: 1, token: admin.token }),
  );
  assert.equal(
    (await once(silent, "close"))[0],
    1006,
    "Zombie clients without pong are terminated",
  );
  const badOrigin = new WebSocket(
    servers[0].base.replace("http:", "ws:") + "/api/realtime",
    { origin: "https://untrusted.example" },
  );
  sockets.push(badOrigin);
  badOrigin.on("error", () => {});
  const [, response] = await once(badOrigin, "unexpected-response");
  assert.equal(response.statusCode, 403);
  response.resume();
  badOrigin.terminate();
});
