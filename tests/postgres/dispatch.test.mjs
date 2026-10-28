import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { saveDispatch } from "../../apps/api/src/domain/dispatch.js";
import { workflowFor } from "../../apps/api/src/domain/ticket-workflow.js";
test("Service groups and pinned acceptance routes persist, reject concurrent edits and retain issued tasks", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const pg = await postgresFixture(f.db.data);
  t.after(pg.cleanup);
  const db = await openDatabase({ databaseUrl: pg.url });
  t.after(() => db.close());
  let team, rule, ticket;
  await db.requestScope({}, () => {
    team = saveDispatch(db, f.admin, "teams", null, {
      propertyId: f.property.id,
      name: "Техническая служба",
      memberIds: [f.worker.id],
      active: true,
      updatedAt: null,
    });
    rule = saveDispatch(db, f.admin, "rules", null, {
      propertyId: f.property.id,
      category: "other",
      teamId: team.id,
      reviewerId: f.manager.id,
      active: true,
      updatedAt: null,
    });
    ticket = db.createTicket({
      unitId: f.unit.id,
      assignedTo: f.worker.id,
      createdBy: f.admin.id,
      title: "Проверка",
      description: "Тест",
      category: "other",
      priority: "medium",
      checklistItems: [],
    });
  });
  await db.requestScope({}, () => {
    assert.deepEqual(
      [
        workflowFor(db, ticket.id).teamId,
        workflowFor(db, ticket.id).reviewerId,
      ],
      [team.id, f.manager.id],
    );
    saveDispatch(db, f.admin, "teams", team.id, {
      propertyId: f.property.id,
      name: "Обновленная служба",
      memberIds: [],
      active: false,
      updatedAt: team.updatedAt,
    });
    db.updateTicket(ticket.id, {
      status: "in_progress",
      updatedBy: f.worker.id,
    });
  });
  await assert.rejects(
    db.requestScope({}, () =>
      saveDispatch(db, f.admin, "teams", team.id, {
        propertyId: f.property.id,
        name: "Устаревшая правка",
        memberIds: [],
        active: true,
        updatedAt: team.updatedAt,
      }),
    ),
    /изменена/,
  );
  const state = await pg.readState();
  assert.equal(
    state.ticket_workflows.find((w) => w.ticketId === ticket.id).reviewerId,
    f.manager.id,
  );
  assert.ok(
    state.audit_log.some(
      (r) => r.entityType === "dispatch_rules" && r.entityId === rule.id,
    ),
  );
});
