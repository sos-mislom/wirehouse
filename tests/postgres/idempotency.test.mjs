import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { createToken } from "../../apps/api/src/auth.js";

const secret = "wirehouse-test-secret";

test("A repeated command with the same Idempotency-Key is answered from the stored response and runs once", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    propertyId: f.property.id,
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "medium",
    title: "Проверить щит",
    description: "Проверка",
  });
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const pg = await postgresFixture(f.db.data);
  const child = spawn(process.execPath, ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: pg.url,
      REDIS_URL: "",
      JWT_ACCESS_SECRET: secret,
      NOTIFICATION_CHANNELS: "in_app",
      TELEGRAM_BOT_TOKEN: "",
      VK_GROUP_TOKEN: "",
      WAREHOUSE_DOCUMENTS_PATH: `${f.dir}/documents`,
      WAREHOUSE_TICKET_ATTACHMENTS_PATH: `${f.dir}/tickets`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await pg.cleanup();
  });
  const base = `http://127.0.0.1:${port}`;
  for (let ready = false, deadline = Date.now() + 30_000; !ready;) {
    if (child.exitCode !== null || Date.now() > deadline) throw Error(output);
    ready = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (!ready) await new Promise((r) => setTimeout(r, 50));
  }
  const tokenFor = (user) =>
    createToken({ sub: user.id, role: user.role }, secret);
  const workerToken = tokenFor(f.worker);
  const comments = `/api/tickets/${ticket.id}/comments`;
  const post = async (body, key, token = workerToken) => {
    const r = await fetch(`${base}${comments}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      replayed: r.headers.get("idempotent-replayed"),
      body: await r.json(),
    };
  };
  const count = async () =>
    (
      await fetch(`${base}${comments}`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      }).then((r) => r.json())
    ).items.length;

  // Browsers must be allowed to send the header cross-origin.
  const preflight = await fetch(`${base}${comments}`, { method: "OPTIONS" });
  assert.match(
    preflight.headers.get("access-control-allow-headers"),
    /Idempotency-Key/,
  );

  const before = await count();
  const key = "test-key-0000000001";
  const first = await post({ content: "Фото загружено" }, key);
  assert.equal(first.status, 201);
  assert.equal(first.replayed, null);
  const again = await post({ content: "Фото загружено" }, key);
  assert.equal(again.status, 201);
  assert.equal(again.replayed, "true");
  assert.deepEqual(again.body, first.body);
  assert.equal(await count(), before + 1);

  // The same key cannot run a different command.
  const reused = await post({ content: "Другой текст" }, key);
  assert.equal(reused.status, 422);
  assert.equal(reused.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(await count(), before + 1);

  // Keys are scoped to the caller: another account's identical key runs anew.
  const manager = await post(
    { content: "Фото загружено" },
    key,
    tokenFor(f.manager),
  );
  assert.equal(manager.status, 201);
  assert.equal(manager.replayed, null);
  assert.equal(await count(), before + 2);

  // A rejected command is not stored, so a corrected retry with the key runs.
  const failedKey = "test-key-0000000002";
  assert.equal((await post({}, failedKey)).status, 400);
  assert.equal((await post({ content: "Исправлено" }, failedKey)).status, 201);
  assert.equal(await count(), before + 3);

  // Without the header the old behaviour is unchanged.
  await post({ content: "Без ключа" });
  await post({ content: "Без ключа" });
  assert.equal(await count(), before + 5);

  assert.equal(
    (await post({ content: "x" }, "short")).body.code,
    "INVALID_IDEMPOTENCY_KEY",
  );

  const storedCount = async () =>
    Number(
      (
        await pg.pool.query(
          "SELECT count(*) AS count FROM warehouse.ticket_comments WHERE ticket_id=$1",
          [ticket.id],
        )
      ).rows[0].count,
    );

  await t.test(
    "A renewed session of the same person replays a lost answer without duplicating the command",
    async () => {
      const before = await storedCount();
      const body = { content: "Ответ потерян перед повторным входом" };
      const retryKey = "renewed-session-key-0001";
      const first = await post(body, retryKey);
      assert.equal(first.status, 201);
      // Both tokens are valid and belong to the same immutable user; changing
      // the nonce models a genuinely new login instead of reusing the old JWT.
      const renewed = createToken(
        { sub: f.worker.id, login: "renewed" },
        secret,
      );
      assert.notEqual(renewed, workerToken);
      const replay = await post(body, retryKey, renewed);
      assert.equal(replay.status, 201);
      assert.equal(replay.replayed, "true");
      assert.deepEqual(replay.body, first.body);
      assert.equal(await storedCount(), before + 1);
    },
  );

  await t.test(
    "Deactivation and missing credentials cannot replay an earlier successful response",
    async () => {
      const body = { content: "Активный сотрудник" };
      const retryKey = "deactivated-user-key-001";
      assert.equal((await post(body, retryKey)).status, 201);
      const before = await storedCount();
      assert.equal((await post(body, retryKey, "")).status, 401);
      await pg.pool.query(
        "UPDATE warehouse.users SET is_active=0 WHERE id=$1",
        [f.worker.id],
      );
      try {
        const denied = await post(body, retryKey);
        assert.equal(denied.status, 401);
        assert.equal(denied.replayed, null);
        assert.equal(await storedCount(), before);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.users SET is_active=1 WHERE id=$1",
          [f.worker.id],
        );
      }
      assert.equal((await post(body, retryKey)).replayed, "true");
      assert.equal(await storedCount(), before);
    },
  );

  await t.test(
    "The exact expired token cannot replay the receipt it created while valid",
    async () => {
      const body = { content: "Короткая сессия" };
      const retryKey = "expired-original-key-001";
      const short = createToken(
        { sub: f.worker.id, login: "short" },
        secret,
        10,
      );
      const first = await post(body, retryKey, short);
      assert.equal(first.status, 201);
      const before = await storedCount();
      const expiresAt =
        JSON.parse(Buffer.from(short.split(".")[1], "base64url").toString())
          .exp * 1000;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 100)),
      );
      const denied = await post(body, retryKey, short);
      assert.equal(denied.status, 401);
      assert.equal(denied.replayed, null);
      assert.equal(await storedCount(), before);
      // A fresh authenticated login can still obtain the same durable receipt.
      assert.equal((await post(body, retryKey)).replayed, "true");
      assert.equal(await storedCount(), before);
    },
  );

  await t.test(
    "Revoking the route permission denies replay without running the command again",
    async () => {
      const body = { content: "Право на обработку заявок" };
      const retryKey = "revoked-permission-key-1";
      assert.equal((await post(body, retryKey)).status, 201);
      const before = await storedCount();
      await pg.pool.query(
        "UPDATE warehouse.users SET permissions=$2::jsonb WHERE id=$1",
        [f.worker.id, JSON.stringify(["workspace.read"])],
      );
      try {
        const denied = await post(body, retryKey);
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
        assert.equal(await storedCount(), before);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.users SET permissions=NULL WHERE id=$1",
          [f.worker.id],
        );
      }
      assert.equal((await post(body, retryKey)).replayed, "true");
      assert.equal(await storedCount(), before);
    },
  );

  await t.test(
    "A revoked property assignment or a reassigned ticket cannot expose a cached receipt",
    async () => {
      const body = { content: "Доступ только к своему заданию" };
      const retryKey = "revoked-context-key-001";
      assert.equal((await post(body, retryKey)).status, 201);
      const before = await storedCount();
      const assignments = await pg.pool.query(
        "SELECT id FROM warehouse.user_assignments WHERE user_id=$1 AND revoked_at IS NULL",
        [f.worker.id],
      );
      assert.ok(assignments.rows.length > 0);
      const ids = assignments.rows.map((row) => row.id);
      await pg.pool.query(
        "UPDATE warehouse.user_assignments SET revoked_at=now() WHERE id=ANY($1::text[])",
        [ids],
      );
      try {
        const denied = await post(body, retryKey);
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
        assert.equal(await storedCount(), before);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.user_assignments SET revoked_at=NULL WHERE id=ANY($1::text[])",
          [ids],
        );
      }
      await pg.pool.query(
        "UPDATE warehouse.tickets SET assigned_to=$2 WHERE id=$1",
        [ticket.id, f.manager.id],
      );
      try {
        const denied = await post(body, retryKey);
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
        assert.equal(await storedCount(), before);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.tickets SET assigned_to=$2 WHERE id=$1",
          [ticket.id, f.worker.id],
        );
      }
      assert.equal((await post(body, retryKey)).replayed, "true");
      assert.equal(await storedCount(), before);
    },
  );

  await t.test(
    "A workflow receipt replays after its own state transition, without starting work twice",
    async () => {
      await pg.pool.query(
        "UPDATE warehouse.ticket_workflows SET require_before_photo=false WHERE ticket_id=$1",
        [ticket.id],
      );
      const workflow = (await pg.readState()).ticket_workflows.find(
        (row) => row.ticketId === ticket.id,
      );
      const body = {
        action: "start",
        reason: "",
        updatedAt: workflow.updatedAt,
      };
      const call = async () => {
        const response = await fetch(
          `${base}/api/tickets/${ticket.id}/workflow/decision`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${workerToken}`,
              "Idempotency-Key": "workflow-start-key-0001",
            },
            body: JSON.stringify(body),
          },
        );
        return {
          status: response.status,
          replayed: response.headers.get("idempotent-replayed"),
          body: await response.json(),
        };
      };
      const first = await call();
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(first.body.item.state, "in_progress");
      assert.equal(first.body.item.amount, null);
      assert.equal(first.body.item.accountId, null);
      const replay = await call();
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      assert.equal(replay.replayed, "true");
      assert.deepEqual(replay.body, first.body);
      const decisions = await pg.pool.query(
        "SELECT count(*) AS count FROM warehouse.ticket_decisions WHERE ticket_id=$1 AND action='start'",
        [ticket.id],
      );
      assert.equal(Number(decisions.rows[0].count), 1);
    },
  );

  await t.test(
    "Creating a ticket after a lost answer or renewed login returns the original id and number exactly once",
    async () => {
      const body = {
        unitId: f.unit.id,
        leaseId: f.lease.id,
        category: "other",
        priority: "medium",
        title: "Без двойного создания",
        description: "Повтор после потерянного ответа",
      };
      const retryKey = "create-ticket-key-0001";
      const call = async (token = workerToken) => {
        const response = await fetch(`${base}/api/tickets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": retryKey,
          },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          replayed: response.headers.get("idempotent-replayed"),
          body: await response.json(),
        };
      };
      const count = async () =>
        Number(
          (
            await pg.pool.query(
              "SELECT count(*) AS count FROM warehouse.tickets",
            )
          ).rows[0].count,
        );
      const before = await count();
      const first = await call();
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.ok(first.body.item.id);
      assert.ok(first.body.item.number);
      assert.equal(first.body.item.financialAccess, false);
      const renewed = createToken(
        { sub: f.worker.id, login: "new-ticket-session" },
        secret,
      );
      const replay = await call(renewed);
      assert.equal(replay.status, 201);
      assert.equal(replay.replayed, "true");
      assert.deepEqual(replay.body, first.body);
      assert.equal(await count(), before + 1);

      const assignments = await pg.pool.query(
        "SELECT id FROM warehouse.user_assignments WHERE user_id=$1 AND revoked_at IS NULL",
        [f.worker.id],
      );
      const ids = assignments.rows.map((row) => row.id);
      assert.ok(ids.length);
      await pg.pool.query(
        "UPDATE warehouse.user_assignments SET revoked_at=now() WHERE id=ANY($1::text[])",
        [ids],
      );
      try {
        const denied = await call(renewed);
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
        assert.equal(await count(), before + 1);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.user_assignments SET revoked_at=NULL WHERE id=ANY($1::text[])",
          [ids],
        );
      }
      await pg.pool.query(
        "UPDATE warehouse.tickets SET assigned_to=$2 WHERE id=$1",
        [first.body.item.id, f.manager.id],
      );
      try {
        const denied = await call();
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
        assert.equal(await count(), before + 1);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.tickets SET assigned_to=$2 WHERE id=$1",
          [first.body.item.id, f.worker.id],
        );
      }
      assert.equal((await call()).replayed, "true");
      assert.equal(await count(), before + 1);
    },
  );

  await t.test(
    "A workflow receipt cannot expose financial fields after that permission is revoked",
    async () => {
      const workflow = (await pg.readState()).ticket_workflows.find(
        (row) => row.ticketId === ticket.id,
      );
      const body = {
        action: "pause",
        reason: "Проверка доступа",
        updatedAt: workflow.updatedAt,
      };
      const call = async () => {
        const response = await fetch(
          `${base}/api/tickets/${ticket.id}/workflow/decision`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenFor(f.manager)}`,
              "Idempotency-Key": "financial-view-key-0001",
            },
            body: JSON.stringify(body),
          },
        );
        return {
          status: response.status,
          replayed: response.headers.get("idempotent-replayed"),
          body: await response.json(),
        };
      };
      const first = await call();
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(typeof first.body.item.amount, "number");
      await pg.pool.query(
        "UPDATE warehouse.users SET permissions=$2::jsonb WHERE id=$1",
        [f.manager.id, JSON.stringify(["workspace.read", "tickets.write"])],
      );
      try {
        const denied = await call();
        assert.equal(denied.status, 403);
        assert.equal(denied.replayed, null);
      } finally {
        await pg.pool.query(
          "UPDATE warehouse.users SET permissions=NULL WHERE id=$1",
          [f.manager.id],
        );
      }
      const replay = await call();
      assert.equal(replay.status, 200);
      assert.equal(replay.replayed, "true");
      assert.deepEqual(replay.body, first.body);
      const decisions = await pg.pool.query(
        "SELECT count(*) AS count FROM warehouse.ticket_decisions WHERE ticket_id=$1 AND action='pause'",
        [ticket.id],
      );
      assert.equal(Number(decisions.rows[0].count), 1);
    },
  );
});
