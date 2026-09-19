import { parseJsonBody } from "../http/body.js";
export function createPropertiesRoutes({
  requireAuth,
  buildScopedCollections,
  ok,
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  forbidden,
  db,
  created,
  normalizeProperty,
  requirePropertyScope,
  notFound,
  conflict,
}) {
  return async function propertiesRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/properties") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.properties,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/properties") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "name",
        "address",
        "totalArea",
        "rentableArea",
        "warehouseClass",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (user.role === "manager") {
        forbidden(response);
        return true;
      }

      const createdRecord = db.createProperty(body);
      created(response, {
        item: normalizeProperty(createdRecord),
      });
      return true;
    }

    const propertyMatch = pathname.match(
      /^\/api\/properties\/([a-zA-Z0-9-]+)$/,
    );

    if (propertyMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const propertyId = propertyMatch[1];

      if (method === "PUT") {
        if (!requirePropertyScope(user, response, propertyId)) {
          return true;
        }

        const body = await parseJsonBody(request);
        const updatedRecord = db.updateProperty(propertyId, body);
        if (!updatedRecord) {
          notFound(response);
          return true;
        }
        ok(response, {
          item: normalizeProperty(updatedRecord),
        });
        return true;
      }

      if (method === "DELETE") {
        if (!requirePropertyScope(user, response, propertyId)) {
          return true;
        }

        try {
          const result = db.deleteProperty(propertyId);
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
