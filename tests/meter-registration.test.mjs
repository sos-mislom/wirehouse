import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  meterRegistrationFixture,
  meterInput,
} from "./meter-registration-helpers.mjs";
import { saveOperation, getOperations } from "../apps/api/src/operations.js";
import {
  saveAccount,
  saveExternalLink,
  processExchange,
} from "../apps/api/src/domain/accounting.js";
import { registerDocument } from "../apps/api/src/domain/documents.js";
import { saveAssignment } from "../apps/api/src/domain/context-access.js";
import {
  saveReadingPeriod,
  submitReading,
  reviewReading,
  readingsWorkspace,
} from "../apps/api/src/domain/readings.js";
import { requestContracts } from "../packages/contracts/src/requests.ts";

test("New source-bound meters queue one validated registration and expose only delivery metadata", () => {
  const f = meterRegistrationFixture();
  try {
    const item = saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      mapping = f.db.data.external_links.find(
        (link) => link.entityType === "meters" && link.localId === item.id,
      ),
      message = f.db.data.exchange_outbox[0];
    assert.equal(mapping.version, 0);
    assert.match(
      mapping.externalId,
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
    );
    assert.notEqual(mapping.externalId, item.id);
    assert.equal(message.kind, "meter_registrations");
    assert.equal(message.sourceId, f.source.id);
    assert.equal(message.payload.catalog.version, 1);
    assert.equal(message.payload.catalog.propertyExternalId, "property-native");
    assert.equal(message.payload.catalog.unitExternalId, "unit-native");
    assert.equal(
      message.payload.binding.accountExternalId,
      f.account.externalId,
    );
    assert.equal(message.payload.binding.externalId, mapping.externalId);
    assert.equal(message.payload.catalog.externalId, mapping.externalId);
    assert.equal(item.integrationStatus, "pending");
    assert.equal(item.registrationId, message.id);
    assert.equal(
      getOperations(f.db, f.manager).meters[0].integrationStatus,
      "pending",
    );
    assert.equal(
      readingsWorkspace(f.db, f.manager).meters[0].integrationStatus,
      "pending",
    );
    assert.equal(
      JSON.stringify(getOperations(f.db, f.manager)).includes(
        '"accountExternalId"',
      ),
      false,
    );
    assert.equal(f.db.data.meters[0].integrationStatus, undefined);
  } finally {
    f.cleanup();
  }
});

test("Ordinary edits never enqueue registration again and cannot rewrite registered meter identity", () => {
  const f = meterRegistrationFixture();
  try {
    const item = saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      firstQueue = structuredClone(f.db.data.exchange_outbox),
      firstLink = structuredClone(
        f.db.data.external_links.filter((link) => link.entityType === "meters"),
      );
    saveOperation(
      f.db,
      f.manager,
      "meters",
      item.id,
      meterInput(f, {
        accountId: null,
        name: "Уточнённое название",
        tariff: 60,
      }),
    );
    assert.deepEqual(f.db.data.exchange_outbox, firstQueue);
    assert.deepEqual(
      f.db.data.external_links.filter((link) => link.entityType === "meters"),
      firstLink,
    );
    for (const patch of [
      { accountId: f.account.id },
      { accountId: null, initialValue: 10 },
      { accountId: null, resource: "heating" },
      { accountId: null, scope: "common" },
    ]) {
      assert.throws(() =>
        saveOperation(f.db, f.manager, "meters", item.id, meterInput(f, patch)),
      );
      assert.deepEqual(f.db.data.exchange_outbox, firstQueue);
    }
    const local = saveOperation(
      f.db,
      f.manager,
      "meters",
      null,
      meterInput(f, { accountId: null, serialNumber: "LOCAL-ONLY" }),
    );
    assert.equal(local.integrationStatus, "local");
    assert.equal(f.db.data.exchange_outbox.length, 1);
  } finally {
    f.cleanup();
  }
});

test("Missing mappings and invalid catalogs roll back meter creation, links, audit and outbox together", () => {
  const f = meterRegistrationFixture();
  try {
    const unitLink = f.db.data.external_links.find(
      (link) => link.entityType === "units",
    );
    f.db.data.external_links = f.db.data.external_links.filter(
      (link) => link.id !== unitLink.id,
    );
    const before = structuredClone(f.db.data);
    assert.throws(
      () => saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      (error) => error.code === "MISSING_MAPPING",
    );
    assert.deepEqual(f.db.data, before);
    f.db.data.external_links.push(unitLink);
    const complete = structuredClone(f.db.data);
    assert.throws(() =>
      saveOperation(
        f.db,
        f.manager,
        "meters",
        null,
        meterInput(f, { name: "x".repeat(301) }),
      ),
    );
    assert.deepEqual(f.db.data, complete);
  } finally {
    f.cleanup();
  }
});

test("Meter registration requires allowed account context, active source/account and matching lease unit", () => {
  const f = meterRegistrationFixture();
  try {
    const foreign = saveAccount(f.db, null, {
        sourceId: f.source.id,
        leaseId: f.otherLease.id,
        externalId: "foreign-account",
        number: "002",
        status: "active",
        validFrom: f.otherLease.start_date,
        validTo: null,
      }),
      cases = [
        () => saveOperation(f.db, f.worker, "meters", null, meterInput(f)),
        () =>
          saveOperation(
            f.db,
            f.manager,
            "meters",
            null,
            meterInput(f, { accountId: foreign.id }),
          ),
      ];
    for (const run of cases) {
      const before = structuredClone(f.db.data);
      assert.throws(run);
      assert.deepEqual(f.db.data, before);
    }
    f.db.getById("accounting_sources", f.source.id).active = false;
    assert.throws(
      () => saveOperation(f.db, f.admin, "meters", null, meterInput(f)),
      (error) => [403, 409].includes(error.status),
    );
    assert.equal(f.db.data.meters.length, 0);
    f.db.getById("accounting_sources", f.source.id).active = true;
    f.db.getById("personal_accounts", f.account.id).status = "closed";
    assert.throws(
      () => saveOperation(f.db, f.admin, "meters", null, meterInput(f)),
      (error) => [403, 409].includes(error.status),
    );
    f.db.getById("personal_accounts", f.account.id).status = "active";
    f.db.data.user_assignments = f.db.data.user_assignments.filter(
      (row) => row.userId !== f.manager.id,
    );
    saveAssignment(f.db, f.admin, null, {
      userId: f.manager.id,
      businessRole: "manager",
      scopeType: "property",
      scopeId: f.property.id,
      permissions: ["workspace.read", "meters.write"],
      validFrom: "2020-01-01",
      validTo: null,
      retainHistory: true,
      reason: "Без доступа к ЛС",
    });
    assert.throws(
      () => saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      (error) => error.status === 403,
    );
    assert.equal(f.db.data.meters.length, 0);
    assert.equal(f.db.data.exchange_outbox.length, 0);
  } finally {
    f.cleanup();
  }
});

test("An existing source cannot be borrowed through parent mappings from another source", () => {
  const f = meterRegistrationFixture();
  try {
    const leaseLink = f.db.data.external_links.find(
      (link) => link.entityType === "leases",
    );
    leaseLink.sourceId = "some-other-source";
    const before = structuredClone(f.db.data);
    assert.throws(
      () => saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      (error) => error.code === "MISSING_MAPPING",
    );
    assert.deepEqual(f.db.data, before);
    const dto = requestContracts.find(
      (contract) =>
        contract.method === "POST" &&
        contract.path.test("/api/operations/meters"),
    );
    assert.throws(() =>
      dto.schema.parse({ ...meterInput(f), externalId: "reused-native-id" }),
    );
  } finally {
    f.cleanup();
  }
});

test("A reading waits for native meter registration and still enforces the monthly duplicate rule", () => {
  const f = meterRegistrationFixture();
  try {
    const meter = saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      tenant = f.db.getTenantPortalUser(f.tenant.id),
      day = new Date().toISOString().slice(0, 10),
      period = saveReadingPeriod(f.db, f.manager, {
        propertyId: f.property.id,
        name: "Текущий месяц",
        startsOn: day.slice(0, 7) + "-01",
        endsOn: day,
        photoRequired: true,
        thresholdPercent: 50,
      }),
      photo = registerDocument(
        f.db,
        tenant,
        {
          name: "Фото.jpg",
          category: "photo",
          mimeType: "image/jpeg",
          links: [
            { entityType: "meters", entityId: meter.id, phase: "general" },
          ],
        },
        "test-photo.jpg",
        100,
      ),
      row = submitReading(f.db, tenant, {
        meterId: meter.id,
        periodId: period.id,
        accountId: f.account.id,
        photoDocumentId: photo.id,
        value: 226.492,
      });
    const review = () =>
      f.db.transaction(() =>
        reviewReading(f.db, f.manager, row.id, {
          updatedAt: row.updatedAt,
          accepted: true,
          reason: "Проверено по фото",
        }),
      );
    for (const status of ["pending", "failed"]) {
      f.db.data.exchange_outbox[0].status = status;
      assert.throws(
        review,
        (error) => error.code === "METER_REGISTRATION_PENDING",
      );
      assert.equal(f.db.data.resource_readings.length, 0);
      assert.equal(
        f.db.getById("reading_submissions", row.id).status,
        "pending",
      );
      assert.equal(f.db.data.exchange_outbox.length, 1);
    }
    f.db.data.exchange_outbox[0].status = "applied";
    review();
    assert.equal(f.db.data.resource_readings[0].value, 226.492);
    assert.equal(f.db.data.exchange_outbox.length, 2);
    assert.equal(f.db.data.exchange_outbox[1].kind, "readings");
    assert.throws(
      () =>
        submitReading(f.db, tenant, {
          meterId: meter.id,
          periodId: period.id,
          accountId: f.account.id,
          photoDocumentId: photo.id,
          value: 227,
        }),
      /уже отправлено/,
    );
  } finally {
    f.cleanup();
  }
});

test("A native echo advances the staged meter mapping and retains a valid worker assignment", () => {
  const f = meterRegistrationFixture();
  try {
    const meter = saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      packet = structuredClone(f.db.data.exchange_outbox[0].payload.catalog),
      message = (item) => ({
        messageId: crypto.randomUUID(),
        environment: "test",
        schemaVersion: 1,
        kind: "meters",
        items: [item],
      });
    const echo = processExchange(f.db, f.source.id, message(packet), "test");
    assert.equal(echo.status, "applied");
    assert.equal(f.db.getById("meters", meter.id).responsibleId, f.worker.id);
    assert.equal(
      f.db.data.external_links.find((link) => link.localId === meter.id)
        .version,
      1,
    );
    assert.equal(f.db.data.exchange_outbox.length, 1);
    f.db.getById("users", f.worker.id).is_active = 0;
    assert.equal(
      processExchange(
        f.db,
        f.source.id,
        message({ ...packet, version: 2, name: "Новое имя из БП" }),
        "test",
      ).status,
      "applied",
    );
    assert.equal(f.db.getById("meters", meter.id).responsibleId, null);
  } finally {
    f.cleanup();
  }
});

test("A newer imported meter clears its old worker only when the assignment context changes", () => {
  const f = meterRegistrationFixture();
  try {
    const meter = saveOperation(
      f.db,
      f.manager,
      "meters",
      null,
      meterInput(f, { accountId: null }),
    );
    saveExternalLink(f.db, {
      sourceId: f.source.id,
      entityType: "meters",
      localId: meter.id,
      externalId: "legacy-native-meter",
      version: 0,
    });
    const otherUnit = f.db.createUnit({
      propertyId: f.property.id,
      number: "102",
      floor: 1,
      area: 80,
      type: "office",
      status: "vacant",
    });
    saveExternalLink(f.db, {
      sourceId: f.source.id,
      entityType: "units",
      localId: otherUnit.id,
      externalId: "other-unit-native",
      version: 1,
    });
    const data = {
        externalId: "legacy-native-meter",
        version: 1,
        propertyExternalId: "property-native",
        unitExternalId: "unit-native",
        name: "Вода из БП",
        scope: "individual",
        resource: "water",
        serialNumber: "LEGACY",
        initialValue: 0,
        tariff: 50,
        active: true,
      },
      packet = (item) => ({
        messageId: crypto.randomUUID(),
        schemaVersion: 1,
        environment: "test",
        kind: "meters",
        items: [item],
      });
    assert.equal(
      processExchange(f.db, f.source.id, packet(data), "test").status,
      "applied",
    );
    assert.equal(f.db.getById("meters", meter.id).responsibleId, f.worker.id);
    assert.equal(
      processExchange(
        f.db,
        f.source.id,
        packet({ ...data, version: 2, unitExternalId: "other-unit-native" }),
        "test",
      ).status,
      "applied",
    );
    assert.equal(f.db.getById("meters", meter.id).unitId, otherUnit.id);
    assert.equal(f.db.getById("meters", meter.id).responsibleId, null);
  } finally {
    f.cleanup();
  }
});
