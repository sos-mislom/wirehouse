import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { createToken } from "../../apps/api/src/auth.js";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import { businessTables } from "../../apps/api/src/persistence/business-schema.js";
const secret = "business-integration-tests-secret-at-least-32";
test("HTTP business workflows persist scoped accounts, duplicate-safe packages, photos and engineer decisions across processes", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const pg = await postgresFixture(f.db.data);
  t.after(pg.cleanup);
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  let logs = "";
  const child = spawn(process.execPath, ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: pg.url,
      POSTGRES_URL: "",
      REDIS_URL: "",
      JWT_ACCESS_SECRET: secret,
      EXCHANGE_ENVIRONMENT: "test",
      NOTIFICATION_CHANNELS: "in_app",
      WAREHOUSE_DOCUMENTS_PATH: f.dir + "/documents",
      WAREHOUSE_TICKET_ATTACHMENTS_PATH: f.dir + "/tickets",
      TELEGRAM_BOT_TOKEN: "",
      VK_GROUP_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    if (child.exitCode !== null) throw Error(logs);
    await new Promise((r) => setTimeout(r, 40));
  }
  const call = async (path, actor = f.admin, method = "GET", body) => {
    const token =
      typeof actor === "string"
        ? actor
        : createToken({ sub: actor.id }, secret);
    const res = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  let r = await call("/api/accounting/sources", f.admin, "POST", {
    name: "Тестовая бухгалтерия",
    environment: "test",
    active: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const source = r.body.item;
  const creds = await call(
    `/api/accounting/sources/${source.id}/token`,
    f.admin,
    "POST",
    {},
  );
  assert.ok(creds.body.token);
  assert.equal(creds.body.source.tokenHash, undefined);
  assert.equal(
    (
      await call("/api/accounting/sources", f.manager, "POST", {
        name: "Нет",
        environment: "test",
        active: true,
      })
    ).status,
    403,
  );
  r = await call("/api/accounting/links", f.admin, "POST", {
    sourceId: source.id,
    entityType: "leases",
    externalId: "lease-1",
    localId: f.lease.id,
    version: 0,
  });
  assert.equal(r.status, 200);
  const packet = {
    messageId: "message-1",
    environment: "test",
    schemaVersion: 1,
    kind: "accounts",
    items: [
      {
        externalId: "account-1",
        leaseExternalId: "lease-1",
        number: "001",
        validFrom: f.lease.start_date,
        validTo: null,
        status: "active",
        version: 1,
      },
    ],
  };
  r = await call(
    `/api/integrations/accounting/${source.id}/messages`,
    creds.body.token,
    "POST",
    packet,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "applied");
  assert.equal(
    (
      await call(
        `/api/integrations/accounting/${source.id}/messages`,
        creds.body.token,
        "POST",
        packet,
      )
    ).body.duplicate,
    true,
  );
  const account = (await call("/api/accounting")).body.accounts[0],
    portal = f.db.getTenantPortalUser(f.tenant.id);
  const statementPacket = {
    messageId: "statement-one",
    environment: "test",
    schemaVersion: 1,
    kind: "statements",
    items: [
      {
        externalId: "statement-1",
        accountExternalId: "account-1",
        period: "2026-10",
        opening: 0,
        charged: 100,
        paid: 20,
        closing: 80,
        lines: [{ service: "Аренда", amount: 100 }],
        asOf: "2026-10-18T10:00:00.000Z",
        version: 1,
      },
    ],
  };
  const sendStatement = (body) =>
    call(
      `/api/integrations/accounting/${source.id}/messages`,
      creds.body.token,
      "POST",
      body,
    );
  assert.equal((await sendStatement(statementPacket)).body.status, "applied");
  const sameVersion = await sendStatement({
    ...statementPacket,
    messageId: "statement-copy",
  });
  assert.equal(
    sameVersion.body.status,
    "applied",
    JSON.stringify(sameVersion.body),
  );
  assert.equal(sameVersion.body.result.skipped, 1);
  r = await call("/api/tickets", portal, "POST", {
    unitId: f.unit.id,
    leaseId: f.lease.id,
    category: "electrical",
    priority: "medium",
    title: "Проверка",
    description: "Проверить прибор",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ticket = r.body.item;
  let workflow = (await call(`/api/tickets/${ticket.id}/workflow`)).body.item;
  r = await call(
    `/api/tickets/${ticket.id}/workflow/terms`,
    f.manager,
    "POST",
    {
      updatedAt: workflow.updatedAt,
      paid: true,
      amount: 500,
      accountId: account.id,
      requireBeforePhoto: true,
      requireAfterPhoto: true,
    },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  workflow = r.body.item;
  assert.equal(
    (
      await call(`/api/tickets/${ticket.id}`, f.manager, "PUT", {
        status: "in_progress",
      })
    ).status,
    409,
  );
  r = await call(
    `/api/tickets/${ticket.id}/workflow/decision`,
    portal,
    "POST",
    { updatedAt: workflow.updatedAt, action: "approve", reason: "" },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  workflow = r.body.item;
  const picture = {
    name: "Фото.jpg",
    category: "photo",
    links: [{ entityType: "tickets", entityId: ticket.id, phase: "before" }],
    fileName: "Фото.jpg",
    mimeType: "image/jpeg",
    contentBase64: Buffer.from([255, 216, 255, 1, 2, 3, 255, 217]).toString(
      "base64",
    ),
  };
  r = await call("/api/documents", f.manager, "POST", picture);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const documentId = r.body.item.id;
  assert.equal(
    (await call("/api/documents", f.worker)).body.items.some(
      (d) => d.id === documentId,
    ),
    false,
  );
  const deniedFile = await fetch(base + `/api/documents/${documentId}/file`, {
    headers: {
      Authorization: `Bearer ${createToken({ sub: f.worker.id }, secret)}`,
    },
  });
  assert.equal(
    deniedFile.status,
    403,
    "Unassigned workers cannot bypass ticket scope through the document registry",
  );
  r = await call(
    `/api/tickets/${ticket.id}/workflow/decision`,
    f.manager,
    "POST",
    { updatedAt: workflow.updatedAt, action: "start", reason: "" },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(
    (await call("/api/documents", portal)).body.items.some(
      (d) => d.id === documentId,
    ),
    true,
  );
  r = await call("/api/documents", f.manager, "POST", {
    ...picture,
    links: [{ entityType: "tickets", entityId: ticket.id, phase: "after" }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const [actor, action] of [
    [f.manager, "submit"],
    [portal, "accept"],
  ]) {
    const current = (await call(`/api/tickets/${ticket.id}/workflow`)).body
      .item;
    r = await call(
      `/api/tickets/${ticket.id}/workflow/decision`,
      actor,
      "POST",
      { updatedAt: current.updatedAt, action, reason: "" },
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const claim = () =>
    call(
      `/api/integrations/accounting/${source.id}/outbox/claim`,
      creds.body.token,
      "POST",
      { limit: 1 },
    );
  const claims = await Promise.all([claim(), claim()]);
  assert.ok(claims.every((c) => c.status === 200));
  const messages = claims.flatMap((c) => c.body.items);
  assert.equal(
    messages.length,
    1,
    "Concurrent claims cannot reserve the same message twice",
  );
  assert.equal(messages[0].kind, "work_results");
  const message = messages[0];
  assert.equal(
    (await claim()).body.items.length,
    0,
    "Unexpired reservation is exclusive",
  );
  const ack = (body) =>
    call(
      `/api/integrations/accounting/${source.id}/outbox/${message.id}/ack`,
      creds.body.token,
      "POST",
      body,
    );
  assert.equal((await ack({ accepted: false, error: "" })).status, 400);
  assert.equal((await ack({ accepted: true })).body.item.status, "applied");
  assert.equal(
    (await ack({ accepted: true })).body.item.status,
    "applied",
    "Positive acknowledgement is idempotent",
  );
  assert.equal(
    (await ack({ accepted: false, error: "Поздний отказ" })).status,
    409,
  );
  assert.equal(
    (await claim()).body.items.length,
    0,
    "Applied message cannot be claimed again",
  );
  r = await call("/api/access/participants", f.admin, "POST", {
    fullName: "Другой участник",
    email: "other-participant@test.local",
    phone: "+79990000299",
    password: "strong-test-password",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const stranger = r.body.item;
  assert.equal(
    (await call("/api/accounting", stranger)).body.accounts.length,
    0,
  );
  assert.equal((await call("/api/documents", stranger)).body.items.length, 0);
  const file = await fetch(base + `/api/documents/${documentId}/file`, {
    headers: {
      Authorization: `Bearer ${createToken({ sub: stranger.id }, secret)}`,
    },
  });
  assert.equal(file.status, 403);
  const assignments = (await call("/api/access/assignments")).body.items;
  const inherited = assignments.find((a) => a.userId === f.manager.id);
  const restricted = await call(
    `/api/access/assignments/${inherited.id}`,
    f.admin,
    "PUT",
    {
      userId: f.manager.id,
      businessRole: "manager",
      scopeType: inherited.scopeType,
      scopeId: inherited.scopeId,
      permissions: ["workspace.read"],
      validFrom: inherited.validFrom,
      validTo: inherited.validTo,
      retainHistory: true,
      reason: "Наблюдение без прав записи",
      updatedAt: inherited.updatedAt,
    },
  );
  assert.equal(restricted.status, 200, JSON.stringify(restricted.body));
  assert.equal(
    (
      await call(`/api/units/${f.unit.id}`, f.manager, "PUT", {
        number: "Запрещено",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/tickets/${ticket.id}`, f.manager, "PUT", {
        title: "Запрещено",
      })
    ).status,
    403,
  );
  const rows = await pg.readState();
  assert.equal(rows.exchange_inbox.length, 3);
  assert.equal(rows.personal_accounts.length, 1);
  assert.equal(
    rows.ticket_workflows.find((w) => w.ticketId === ticket.id).state,
    "accepted",
  );
  assert.equal(rows.entity_documents.length, 2);
  assert.ok(rows.audit_log.some((a) => a.entityType === "ticket_workflows"));
});
test("Business migration includes existing files and converts account bindings without inventing approvals or photo evidence", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    createdBy: f.admin.id,
    category: "other",
    priority: "low",
    title: "Обращение",
    description: "Описание",
  });
  f.db.createTicketAttachment({
    ticketId: ticket.id,
    fileName: "Файл.pdf",
    storedName: "existing.pdf",
    mimeType: "application/pdf",
    mediaType: "document",
    sizeBytes: 10,
    uploadedBy: f.admin.id,
  });
  const pg = await postgresFixture(f.db.data);
  t.after(pg.cleanup);
  await pg.pool.query("UPDATE warehouse.users SET permissions=$1 WHERE id=$2", [
    JSON.stringify(["workspace.read", "tickets.write", "meters.write"]),
    f.worker.id,
  ]);
  await pg.pool.query("UPDATE warehouse.users SET permissions=$1 WHERE id=$2", [
    JSON.stringify(["workspace.read"]),
    f.manager.id,
  ]);
  await pg.pool.query("BEGIN");
  await pg.pool.query(
    "DROP TABLE " +
      Object.keys(businessTables)
        .map((t) => "warehouse." + t)
        .join(",") +
      " CASCADE",
  );
  await pg.pool.query("DROP INDEX warehouse.service_act_ticket_unique");
  await pg.pool.query(
    "DELETE FROM warehouse.schema_migrations WHERE name>='005'",
  );
  await pg.pool.query("COMMIT");
  await migrate(pg.pool);
  const rows = await pg.readState();
  assert.equal(
    rows.users.find((u) => u.id === f.worker.id).permissions,
    null,
    "Former full-role template uses new role defaults",
  );
  assert.deepEqual(
    rows.users.find((u) => u.id === f.manager.id).permissions,
    ["workspace.read"],
    "Custom global restrictions are preserved",
  );
  assert.equal(rows.entity_documents[0].storedName, "existing.pdf");
  assert.equal(rows.entity_documents[0].storageKind, "tickets");
  assert.equal(rows.document_links[0].phase, "general");
  assert.equal(rows.ticket_workflows[0].requireBeforePhoto, false);
  assert.equal(rows.ticket_workflows[0].approvedVersion, null);
  assert.equal(
    rows.user_assignments.filter((a) => a.businessRole === "tenant").length,
    2,
  );
});
