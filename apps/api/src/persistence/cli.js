import { createPool } from "./pool.js";
import { migrate, assertMigrated } from "./migrate.js";
const action = process.argv[2];
if (!["migrate", "status"].includes(action))
  throw new Error("Usage: node apps/api/src/persistence/cli.js migrate|status");
const pool = createPool(process.env.DATABASE_URL);
try {
  if (action === "status") {
    await assertMigrated(pool);
    console.log(
      JSON.stringify(
        (
          await pool.query(
            "SELECT migrated_at,migration_counts FROM warehouse.storage_control WHERE id",
          )
        ).rows[0],
      ),
    );
  } else console.log(JSON.stringify(await migrate(pool)));
} catch (error) {
  console.error("Database migration failed", {
    code: error.code,
    message: error.message,
    constraint: error.constraint,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
