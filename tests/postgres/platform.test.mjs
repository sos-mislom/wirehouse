import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { postgresFixture } from "./helpers.mjs";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { fixture } from "../fixtures.mjs";
test("Upgrade v2 preserves populated locations, backfills stable relations and protects history", async (t) => {
  const pg = await postgresFixture(null, { applyMigration: false });
  t.after(pg.cleanup);
  await pg.pool.query(
    "CREATE SCHEMA warehouse;CREATE TABLE warehouse.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of ["001-relational.sql", "002-remove-legacy-state.sql"]) {
    const sql = await fs.readFile(
      new URL(
        `../../apps/api/src/persistence/migrations/${name}`,
        import.meta.url,
      ),
      "utf8",
    );
    await pg.pool.query(sql);
    await pg.pool.query(
      "INSERT INTO warehouse.schema_migrations(name,checksum) VALUES($1,$2)",
      [name, crypto.createHash("sha256").update(sql).digest("hex")],
    );
  }
  await pg.pool.query(
    "INSERT INTO warehouse.properties(id,name,address,total_area,rentable_area) VALUES('p','Объект','Адрес',100,90);INSERT INTO warehouse.units(id,property_id,number,area,floor,building,entrance) VALUES('u1','p','101',20,1,'A:B','C'),('u2','p','101',20,1,'A','B:C'),('u3','p','201',20,2,'','')",
  );
  await migrate(pg.pool);
  const units = (await pg.pool.query("SELECT * FROM warehouse.units")).rows;
  assert.equal(units.length, 3);
  assert.equal(new Set(units.map((u) => u.floor_id)).size, 3);
  assert.equal(
    (await pg.pool.query("SELECT count(*)::int AS n FROM warehouse.buildings"))
      .rows[0].n,
    3,
  );
  await assert.rejects(
    pg.pool.query(
      "INSERT INTO warehouse.units(id,property_id,floor_id,number,area,floor) SELECT 'duplicate',property_id,floor_id,number,area,floor FROM warehouse.units WHERE id='u1'",
    ),
    { code: "23505" },
  );
  await pg.pool.query(
    "INSERT INTO warehouse.audit_log(id,action) VALUES('history','created')",
  );
  await assert.rejects(
    pg.pool.query("DELETE FROM warehouse.audit_log WHERE id='history'"),
    { code: "23514" },
  );
});
test("Audit paginates complete history without loading it into every domain transaction", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const pg = await postgresFixture(f.db.data);
  const db = await openDatabase({ databaseUrl: pg.url });
  t.after(async () => {
    await db.close();
    await pg.cleanup();
  });
  await pg.pool.query(
    "INSERT INTO warehouse.audit_log(id,actor_name,entity_type,entity_id,action,created_at) SELECT 'history-'||n,'Автор','properties','p','updated',now() FROM generate_series(1,250)n",
  );
  await db.requestScope({ readOnly: true }, async () => {
    assert.equal(db.data.audit_log.length, 200);
    const page = await db.auditPage({ entityId: "p", offset: 200, limit: 50 });
    assert.equal(page.total, 250);
    assert.equal(page.items.length, 50);
  });
  await db.requestScope({ source: "PUT /api/properties" }, () => {
    db.setAuditActor(f.admin);
    db.updateProperty(f.property.id, { name: "Изменено" });
  });
  assert.equal(
    (await pg.pool.query("SELECT count(*)::int AS n FROM warehouse.audit_log"))
      .rows[0].n,
    251,
  );
});
