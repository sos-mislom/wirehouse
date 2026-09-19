import fs from "node:fs/promises";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { tables, emptyData, relation } from "./schema.js";
import { loadRows, normalizedData, flushRows } from "./rows.js";
import { WRITE_LOCK } from "./pool.js";

const migrations = ["001-relational.sql"];
async function sources() {
  return Promise.all(
    migrations.map(async (name) => {
      const sql = await fs.readFile(
        new URL(`./migrations/${name}`, import.meta.url),
        "utf8",
      );
      return {
        name,
        sql,
        checksum: crypto.createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}
export async function assertMigrated(client) {
  const expected = await sources();
  const { rows } = await client.query(
    "SELECT name, checksum FROM warehouse.schema_migrations ORDER BY name",
  );
  for (const migration of expected) {
    const applied = rows.find((row) => row.name === migration.name);
    if (!applied || applied.checksum !== migration.checksum)
      throw new Error(
        "Database schema differs from this release; run the matching migration",
      );
  }
  const control = await client.query(
    "SELECT mode FROM warehouse.storage_control WHERE id",
  );
  if (control.rows[0]?.mode !== "relational")
    throw new Error(
      "Database is in legacy mode; run the migration before starting this API",
    );
}
async function withMigrationLock(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL lock_timeout = '15s'; SET LOCAL statement_timeout = '5min'",
    );
    await client.query("SELECT pg_advisory_xact_lock($1,$2)", WRITE_LOCK);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate(pool) {
  return withMigrationLock(pool, async (client) => {
    await client.query(
      "CREATE SCHEMA IF NOT EXISTS warehouse; CREATE TABLE IF NOT EXISTS warehouse.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = (
      await client.query(
        "SELECT name, checksum FROM warehouse.schema_migrations ORDER BY name",
      )
    ).rows;
    const expected = await sources();
    for (const row of applied)
      if (
        !expected.some(
          (m) => m.name === row.name && m.checksum === row.checksum,
        )
      )
        throw new Error(`Unrecognized or modified migration: ${row.name}`);
    for (const migration of expected)
      if (!applied.some((row) => row.name === migration.name)) {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO warehouse.schema_migrations (name,checksum) VALUES ($1,$2)",
          [migration.name, migration.checksum],
        );
      }
    const control = (
      await client.query(
        "SELECT mode, migration_counts FROM warehouse.storage_control WHERE id",
      )
    ).rows[0];
    if (control?.mode === "relational")
      return { status: "already-migrated", counts: control.migration_counts };
    const legacyExists = (
      await client.query("SELECT to_regclass('public.app_state') AS name")
    ).rows[0].name;
    let legacy = emptyData();
    if (legacyExists) {
      // Old versions write this row without our advisory lock. Block them until
      // the archive's guard trigger is installed in the same atomic commit.
      await client.query(
        "LOCK TABLE public.app_state IN ACCESS EXCLUSIVE MODE",
      );
      const result = await client.query(
        "SELECT data FROM public.app_state WHERE id = 'warehouse'",
      );
      if (result.rows.length) legacy = result.rows[0].data;
    }
    const imported = normalizedData(legacy);
    if (control?.mode === "legacy")
      await client.query(
        `TRUNCATE ${Object.keys(tables).map(relation).join(",")} RESTART IDENTITY`,
      );
    await flushRows(client, emptyData(), imported);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const restored = await loadRows(client);
    if (!isDeepStrictEqual(imported, restored))
      throw new Error("Migration verification failed: row contents differ");
    const counts = Object.fromEntries(
      Object.entries(restored).map(([name, rows]) => [name, rows.length]),
    );
    await client.query(
      "INSERT INTO warehouse.storage_control (id,mode,migration_counts) VALUES (true,'relational',$1) ON CONFLICT (id) DO UPDATE SET mode='relational', migrated_at=now(), migration_counts=EXCLUDED.migration_counts",
      [counts],
    );
    if (legacyExists)
      await client.query(`
      CREATE OR REPLACE FUNCTION warehouse.reject_legacy_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'app_state is a migration archive; use the relational API' USING ERRCODE = '55000'; END; $$;
      DROP TRIGGER IF EXISTS reject_legacy_write ON public.app_state;
      CREATE TRIGGER reject_legacy_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.app_state FOR EACH STATEMENT EXECUTE FUNCTION warehouse.reject_legacy_write();
    `);
    return {
      status: "migrated",
      counts,
      sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(restored))
        .digest("hex"),
    };
  });
}
// Explicit deployment rollback, never a runtime fallback. Stop all APIs first.
// Export CURRENT relational rows, so a rollback cannot silently restore stale data.
export async function rollbackLegacy(pool) {
  return withMigrationLock(pool, async (client) => {
    await assertMigrated(client);
    const data = await loadRows(client);
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.app_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query("LOCK TABLE public.app_state IN ACCESS EXCLUSIVE MODE");
    await client.query(
      "DROP TRIGGER IF EXISTS reject_legacy_write ON public.app_state",
    );
    await client.query(
      "INSERT INTO public.app_state(id,data) VALUES ('warehouse',$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",
      [JSON.stringify(data)],
    );
    await client.query(
      "UPDATE warehouse.storage_control SET mode='legacy' WHERE id",
    );
    return {
      status: "legacy-exported",
      counts: Object.fromEntries(
        Object.entries(data).map(([name, rows]) => [name, rows.length]),
      ),
    };
  });
}
