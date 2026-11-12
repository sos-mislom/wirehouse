import test from "node:test";
import assert from "node:assert/strict";
import {
  idempotencyFor,
  idempotencyKeyFor,
} from "../apps/api/src/http/idempotency.js";

const key = "scope-test-key-0000001";
const request = (authorization = "Bearer test-session", value = key) => ({
  headers: { authorization, "idempotency-key": value },
});
const url = (path) => new URL(path, "https://test.invalid");

test("Only guarded mobile queue commands can read or create cached receipts", () => {
  for (const [method, path] of [
    ["POST", "/api/tickets"],
    ["POST", "/api/tickets/test-ticket/comments"],
    ["POST", "/api/tickets/test-ticket/attachments"],
    ["PUT", "/api/tickets/test-ticket/checklist/test-item"],
    ["POST", "/api/tickets/test-ticket/workflow/decision"],
    ["POST", "/api/documents"],
  ]) {
    assert.equal(
      idempotencyKeyFor(request(), method, url(path)),
      key,
      `${method} ${path}`,
    );
  }

  // These commands require their full ordinary route authorization each time.
  // A stale response must not conceal a revoked lease/property context, and
  // authentication responses must never be stored in the command cache.
  for (const [method, path] of [
    ["POST", "/api/auth/staff/login"],
    ["POST", "/api/auth/tenant/request-otp"],
    ["POST", "/api/integrations/accounting/source/messages"],
    ["PUT", "/api/tickets/test-ticket"],
    ["POST", "/api/tickets/test-ticket/workflow/terms"],
    ["PUT", "/api/leases/test-lease"],
    ["POST", "/api/leases/test-lease/documents"],
    ["PUT", "/api/documents/test-document"],
    ["DELETE", "/api/documents/test-document"],
    ["POST", "/api/billing/invoices/test-invoice/payments"],
    ["POST", "/api/push/devices"],
    ["GET", "/api/tickets/test-ticket/comments"],
    ["HEAD", "/api/documents"],
  ]) {
    assert.equal(
      idempotencyKeyFor(request(), method, url(path)),
      null,
      `${method} ${path}`,
    );
    assert.equal(
      idempotencyKeyFor(request("", "invalid"), method, url(path)),
      null,
    );
  }
  assert.throws(
    () =>
      idempotencyKeyFor(request("", "short"), "POST", url("/api/documents")),
    { status: 400, code: "INVALID_IDEMPOTENCY_KEY" },
  );
});

test("Receipt ownership uses the authenticated user identity across renewed sessions", () => {
  const first = idempotencyFor(
    request("Bearer old-session"),
    "POST",
    url("/api/documents"),
    "user-a",
  );
  const renewed = idempotencyFor(
    request("Bearer renewed-session"),
    "POST",
    url("/api/documents"),
    "user-a",
  );
  const other = idempotencyFor(
    request("Bearer other-session"),
    "POST",
    url("/api/documents"),
    "user-b",
  );
  assert.equal(first.scope, renewed.scope);
  assert.notEqual(first.scope, other.scope);
  assert.throws(
    () => idempotencyFor(request(), "POST", url("/api/documents")),
    { status: 401, code: "UNAUTHORIZED" },
  );
});
