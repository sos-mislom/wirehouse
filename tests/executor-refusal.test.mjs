import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  decideTicket,
  workflowFor,
} from "../apps/api/src/domain/ticket-workflow.js";
test("Refusal before work records the executor/reason and only a dispatcher can recover assignment", () => {
  const f = fixture();
  try {
    const ticket = f.db.createTicket({
      unitId: f.unit.id,
      tenantId: f.tenant.id,
      leaseId: f.lease.id,
      assignedTo: f.worker.id,
      createdBy: f.manager.id,
      title: "Demo refusal",
      description: "Refuse before starting",
      category: "other",
      priority: "medium",
    });
    const w = workflowFor(f.db, ticket.id);
    assert.throws(() =>
      decideTicket(f.db, f.worker, ticket.id, {
        updatedAt: w.updatedAt,
        action: "refuse",
        reason: "",
      }),
    );
    decideTicket(f.db, f.worker, ticket.id, {
      updatedAt: w.updatedAt,
      action: "refuse",
      reason: "Необходим допуск",
    });
    assert.equal(w.state, "refused");
    assert.equal(f.db.data.ticket_decisions.at(-1).reason, "Необходим допуск");
    assert.throws(
      () =>
        f.db.updateTicket(ticket.id, {
          status: "in_progress",
          updatedBy: f.worker.id,
        }),
      /переназначает/,
    );
    f.db.updateTicket(ticket.id, { assignedTo: null, updatedBy: f.manager.id });
    assert.equal(workflowFor(f.db, ticket.id).state, "registered");
  } finally {
    f.cleanup();
  }
});
