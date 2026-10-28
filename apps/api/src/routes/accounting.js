import { contextCan } from "../domain/context-access.js";
import { parseJsonBody } from "../http/body.js";
import { parseDto } from "../http/body.js";
import { exchangePageQuery } from "../../../../packages/contracts/src/registry.ts";
import { assertPermission } from "../services/permissions.js";
import {
  businessError,
  requiredRecord,
  publicSource,
  saveSource,
  rotateSourceToken,
  authenticateSource,
  saveExternalLink,
  saveAccount,
  processExchange,
} from "../domain/accounting.js";
const summary = ({ payload, payloadHash, ...row }) => row;
export function createAccountingRoutes({
  db,
  requireAuth,
  ok,
  json,
  getScopedLease,
  exchangeEnvironment,
}) {
  return async (request, response, url) => {
    const path = url.pathname,
      method = request.method;
    if (!/^\/api\/(accounting|integrations\/accounting)(\/|$)/.test(path))
      return false;
    try {
      const machine = path.match(
        /^\/api\/integrations\/accounting\/([a-zA-Z0-9-]+)\/(capabilities|runs|messages|outbox\/claim|outbox\/([a-zA-Z0-9-]+)\/ack)$/,
      );
      if (machine) {
        const source = authenticateSource(
          db,
          machine[1],
          request.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (source.environment !== exchangeEnvironment)
          throw businessError(
            "Источник другой среды",
            409,
            "ENVIRONMENT_MISMATCH",
          );
        if (machine[2] === "capabilities") {
          if (method !== "GET")
            throw businessError("Метод не поддерживается", 405);
          ok(response, {
            sourceId: source.id,
            environment: exchangeEnvironment,
            schemaVersion: 1,
            runReports: true,
            incomingKinds: [
              "properties",
              "units",
              "tenants",
              "leases",
              "meters",
              "accounts",
              "statements",
            ],
            outgoingKinds: [
              "readings",
              "work_results",
              "work_reopened",
              "service_acts",
            ],
          });
          return true;
        }
        if (method !== "POST")
          throw businessError("Метод не поддерживается", 405);
        const input = await parseJsonBody(request);
        if (machine[2] === "runs") {
          if (source.lastRunId !== input.runId) {
            source.lastSeenAt = new Date().toISOString();
            source.lastRunId = input.runId;
            source.lastError =
              input.status === "failed"
                ? (input.error ?? "EXCHANGE_FAILED")
                : null;
            if (input.status === "ok")
              source.lastSuccessfulAt = source.lastSeenAt;
          }
          ok(response, { accepted: true });
          return true;
        }
        if (machine[2] === "messages")
          ok(
            response,
            processExchange(db, source.id, input, exchangeEnvironment),
          );
        else if (machine[2] === "outbox/claim") {
          const now = new Date().toISOString();
          const items = db.data.exchange_outbox
            .filter(
              (r) =>
                r.sourceId === source.id &&
                (!input.kinds || input.kinds.includes(r.kind)) &&
                r.status !== "applied" &&
                (r.status !== "failed" || r.attempts < 8) &&
                (!r.nextAttemptAt || r.nextAttemptAt <= now),
            )
            .slice(0, input.limit);
          for (const row of items) {
            row.attempts++;
            row.updatedAt = now;
            row.nextAttemptAt = new Date(Date.now() + 60000).toISOString();
          }
          ok(response, {
            items: items.map((r) => ({ ...summary(r), payload: r.payload })),
          });
        } else {
          const row = requiredRecord(db, "exchange_outbox", machine[3]);
          if (row.sourceId !== source.id)
            throw businessError("Сообщение другого источника", 404);
          if (!input.accepted && !input.error?.trim())
            throw businessError("Укажите причину отказа");
          if (row.status === "applied") {
            if (!input.accepted)
              throw businessError("Доставка уже подтверждена", 409);
          } else {
            row.status = input.accepted ? "applied" : "failed";
            row.error = input.accepted ? null : input.error;
            row.updatedAt = new Date().toISOString();
            row.nextAttemptAt = input.accepted
              ? null
              : new Date(Date.now() + 60000).toISOString();
          }
          ok(response, { item: summary(row) });
        }
        return true;
      }
      const actor = requireAuth(request, response);
      if (!actor) return true;
      const admin = actor.role === "admin";
      if (path === "/api/accounting/exchange" && method === "GET") {
        assertPermission(actor, "exchange.manage");
        if (!admin) throw businessError("Журнал доступен администратору", 403);
        const query = parseDto(
          exchangePageQuery,
          Object.fromEntries(url.searchParams),
        );
        ok(response, await db.exchangePage(query));
        return true;
      }
      if (path === "/api/accounting" && method === "GET") {
        const accounts = db.data.personal_accounts.filter((a) =>
          contextCan(db, actor, "finance.read", "personal_accounts", a.id),
        );
        const ids = new Set(accounts.map((a) => a.id));
        const sourceIds = new Set(accounts.map((a) => a.sourceId));
        ok(response, {
          sources: db.data.accounting_sources
            .filter((s) => admin || sourceIds.has(s.id))
            .map(publicSource),
          accounts,
          statements: db.data.account_statements.filter(
            (s) =>
              ids.has(s.accountId) &&
              contextCan(
                db,
                actor,
                "finance.read",
                "personal_accounts",
                s.accountId,
                new Date().toISOString().slice(0, 10),
                s.period + "-01",
              ),
          ),
          links: admin ? db.data.external_links : [],
        });
        return true;
      }
      const source = path.match(
        /^\/api\/accounting\/sources(?:\/([a-zA-Z0-9-]+))?(?:\/(token|messages))?$/,
      );
      if (source && ["POST", "PUT"].includes(method)) {
        assertPermission(actor, "accounting.manage");
        const body = await parseJsonBody(request);
        if (source[2] === "token")
          ok(response, rotateSourceToken(db, source[1]));
        else if (source[2] === "messages")
          ok(
            response,
            processExchange(db, source[1], body, exchangeEnvironment),
          );
        else ok(response, { item: saveSource(db, actor, source[1], body) });
        return true;
      }
      if (path === "/api/accounting/links" && method === "POST") {
        assertPermission(actor, "accounting.manage");
        const body = await parseJsonBody(request);
        ok(response, {
          item: db.transaction(() => saveExternalLink(db, body)),
        });
        return true;
      }
      const account = path.match(
        /^\/api\/accounting\/accounts(?:\/([a-zA-Z0-9-]+))?$/,
      );
      if (account && ["POST", "PUT"].includes(method)) {
        assertPermission(actor, "leases.write");
        const body = await parseJsonBody(request);
        if (
          !getScopedLease(actor, body.leaseId) ||
          !contextCan(db, actor, "leases.write", "leases", body.leaseId) ||
          (account[1] &&
            !getScopedLease(
              actor,
              requiredRecord(db, "personal_accounts", account[1]).leaseId,
            ))
        )
          throw businessError("Нет доступа к договору", 403);
        ok(response, {
          item: db.transaction(() => saveAccount(db, account[1], body)),
        });
        return true;
      }
      const retry = path.match(
        /^\/api\/accounting\/(inbox|outbox)\/([a-zA-Z0-9-]+)\/retry$/,
      );
      if (retry && method === "POST") {
        assertPermission(actor, "exchange.manage");
        await parseJsonBody(request);
        const row = requiredRecord(
          db,
          retry[1] === "inbox" ? "exchange_inbox" : "exchange_outbox",
          retry[2],
        );
        if (retry[1] === "outbox") {
          if (row.status === "applied")
            throw businessError("Доставка уже подтверждена", 409);
          row.status = "pending";
          row.nextAttemptAt = null;
          row.updatedAt = new Date().toISOString();
          ok(response, { item: summary(row) });
          return true;
        }
        ok(
          response,
          processExchange(db, row.sourceId, row.payload, exchangeEnvironment),
        );
        return true;
      }
      throw businessError("Маршрут не найден", 404);
    } catch (error) {
      json(response, error.status ?? 400, {
        error: error.message,
        code: error.code ?? "INVALID_REQUEST",
        ...(error.fields ? { fields: error.fields } : {}),
      });
    }
    return true;
  };
}
