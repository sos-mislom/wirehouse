import crypto from "node:crypto";
import { createPool } from "../../apps/api/src/persistence/pool.js";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import {
  flushRows,
  loadRows,
  normalizedData,
} from "../../apps/api/src/persistence/rows.js";
import { emptyData } from "../../apps/api/src/persistence/schema.js";

// Every suite owns a separate disposable database; never reset the supplied DB.
export async function postgresFixture(data, { applyMigration = true } = {}) {
  if (!process.env.TEST_POSTGRES_URL)
    throw new Error(
      "TEST_POSTGRES_URL is required for PostgreSQL integration tests",
    );
  const admin = createPool(process.env.TEST_POSTGRES_URL);
  const name = `wirehouse_test_${crypto.randomBytes(8).toString("hex")}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.TEST_POSTGRES_URL);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString());
  const cleanup = async () => {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  };
  try {
    const result = applyMigration ? await migrate(pool) : null;
    if (data) {
      if (!applyMigration)
        throw new Error("Fixture data requires an initialized schema");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await flushRows(client, emptyData(), normalizedData(data));
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    return {
      pool,
      url: url.toString(),
      result,
      cleanup,
      readState: () => loadRows(pool),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
