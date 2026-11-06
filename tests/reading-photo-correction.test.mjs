import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { fixture } from "./fixtures.mjs";
import { saveOperation } from "../apps/api/src/operations.js";
import {
  saveSource,
  saveAccount,
  saveExternalLink,
} from "../apps/api/src/domain/accounting.js";
import {
  registerDocument,
  removeExistingDocument,
  canReadDocument,
} from "../apps/api/src/domain/documents.js";
import {
  saveReadingPeriod,
  submitReading,
  reviewReading,
  correctReadingPhoto,
  readingsWorkspace,
} from "../apps/api/src/domain/readings.js";
import { createBusinessWorkflowRoutes } from "../apps/api/src/routes/business-workflows.js";

const photo = (f, actor, meterId, type = "image/jpeg") =>
  registerDocument(
    f.db,
    actor,
    {
      name: "Справочное фото прибора.jpg",
      category: type.startsWith("image/") ? "photo" : "other",
      mimeType: type,
      links: [{ entityType: "meters", entityId: meterId, phase: "general" }],
    },
    type.startsWith("image/") ? "meter.jpg" : "meter.pdf",
    100,
  );
function prepare() {
  const f = fixture(),
    day = new Date().toISOString().slice(0, 10),
    tenantUser = f.db.getTenantPortalUser(f.tenant.id),
    source = saveSource(f.db, f.admin, null, {
      name: "БП — тест исправления фото",
      environment: "test",
      active: true,
    }),
    account = saveAccount(f.db, null, {
      sourceId: source.id,
      leaseId: f.lease.id,
      externalId: "account-photo-test",
      number: "001",
      status: "active",
      validFrom: f.lease.start_date,
      validTo: null,
    }),
    meter = saveOperation(f.db, f.manager, "meters", null, {
      propertyId: f.property.id,
      unitId: f.unit.id,
      name: "Вода",
      resource: "water",
      serialNumber: "photo-test",
      scope: "individual",
      tariff: 10,
      initialValue: 100,
      active: true,
      responsibleId: f.worker.id,
    }),
    period = saveReadingPeriod(f.db, f.manager, {
      propertyId: f.property.id,
      name: "Текущий месяц",
      startsOn: day.slice(0, 7) + "-01",
      endsOn: day,
      photoRequired: true,
      thresholdPercent: 50,
    }),
    original = photo(f, tenantUser, meter.id),
    submission = submitReading(f.db, tenantUser, {
      meterId: meter.id,
      periodId: period.id,
      accountId: account.id,
      photoDocumentId: original.id,
      value: 120,
    });
  saveExternalLink(f.db, {
    sourceId: source.id,
    entityType: "meters",
    localId: meter.id,
    externalId: "meter-photo-test",
    version: 0,
  });
  reviewReading(f.db, f.manager, submission.id, {
    updatedAt: submission.updatedAt,
    accepted: true,
    reason: "Принято по исходному учебному изображению",
  });
  return {
    ...f,
    tenantUser,
    source,
    account,
    meter,
    period,
    original,
    submission,
  };
}
const correct = (f, actor, doc, patch = {}) =>
  f.db.transaction(() =>
    correctReadingPhoto(f.db, actor, f.submission.id, {
      updatedAt: f.db.getById("reading_submissions", f.submission.id).updatedAt,
      photoDocumentId: doc.id,
      reason:
        "Справочное фото из открытого источника; не подтверждает принятые 120",
      ...patch,
    }),
  );

test("An accepted reading photo is corrected with an audit trail while its evidence, amounts and exchange remain intact", () => {
  const f = prepare();
  try {
    const before = structuredClone(f.submission),
      readings = structuredClone(f.db.data.resource_readings),
      outbox = structuredClone(f.db.data.exchange_outbox),
      replacement = photo(f, f.manager, f.meter.id),
      result = correct(f, f.manager, replacement);
    assert.equal(result.photoDocumentId, replacement.id);
    assert.notEqual(result.updatedAt, before.updatedAt);
    const { photoDocumentId, updatedAt, photoCorrections, ...rest } = result,
      { photoDocumentId: oldPhotoId, updatedAt: oldTime, ...oldRest } = before;
    assert.deepEqual(rest, oldRest);
    assert.deepEqual(f.db.data.resource_readings, readings);
    assert.deepEqual(f.db.data.exchange_outbox, outbox);
    assert.equal(outbox[0].payload.photoDocumentId, f.original.id);
    assert.ok(f.db.getById("entity_documents", f.original.id));
    assert.ok(f.db.getById("entity_documents", replacement.id));
    assert.equal(canReadDocument(f.db, f.tenantUser, f.original.id), true);
    assert.equal(canReadDocument(f.db, f.tenantUser, replacement.id), true);
    assert.equal(photoCorrections.length, 1);
    assert.equal(photoCorrections[0].previousPhotoDocumentId, oldPhotoId);
    assert.equal(photoCorrections[0].photoDocumentId, replacement.id);
    assert.match(photoCorrections[0].reason, /не подтверждает принятые 120/);
    const visible = readingsWorkspace(f.db, f.tenantUser).submissions.find(
      (row) => row.id === f.submission.id,
    );
    assert.deepEqual(visible.photoCorrections, photoCorrections);
    assert.throws(
      () => removeExistingDocument(f.db, f.original.id),
      /используется/,
    );
    assert.throws(
      () => removeExistingDocument(f.db, replacement.id),
      /используется/,
    );
    assert.throws(
      () => correct(f, f.manager, replacement),
      (error) => error.status === 409 && /уже прикреплена/.test(error.message),
    );
  } finally {
    f.cleanup();
  }
});

test("Photo correction rejects tenant/worker roles, wrong scope, stale edits and unrelated or borrowed files without writes", () => {
  const f = prepare();
  try {
    const replacement = photo(f, f.manager, f.meter.id),
      borrowed = photo(f, f.admin, f.meter.id),
      pdf = photo(f, f.manager, f.meter.id, "application/pdf"),
      second = saveOperation(f.db, f.admin, "meters", null, {
        propertyId: f.property.id,
        unitId: f.unit.id,
        name: "Другой прибор",
        resource: "water",
        serialNumber: "another-meter",
        scope: "individual",
        tariff: 10,
        initialValue: 0,
        active: true,
        responsibleId: null,
      }),
      otherMeterPhoto = photo(f, f.manager, second.id),
      outsider = f.db.createUser({
        fullName: "Другой инженер",
        email: "other-reviewer@test.local",
        password: "test-password-123",
        role: "manager",
        propertyId: f.other.id,
      });
    const checks = [
      [f.tenantUser, replacement, {}, 403],
      [f.worker, replacement, {}, 403],
      [outsider, replacement, {}, 403],
      [f.manager, replacement, { updatedAt: "2001-01-01T00:00:00.000Z" }, 409],
      [f.manager, replacement, { reason: "   " }, 400],
      [f.manager, borrowed, {}, 400],
      [f.manager, pdf, {}, 400],
      [f.manager, otherMeterPhoto, {}, 400],
    ];
    const before = structuredClone(f.db.data);
    for (const [actor, document, patch, status] of checks) {
      assert.throws(
        () => correct(f, actor, document, patch),
        (error) => error.status === status,
      );
      assert.deepEqual(f.db.data, before);
    }
  } finally {
    f.cleanup();
  }
});

test("Further photo corrections preserve the whole history and do not leak it outside the reading context", () => {
  const f = prepare();
  try {
    const first = photo(f, f.manager, f.meter.id),
      stale = f.submission.updatedAt;
    correct(f, f.manager, first);
    const second = photo(f, f.admin, f.meter.id),
      result = correct(f, f.admin, second);
    assert.equal(result.photoCorrections.length, 2);
    assert.equal(result.photoCorrections[1].previousPhotoDocumentId, first.id);
    assert.equal(result.photoCorrections[1].photoDocumentId, second.id);
    assert.throws(
      () => correct(f, f.manager, first, { updatedAt: stale }),
      (error) => error.code === "VERSION_CONFLICT",
    );
    const outsider = f.db.createUser({
      fullName: "Инженер другой площадки",
      email: "outside-photo@test.local",
      password: "test-password-123",
      role: "manager",
      propertyId: f.other.id,
    });
    assert.equal(readingsWorkspace(f.db, outsider).submissions.length, 0);
    assert.ok(f.db.getById("entity_documents", first.id));
    assert.ok(f.db.getById("entity_documents", f.original.id));
    assert.throws(() => removeExistingDocument(f.db, first.id), /используется/);
  } finally {
    f.cleanup();
  }
});

test("The correction HTTP route uses a strict DTO and rejects value changes and unauthorized roles", async (t) => {
  const f = prepare();
  t.after(f.cleanup);
  const replacement = photo(f, f.manager, f.meter.id),
    users = [f.admin, f.manager, f.worker, f.tenantUser],
    json = (response, status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    },
    handler = createBusinessWorkflowRoutes({
      db: f.db,
      requireAuth: (request, response) => {
        const actor = users.find(
          (u) => u.id === request.headers["x-test-user"],
        );
        if (!actor) json(response, 401, { error: "Unauthorized" });
        return actor;
      },
      ok: (response, value) => json(response, 200, value),
      json,
    }),
    server = http.createServer(async (request, response) => {
      if (
        !(await handler(
          request,
          response,
          new URL(request.url, "http://localhost"),
        ))
      )
        json(response, 404, { error: "Not found" });
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/readings/submissions/${f.submission.id}/photo`,
    body = {
      updatedAt: f.submission.updatedAt,
      photoDocumentId: replacement.id,
      reason: "Справочное фото для демонстрации; исходная проверка сохранена",
    },
    send = (actor, input) =>
      fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-test-user": actor.id,
        },
        body: JSON.stringify(input),
      });
  const before = structuredClone(f.db.data);
  for (const input of [
    { ...body, value: 999 },
    { ...body, reason: " " },
    { ...body, photoDocumentId: null },
  ]) {
    const response = await send(f.manager, input);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "VALIDATION_ERROR");
    assert.deepEqual(f.db.data, before);
  }
  const forbidden = await send(f.tenantUser, body);
  assert.equal(forbidden.status, 403);
  const success = await send(f.manager, body);
  assert.equal(success.status, 200);
  const item = (await success.json()).item;
  assert.equal(item.photoDocumentId, replacement.id);
  assert.equal(item.value, 120);
  assert.equal(item.status, "accepted");
  assert.equal(item.photoCorrections.length, 1);
  const conflict = await send(f.manager, body);
  assert.equal(conflict.status, 409);
});
