import crypto from "node:crypto";
import { parseJsonBody } from "../http/body.js";
import { operationsScope } from "../operations.js";
import { hasPermission } from "../../../../packages/contracts/src/permissions.ts";
import { assertPermission } from "../services/permissions.js";
import { saveStructure, deleteStructure } from "../domain/structure.js";
import { saveEstimate, transitionEstimate } from "../domain/estimates.js";
import { importDxf } from "../domain/cad.js";

const catalogs = {
  templates: "maintenance_templates",
  materials: "materials",
  contractors: "contractors",
};
export function createPlatformRoutes({ db, requireAuth, ok, json }) {
  return async (request, response, url) => {
    const path = url.pathname,
      method = request.method;
    if (
      !/^\/api\/(structure|maintenance|estimates|audit)(\/|$)/.test(path) &&
      path !== "/api/operations/floorplans/import-dxf"
    )
      return false;
    const actor = requireAuth(request, response);
    if (!actor) return true;
    try {
      if (actor.role === "tenant")
        throw Object.assign(new Error("Раздел доступен сотрудникам"), {
          status: 403,
        });
      const scope = operationsScope(db, actor);
      const scopedProperty = (id) => {
        db.requireProperty(id);
        if (!scope(id))
          throw Object.assign(new Error("Нет доступа к объекту"), {
            status: 403,
          });
      };
      if (path === "/api/audit" && method === "GET") {
        assertPermission(actor, "audit.read");
        const limit = 50,
          offset = Number(url.searchParams.get("offset") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw new Error("Некорректное смещение");
        const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("ru");
        const entity = url.searchParams.get("entityId");
        ok(
          response,
          await db.auditPage({ query: q, entityId: entity, offset, limit }),
        );
        return true;
      }
      if (path === "/api/structure" && method === "GET") {
        ok(
          response,
          Object.fromEntries(
            ["buildings", "entrances", "floors"].map((k) => [
              k,
              db.data[k].filter((r) => scope(r.propertyId)),
            ]),
          ),
        );
        return true;
      }
      if (path === "/api/maintenance" && method === "GET") {
        const canCost =
          hasPermission(actor, "estimates.write") ||
          hasPermission(actor, "estimates.approve");
        ok(response, {
          ...Object.fromEntries(
            Object.entries(catalogs).map(([k, t]) => [
              k,
              db.data[t].filter(
                (r) =>
                  scope(r.propertyId) &&
                  (k === "templates" ||
                    canCost ||
                    hasPermission(actor, "services.write")),
              ),
            ]),
          ),
          estimates: canCost
            ? db.data.estimates.filter((r) => scope(r.propertyId))
            : [],
          acts: canCost
            ? db.data.service_acts.filter((r) => scope(r.propertyId))
            : [],
        });
        return true;
      }
      const structure = path.match(
        /^\/api\/structure\/(buildings|entrances|floors)(?:\/([a-zA-Z0-9-]+))?$/,
      );
      if (structure && ["POST", "PUT", "DELETE"].includes(method)) {
        assertPermission(actor, "plans.write");
        if (method !== "POST") {
          const old = db.getById(structure[1], structure[2]);
          if (!old)
            throw Object.assign(new Error("Узел не найден"), { status: 404 });
          scopedProperty(old.propertyId);
        }
        if (method === "DELETE") {
          deleteStructure(db, structure[1], structure[2]);
          ok(response, { deleted: true });
          return true;
        }
        const body = await parseJsonBody(request);
        scopedProperty(body.propertyId);
        ok(response, {
          item: db.transaction(() =>
            saveStructure(db, structure[1], structure[2], body),
          ),
        });
        return true;
      }
      if (
        path === "/api/operations/floorplans/import-dxf" &&
        method === "POST"
      ) {
        assertPermission(actor, "plans.write");
        const body = await parseJsonBody(request);
        ok(response, importDxf(body.content));
        return true;
      }
      const catalog = path.match(
        /^\/api\/maintenance\/(templates|materials|contractors)(?:\/([a-zA-Z0-9-]+))?$/,
      );
      if (catalog && ["POST", "PUT"].includes(method)) {
        assertPermission(
          actor,
          catalog[1] === "templates" ? "maintenance.write" : "services.write",
        );
        const body = await parseJsonBody(request);
        scopedProperty(body.propertyId);
        const table = catalogs[catalog[1]],
          old = catalog[2] ? db.getById(table, catalog[2]) : null;
        if (catalog[2] && !old)
          throw Object.assign(new Error("Запись не найдена"), { status: 404 });
        if (old) {
          scopedProperty(old.propertyId);
          if (old.propertyId !== body.propertyId)
            throw new Error("Перенос между объектами запрещён");
          if (old.updatedAt !== body.updatedAt)
            throw Object.assign(new Error("Запись уже изменена"), {
              status: 409,
            });
        }
        const now = new Date().toISOString();
        const row = {
          ...body,
          id: old?.id ?? crypto.randomUUID(),
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
          ...(catalog[1] === "templates"
            ? { version: (old?.version ?? 0) + 1 }
            : {}),
        };
        if (old) Object.assign(old, row);
        else db.data[table].push(row);
        ok(response, { item: row });
        return true;
      }
      const estimate = path.match(
        /^\/api\/estimates(?:\/([a-zA-Z0-9-]+))?(?:\/(submit|approve|reject|act))?$/,
      );
      if (estimate && ["POST", "PUT"].includes(method)) {
        const body = await parseJsonBody(request);
        if (estimate[1]) {
          const row = db.getById("estimates", estimate[1]);
          if (!row)
            throw Object.assign(new Error("Смета не найдена"), { status: 404 });
          scopedProperty(row.propertyId);
        }
        if (estimate[2])
          ok(
            response,
            transitionEstimate(db, actor, estimate[1], estimate[2], body),
          );
        else {
          scopedProperty(body.propertyId);
          ok(response, { item: saveEstimate(db, actor, estimate[1], body) });
        }
        return true;
      }
      json(response, 404, { error: "Маршрут не найден" });
    } catch (error) {
      json(response, error.status ?? 400, {
        error: error.message,
        code: error.code ?? "INVALID_REQUEST",
      });
    }
    return true;
  };
}
