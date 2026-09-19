import { AsyncLocalStorage } from "node:async_hooks";
import { WarehouseDatabase } from "../database.js";
import { createPool, WRITE_LOCK } from "./pool.js";
import { assertMigrated } from "./migrate.js";
import { loadRows, flushRows } from "./rows.js";
import { isDeepStrictEqual } from "node:util";

export async function openDatabase({ databaseUrl, dbPath }) {
  if (!databaseUrl) {
    const db = new WarehouseDatabase(dbPath);
    db.requestScope = async (_options, fn) => fn();
    db.close = async () => {};
    db.health = async () => true;
    db.afterCommit = async (fn) => fn();
    return db;
  }
  const pool = createPool(databaseUrl);
  try {
    await assertMigrated(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const context = new AsyncLocalStorage();
  const api = {
    backend: "postgres",
    async health() {
      await (context.getStore()?.client ?? pool).query("SELECT 1");
      return true;
    },
    async close() {
      await pool.end();
    },
    afterCommit(fn) {
      const scope = context.getStore();
      if (!scope) throw new Error("Post-commit action outside a transaction");
      scope.afterCommit.push(fn);
    },
    async requestScope({ readOnly = false } = {}, fn) {
      if (context.getStore())
        throw new Error("Nested database request scopes are not supported");
      const client = await pool.connect();
      const afterCommit = [];
      let result;
      try {
        await client.query(
          readOnly
            ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
            : "BEGIN",
        );
        if (!readOnly) {
          await client.query("SET LOCAL lock_timeout = '10s'");
          // Serialize domain writes across processes until each aggregate has its
          // own SQL repository. Readers never take this lock or wait for writers.
          await client.query("SELECT pg_advisory_xact_lock($1,$2)", WRITE_LOCK);
        }
        const control = await client.query(
          "SELECT mode FROM warehouse.storage_control WHERE id",
        );
        if (control.rows[0]?.mode !== "relational")
          throw new Error("Database is not in relational mode");
        const before = await loadRows(client);
        const domain = new WarehouseDatabase(null, {
          data: structuredClone(before),
        });
        result = await context.run({ domain, client, afterCommit }, fn);
        if (readOnly) {
          if (!isDeepStrictEqual(before, domain.data))
            throw new Error(
              "Read-only request attempted to change stored data",
            );
        } else await flushRows(client, before, domain.data);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      // SQL is already durable. A failed cleanup must not report that the
      // business operation rolled back; retain the unused file and log it.
      for (const action of afterCommit) {
        try {
          await action();
        } catch (error) {
          console.error("Post-commit file cleanup failed", {
            code: error.code,
            message: error.message,
          });
        }
      }
      return result;
    },
  };
  return new Proxy(api, {
    get(target, key) {
      if (key in target)
        return typeof target[key] === "function"
          ? target[key].bind(target)
          : target[key];
      if (key === "then" || typeof key === "symbol") return undefined;
      const domain = context.getStore()?.domain;
      if (!domain)
        throw new Error(
          `Database access outside a request transaction: ${key}`,
        );
      return typeof domain[key] === "function"
        ? domain[key].bind(domain)
        : domain[key];
    },
  });
}
