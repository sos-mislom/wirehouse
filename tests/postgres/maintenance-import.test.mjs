import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures.mjs";
import { scheduleFile } from "../maintenance-fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { saveOperation } from "../../apps/api/src/operations.js";
import {
  prepareMaintenanceImport,
  commitMaintenanceImport,
} from "../../apps/api/src/services/maintenance-import.js";
test("PPR import migration preserves existing plans; concurrent submissions cannot duplicate keys and writes are audited", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const old = saveOperation(f.db, f.admin, "plans", null, {
    name: "Существующий график",
    propertyId: f.property.id,
    unitId: f.unit.id,
    recurrence: "months",
    intervalCount: 1,
    nextDate: "2030-01-31",
    checklist: ["Проверить"],
  });
  const pg = await postgresFixture(f.db.data);
  let first, second;
  t.after(async () => {
    if (first) await first.close();
    if (second) await second.close();
    await pg.cleanup();
  });
  // Recreate the prior schema only inside this disposable fixture to exercise a populated upgrade.
  await pg.pool.query(
    "ALTER TABLE warehouse.maintenance_plans DROP COLUMN import_key; DELETE FROM warehouse.schema_migrations WHERE name='004-maintenance-import.sql'",
  );
  assert.equal((await migrate(pg.pool)).status, "migrated");
  assert.equal(
    (
      await pg.pool.query(
        "SELECT import_key, name FROM warehouse.maintenance_plans WHERE id=$1",
        [old.id],
      )
    ).rows[0].name,
    old.name,
  );
  first = await openDatabase({ databaseUrl: pg.url });
  second = await openDatabase({ databaseUrl: pg.url });
  const input = scheduleFile(f);
  const { preview } = await first.requestScope({ readOnly: true }, () =>
    prepareMaintenanceImport(first, f.admin, input),
  );
  const attempts = await Promise.allSettled(
    [first, second].map((db) =>
      db.requestScope({ source: "POST /api/maintenance-import/commit" }, () => {
        db.setAuditActor(f.admin);
        return commitMaintenanceImport(db, f.admin, {
          ...input,
          previewHash: preview.previewHash,
        });
      }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    attempts.find((r) => r.status === "rejected").reason.status,
    409,
  );
  const data = await pg.readState();
  assert.equal(data.maintenance_plans.length, 2);
  const imported = data.maintenance_plans.find(
    (p) => p.importKey === "PPR-001",
  );
  assert.ok(imported);
  assert.ok(
    data.audit_log.some(
      (a) =>
        a.entityType === "maintenance_plans" &&
        a.entityId === imported.id &&
        a.actorId === f.admin.id,
    ),
  );
  await assert.rejects(
    pg.pool.query(
      "UPDATE warehouse.maintenance_plans SET import_key='PPR-001' WHERE id=$1",
      [old.id],
    ),
    (e) => e.code === "23505",
  );
});
