import { parseJsonBody } from "../http/body.js";
export function createUnitsRoutes({
  requireAuth,
  buildScopedCollections,
  db,
  normalizeUnit,
  ok,
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  requirePropertyScope,
  created,
  conflict,
  requireUnitScope,
  notFound,
}) {
  return async function unitsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/units") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      const items = db
        .listUnits({
          propertyId: url.searchParams.get("propertyId") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        })
        .map(normalizeUnit);

      ok(response, {
        items: items.filter((item) =>
          scoped.units.some((unit) => unit.id === item.id),
        ),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/units") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "propertyId",
        "number",
        "floor",
        "area",
        "type",
        "status",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (!requirePropertyScope(user, response, body.propertyId)) {
        return true;
      }

      try {
        const createdRecord = db.createUnit(body);
        created(response, {
          item: normalizeUnit(createdRecord),
        });
      } catch (error) {
        conflict(response, error);
      }
      return true;
    }

    const unitSplitMatch = pathname.match(
      /^\/api\/units\/([a-zA-Z0-9-]+)\/split$/,
    );

    if (unitSplitMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const unitId = unitSplitMatch[1];
      if (!requireUnitScope(user, response, unitId)) {
        return true;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["number", "area"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return true;
        }

        try {
          const result = db.splitUnit(unitId, body);
          if (!result) {
            notFound(response);
            return true;
          }
          created(response, {
            original: normalizeUnit(result.original),
            item: normalizeUnit(result.created),
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }
    }

    const unitMatch = pathname.match(/^\/api\/units\/([a-zA-Z0-9-]+)$/);

    if (unitMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const unitId = unitMatch[1];

      if (method === "PUT") {
        try {
          const body = await parseJsonBody(request);
          if (!requireUnitScope(user, response, unitId)) {
            return true;
          }
          if (
            body.propertyId &&
            !requirePropertyScope(user, response, body.propertyId)
          ) {
            return true;
          }

          const updatedRecord = db.updateUnit(unitId, body);
          if (!updatedRecord) {
            notFound(response);
            return true;
          }
          ok(response, {
            item: normalizeUnit(updatedRecord),
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }

      if (method === "DELETE") {
        if (!requireUnitScope(user, response, unitId)) {
          return true;
        }

        try {
          const result = db.deleteUnit(unitId);
          if (result.changes === 0) {
            notFound(response);
            return true;
          }
          ok(response, {
            success: true,
          });
        } catch (error) {
          conflict(response, error);
        }
        return true;
      }
    }
    return false;
  };
}
