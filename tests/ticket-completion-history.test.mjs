import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  workflowFor,
  saveTerms,
  decideTicket,
} from "../apps/api/src/domain/ticket-workflow.js";

function setup(t) {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    createdBy: f.admin.id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "medium",
    title: "Ремонт света",
    description: "Проверка обязательных действий",
    checklistItems: [
      {
        id: "required",
        title: "Отключить питание",
        required: true,
        completed: false,
      },
      {
        id: "optional",
        title: "Дополнительная проверка",
        required: false,
        completed: false,
      },
    ],
  });
  saveTerms(f.db, f.admin, ticket.id, {
    updatedAt: workflowFor(f.db, ticket.id).updatedAt,
    paid: false,
    amount: 0,
    accountId: null,
    requireBeforePhoto: false,
    requireAfterPhoto: false,
  });
  const action = (name) =>
    f.db.transaction(() =>
      decideTicket(f.db, f.worker, ticket.id, {
        updatedAt: workflowFor(f.db, ticket.id).updatedAt,
        action: name,
        reason: "",
      }),
    );
  return { ...f, ticket, action };
}

test("Ordinary tasks cannot bypass required checklist through workflow or direct status edit", (t) => {
  const f = setup(t);
  f.action("start");
  const before = structuredClone(f.db.getTicket(f.ticket.id));
  const historyCount = f.db.listTicketHistory(f.ticket.id).length;
  assert.throws(() => f.action("submit"), /обязательные пункты чек-листа/);
  assert.throws(
    () =>
      f.db.updateTicket(f.ticket.id, {
        status: "completed",
        updatedBy: f.worker.id,
      }),
    /обязательные пункты/,
  );
  assert.deepEqual(f.db.getTicket(f.ticket.id), before);
  assert.equal(f.db.listTicketHistory(f.ticket.id).length, historyCount);
  assert.equal(workflowFor(f.db, f.ticket.id).state, "in_progress");
  f.db.updateTicketChecklistItem(f.ticket.id, "required", {
    completed: true,
    completedBy: f.worker.id,
  });
  f.action("submit");
  assert.equal(workflowFor(f.db, f.ticket.id).state, "awaiting_acceptance");
  assert.equal(f.db.getTicket(f.ticket.id).checklist_items[1].completed, false);
  const completed = f.db.getTicket(f.ticket.id).checklist_items[0];
  assert.equal(completed.completed_by, f.worker.id);
  assert.ok(completed.completed_at);
});

test("Assignment, category, priority and deadline have actor/time history without status changes or no-op duplicates", (t) => {
  const f = setup(t);
  const changed = {
    assignedTo: f.manager.id,
    category: "other",
    priority: "high",
    slaHours: 2,
    slaDueAt: "2026-12-31T12:00:00.000Z",
    updatedBy: f.admin.id,
  };
  f.db.updateTicket(f.ticket.id, changed);
  const history = f.db.listTicketHistory(f.ticket.id);
  assert.equal(history.length, 5);
  for (const type of [
    "assignment_changed",
    "category_changed",
    "priority_changed",
    "sla_changed",
  ]) {
    const event = history.find((entry) => entry.type === type);
    assert.equal(event.created_by, f.admin.id);
    assert.equal(event.created_by_name, f.admin.full_name);
    assert.ok(event.created_at && event.reason.includes(" → "));
    assert.equal(event.from_status, null);
    assert.equal(event.to_status, null);
  }
  assert.match(
    history.find((e) => e.type === "assignment_changed").reason,
    /Электрик → Менеджер/,
  );
  assert.match(
    history.find((e) => e.type === "priority_changed").reason,
    /Средний → Высокий/,
  );
  f.db.updateTicket(f.ticket.id, changed);
  assert.equal(f.db.listTicketHistory(f.ticket.id).length, 5);
  assert.throws(
    () =>
      f.db.updateTicket(f.ticket.id, {
        assignedTo: "missing",
        updatedBy: f.admin.id,
      }),
    /not found/,
  );
  assert.equal(f.db.listTicketHistory(f.ticket.id).length, 5);
});
