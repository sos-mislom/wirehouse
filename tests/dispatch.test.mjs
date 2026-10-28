import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  saveDispatch,
  dispatchWorkspace,
} from "../apps/api/src/domain/dispatch.js";
import {
  workflowFor,
  decideTicket,
} from "../apps/api/src/domain/ticket-workflow.js";
test("Category dispatch pins the service/reviewer, checks members and prevents unauthorized acceptance", () => {
  const f = fixture();
  try {
    const team = saveDispatch(f.db, f.admin, "teams", null, {
      propertyId: f.property.id,
      name: "Электрослужба",
      memberIds: [f.worker.id],
      active: true,
      updatedAt: null,
    });
    const rule = saveDispatch(f.db, f.admin, "rules", null, {
      propertyId: f.property.id,
      category: "other",
      teamId: team.id,
      reviewerId: f.manager.id,
      active: true,
      updatedAt: null,
    });
    assert.throws(() =>
      saveDispatch(f.db, f.worker, "teams", team.id, {
        ...team,
        updatedAt: team.updatedAt,
      }),
    );
    assert.equal(dispatchWorkspace(f.db, f.worker).teams.length, 0);
    assert.throws(
      () =>
        f.db.createTicket({
          unitId: f.unit.id,
          assignedTo: f.admin.id,
          createdBy: f.admin.id,
          title: "Неверный состав",
          description: "Тест",
          category: "other",
          priority: "medium",
        }),
      /службы/,
    );
    const ticket = f.db.createTicket({
      unitId: f.unit.id,
      assignedTo: f.worker.id,
      createdBy: f.admin.id,
      title: "Электрика",
      description: "Тест",
      category: "other",
      priority: "medium",
      checklistItems: [],
    });
    const w = () => workflowFor(f.db, ticket.id);
    assert.deepEqual([w().teamId, w().reviewerId], [team.id, f.manager.id]);
    const act = (actor, action) =>
      decideTicket(f.db, actor, ticket.id, {
        updatedAt: w().updatedAt,
        action,
        reason: "Тест",
      });
    act(f.worker, "start");
    act(f.worker, "submit");
    assert.throws(() => act(f.admin, "accept"), /ответственный/);
    act(f.manager, "accept");
    assert.equal(w().state, "accepted");
    assert.throws(
      () =>
        saveDispatch(f.db, f.admin, "rules", null, {
          propertyId: f.property.id,
          category: "other",
          teamId: team.id,
          reviewerId: f.manager.id,
          active: true,
          updatedAt: null,
        }),
      /уже/,
    );
  } finally {
    f.cleanup();
  }
});
