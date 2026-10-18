import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { saveAssignment } from "../apps/api/src/domain/context-access.js";
import {
  registerDocument,
  listDocuments,
  canReadDocument,
} from "../apps/api/src/domain/documents.js";
import { readingsWorkspace } from "../apps/api/src/domain/readings.js";
import { saveOperation } from "../apps/api/src/operations.js";
import { createQueriesService } from "../apps/api/src/services/queries.js";
import { createNormalizersService } from "../apps/api/src/services/normalizers.js";
import { createDomainUtilsService } from "../apps/api/src/services/domain-utils.js";

function historyFixture(t) {
  const f = fixture();
  t.after(f.cleanup);
  const current = new Date().toISOString().slice(0, 7);
  const previous = new Date(
    Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)) - 2, 1),
  )
    .toISOString()
    .slice(0, 7);
  const user = f.db.getTenantPortalUser(f.tenant.id);
  f.db.data.user_assignments = f.db.data.user_assignments.filter(
    (a) => a.userId !== user.id,
  );
  saveAssignment(f.db, f.admin, null, {
    userId: user.id,
    businessRole: "owner",
    scopeType: "lease",
    scopeId: f.lease.id,
    permissions: ["workspace.read", "finance.read", "documents.read"],
    validFrom: "2020-01-01",
    validTo: previous + "-28",
    retainHistory: true,
    reason: "Доступ к истории",
  });
  const queries = createQueriesService({
    db: f.db,
    ...createNormalizersService({}),
    ...createDomainUtilsService({}),
  });
  return { ...f, user, current, previous, queries };
}

test("Expired access uses the same invoice periods in lists, dashboard and tenant totals", (t) => {
  const f = historyFixture(t);
  const old = f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period: f.previous,
    rentAmount: 123,
    dueDate: f.previous + "-15",
  });
  const newer = f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period: f.current,
    rentAmount: 987654,
    dueDate: f.current + "-15",
  });
  assert.deepEqual(
    f.queries.getScopedBillingInvoices(f.user).map((i) => i.id),
    [old.id],
  );
  const detail = f.queries.buildTenantDetailResponse(f.user, f.tenant.id);
  assert.deepEqual(
    detail.payments.map((p) => p.id),
    [old.id],
  );
  assert.equal(detail.summary.arrearsAmount, 123);
  const finance = f.queries.buildFinanceSummary(
    f.user,
    f.queries.buildScopedCollections(f.user),
  );
  assert.equal(finance.collectionBilled, 0);
  assert.equal(finance.arrearsAmount, 123);
  assert.ok(
    finance.series.every((s) => s.billed === 0 && s.details.length === 0),
  );
  assert.equal(
    f.queries.getScopedBillingInvoices(f.admin).some((i) => i.id === newer.id),
    true,
  );
});

test("Historical document access uses upload time even when linked to an older ticket", (t) => {
  const f = historyFixture(t);
  const ticket = f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    createdBy: f.admin.id,
    category: "other",
    title: "Старая заявка",
    description: "Описание",
    priority: "low",
  });
  f.db.getById("tickets", ticket.id).created_at =
    f.previous + "-01T00:00:00.000Z";
  const add = (entityType, entityId, name) =>
    registerDocument(
      f.db,
      f.admin,
      {
        name,
        category: "other",
        mimeType: "application/pdf",
        links: [{ entityType, entityId, phase: "general" }],
      },
      name + ".pdf",
      10,
    );
  const old = add("leases", f.lease.id, "Исторический файл");
  f.db.getById("entity_documents", old.id).createdAt =
    f.previous + "-01T00:00:00.000Z";
  const fresh = add("tickets", ticket.id, "Новый файл в старой заявке");
  assert.deepEqual(
    listDocuments(f.db, f.user).map((d) => d.id),
    [old.id],
  );
  assert.equal(canReadDocument(f.db, f.user, fresh.id), false);
  assert.equal(canReadDocument(f.db, f.admin, fresh.id), true);
  assert.equal(canReadDocument(f.db, f.admin, "missing"), false);
});

test("Historical meter access does not expose readings from later occupants", (t) => {
  const f = historyFixture(t);
  const meter = saveOperation(f.db, f.admin, "meters", null, {
    name: "Вода",
    propertyId: f.property.id,
    unitId: f.unit.id,
    scope: "individual",
    resource: "water",
    tariff: 1,
    initialValue: 10,
  });
  for (const period of [f.previous, f.current])
    f.db.data.resource_readings.push({
      id: period,
      meterId: meter.id,
      period,
      value: 20,
      consumption: 10,
    });
  assert.deepEqual(
    readingsWorkspace(f.db, f.user).readings.map((r) => r.period),
    [f.previous],
  );
  assert.equal(readingsWorkspace(f.db, f.admin).readings.length, 2);
});

test("Worker document access follows the same ticket assignment boundary as ticket details", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  for (const assignedTo of [f.worker.id, null]) {
    const ticket = f.db.createTicket({
      unitId: f.unit.id,
      tenantId: f.tenant.id,
      leaseId: f.lease.id,
      createdBy: f.admin.id,
      assignedTo,
      category: "other",
      title: "Обращение",
      description: "Описание",
      priority: "low",
    });
    const document = registerDocument(
      f.db,
      f.admin,
      {
        name: "Фото.jpg",
        category: "photo",
        mimeType: "image/jpeg",
        links: [
          { entityType: "tickets", entityId: ticket.id, phase: "general" },
        ],
      },
      "photo.jpg",
      10,
    );
    assert.equal(
      canReadDocument(f.db, f.worker, document.id),
      assignedTo === f.worker.id,
    );
    assert.equal(canReadDocument(f.db, f.manager, document.id), true);
  }
});
