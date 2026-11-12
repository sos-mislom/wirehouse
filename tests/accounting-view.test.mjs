import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { saveSource, saveAccount } from "../apps/api/src/domain/accounting.js";
import { saveAssignment, contextCan } from "../apps/api/src/domain/context-access.js";
import { createAccountingRoutes } from "../apps/api/src/routes/accounting.js";

test("Account-only readers receive safe context labels without access to the contract or another account", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const actor = f.db.getTenantPortalUser(f.tenant.id);
  f.db.data.user_assignments = f.db.data.user_assignments.filter((a) => a.userId !== actor.id);
  const source = saveSource(f.db, f.admin, null, { name: "Учёт", environment: "test", active: true });
  const create = (externalId, leaseId) => saveAccount(f.db, null, {
    sourceId: source.id, externalId, leaseId, number: externalId,
    validFrom: f.lease.start_date, validTo: null, status: "active",
  });
  const own = create("own", f.lease.id);
  create("same-contract-private", f.lease.id);
  create("foreign", f.otherLease.id);
  saveAssignment(f.db, f.admin, null, {
    userId: actor.id, businessRole: "tenant", scopeType: "account", scopeId: own.id,
    permissions: ["workspace.read", "finance.read"], validFrom: "2020-01-01", validTo: null,
    retainHistory: true, reason: "Only one personal account",
  });
  const storedBefore = JSON.stringify(f.db.data);
  let body;
  const route = createAccountingRoutes({
    db: f.db, requireAuth: () => actor, ok: (_response, result) => { body = result; },
    json: () => assert.fail("A valid read must not fail"), exchangeEnvironment: "test",
    getScopedLease: () => assert.fail("Reading account labels must not open the contract"),
  });
  await route({ method: "GET" }, {}, new URL("http://localhost/api/accounting"));
  assert.equal(body.accounts.length, 1);
  assert.equal(body.accounts[0].id, own.id);
  assert.equal(body.accounts[0].contractNumber, f.lease.contract_number);
  assert.equal(body.accounts[0].unitNumber, f.unit.number);
  assert.equal(body.accounts[0].propertyName, f.property.name);
  for (const forbidden of ["ratePerSqm", "deposit", "tenantPhone", "bankDetails", "lease", "tenant"]) {
    assert.equal(Object.hasOwn(body.accounts[0], forbidden), false, forbidden);
  }
  assert.equal(contextCan(f.db, actor, "finance.read", "leases", f.lease.id), false);
  assert.equal(contextCan(f.db, actor, "finance.read", "personal_accounts", body.accounts[0].id), true);
  assert.equal(JSON.stringify(f.db.data), storedBefore, "Read projection must not persist labels or change grants");
});
