import { AsyncLocalStorage } from "node:async_hooks";
import { WarehouseDatabase } from "../database.js";
import { createPool, WRITE_LOCK } from "./pool.js";
import { assertMigrated } from "./migrate.js";
import { loadRows, flushRows } from "./rows.js";
import { isDeepStrictEqual } from "node:util";
import { appendAudit } from "./audit.js";
import { decodeRow } from "./schema.js";

export async function openDatabase({ databaseUrl }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
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
    setAuditActor(actor) {
      const scope = context.getStore();
      if (scope) scope.audit.actor = actor;
    },
    async auditPage({ query = "", entityId = null, offset = 0, limit = 50 }) {
      const client = context.getStore()?.client;
      if (!client) throw new Error("Audit read outside request scope");
      const where =
        "($1::text IS NULL OR entity_id=$1) AND ($2='' OR concat_ws(' ',actor_name,entity_type,entity_id,action) ILIKE '%' || $2 || '%')";
      const count = await client.query(
        `SELECT count(*)::int AS total FROM warehouse.audit_log WHERE ${where}`,
        [entityId, query],
      );
      const rows = await client.query(
        `SELECT * FROM warehouse.audit_log WHERE ${where} ORDER BY created_at DESC,_sequence DESC LIMIT $3 OFFSET $4`,
        [entityId, query, limit, offset],
      );
      return {
        items: rows.rows.map((r) => decodeRow("audit_log", r)),
        total: count.rows[0].total,
        offset,
        limit,
      };
    },
    async requestScope({ readOnly = false, source = "system" } = {}, fn) {
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
        const before = await loadRows(client, { auditLimit: 200 });
        const domain = new WarehouseDatabase(before);
        const audit = { source, actor: null };
        result = await context.run({ domain, client, afterCommit, audit }, fn);
        if (readOnly) {
          if (!isDeepStrictEqual(before, domain.data))
            throw new Error(
              "Read-only request attempted to change stored data",
            );
        } else {
          appendAudit(before, domain.data, audit);
          await flushRows(client, before, domain.data);
        }
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
