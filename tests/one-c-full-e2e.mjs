import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./fixtures.mjs";
import { postgresFixture } from "./postgres/helpers.mjs";
import { createToken } from "../apps/api/src/auth.js";
import {
  saveSource,
  rotateSourceToken,
  saveExternalLink,
  enqueueExchange,
} from "../apps/api/src/domain/accounting.js";
import { saveOperation } from "../apps/api/src/operations.js";
import {
  workflowFor,
  saveTerms,
  decideTicket,
} from "../apps/api/src/domain/ticket-workflow.js";
import {
  saveEstimate,
  transitionEstimate,
} from "../apps/api/src/domain/estimates.js";
import { openDatabase } from "../apps/api/src/persistence/database.js";

const secret = "one-c-native-e2e-only-secret-at-least-32";
const database = process.env.ONE_C_TEST_DATABASE;
if (!database || !path.resolve(database).split(path.sep).includes(".local"))
  throw Error(
    "ONE_C_TEST_DATABASE must select a disposable native 1C base under .local",
  );

async function python(args, env = {}) {
  const child = spawn(process.env.ONE_C_PYTHON ?? "python", args, {
    env: { ...process.env, PYTHONIOENCODING: "utf-8", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "",
    errors = "";
  child.stdout.on("data", (d) => (output += d.toString("utf8")));
  child.stderr.on("data", (d) => (errors += d.toString("utf8")));
  const [code] = await once(child, "exit");
  assert.equal(code, 0, errors || output);
  return JSON.parse(output);
}

test(
  "Full native BP master graph ↔ HTTP CRM: financial correction, readings, actual act and lost acknowledgement",
  { timeout: 1_800_000 },
  async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const source = saveSource(f.db, f.admin, null, {
      name: "Native BP test",
      environment: "test",
      active: true,
    });
    const { token } = rotateSourceToken(f.db, source.id);
    const evidence = path.resolve(".local/one-c-build/full-e2e");
    fs.mkdirSync(evidence, { recursive: true });
    const seeded = await python([
      "scripts/one-c-demo.py",
      "seed",
      "--database",
      database,
      "--source-id",
      source.id,
      "--key",
      "WH-DEMO-HTTP-" + source.id.slice(0, 8),
      "--output",
      path.join(evidence, "fixture.json"),
    ]);
    const native = seeded.fixture;
    // Future kinds must stay untouched by adapters that do not implement them.
    enqueueExchange(f.db, source.id, "future_kind", "work-test-untouched", {
      schemaVersion: 1,
    });
    const pg = await postgresFixture(f.db.data);
    let api;
    const handles = [];
    t.after(async () => {
      if (api && api.exitCode === null) {
        api.kill("SIGTERM");
        await once(api, "exit");
      }
      for (const handle of handles) await handle.close();
      await pg.cleanup();
    });
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    api = spawn(process.execPath, ["apps/api/src/index.js"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        DATABASE_URL: pg.url,
        JWT_ACCESS_SECRET: secret,
        EXCHANGE_ENVIRONMENT: "test",
        REDIS_URL: "",
        NOTIFICATION_CHANNELS: "in_app",
        TELEGRAM_BOT_TOKEN: "",
        VK_GROUP_TOKEN: "",
        SMTP_HOST: "",
        WAREHOUSE_DOCUMENTS_PATH: f.dir + "/documents",
        WAREHOUSE_TICKET_ATTACHMENTS_PATH: f.dir + "/tickets",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let errors = "";
    api.stderr.on("data", (d) => (errors += d));
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 1000; i++) {
      if (api.exitCode !== null) throw Error(errors);
      try {
        if ((await fetch(base + "/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.equal(ready, true, errors);
    const bridgeEnv = {
      ONE_C_CRM_URL: base,
      ONE_C_SOURCE_ID: source.id,
      ONE_C_ENVIRONMENT: "test",
      ONE_C_SOURCE_TOKEN: token,
      ONE_C_DATABASE: path.resolve(database),
      ONE_C_USER: "",
      ONE_C_PASSWORD: "",
    };
    const machine = `/api/integrations/accounting/${source.id}`;
    assert.equal((await fetch(base + machine + "/capabilities")).status, 401);
    const capabilities = await fetch(base + machine + "/capabilities", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(capabilities.status, 200);
    assert.equal((await capabilities.json()).environment, "test");
    const outbound = await python(
      ["integrations/one-c/wirehouse_bridge.py"],
      bridgeEnv,
    );
    assert.equal(outbound.sent, 7);
    const state = await pg.readState();
    assert.equal(state.personal_accounts.length, 1);
    const account = state.personal_accounts[0];
    assert.equal(account.externalId, native.accountId);
    const link = (kind, external) =>
      state.external_links.find(
        (r) =>
          r.sourceId === source.id &&
          r.entityType === kind &&
          r.externalId === external,
      ).localId;
    const propertyId = link("properties", native.propertyId),
      unitId = link("units", native.unitId);
    const meterId = link("meters", native.meterId);
    assert.equal(account.leaseId, link("leases", native.contractId));
    assert.equal(
      state.users.length,
      f.db.data.users.length,
      "Imported contacts never enroll users",
    );
    assert.deepEqual(
      state.account_statements.map((r) => [
        r.opening,
        r.charged,
        r.paid,
        r.closing,
      ]),
      [[1000, 10000, 6000, 5000]],
    );
    assert.ok(
      state.accounting_sources.find((r) => r.id === source.id).lastSuccessfulAt,
    );
    assert.ok(
      state.tenants
        .find((r) => r.id === link("tenants", native.tenantId))
        .name.startsWith("ТЕСТ WH-DEMO-"),
    );
    const call = async (route, body) => {
      const response = await fetch(base + route, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createToken({ sub: f.admin.id }, secret)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    const day = new Date().toISOString().slice(0, 10),
      month = day.slice(0, 7);
    const period = await call("/api/readings/periods", {
      propertyId,
      name: "Native BP test",
      startsOn: month + "-01",
      endsOn: day,
      photoRequired: false,
      thresholdPercent: 50,
    });
    const submission = await call("/api/readings/submissions", {
      meterId,
      periodId: period.item.id,
      accountId: account.id,
      photoDocumentId: null,
      value: 120,
    });
    await call(`/api/readings/submissions/${submission.item.id}/review`, {
      updatedAt: submission.item.updatedAt,
      accepted: true,
      reason: "Native BP E2E test",
    });
    const lost = await python(
      ["scripts/test-one-c-runtime.py", "--database", database, "--drop-ack"],
      bridgeEnv,
    );
    assert.equal(lost.status, "simulated_ack_loss");
    let oneC = await python([
      "scripts/test-one-c-runtime.py",
      "--database",
      database,
      "--source-id",
      source.id,
      "--state-only",
    ]);
    assert.deepEqual([oneC.WH_Readings, oneC.WH_Inbox], [1, 1]);
    const afterLoss = await pg.readState();
    const outgoing = afterLoss.exchange_outbox.find(
      (r) => r.kind === "readings",
    );
    assert.equal(outgoing.status, "pending");
    const handle = await openDatabase({ databaseUrl: pg.url });
    handles.push(handle);
    await handle.requestScope({}, () => {
      handle.data.exchange_outbox.find(
        (r) => r.id === outgoing.id,
      ).nextAttemptAt = "2000-01-01T00:00:00Z";
    });
    const replay = await python(
      ["integrations/one-c/wirehouse_bridge.py"],
      bridgeEnv,
    );
    assert.deepEqual([replay.received, replay.duplicates], [1, 1]);
    oneC = await python([
      "scripts/test-one-c-runtime.py",
      "--database",
      database,
      "--source-id",
      source.id,
      "--state-only",
    ]);
    assert.deepEqual([oneC.WH_Readings, oneC.WH_Inbox], [1, 1]);
    const final = await pg.readState();
    assert.equal(
      final.exchange_outbox.find((r) => r.id === outgoing.id).status,
      "applied",
    );
    const untouched = final.exchange_outbox.find(
      (r) => r.kind === "future_kind",
    );
    assert.deepEqual([untouched.status, untouched.attempts], ["pending", 0]);
    let actId;
    await handle.requestScope({}, () => {
      const lease = handle.getById("leases", account.leaseId);
      const ticket = handle.createTicket({
        unitId,
        tenantId: lease.tenant_id,
        leaseId: lease.id,
        assignedTo: f.admin.id,
        createdBy: f.admin.id,
        title: "ТЕСТ WH-DEMO ремонт",
        description: "Проверка полного цикла",
        category: "other",
        priority: "medium",
        checklistItems: [],
      });
      const w = workflowFor(handle, ticket.id);
      saveTerms(handle, f.admin, ticket.id, {
        updatedAt: w.updatedAt,
        paid: true,
        amount: 122,
        accountId: account.id,
        requireBeforePhoto: false,
        requireAfterPhoto: false,
      });
      const quote = saveEstimate(handle, f.admin, null, {
        version: 0,
        propertyId,
        ticketId: ticket.id,
        contractorId: null,
        name: "ТЕСТ WH-DEMO смета",
        lines: [
          {
            kind: "labor",
            catalogId: null,
            description: "Тестовая работа",
            unit: "hour",
            quantity: 2,
            unitPrice: 50,
            vatRate: "22",
          },
        ],
      });
      transitionEstimate(handle, f.admin, quote.id, "submit", {
        version: quote.version,
      });
      transitionEstimate(handle, f.admin, quote.id, "approve", {
        version: quote.version,
      });
      const decision = (action) =>
        decideTicket(handle, f.admin, ticket.id, {
          updatedAt: workflowFor(handle, ticket.id).updatedAt,
          action,
          reason: "ТЕСТ сквозной обмен",
        });
      decision("approve");
      decision("start");
      decision("submit");
      decision("accept");
      actId = transitionEstimate(handle, f.admin, quote.id, "act", {
        version: quote.version,
      }).act.id;
      decision("close");
    });
    const workDelivery = await python(
      ["integrations/one-c/wirehouse_bridge.py"],
      bridgeEnv,
    );
    assert.deepEqual([workDelivery.received, workDelivery.rejected], [2, 0]);
    oneC = await python([
      "scripts/test-one-c-runtime.py",
      "--database",
      database,
      "--source-id",
      source.id,
      "--state-only",
    ]);
    assert.deepEqual([oneC.WH_WorkEvents, oneC.WH_Inbox], [2, 3]);
    const workState = await pg.readState();
    for (const kind of ["work_results", "service_acts"])
      assert.equal(
        workState.exchange_outbox.find((r) => r.kind === kind).status,
        "applied",
      );
    const demo = (action, extra = []) =>
      python([
        "scripts/one-c-demo.py",
        action,
        "--database",
        database,
        "--source-id",
        source.id,
        ...extra,
      ]);
    const draft = await demo("act", ["--act-id", actId]);
    assert.equal(draft.total, 122);
    assert.equal(draft.posted, false);
    assert.ok(draft.documentId);
    await demo("post-demo-act", ["--act-id", actId]);
    const financialDelivery = await python(
      ["integrations/one-c/wirehouse_bridge.py"],
      bridgeEnv,
    );
    assert.equal(financialDelivery.sent, 1);
    let financial = (await pg.readState()).account_statements[0];
    assert.deepEqual(
      [financial.opening, financial.charged, financial.paid, financial.closing],
      [1000, 10122, 6000, 5122],
    );
    const version = financial.version;
    await demo("correct-charge", [
      "--key",
      native.demoKey,
      "--amount",
      "12000",
    ]);
    assert.equal(
      (await python(["integrations/one-c/wirehouse_bridge.py"], bridgeEnv))
        .sent,
      1,
    );
    financial = (await pg.readState()).account_statements[0];
    assert.deepEqual(
      [financial.charged, financial.paid, financial.closing],
      [12122, 6000, 7122],
    );
    assert.ok(financial.version > version);
    assert.equal(
      (await python(["integrations/one-c/wirehouse_bridge.py"], bridgeEnv))
        .sent,
      0,
    );
    fs.writeFileSync(
      path.join(evidence, "result.json"),
      JSON.stringify(
        {
          status: "passed",
          configuration: seeded.adapter,
          sourceId: source.id,
          sent: outbound.sent,
          lostAck: true,
          replay: { received: replay.received, duplicates: replay.duplicates },
          native: oneC,
          crmReadingDelivery: "applied",
          crmWorkAndActDelivery: "applied",
          salesDraft: draft,
          financial,
          unsupportedEventsUntouched: true,
        },
        null,
        2,
      ),
    );
  },
);
