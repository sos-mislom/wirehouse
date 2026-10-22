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
  "Real BP ↔ CRM delivers accounts, readings, work and acts; lost ack replays without duplicate native writes",
  { timeout: 600_000 },
  async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const source = saveSource(f.db, f.admin, null, {
      name: "Native BP test",
      environment: "test",
      active: true,
    });
    const { token } = rotateSourceToken(f.db, source.id);
    const evidence = path.resolve(".local/one-c-build/e2e");
    fs.mkdirSync(evidence, { recursive: true });
    const seeded = await python([
      "scripts/test-one-c-runtime.py",
      "--database",
      database,
      "--source-id",
      source.id,
      "--fixture-only",
      "--output",
      path.join(evidence, "fixture.json"),
    ]);
    const native = seeded.fixture;
    assert.equal(
      native.nativeBPContract,
      true,
      "This test must use actual BP metadata and a native synthetic BP contract",
    );
    saveExternalLink(f.db, {
      sourceId: source.id,
      entityType: "leases",
      externalId: native.account.leaseExternalId,
      localId: f.lease.id,
      version: 0,
    });
    const meter = saveOperation(f.db, f.admin, "meters", null, {
      propertyId: f.property.id,
      unitId: f.unit.id,
      name: "Native BP test meter",
      resource: "water",
      scope: "individual",
      initialValue: 100,
      tariff: 0,
      responsibleId: f.worker.id,
      active: true,
    });
    saveExternalLink(f.db, {
      sourceId: source.id,
      entityType: "meters",
      externalId: native.meter.externalId,
      localId: meter.id,
      version: 0,
    });
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
    assert.equal(outbound.sent, 1);
    const state = await pg.readState();
    assert.equal(state.personal_accounts.length, 1);
    const account = state.personal_accounts[0];
    assert.equal(account.externalId, native.account.externalId);
    assert.equal(account.leaseId, f.lease.id);
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
      propertyId: f.property.id,
      name: "Native BP test",
      startsOn: month + "-01",
      endsOn: day,
      photoRequired: false,
      thresholdPercent: 50,
    });
    const submission = await call("/api/readings/submissions", {
      meterId: meter.id,
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
    const ticketId = "native-e2e-work";
    const actId = "native-e2e-act";
    await handle.requestScope({}, () => {
      enqueueExchange(handle, source.id, "work_results", "native-work-result", {
        schemaVersion: 1,
        ticketId,
        number: "WH-E2E",
        accountExternalId: account.externalId,
        termsVersion: 1,
        resultVersion: 1,
        amount: 122,
        acceptedBy: f.admin.id,
        acceptedAt: new Date().toISOString(),
      });
      enqueueExchange(handle, source.id, "service_acts", "native-service-act", {
        schemaVersion: 1,
        actId,
        number: "WH-E2E-ACT",
        date: day,
        ticketId,
        accountExternalId: account.externalId,
        total: 122,
        lines: [
          {
            kind: "labor",
            catalogId: null,
            description: "Synthetic work",
            unit: "hour",
            quantity: 2,
            unitPrice: 50,
            vatRate: "22",
            net: 100,
            vat: 22,
            total: 122,
          },
        ],
      });
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
    fs.writeFileSync(
      path.join(evidence, "result.json"),
      JSON.stringify(
        {
          status: "passed",
          configuration: native.configuration,
          sourceId: source.id,
          sent: outbound.sent,
          lostAck: true,
          replay: { received: replay.received, duplicates: replay.duplicates },
          native: oneC,
          crmReadingDelivery: "applied",
          crmWorkAndActDelivery: "applied",
          unsupportedEventsUntouched: true,
        },
        null,
        2,
      ),
    );
  },
);
