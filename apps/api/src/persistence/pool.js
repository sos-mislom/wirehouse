import pg from "pg";
export const WRITE_LOCK = [782144, 1];
export function createPool(databaseUrl) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const max = Number(process.env.DATABASE_POOL_SIZE ?? 8);
  if (!Number.isInteger(max) || max < 1 || max > 50)
    throw new Error("DATABASE_POOL_SIZE must be an integer from 1 to 50");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 120000,
    application_name: "wirehouse-api",
    types: {
      getTypeParser(oid, format) {
        if (oid === 1082) return (value) => value; // Calendar dates must not shift with TZ.
        if (oid === 1184) return (value) => new Date(value).toISOString();
        if (oid === 1700) return (value) => Number(value); // Domain DTOs use finite JS numbers.
        return pg.types.getTypeParser(oid, format);
      },
    },
  });
  pool.on("error", (error) =>
    console.error("PostgreSQL idle connection failed", { code: error.code }),
  );
  return pool;
}
