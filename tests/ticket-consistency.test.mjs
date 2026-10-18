import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { preparePaidWork } from "./business-helpers.mjs";
import {
  saveEstimate,
  transitionEstimate,
} from "../apps/api/src/domain/estimates.js";
import {
  workflowFor,
  saveTerms,
  decideTicket,
} from "../apps/api/src/domain/ticket-workflow.js";
import { saveOperation } from "../apps/api/src/operations.js";
import { runMaintenance } from "../apps/api/src/operations.js";
import {
  changeMaintenanceTask,
  maintenanceProgress,
} from "../apps/api/src/domain/maintenance-progress.js";
import { termsInput } from "../packages/contracts/src/business-workflows.ts";

function setup(t) {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    createdBy: f.admin.id,
    title: "Ремонт",
    description: "Описание",
    category: "other",
    priority: "medium",
  });
  const quote = (name, amount, approve = true) => {
    const row = saveEstimate(f.db, f.admin, null, {
      propertyId: f.property.id,
      ticketId: ticket.id,
      name,
      contractorId: null,
      version: 0,
      lines: [
        {
          kind: "labor",
          catalogId: null,
          description: name,
          unit: "шт",
          quantity: 1,
          unitPrice: amount,
          vatRate: "0",
        },
      ],
    });
    f.db.transaction(() =>
      transitionEstimate(f.db, f.admin, row.id, "submit", {
        version: row.version,
      }),
    );
    if (approve)
      f.db.transaction(() =>
        transitionEstimate(f.db, f.admin, row.id, "approve", {
          version: row.version,
        }),
      );
    return row;
  };
  return { ...f, ticket, quote };
}
test("Only the estimate bound to accepted work can produce its act", (t) => {
  const f = setup(t),
    old = f.quote("Первый вариант", 100);
  old.updatedAt = "2020-01-01T00:00:00.000Z";
  const current = f.quote("Уточненный объем", 200);
  preparePaidWork(f.db, f.admin, f.ticket.id, f.lease.id);
  for (const item of f.db.getById("tickets", f.ticket.id).checklist_items)
    f.db.updateTicketChecklistItem(f.ticket.id, item.id, {
      completed: true,
      completedBy: f.admin.id,
    });
  f.db.updateTicket(f.ticket.id, {
    status: "completed",
    updatedBy: f.admin.id,
  });
  f.db.transaction(() =>
    decideTicket(f.db, f.admin, f.ticket.id, {
      updatedAt: workflowFor(f.db, f.ticket.id).updatedAt,
      action: "accept",
      reason: "",
    }),
  );
  assert.throws(
    () =>
      f.db.transaction(() =>
        transitionEstimate(f.db, f.admin, old.id, "act", {
          version: old.version,
        }),
      ),
    /актуальн|заменена|смет/,
  );
  const { act } = f.db.transaction(() =>
    transitionEstimate(f.db, f.admin, current.id, "act", {
      version: current.version,
    }),
  );
  assert.equal(act.total, 200);
  assert.equal(f.db.data.service_acts.length, 1);
});
test("Approving an obsolete estimate cannot replace the selected work scope", (t) => {
  const f = setup(t),
    old = f.quote("Первый вариант", 100, false);
  const current = f.quote("Другой состав при той же цене", 100, false);
  assert.throws(
    () =>
      f.db.transaction(() =>
        transitionEstimate(f.db, f.admin, old.id, "approve", {
          version: old.version,
        }),
      ),
    /актуальн|заменена/,
  );
  f.db.transaction(() =>
    transitionEstimate(f.db, f.admin, current.id, "approve", {
      version: current.version,
    }),
  );
  assert.equal(workflowFor(f.db, f.ticket.id).estimateId, current.id);
});
test("Changing a service cannot silently discard published estimate terms", (t) => {
  const f = setup(t);
  f.quote("Работа", 100);
  const service = saveOperation(f.db, f.admin, "services", null, {
    propertyId: f.property.id,
    name: "Бесплатная услуга",
    paid: false,
    basePrice: 0,
    category: "other",
    unit: "шт",
  });
  assert.throws(
    () =>
      f.db.updateTicket(f.ticket.id, {
        serviceId: service.id,
        updatedBy: f.admin.id,
      }),
    /смет/,
  );
  assert.equal(workflowFor(f.db, f.ticket.id).amount, 100);
});
test("Assignment and revised declined terms keep ticket and workflow stages consistent", (t) => {
  const f = setup(t);
  f.db.updateTicket(f.ticket.id, {
    assignedTo: f.worker.id,
    updatedBy: f.admin.id,
  });
  assert.equal(workflowFor(f.db, f.ticket.id).state, "assigned");
  f.db.updateTicket(f.ticket.id, { status: "rejected", updatedBy: f.admin.id });
  f.db.transaction(() =>
    saveTerms(f.db, f.admin, f.ticket.id, {
      updatedAt: workflowFor(f.db, f.ticket.id).updatedAt,
      paid: false,
      amount: 0,
      accountId: null,
      requireBeforePhoto: false,
      requireAfterPhoto: false,
    }),
  );
  assert.equal(workflowFor(f.db, f.ticket.id).state, "assigned");
  assert.equal(f.db.getById("tickets", f.ticket.id).status, "accepted");
  assert.equal(f.db.getById("tickets", f.ticket.id).resolved_at, null);
});
test("Free work cannot carry a nonzero amount in its contract", () => {
  assert.equal(
    termsInput.safeParse({
      updatedAt: new Date().toISOString(),
      paid: false,
      amount: 100,
      accountId: null,
      requireBeforePhoto: false,
      requireAfterPhoto: false,
    }).success,
    false,
  );
});
test("Workflow versions advance even when two decisions share the same millisecond", (t) => {
  const f = setup(t),
    w = workflowFor(f.db, f.ticket.id),
    stamp = w.updatedAt;
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
  const body = {
    updatedAt: stamp,
    paid: false,
    amount: 0,
    accountId: null,
    requireBeforePhoto: false,
    requireAfterPhoto: false,
  };
  f.db.transaction(() => saveTerms(f.db, f.admin, f.ticket.id, body));
  assert.notEqual(workflowFor(f.db, f.ticket.id).updatedAt, stamp);
  assert.throws(
    () => f.db.transaction(() => saveTerms(f.db, f.admin, f.ticket.id, body)),
    /изменена/,
  );
});
test("PPR ignores no-op moves, preserves technical remarks and never offers rescheduling of rejected work", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const today = new Date().toISOString().slice(0, 10);
  saveOperation(f.db, f.admin, "plans", null, {
    propertyId: f.property.id,
    unitId: f.unit.id,
    name: "Осмотр",
    nextDate: today,
    recurrence: "months",
    intervalCount: 1,
    leadDays: 0,
    checklist: ["Осмотр"],
    responsibleId: f.worker.id,
    active: true,
  });
  const [id] = runMaintenance(f.db, today),
    ticket = f.db.getById("tickets", id);
  assert.throws(
    () =>
      changeMaintenanceTask(f.db, f.admin, id, {
        updatedAt: ticket.updated_at,
        toDate: ticket.sla_due_at,
        reason: "Без изменения",
        remark: "",
      }),
    /совпадает/,
  );
  assert.equal(f.db.data.maintenance_changes.length, 0);
  f.db.updateTicket(id, { status: "rejected", updatedBy: f.admin.id });
  const item = maintenanceProgress(f.db, f.admin).items.find(
    (i) => i.ticketId === id,
  );
  assert.equal(item.capabilities.reschedule, false);
  assert.equal(item.capabilities.remark, true);
  const stamp = ticket.updated_at;
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
  changeMaintenanceTask(f.db, f.worker, id, {
    updatedAt: stamp,
    toDate: null,
    reason: "Техническое наблюдение",
    remark: "Осмотреть повторно при следующем обходе",
  });
  assert.notEqual(ticket.updated_at, stamp);
  assert.throws(
    () =>
      changeMaintenanceTask(f.db, f.worker, id, {
        updatedAt: stamp,
        toDate: null,
        reason: "Повтор",
        remark: "",
      }),
    /изменено/,
  );
});
