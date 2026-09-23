import fs from "node:fs/promises";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadRows } from "./rows.js";
import { WRITE_LOCK } from "./pool.js";

const migrations = [
  "001-relational.sql",
  "002-remove-legacy-state.sql",
  "003-operations-platform.sql",
];

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
  if (
    !isDeepStrictEqual(
      rows,
      expected.map(({ name, checksum }) => ({ name, checksum })),
    )
  )
    throw new Error(
      "Database schema differs from this release; run the matching migration",
    );
  const control = await client.query(
    "SELECT id FROM warehouse.storage_control WHERE id",
  );
  if (!control.rows[0]) throw new Error("Database storage is not initialized");
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
    let schemaChanged = false;
    for (const row of applied)
      if (
        !expected.some(
          (migration) =>
            migration.name === row.name && migration.checksum === row.checksum,
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
        schemaChanged = true;
      }

    const control = (
      await client.query(
        "SELECT migration_counts FROM warehouse.storage_control WHERE id",
      )
    ).rows[0];
    if (control)
      return {
        status: schemaChanged ? "migrated" : "already-migrated",
        counts: control.migration_counts,
      };

    const restored = await loadRows(client);
    const counts = Object.fromEntries(
      Object.entries(restored).map(([name, rows]) => [name, rows.length]),
    );
    await client.query(
      "INSERT INTO warehouse.storage_control (id,migration_counts) VALUES (true,$1)",
      [counts],
    );
    return {
      status: "initialized",
      counts,
      sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(restored))
        .digest("hex"),
    };
  });
}
