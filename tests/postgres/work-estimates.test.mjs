import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import {
  saveEstimate,
  transitionEstimate,
} from "../../apps/api/src/domain/estimates.js";
import {
  publishedEstimate,
  workflowFor,
} from "../../apps/api/src/domain/ticket-workflow.js";

test("Estimate binding migration preserves unique scope, refuses ambiguity and persists an explicit replacement across connections", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = (name) =>
    f.db.createTicket({
      unitId: f.unit.id,
      tenantId: f.tenant.id,
      leaseId: f.lease.id,
      createdBy: f.admin.id,
      title: name,
      description: "Описание",
      category: "other",
      priority: "low",
    });
  const first = ticket("Однозначная смета"),
    second = ticket("Несколько вариантов");
  const input = (ticketId) => ({
    propertyId: f.property.id,
    ticketId,
    name: "Работа",
    contractorId: null,
    version: 0,
    lines: [
      {
        kind: "labor",
        catalogId: null,
        description: "Работа",
        unit: "шт",
        quantity: 1,
        unitPrice: 100,
        vatRate: "0",
      },
    ],
  });
  const quote = (id) => {
    const row = saveEstimate(f.db, f.admin, null, input(id));
    transitionEstimate(f.db, f.admin, row.id, "submit", {
      version: row.version,
    });
    return row;
  };
  const unique = quote(first.id);
  quote(second.id);
  quote(second.id);
  const pg = await postgresFixture(f.db.data);
  let a, b;
  t.after(async () => {
    await a?.close();
    await b?.close();
    await pg.cleanup();
  });
  await pg.pool.query(
    "ALTER TABLE warehouse.ticket_workflows DROP COLUMN estimate_id; DROP INDEX warehouse.service_act_ticket_unique; DELETE FROM warehouse.schema_migrations WHERE name='008-work-estimate-binding.sql'",
  );
  assert.equal((await migrate(pg.pool)).status, "migrated");
  const rows = await pg.readState();
  assert.equal(
    rows.ticket_workflows.find((w) => w.ticketId === first.id).estimateId,
    unique.id,
  );
  assert.equal(
    rows.ticket_workflows.find((w) => w.ticketId === second.id).estimateId,
    null,
  );
  assert.equal(rows.estimates.length, 3);
  a = await openDatabase({ databaseUrl: pg.url });
  b = await openDatabase({ databaseUrl: pg.url });
  await a.requestScope({ readOnly: true }, () =>
    assert.throws(
      () => publishedEstimate(a, second.id),
      /Не выбрана актуальная смета/,
    ),
  );
  const replacement = await a.requestScope({}, () => {
    a.setAuditActor(f.admin);
    const row = saveEstimate(a, f.admin, null, input(second.id));
    transitionEstimate(a, f.admin, row.id, "submit", { version: row.version });
    return { id: row.id, version: row.version };
  });
  await b.requestScope({ readOnly: true }, () =>
    assert.equal(workflowFor(b, second.id).estimateId, replacement.id),
  );
  await b.requestScope({}, () =>
    transitionEstimate(b, f.admin, replacement.id, "approve", {
      version: replacement.version,
    }),
  );
  await a.requestScope({ readOnly: true }, () =>
    assert.equal(publishedEstimate(a, second.id).id, replacement.id),
  );
  assert.equal((await migrate(pg.pool)).status, "already-migrated");
});
