import test from "node:test";
import assert from "node:assert/strict";
import { createToken, verifyToken } from "../apps/api/src/auth.js";

test("JWT is rejected at the exact exp second and remains valid immediately before it", (t) => {
  const epoch = 1_800_000_000_000;
  let clock = epoch;
  t.mock.method(Date, "now", () => clock);
  const secret = "expiry-boundary-test-secret";
  const token = createToken({ sub: "test-user" }, secret, 1);

  clock = epoch + 999;
  assert.equal(verifyToken(token, secret)?.sub, "test-user");
  clock = epoch + 1000;
  assert.equal(verifyToken(token, secret), null);
  clock = epoch + 1001;
  assert.equal(verifyToken(token, secret), null);
});
