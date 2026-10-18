import test from "node:test";
import assert from "node:assert/strict";
import { parseRealtimeServerMessage } from "../packages/contracts/src/realtime.ts";
import { QueryClient } from "../apps/web/src/realtime/query-client.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn) => {
  for (let i = 0; i < 150; i++) {
    if (fn()) return;
    await sleep(10);
  }
  assert.fail("Condition timeout");
};

test("Live queries share in-flight reads and coalesce a burst with one follow-up for concurrent commits", async (t) => {
  const responses = [],
    reads = [];
  const client = new QueryClient((_token, path) => {
    reads.push(path);
    return new Promise((resolve) => responses.push(resolve));
  }, 10);
  t.after(() => client.dispose());
  const stops = [
    client.subscribe("user", "/api/maintenance", () => {}),
    client.subscribe("user", "/api/maintenance", () => {}),
  ];
  t.after(() => stops.forEach((stop) => stop()));
  await until(() => responses.length === 1);
  responses.shift()({ value: 1 });
  await until(() => !client.snapshot("user", "/api/maintenance").loading);
  for (let i = 0; i < 200; i++) client.invalidate("user", ["maintenance"]);
  await until(() => reads.length === 2);
  for (let i = 0; i < 200; i++) client.invalidate("user", ["maintenance"]);
  await sleep(20);
  assert.equal(reads.length, 2, "No overlapping requests");
  responses.shift()({ value: 2 });
  await until(() => reads.length === 3);
  responses.shift()({ value: 3 });
  await until(
    () => client.snapshot("user", "/api/maintenance").data?.value === 3,
  );
  await sleep(30);
  assert.equal(reads.length, 3);
});

test("Invalidation targets query resources and never crosses sessions or search keys", async (t) => {
  const reads = [];
  const client = new QueryClient(async (token, path) => {
    reads.push([token, path]);
    return { token, path };
  }, 5);
  t.after(() => client.dispose());
  const stops = [
    client.subscribe("a", "/api/audit?q=first", () => {}),
    client.subscribe("a", "/api/maintenance", () => {}),
    client.subscribe("b", "/api/audit?q=first", () => {}),
  ];
  t.after(() => stops.forEach((stop) => stop()));
  await until(() => reads.length === 3);
  client.invalidate("a", ["audit"]);
  await until(() => reads.length === 4);
  assert.deepEqual(reads[3], ["a", "/api/audit?q=first"]);
  assert.equal(client.snapshot("a", "/api/audit?q=second").data, undefined);
});

test("Temporary read failures retry automatically and access failures remove cached private data", async (t) => {
  let calls = 0,
    fail = true,
    denied = false,
    loggedOut = 0;
  const client = new QueryClient(async () => {
    calls++;
    if (denied) throw Object.assign(new Error("Expired"), { status: 401 });
    if (fail) {
      fail = false;
      throw Object.assign(new Error("Unavailable"), { status: 503 });
    }
    return { secret: "scoped" };
  }, 5);
  client.onUnauthorized = () => loggedOut++;
  t.after(() => client.dispose());
  const stop = client.subscribe("a", "/api/accounting", () => {});
  t.after(stop);
  await until(() => client.snapshot("a", "/api/accounting").error);
  assert.match(client.snapshot("a", "/api/accounting").error, /автоматически/);
  await until(() => client.snapshot("a", "/api/accounting").data?.secret);
  assert.equal(calls, 2);
  denied = true;
  client.invalidate("a");
  await until(() => loggedOut === 1);
  assert.equal(client.snapshot("a", "/api/accounting").data, undefined);
  await sleep(30);
  assert.equal(calls, 3, "No retry for authentication failures");
});

test("Unsubscribing cancels obsolete requests and remounting recovers without hanging", async (t) => {
  let calls = 0;
  const client = new QueryClient((_token, _path, signal) => {
    calls++;
    if (calls > 1) return Promise.resolve({ current: true });
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new Error("Aborted")), {
        once: true,
      }),
    );
  }, 5);
  t.after(() => client.dispose());
  const stop = client.subscribe("a", "/api/audit?q=old", () => {});
  await until(() => calls === 1);
  stop();
  const remount = client.subscribe("a", "/api/audit?q=old", () => {});
  t.after(remount);
  await until(() => client.snapshot("a", "/api/audit?q=old").data?.current);
  assert.equal(calls, 2);
});

test("Realtime protocol rejects malformed, unknown and oversized invalidations", () => {
  const cursor = {
    epoch: "00000000-0000-4000-8000-000000000001",
    revision: "9007199254740993",
  };
  assert.deepEqual(parseRealtimeServerMessage({ type: "state", cursor }), {
    type: "state",
    cursor,
  });
  for (const invalid of [
    { type: "state", cursor: { ...cursor, revision: 1 } },
    { type: "state", cursor: { ...cursor, revision: "-1" } },
    { type: "ready", protocol: 2, cursor, resources: ["workspace"] },
    { type: "invalidate", cursor, resources: ["unknown"] },
    { type: "invalidate", cursor, resources: Array(100).fill("workspace") },
    {
      type: "invalidate",
      cursor,
      resources: ["workspace"],
      record: { secret: true },
    },
  ])
    assert.equal(parseRealtimeServerMessage(invalid), null);
});
