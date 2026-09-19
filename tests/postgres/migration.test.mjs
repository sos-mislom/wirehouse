import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import {
  migrate,
  rollbackLegacy,
  assertMigrated,
} from "../../apps/api/src/persistence/migrate.js";
import { normalizedData } from "../../apps/api/src/persistence/rows.js";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { PostgresTtlStore } from "../../apps/api/src/infrastructure/postgres-ttl-store.js";
import {
  runMaintenance,
  saveOperation,
} from "../../apps/api/src/operations.js";
import { updateRenewal } from "../../apps/api/src/agenda.js";

const open = (pg) => openDatabase({ databaseUrl: pg.url });

test("Migration preserves all fields; repeat is safe, legacy writes blocked, rollback exports current rows", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const pg = await postgresFixture(f.db.data);
  assert.deepEqual(await pg.readState(), normalizedData(f.db.data));
  assert.equal((await migrate(pg.pool)).status, "already-migrated");
  await assert.rejects(
    pg.pool.query("UPDATE app_state SET data='{}' WHERE id='warehouse'"),
    { code: "55000" },
  );
  const db = await open(pg);
  t.after(async () => {
    await db.close();
    await pg.cleanup();
  });
  await db.requestScope({}, () =>
    db.updateProperty(f.property.id, { name: "После миграции" }),
  );
  const current = await pg.readState();
  await rollbackLegacy(pg.pool);
  assert.deepEqual(
    (await pg.pool.query("SELECT data FROM app_state")).rows[0].data,
    current,
  );
  await assert.rejects(assertMigrated(pg.pool), /legacy mode/);
  await assert.rejects(
    db.requestScope({}, () => db.listProperties()),
    /not in relational/,
  );
  await migrate(pg.pool);
  assert.deepEqual(await pg.readState(), current);
});

test("Invalid legacy relation or unknown field aborts schema and leaves source unchanged", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.db.data.units[0].property_id = "missing";
  const pg = await postgresFixture(f.db.data, { applyMigration: false });
  t.after(pg.cleanup);
  await assert.rejects(migrate(pg.pool), { code: "23503" });
  assert.equal(
    (await pg.pool.query("SELECT to_regclass('warehouse.units') AS table_name"))
      .rows[0].table_name,
    null,
  );
  assert.deepEqual(
    (await pg.pool.query("SELECT data FROM app_state")).rows[0].data,
    f.db.data,
  );
  f.db.data.units[0].property_id = f.property.id;
  f.db.data.properties[0].unknown = "do not discard";
  await pg.pool.query("UPDATE app_state SET data=$1", [f.db.data]);
  await assert.rejects(migrate(pg.pool), /Unknown storage fields/);
});

test("Separate connections serialize changes, readers remain fresh, failed commit and thrown operation roll back", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const period = new Date().toISOString().slice(0, 7);
  const invoice = f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period,
    rentAmount: 1000,
    variableAmount: 0,
    dueDate: `${period}-01`,
  });
  const pg = await postgresFixture(f.db.data);
  const a = await open(pg),
    b = await open(pg);
  t.after(async () => {
    await Promise.all([a.close(), b.close()]);
    await pg.cleanup();
  });
  assert.throws(() => a.listProperties(), /outside a request/);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).requestScope({}, async () => {
        const db = i % 2 ? a : b;
        db.createBillingPayment({
          invoiceId: invoice.id,
          amount: 10,
          paidAt: `${period}-02`,
          reference: `parallel-${i}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }),
    ),
  );
  await a.requestScope({ readOnly: true }, () =>
    assert.equal(a.getBillingInvoice(invoice.id).paid_amount, 100),
  );
  const before = await pg.readState();
  await assert.rejects(
    a.requestScope({}, () => {
      a.updateProperty(f.property.id, { name: "must roll back" });
      throw Error("abort");
    }),
    /abort/,
  );
  await assert.rejects(
    a.requestScope({}, () => {
      a.getById("units", f.unit.id).property_id = "missing";
    }),
    { code: "23503" },
  );
  await assert.rejects(
    a.requestScope({ readOnly: true }, () =>
      a.updateProperty(f.property.id, { name: "not read-only" }),
    ),
    /Read-only/,
  );
  assert.deepEqual(await pg.readState(), before);
  const effects = [];
  await assert.rejects(
    a.requestScope({}, () => {
      a.afterCommit(() => effects.push("must not delete"));
      a.getById("units", f.unit.id).property_id = "missing";
    }),
    { code: "23503" },
  );
  assert.deepEqual(effects, []);
  await a.requestScope({}, () =>
    a.afterCommit(() => effects.push("committed")),
  );
  assert.deepEqual(effects, ["committed"]);
  // An unrelated record is not rewritten as part of an operation.
  const xmin = (
    await pg.pool.query("SELECT xmin::text FROM warehouse.users WHERE id=$1", [
      f.admin.id,
    ])
  ).rows[0].xmin;
  await a.requestScope({}, () =>
    a.updateProperty(f.property.id, { name: "Only this row" }),
  );
  assert.equal(
    (
      await pg.pool.query(
        "SELECT xmin::text FROM warehouse.users WHERE id=$1",
        [f.admin.id],
      )
    ).rows[0].xmin,
    xmin,
  );
  await b.requestScope({ readOnly: true }, () =>
    assert.equal(b.getProperty(f.property.id).name, "Only this row"),
  );
});

test("Concurrent planners and renewal versions do not create duplicates or overwrite decisions; OTP is shared and single-use", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const day = new Date().toISOString().slice(0, 10);
  saveOperation(f.db, f.admin, "plans", null, {
    name: "Осмотр",
    propertyId: f.property.id,
    unitId: f.unit.id,
    nextDate: day,
    intervalDays: 30,
    checklist: ["Осмотр"],
  });
  const pg = await postgresFixture(f.db.data);
  const a = await open(pg),
    b = await open(pg);
  t.after(async () => {
    await Promise.all([a.close(), b.close()]);
    await pg.cleanup();
  });
  const created = await Promise.all(
    [a, b].map((db) => db.requestScope({}, () => runMaintenance(db, day))),
  );
  assert.equal(created.flat().length, 1);
  const outcomes = await Promise.allSettled(
    [a, b].map((db) =>
      db.requestScope({}, () =>
        updateRenewal(db, f.admin, f.lease.id, {
          status: "contacted",
          note: "Version test",
          version: 0,
        }),
      ),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.find((r) => r.status === "rejected").reason.status,
    409,
  );
  const stores = [
    new PostgresTtlStore("test", a),
    new PostgresTtlStore("test", b),
  ];
  await a.requestScope({}, () =>
    stores[0].set("code", { userId: f.admin.id }, 60_000),
  );
  const consumed = await Promise.all(
    [a, b].map((db, i) =>
      db.requestScope({}, () => {
        const v = stores[i].get("code");
        stores[i].delete("code");
        return v;
      }),
    ),
  );
  assert.equal(consumed.filter(Boolean).length, 1);
});

test("Operations, documents, MFA setup, audit and import records all survive typed storage", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const period = new Date().toISOString().slice(0, 7),
    day = `${period}-01`;
  const { addReading, addWorkLog } =
    await import("../../apps/api/src/operations.js");
  const { issueBotLink } = await import("../../apps/api/src/bot-links.js");
  const eq = saveOperation(f.db, f.admin, "equipment", null, {
    name: "Оборудование",
    propertyId: f.property.id,
    unitId: f.unit.id,
    type: "Щит",
    warrantyUntil: day,
    cost: 100,
  });
  const service = saveOperation(f.db, f.admin, "services", null, {
    name: "Работа",
    propertyId: f.property.id,
    paid: true,
    hourlyRate: 200,
  });
  const task = f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    createdBy: f.admin.id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "high",
    title: "Проверка",
    description: "Тест",
    equipmentId: eq.id,
    serviceId: service.id,
    leaseId: f.lease.id,
  });
  addWorkLog(f.db, f.worker, task.id, {
    description: "Час",
    hours: 1,
    materialCost: 15,
  });
  f.db.createTicketComment({
    ticketId: task.id,
    authorId: f.admin.id,
    content: "Комментарий",
    sourceChannel: "web",
  });
  const file = {
    fileName: "акт.txt",
    storedName: "test-file.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    uploadedBy: f.admin.id,
  };
  f.db.createTicketAttachment({
    ...file,
    ticketId: task.id,
    mediaType: "document",
    note: "Файл",
  });
  f.db.createLeaseDocument({ ...file, leaseId: f.lease.id, category: "other" });
  const note = f.db.createTenantNote({
    tenantId: f.tenant.id,
    authorId: f.admin.id,
    title: "Заметка",
    content: "Содержимое",
  });
  f.db.createTenantNoteAttachment({ ...file, noteId: note.id });
  saveOperation(f.db, f.admin, "floorplans", null, {
    name: "План",
    propertyId: f.property.id,
    image: "data:image/png;base64,aGVsbG8=",
    markers: [{ unitId: f.unit.id, x: 10, y: 20 }],
  });
  saveOperation(f.db, f.admin, "news", null, {
    name: "Объявление",
    propertyId: f.property.id,
    content: "Текст",
    audience: "all",
    published: true,
    expiresAt: day,
  });
  saveOperation(f.db, f.admin, "expenses", null, {
    name: "Расход",
    propertyId: f.property.id,
    amount: 15,
    date: day,
  });
  const meter = saveOperation(f.db, f.admin, "meters", null, {
    name: "Вода",
    propertyId: f.property.id,
    unitId: f.unit.id,
    scope: "individual",
    resource: "water",
    tariff: 3,
    initialValue: 0,
  });
  addReading(f.db, f.admin, meter.id, { period, value: 10 });
  f.db.createMeterReading({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    period,
    value: 5,
    previousValue: 0,
  });
  const portal = f.db.getTenantPortalUser(f.tenant.id);
  f.db.upsertOtpBinding({
    channel: "telegram",
    phone: portal.phone,
    userId: portal.id,
    tenantId: f.tenant.id,
    recipientId: 123,
  });
  issueBotLink(f.db, f.admin, portal.id, "vk");
  f.db.createPasswordReset({
    userId: f.admin.id,
    codeHash: "test-hash",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  f.db.setUserTotpPending(f.admin.id, "test-mfa-secret");
  const event = f.db.createNotification({
    type: "ticket",
    title: "Заявка",
    message: "Текст",
    propertyId: f.property.id,
    createdBy: f.admin.id,
    deliveries: [{ channel: "in_app", userId: f.manager.id }],
  });
  f.db.markNotificationRead({
    userId: f.manager.id,
    deliveryId: event.deliveries[0].id,
  });
  const batch = f.db.createImportBatch({
    templateId: "tenants",
    fileName: "test.xlsx",
    mode: "create",
    summary: { ready: 1 },
    rows: [{ name: "Тест" }],
    operations: [],
    createdBy: f.admin.id,
    createdByName: f.admin.full_name,
  });
  const approval = f.db.createImportApproval({
    templateId: "tenants",
    fileName: "test.xlsx",
    mode: "create",
    contentBase64: "dGVzdA==",
    rows: [],
    report: {},
    requestedBy: f.manager.id,
    requestedByName: f.manager.full_name,
  });
  f.db.markImportApprovalApproved(approval.id, f.admin.id, batch.id);
  f.db.data.notification_reads.push({
    userId: f.admin.id,
    notificationId: "virtual-notification",
    version: "v1",
    readAt: new Date().toISOString(),
  });
  const pg = await postgresFixture(f.db.data);
  const db = await open(pg);
  t.after(async () => {
    await db.close();
    await pg.cleanup();
  });
  assert.deepEqual(await pg.readState(), normalizedData(f.db.data));
  await db.requestScope({}, () => db.enableUserTotp(f.admin.id));
  await db.requestScope({ readOnly: true }, () =>
    assert.equal(db.getUserById(f.admin.id).totp_enabled, 1),
  );
  // SQL itself rejects overlapping leases, even if a caller bypasses the domain.
  await assert.rejects(
    pg.pool.query(
      "INSERT INTO warehouse.leases (id,tenant_id,unit_id,contract_number,stage,start_date,end_date) SELECT 'overlap',tenant_id,unit_id,'overlap','draft',start_date,end_date FROM warehouse.leases WHERE id=$1",
      [f.lease.id],
    ),
    { code: "23P01" },
  );
});
