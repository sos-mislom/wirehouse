import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fixture } from "./fixtures.mjs";
import {
  saveSource,
  rotateSourceToken,
  enqueueExchange,
} from "../apps/api/src/domain/accounting.js";
import { createAccountingRoutes } from "../apps/api/src/routes/accounting.js";

function setup() {
  const f = fixture();
  const source = saveSource(f.db, f.admin, null, {
    name: "1C test",
    active: true,
    environment: "test",
  });
  const { token } = rotateSourceToken(f.db, source.id);
  const route = createAccountingRoutes({
    db: f.db,
    exchangeEnvironment: "test",
    requireAuth: () => {
      throw Error("Machine endpoint entered user authorization");
    },
    ok: (response, body) => Object.assign(response, { status: 200, body }),
    json: (response, status, body) => Object.assign(response, { status, body }),
  });
  const call = async (
    suffix,
    method = "GET",
    body,
    key = token,
    id = source.id,
  ) => {
    const url = new URL(
      `http://localhost/api/integrations/accounting/${id}${suffix}`,
    );
    const request = Readable.from(
      body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
    );
    Object.assign(request, {
      method,
      url: url.pathname,
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
    });
    const response = {};
    assert.equal(await route(request, response, url), true);
    return response;
  };
  return { ...f, source, token, call };
}

test("Machine capabilities authenticate their source, expose the environment and never expose source secrets", async () => {
  const f = setup();
  try {
    const response = await f.call("/capabilities");
    assert.equal(response.status, 200);
    assert.equal(response.body.sourceId, f.source.id);
    assert.equal(response.body.environment, "test");
    assert.equal(response.body.schemaVersion, 1);
    assert.ok(response.body.incomingKinds.includes("accounts"));
    assert.ok(response.body.outgoingKinds.includes("readings"));
    assert.equal(JSON.stringify(response.body).includes(f.token), false);
    assert.equal(response.body.tokenHash, undefined);
    assert.equal(
      (await f.call("/capabilities", "GET", undefined, "")).status,
      401,
    );
    assert.equal((await f.call("/capabilities", "POST", {})).status, 405);
    const other = saveSource(f.db, f.admin, null, {
      name: "Production",
      active: true,
      environment: "production",
    });
    const { token } = rotateSourceToken(f.db, other.id);
    assert.equal(
      (await f.call("/capabilities", "GET", undefined, token, other.id)).status,
      409,
    );
  } finally {
    f.cleanup();
  }
});

test("A readings-only adapter claims only its supported source events; legacy unfiltered claims still work", async () => {
  const f = setup();
  try {
    const reading = enqueueExchange(
      f.db,
      f.source.id,
      "readings",
      "reading-1",
      { value: 120 },
    );
    const work = enqueueExchange(f.db, f.source.id, "work_results", "work-1", {
      schemaVersion: 1,
    });
    const other = saveSource(f.db, f.admin, null, {
      name: "Other base",
      active: true,
      environment: "test",
    });
    const foreign = enqueueExchange(f.db, other.id, "readings", "reading-1", {
      value: 999,
    });
    const response = await f.call("/outbox/claim", "POST", {
      limit: 50,
      kinds: ["readings"],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.items.map((r) => r.id),
      [reading.id],
    );
    assert.equal(reading.attempts, 1);
    assert.equal(work.attempts, 0);
    assert.equal(foreign.attempts, 0);
    const legacy = await f.call("/outbox/claim", "POST", { limit: 50 });
    assert.deepEqual(
      legacy.body.items.map((r) => r.id),
      [work.id],
    );
  } finally {
    f.cleanup();
  }
});

test("Invalid capability selections and claim methods cannot mutate delivery attempts", async () => {
  const f = setup();
  try {
    const row = enqueueExchange(f.db, f.source.id, "readings", "reading-1", {});
    for (const body of [
      { limit: 1, kinds: [] },
      { limit: 1, kinds: ["unknown"] },
      { limit: 101, kinds: ["readings"] },
      { limit: "1", kinds: ["readings"] },
    ]) {
      assert.equal((await f.call("/outbox/claim", "POST", body)).status, 400);
      assert.equal(row.attempts, 0);
    }
    assert.equal((await f.call("/outbox/claim")).status, 405);
    assert.equal(row.attempts, 0);
  } finally {
    f.cleanup();
  }
});
