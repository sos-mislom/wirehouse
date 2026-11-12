import crypto from "node:crypto";
import { RequestError, preloadedBody } from "./body.js";
import { contextCan, requireContext } from "../domain/context-access.js";
import { requiredRecord } from "../domain/accounting.js";
import { canReviewRoutedTicket } from "../domain/dispatch.js";

const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;
/** @type {[string, RegExp][]} */
const supportedCommands = [
  ["POST", /^\/api\/tickets$/],
  ["POST", /^\/api\/tickets\/[^/]+\/comments$/],
  ["POST", /^\/api\/tickets\/[^/]+\/attachments$/],
  ["PUT", /^\/api\/tickets\/[^/]+\/checklist\/[^/]+$/],
  ["POST", /^\/api\/tickets\/[^/]+\/workflow\/decision$/],
  ["POST", /^\/api\/documents$/],
];
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

// Only the explicitly supported mobile-queue commands participate. Every
// supported replay has an entity permission guard below. Other routes keep
// their normal authorization/execution path, even if a client sends this
// header; in particular never cache a sign-in, OTP or integration response.
export function idempotencyKeyFor(request, method, url) {
  const key = request.headers["idempotency-key"];
  if (
    key === undefined ||
    method === "GET" ||
    method === "HEAD" ||
    !url.pathname.startsWith("/api/") ||
    /^\/api\/(auth|integrations)(?:\/|$)/.test(url.pathname) ||
    !supportedCommands.some(
      ([verb, pattern]) => verb === method && pattern.test(url.pathname),
    )
  )
    return null;
  if (typeof key !== "string" || !keyPattern.test(key))
    throw new RequestError(
      "Некорректный заголовок Idempotency-Key",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  return key;
}

// userId comes from requireAuth inside the current database transaction, never
// from an unverified JWT subject. Scope survives a renewed login of the same
// person, so an offline retry after a lost response cannot create a duplicate.
export function idempotencyFor(request, method, url, userId) {
  const key = idempotencyKeyFor(request, method, url);
  if (!key) return null;
  if (!userId)
    throw new RequestError("Необходим вход в систему", 401, "UNAUTHORIZED");
  return {
    key,
    scope: sha256(`user:${userId}`),
    requestHash: sha256(
      `${method} ${url.pathname}${url.search}\n${preloadedBody(request)}`,
    ),
  };
}

// A receipt is not a grant of access. Recheck the entity permissions used by
// the offline queue, without rerunning workflow state/version checks: a
// successful "start" or "submit" has already moved that state.
export function authorizeIdempotentReplay(
  db,
  actor,
  request,
  url,
  receiptBody,
) {
  const receipt = JSON.parse(receiptBody);
  if (url.pathname === "/api/tickets" && request.method === "POST") {
    const body = JSON.parse(preloadedBody(request));
    requireContext(db, actor, "tickets.write", "units", body.unitId);
    if (body.leaseId)
      requireContext(db, actor, "tickets.write", "leases", body.leaseId);
    const created = requiredRecord(db, "tickets", receipt.item.id);
    requireContext(db, actor, "workspace.read", "tickets", created.id);
    if (receipt.item.financialAccess)
      requireContext(db, actor, "finance.read", "tickets", created.id);
  }
  const ticket = url.pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)(?:\/|$)/);
  if (ticket) {
    const id = ticket[1];
    requireContext(db, actor, "workspace.read", "tickets", id);
    if (/\/workflow\/decision$/.test(url.pathname)) {
      const body = JSON.parse(preloadedBody(request));
      const workflow = db.data.ticket_workflows.find(
        (row) => row.ticketId === id,
      );
      if (
        (receipt.item.amount != null || receipt.item.accountId != null) &&
        !contextCan(db, actor, "finance.read", "tickets", id) &&
        !(
          workflow?.accountId &&
          contextCan(
            db,
            actor,
            "work.approve",
            "personal_accounts",
            workflow.accountId,
          )
        )
      )
        throw new RequestError(
          "Нет права просматривать стоимость работы",
          403,
          "CONTEXT_PERMISSION_DENIED",
        );
      if (["approve", "decline"].includes(body.action)) {
        requireContext(
          db,
          actor,
          "work.approve",
          "personal_accounts",
          workflow?.accountId,
        );
      } else if (["accept", "return"].includes(body.action)) {
        requireContext(db, actor, "tickets.accept", "tickets", id);
        if (
          !workflow ||
          !canReviewRoutedTicket(
            db,
            actor,
            requiredRecord(db, "tickets", id),
            workflow,
          )
        )
          throw new RequestError(
            "Результат принимает назначенный ответственный",
            403,
            "CONTEXT_PERMISSION_DENIED",
          );
      } else {
        requireContext(db, actor, "tickets.write", "tickets", id);
        if (actor.role === "tenant")
          throw new RequestError(
            "Работу выполняет назначенный сотрудник",
            403,
            "CONTEXT_PERMISSION_DENIED",
          );
      }
    } else {
      requireContext(db, actor, "tickets.write", "tickets", id);
      if (receipt.ticket?.financialAccess)
        requireContext(db, actor, "finance.read", "tickets", id);
    }
  }
  if (url.pathname === "/api/documents" && request.method === "POST") {
    const body = JSON.parse(preloadedBody(request));
    for (const link of body.links ?? []) {
      const permission =
        link.entityType === "tickets"
          ? "tickets.write"
          : link.entityType === "meters" && body.category === "photo"
            ? "readings.submit"
            : "documents.write";
      requireContext(db, actor, permission, link.entityType, link.entityId);
    }
  }
}
