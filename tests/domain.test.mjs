import test from "node:test";
import assert from "node:assert/strict";
import {
  isCriticalTicket,
  isOpenTicket,
  slaState,
} from "../packages/contracts/src/domain.js";
import { WarehouseDatabase } from "../apps/api/src/database.js";
import {
  saveOperation,
  runMaintenance,
  addReading,
  addWorkLog,
  updateUser,
  getOperations,
  validateTicketLinks,
} from "../apps/api/src/operations.js";
import { fixture } from "./fixtures.mjs";

test("Completed, rejected and resolved tickets stop SLA, only urgent open tickets are critical", () => {
  for (const status of ["completed", "closed", "resolved", "rejected"]) {
    assert.equal(isOpenTicket(status), false);
    assert.equal(
      slaState({ status, slaDueAt: "2020-01-01" }).state,
      "finished",
    );
  }
  assert.equal(
    [
      { status: "new", priority: "medium" },
      { status: "new", priority: "high" },
      { status: "new", priority: "urgent" },
      { status: "completed", priority: "urgent" },
    ].filter(isCriticalTicket).length,
    1,
  );
  assert.equal(
    slaState({ status: "in_progress", slaDueAt: "2020-01-01" }).state,
    "overdue",
  );
});

test("Lease succession permits nonoverlapping periods, rejects overlap and invalid dates", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const next = {
    tenantId: f.tenant.id,
    unitId: f.unit.id,
    contractNumber: "A-2",
    stage: "signed",
    startDate: `${new Date().getFullYear() + 1}-01-01`,
    endDate: `${new Date().getFullYear() + 1}-12-31`,
    ratePerSqm: 100,
  };
  assert.ok(f.db.createLease(next));
  assert.throws(
    () => f.db.createLease({ ...next, contractNumber: "overlap" }),
    /already has/,
  );
  assert.throws(
    () =>
      f.db.createLease({
        ...next,
        contractNumber: "bad",
        stage: "terminated",
        startDate: "2026-02-30",
      }),
    /дата/,
  );
});

test("PPR creates one task per date and preserves its checklist and occurrence", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const day = new Date().toISOString().slice(0, 10);
  const eq = saveOperation(f.db, f.admin, "equipment", null, {
    name: "Вентиляция",
    propertyId: f.property.id,
    unitId: f.unit.id,
    type: "Вентустановка",
    responsibleId: f.worker.id,
    cost: 12000,
  });
  const plan = saveOperation(f.db, f.admin, "plans", null, {
    name: "Осмотр",
    propertyId: f.property.id,
    unitId: f.unit.id,
    equipmentId: eq.id,
    responsibleId: f.worker.id,
    nextDate: day,
    recurrence: "days",
    intervalCount: 30,
    checklist: ["Осмотреть", "Проверить фильтр"],
  });
  assert.equal(runMaintenance(f.db, day).length, 1);
  assert.equal(runMaintenance(f.db, day).length, 0);
  const reloaded = new WarehouseDatabase(f.db.data);
  assert.equal(runMaintenance(reloaded, day).length, 0);
  const task = reloaded.data.tickets[0];
  assert.equal(task.equipment_id, eq.id);
  assert.equal(task.maintenance_plan_id, plan.id);
  assert.equal(task.checklist_items.length, 2);
  assert.throws(
    () =>
      reloaded.updateTicket(task.id, {
        status: "completed",
        updatedBy: f.worker.id,
      }),
    /чек-лист/,
  );
  for (const item of task.checklist_items) {
    reloaded.updateTicketChecklistItem(task.id, item.id, {
      completed: true,
      completedBy: f.worker.id,
    });
  }
  reloaded.updateTicket(task.id, {
    status: "completed",
    updatedBy: f.worker.id,
  });
  const done = reloaded.getTicket(task.id);
  assert.ok(done.resolved_at);
  assert.equal(
    reloaded.listTicketHistory(task.id).at(-1).created_by_name,
    "Электрик",
  );
});

test("Scope, tenant visibility, audit and immediate account blocking are enforced", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  assert.throws(
    () =>
      saveOperation(f.db, f.manager, "equipment", null, {
        name: "Чужое",
        propertyId: f.other.id,
        unitId: f.otherUnit.id,
        type: "Щит",
      }),
    /доступ/,
  );
  assert.equal(f.db.data.equipment.length, 0);
  assert.throws(
    () => updateUser(f.db, f.manager, f.admin.id, { role: "worker" }),
    /доступ/,
  );
  assert.throws(
    () => updateUser(f.db, f.admin, f.admin.id, { isActive: false }),
    /себя/,
  );
  updateUser(f.db, f.manager, f.worker.id, {
    fullName: "Электрик 2",
    specialty: "electrician",
    isActive: false,
  });
  assert.equal(f.db.getUserById(f.worker.id).is_active, 0);
  assert.equal(f.db.data.audit_log.length, 1);
  saveOperation(f.db, f.admin, "news", null, {
    name: "Сотрудникам",
    propertyId: f.property.id,
    content: "Внутреннее",
    audience: "staff",
  });
  saveOperation(f.db, f.admin, "news", null, {
    name: "Всем",
    propertyId: f.property.id,
    content: "Отключение воды",
    audience: "all",
  });
  const portal = f.db.data.users.find((u) => u.tenant_id === f.tenant.id);
  assert.equal(getOperations(f.db, portal).news.length, 1);
  assert.equal(getOperations(f.db, portal).audit.length, 0);
  assert.equal(getOperations(f.db, portal).users.length, 0);
});

test("Meter allocations conserve cents and reject duplicated and decreasing readings", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const meter = saveOperation(f.db, f.admin, "meters", null, {
    name: "Вода МОП",
    propertyId: f.property.id,
    scope: "common",
    resource: "water",
    tariff: 3.33,
    initialValue: 100,
    responsibleId: f.worker.id,
  });
  const body = { period: new Date().toISOString().slice(0, 7), value: 110 };
  const reading = addReading(f.db, f.worker, meter.id, body);
  assert.equal(reading.consumption, 10);
  assert.equal(reading.amount, 33.3);
  assert.equal(
    reading.allocations.reduce((s, r) => s + r.amount, 0),
    33.3,
  );
  assert.throws(
    () => addReading(f.db, f.worker, meter.id, body),
    /уже внесено/,
  );
  assert.throws(
    () =>
      saveOperation(f.db, f.admin, "meters", meter.id, { initialValue: 99 }),
    /использовано/,
  );
  const m2 = saveOperation(f.db, f.admin, "meters", null, {
    name: "Другой",
    propertyId: f.property.id,
    unitId: f.unit.id,
    scope: "individual",
    resource: "water",
    tariff: 1,
    initialValue: 100,
  });
  assert.throws(
    () => addReading(f.db, f.admin, m2.id, { ...body, value: 99 }),
    /допустимо/,
  );
});

test("Work costs freeze the service tariff; closed tickets and foreign links are rejected", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const service = saveOperation(f.db, f.admin, "services", null, {
    name: "Ремонт",
    propertyId: f.property.id,
    paid: true,
    hourlyRate: 500,
    basePrice: 100,
  });
  const task = f.db.createTicket({
    unitId: f.unit.id,
    createdBy: f.admin.id,
    assignedTo: f.worker.id,
    tenantId: f.tenant.id,
    serviceId: service.id,
    category: "electrical",
    priority: "urgent",
    title: "Щит",
    description: "Проверка",
  });
  addWorkLog(f.db, f.worker, task.id, {
    description: "Замена",
    hours: 2,
    materialCost: 50,
  });
  saveOperation(f.db, f.admin, "services", service.id, { hourlyRate: 999 });
  assert.equal(f.db.getTicket(task.id).work_logs[0].cost, 1050);
  f.db.updateTicket(task.id, { status: "completed", updatedBy: f.worker.id });
  assert.throws(
    () => addWorkLog(f.db, f.worker, task.id, { description: "Ещё", hours: 1 }),
    /закрыт/,
  );
  assert.throws(
    () =>
      validateTicketLinks(f.db, f.manager, {
        unitId: f.unit.id,
        leaseId: f.otherLease.id,
      }),
    /не относится/,
  );
});

test("A failed transaction restores the complete domain snapshot", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const before = structuredClone(f.db.data);
  assert.throws(() =>
    f.db.transaction(() => {
      f.db.data.users = [];
      throw new Error("cancel");
    }),
  );
  assert.deepEqual(f.db.data, before);
  assert.ok(f.db.data.users.length);
});

test("Failed tenant creation rolls back and referenced records cannot be deleted", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.db.createUser({
    fullName: "Existing",
    email: "other@test.local",
    phone: "+79990000999",
    password: "test-password-123",
    role: "worker",
  });
  const before = JSON.stringify(f.db.data);
  assert.throws(
    () =>
      f.db.createTenant({
        name: "Conflict",
        inn: "9876543210",
        contactName: "Contact",
        phone: "+79990000999",
        email: "conflict@test.local",
        riskLevel: "low",
      }),
    /phone must be unique/,
  );
  assert.equal(JSON.stringify(f.db.data), before);
  assert.throws(() => f.db.deleteProperty(f.property.id), /Нельзя удалить/);
  assert.throws(() => f.db.deleteUnit(f.unit.id), /Нельзя удалить/);
  assert.throws(() => f.db.deleteTenant(f.tenant.id), /Нельзя удалить/);
  const period = new Date().toISOString().slice(0, 7);
  f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period,
    rentAmount: 10,
    variableAmount: 0,
    dueDate: `${period}-01`,
  });
  assert.throws(() => f.db.deleteLease(f.lease.id), /Нельзя удалить/);
});

test("Notifications reach only managers and workers assigned to the affected property", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const { createNotificationsService } =
    await import("../apps/api/src/services/notifications.js");
  const unassigned = f.db.createUser({
    fullName: "Без объекта",
    email: "no-scope@test.local",
    password: "test-password-123",
    role: "manager",
  });
  const foreign = f.db.createUser({
    fullName: "Другой объект",
    email: "foreign@test.local",
    password: "test-password-123",
    role: "manager",
    propertyId: f.other.id,
  });
  const service = createNotificationsService({
    db: f.db,
    sendEmail: () => {
      throw Error("No external email in test");
    },
  });
  const recipients = service.getNotificationRecipientUsers({
    propertyId: f.property.id,
  });
  assert.ok(recipients.some((u) => u.id === f.admin.id));
  assert.ok(recipients.some((u) => u.id === f.manager.id));
  assert.ok(
    !recipients.some((u) => u.id === unassigned.id || u.id === foreign.id),
  );
});
