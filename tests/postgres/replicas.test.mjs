import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { createToken } from "../../apps/api/src/auth.js";

async function startApi(url) {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: url,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      ENABLE_DEMO_SEED: "false",
      REDIS_URL: "",
      JWT_ACCESS_SECRET: "replica-test-secret",
      NOTIFICATION_CHANNELS: "in_app",
      TELEGRAM_BOT_TOKEN: "",
      VK_GROUP_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (data) => (output += data));
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  };
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw Error(output);
      try {
        if ((await fetch(`http://127.0.0.1:${port}/health`)).ok)
          return {
            base: `http://127.0.0.1:${port}`,
            stop,
            output: () => output,
          };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error("API startup timeout: " + output);
  } catch (error) {
    await stop();
    throw error;
  }
}

test("Two real API processes preserve concurrent payments and return a failure when COMMIT is rejected", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const period = new Date().toISOString().slice(0, 7);
  const invoice = f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period,
    rentAmount: 1000,
    variableAmount: 0,
    dueDate: `${period}-01`,
  });
  const pg = await postgresFixture(f.db.data);
  const processes = [];
  t.after(async () => {
    await Promise.all(processes.map((p) => p.stop()));
    await pg.cleanup();
  });
  processes.push(await startApi(pg.url), await startApi(pg.url));
  const token = createToken(
    { sub: f.admin.id, role: "admin" },
    "replica-test-secret",
  );
  const call = async (api, path, body) => {
    const response = await fetch(api.base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      call(processes[i % 2], `/api/billing/invoices/${invoice.id}/payments`, {
        amount: 10,
        paidAt: `${period}-02`,
        method: "bank_transfer",
        reference: `replica-${i}`,
      }),
    ),
  );
  for (const response of responses)
    assert.equal(response.status, 201, JSON.stringify(response.body));
  const stored = await pg.readState();
  assert.equal(stored.billing_payments.length, 8);
  assert.equal(
    stored.billing_payments.reduce((sum, row) => sum + row.amount, 0),
    80,
  );
  for (const api of processes)
    assert.equal(
      (await call(api, "/api/dashboard/overview")).body.finance.collectionPaid,
      80,
    );
  // A deferred constraint fails at COMMIT, after a route has produced its 201.
  await pg.pool
    .query(`CREATE FUNCTION warehouse.test_reject_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit rejection' USING ERRCODE='23514'; END; $$;
    CREATE CONSTRAINT TRIGGER test_reject_payment AFTER INSERT ON warehouse.billing_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION warehouse.test_reject_payment();`);
  const failed = await call(
    processes[0],
    `/api/billing/invoices/${invoice.id}/payments`,
    {
      amount: 10,
      paidAt: `${period}-02`,
      method: "bank_transfer",
      reference: "must-rollback",
    },
  );
  assert.equal(failed.status, 409);
  assert.equal(failed.body.code, "DATA_CONFLICT");
  assert.equal((await pg.readState()).billing_payments.length, 8);
  await pg.pool.query(
    "DROP TRIGGER test_reject_payment ON warehouse.billing_payments; DROP FUNCTION warehouse.test_reject_payment()",
  );
  // A restarted process reads current tables, not an old process snapshot.
  await processes[1].stop();
  processes[1] = await startApi(pg.url);
  assert.equal(
    (await call(processes[1], "/api/dashboard/overview")).body.finance
      .collectionPaid,
    80,
  );
});
