import test from "node:test";
import assert from "node:assert/strict";
import { parseRealtimeServerMessage } from "../packages/contracts/src/realtime.ts";
import { QueryClient } from "../apps/web/src/realtime/query-client.ts";
import {
  ApiError,
  completeActiveRead,
  isRequestCancelled,
  normalizeRequestError,
  validationMessage,
} from "../apps/web/src/api/read-errors.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("Validation errors use visible field names and keep internal DTO paths out of user messages", () => {
  assert.equal(
    validationMessage([
      { path: "title", message: "Заполните поле" },
      { path: "description", message: "Заполните поле" },
      { path: "internalReference.privateId", message: "Проверьте значение" },
    ]),
    "Тема: Заполните поле; Описание: Заполните поле; Проверьте значение",
  );
  assert.equal(validationMessage(undefined), undefined);
});
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

test("Cancelling inactive ticket threads never reaches an imperative user-error callback", async (t) => {
  for (const suffix of ["comments", "attachments", "history"]) {
    const path = `/api/tickets/ticket-a/${suffix}`;
    const userErrors = [];
    let calls = 0;
    const client = new QueryClient((_token, _path, signal) => {
      calls++;
      if (calls > 1) return Promise.resolve({ items: ["current"] });
      return new Promise((_resolve, reject) => {
        const cancel = () =>
          reject(new Error("Underlying transport cancelled"));
        if (signal.aborted) cancel();
        else signal.addEventListener("abort", cancel, { once: true });
      });
    }, 5);
    t.after(() => client.dispose());
    const stop = client.subscribe("user", path, () => {
      const error = client.snapshot("user", path).error;
      if (error) userErrors.push(error);
    });
    const refresh = completeActiveRead(async () => {
      await client.request("user", path, true);
    }).catch((error) => userErrors.push(error.message));
    await until(() => calls === 1);
    stop();
    await refresh;
    assert.deepEqual(userErrors, [], suffix);
    assert.equal(client.snapshot("user", path).loading, false);
    const remount = client.subscribe("user", path, () => {});
    t.after(remount);
    await until(
      () => client.snapshot("user", path).data?.items[0] === "current",
    );
    assert.equal(calls, 2);
  }
});

test("Native browser cancellation and superseded read failures recover without publishing user errors", async (t) => {
  for (const nativeAbort of [true, false]) {
    const userErrors = [];
    let calls = 0,
      rejectFirst;
    const client = new QueryClient(() => {
      calls++;
      if (calls > 1) return Promise.resolve({ current: true });
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    }, 5);
    t.after(() => client.dispose());
    const stop = client.subscribe("user", "/api/tickets", () => {
      const error = client.snapshot("user", "/api/tickets").error;
      if (error) userErrors.push(error);
    });
    t.after(stop);
    await until(() => calls === 1);
    if (!nativeAbort) client.invalidate("user");
    rejectFirst(
      nativeAbort
        ? new DOMException("signal is aborted without reason", "AbortError")
        : new TypeError("Superseded transport failure"),
    );
    await until(() => client.snapshot("user", "/api/tickets").data?.current);
    assert.deepEqual(userErrors, []);
    assert.equal(calls, 2);
  }
});

test("Real network and access failures still reach the user and 403 evicts private cache even after supersession", async (t) => {
  let failure;
  const client = new QueryClient(async () => {
    if (failure) throw failure;
    return { privateValue: "scoped fixture" };
  }, 5);
  t.after(() => client.dispose());
  await client.request("user", "/api/accounting");
  const userErrors = [];
  const refresh = () =>
    completeActiveRead(async () => {
      await client.request("user", "/api/accounting", true);
    }).catch((error) => userErrors.push(error.message));
  failure = new TypeError("Failed to fetch");
  await refresh();
  assert.match(
    client.snapshot("user", "/api/accounting").error,
    /Failed to fetch/,
  );
  assert.equal(
    client.snapshot("user", "/api/accounting").data.privateValue,
    "scoped fixture",
  );
  failure = Object.assign(new Error("Access denied"), { status: 403 });
  const denied = refresh();
  client.invalidate("user");
  await denied;
  assert.deepEqual(userErrors, ["Failed to fetch", "Access denied"]);
  assert.equal(client.snapshot("user", "/api/accounting").data, undefined);
  assert.match(
    client.snapshot("user", "/api/accounting").error,
    /Access denied/,
  );
});

test("Cancellation detection does not silence deadlines or similarly worded real errors", () => {
  assert.equal(
    isRequestCancelled(new DOMException("Cancelled", "AbortError")),
    true,
  );
  assert.equal(
    isRequestCancelled(new DOMException("Deadline", "TimeoutError")),
    false,
  );
  assert.equal(
    isRequestCancelled(new TypeError("signal is aborted without reason")),
    false,
  );
  assert.equal(
    isRequestCancelled(Object.assign(new Error("Forbidden"), { status: 403 })),
    false,
  );
  const deadline = new DOMException("Deadline", "TimeoutError");
  const signal = AbortSignal.abort(deadline);
  assert.equal(isRequestCancelled(deadline, signal), false);
});

test("API transport messages are readable while original causes and domain validation stay intact", () => {
  const transport = new TypeError("Failed to fetch");
  const network = normalizeRequestError(transport);
  assert.ok(network instanceof ApiError);
  assert.match(network.message, /Не удалось связаться с сервером/);
  assert.equal(network.code, "NETWORK_ERROR");
  assert.equal(network.status, 0);
  assert.equal(network.cause, transport);
  const deadline = new DOMException("signal timed out", "TimeoutError");
  const timeout = normalizeRequestError(deadline);
  assert.match(timeout.message, /Сервер не ответил вовремя/);
  assert.equal(timeout.code, "REQUEST_TIMEOUT");
  assert.equal(timeout.status, 0);
  assert.equal(timeout.cause, deadline);
  assert.equal(isRequestCancelled(timeout), false);
  for (const status of [400, 403]) {
    const domain = new ApiError("Серверное сообщение", status, "DOMAIN_RULE", [
      { path: "title", message: "Заполните название" },
    ]);
    assert.equal(normalizeRequestError(domain), domain);
    assert.equal(domain.fields[0].message, "Заполните название");
  }
  const cancelled = normalizeRequestError(
    new DOMException("Aborted", "AbortError"),
  );
  assert.equal(isRequestCancelled(cancelled), true);
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
