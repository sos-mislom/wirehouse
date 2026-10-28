import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  saveSource,
  processExchange,
} from "../apps/api/src/domain/accounting.js";
import crypto from "node:crypto";
const catalogMessage = (kind, items) => ({
  messageId: crypto.randomUUID(),
  environment: "test",
  schemaVersion: 1,
  kind,
  items,
});
const propertyItem = () => ({
  externalId: "building-1",
  version: 1,
  name: "Demo warehouse",
  address: "Demo address",
  totalArea: 1000,
  rentableArea: 900,
  warehouseClass: "B",
});
const unitItem = () => ({
  externalId: "unit-1",
  version: 1,
  propertyExternalId: "building-1",
  number: "101",
  floor: 1,
  area: 100,
  type: "office",
  building: "A",
  entrance: "1",
});
test("Full source graph imports without enrolling accounting contacts or guessing identities", () => {
  const f = fixture();
  try {
    const source = saveSource(f.db, f.admin, null, {
      name: "Demo master",
      environment: "test",
      active: true,
    });
    const apply = (kind, items) => {
      const result = processExchange(
        f.db,
        source.id,
        catalogMessage(kind, items),
        "test",
      );
      assert.equal(result.status, "applied", result.error);
      return result;
    };
    apply("properties", [propertyItem()]);
    apply("units", [unitItem()]);
    const userCount = f.db.data.users.length;
    const tenant = {
      externalId: "tenant-external",
      version: 1,
      name: "Demo counterparty",
      inn: "",
      contactName: "",
      phone: "",
      email: "",
    };
    apply("tenants", [tenant, { ...tenant, externalId: "tenant-empty-2" }]);
    assert.equal(f.db.data.users.length, userCount);
    const lease = {
      externalId: "contract",
      version: 1,
      tenantExternalId: tenant.externalId,
      unitExternalId: "unit-1",
      contractNumber: "DEMO-2026",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      stage: "active",
      ratePerSqm: 100,
      deposit: 1000,
      indexationPct: 0,
    };
    apply("leases", [lease]);
    apply("accounts", [
      {
        externalId: "account",
        leaseExternalId: "contract",
        number: "DEMO-LS",
        validFrom: "2026-01-01",
        validTo: null,
        status: "active",
        version: 1,
      },
    ]);
    const managed = f.db.data.personal_accounts.find(
      (a) => a.sourceId === source.id,
    );
    assert.throws(
      () =>
        f.db.createBillingInvoice({
          leaseId: managed.leaseId,
          period: "2026-10",
          rentAmount: 500,
        }),
      (e) => e.code === "ONE_C_ACCOUNTING_MASTER",
    );
    const managedLease = f.db.getById("leases", managed.leaseId);
    assert.throws(
      () =>
        f.db.createMeterReading({
          unitId: managedLease.unit_id,
          value: 120,
          previousValue: 100,
          period: "2026-10",
          syncInvoice: false,
        }),
      (e) => e.code === "ONE_C_ACCOUNTING_MASTER",
    );
    assert.throws(
      () => f.db.syncInvoiceVariableAmount(managed.leaseId, "2026-10"),
      (e) => e.code === "ONE_C_ACCOUNTING_MASTER",
    );
    const meter = {
      externalId: "meter",
      version: 1,
      propertyExternalId: "building-1",
      unitExternalId: "unit-1",
      name: "Demo meter",
      resource: "water",
      scope: "individual",
      serialNumber: "DEMO-1",
      initialValue: 100,
      tariff: 50,
      active: true,
    };
    apply("meters", [meter]);
    assert.equal(
      f.db.data.users.length,
      userCount,
      "No rights by imported phone/contact",
    );
    assert.equal(apply("meters", [meter]).result.skipped, 1);
    assert.equal(
      apply("tenants", [
        {
          ...tenant,
          version: 2,
          phone: "+12025550101",
          contactName: "Demo contact",
          email: "demo@example.invalid",
        },
      ]).result.updated,
      1,
    );
    assert.equal(f.db.data.users.length, userCount);
    const failed = processExchange(
      f.db,
      source.id,
      catalogMessage("leases", [
        { ...lease, version: 2, tenantExternalId: "missing" },
      ]),
      "test",
    );
    assert.equal(failed.status, "failed");
    assert.equal(
      f.db.data.external_links.find(
        (r) => r.sourceId === source.id && r.externalId === "contract",
      ).version,
      1,
    );
  } finally {
    f.cleanup();
  }
});
