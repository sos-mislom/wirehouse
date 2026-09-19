import crypto from "node:crypto";
import { createPool } from "../../apps/api/src/persistence/pool.js";
import { migrate } from "../../apps/api/src/persistence/migrate.js";
import { loadRows } from "../../apps/api/src/persistence/rows.js";

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
    if (data) {
      await pool.query(
        "CREATE TABLE public.app_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
      );
      await pool.query(
        "INSERT INTO public.app_state (id,data) VALUES ('warehouse',$1)",
        [JSON.stringify(data)],
      );
    }
    const result = applyMigration ? await migrate(pool) : null;
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
