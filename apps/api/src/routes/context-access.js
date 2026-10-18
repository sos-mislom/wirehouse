import crypto from "node:crypto";
import { hashPassword } from "../auth.js";
import { parseJsonBody } from "../http/body.js";
import { saveAssignment, revokeAssignment } from "../domain/context-access.js";
import { businessError } from "../domain/accounting.js";
import { hasPermission } from "../../../../packages/contracts/src/permissions.ts";
export function createContextAccessRoutes({ db, requireAuth, ok, json }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith("/api/access/")) return false;
    const actor = requireAuth(request, response);
    if (!actor) return true;
    try {
      if (
        url.pathname === "/api/access/assignments" &&
        request.method === "GET"
      ) {
        ok(response, {
          items: db.data.user_assignments.filter(
            (a) =>
              hasPermission(actor, "permissions.manage") ||
              a.userId === actor.id,
          ),
        });
        return true;
      }
      if (!hasPermission(actor, "permissions.manage"))
        throw businessError("Нет права управлять назначениями", 403);
      if (
        url.pathname === "/api/access/participants" &&
        request.method === "POST"
      ) {
        const body = await parseJsonBody(request);
        if (
          db.data.users.some(
            (u) => u.email === body.email || u.phone === body.phone,
          )
        )
          throw businessError("Почта или телефон уже используются", 409);
        const stamp = new Date().toISOString(),
          row = {
            id: crypto.randomUUID(),
            email: body.email,
            phone: body.phone,
            password_hash: hashPassword(body.password),
            full_name: body.fullName,
            role: "tenant",
            property_id: null,
            tenant_id: null,
            is_active: 1,
            created_at: stamp,
            last_login_at: null,
          };
        db.validateUserPayload(row);
        db.data.users.push(row);
        const { password_hash, ...item } = row;
        ok(response, { item });
        return true;
      }
      if (
        url.pathname === "/api/access/participants" &&
        request.method === "GET"
      ) {
        ok(response, {
          items: db.data.users
            .filter((u) => u.role === "tenant")
            .map(({ password_hash, ...u }) => u),
        });
        return true;
      }
      const match = url.pathname.match(
        /^\/api\/access\/assignments(?:\/([a-zA-Z0-9-]+))?(?:\/(revoke))?$/,
      );
      if (match && ["POST", "PUT"].includes(request.method)) {
        const body = await parseJsonBody(request);
        ok(response, {
          item: db.transaction(() =>
            match[2]
              ? revokeAssignment(db, actor, match[1], body.reason)
              : saveAssignment(db, actor, match[1], body),
          ),
        });
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
