import { parseJsonBody } from "../http/body.js";
import {
  addReading,
  addWorkLog,
  getOperations,
  runMaintenance,
  saveOperation,
  updateUser,
} from "../operations.js";
export function createOperationsRoutes({
  requireAuth,
  ok,
  db,
  created,
  notFound,
  json,
}) {
  return async function operationsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (
      pathname === "/api/operations" ||
      pathname.startsWith("/api/operations/") ||
      (pathname.startsWith("/api/users/") && method === "PUT")
    ) {
      const user = requireAuth(request, response);
      if (!user) return true;
      try {
        if (method === "GET" && pathname === "/api/operations") {
          ok(response, getOperations(db, user));
          return true;
        }
        const body = await parseJsonBody(request);
        const userMatch = pathname.match(/^\/api\/users\/([a-zA-Z0-9-]+)$/);
        if (userMatch && method === "PUT") {
          ok(response, { item: updateUser(db, user, userMatch[1], body) });
          return true;
        }
        const reading = pathname.match(
          /^\/api\/operations\/meters\/([a-zA-Z0-9-]+)\/readings$/,
        );
        if (reading && method === "POST") {
          created(response, { item: addReading(db, user, reading[1], body) });
          return true;
        }
        const work = pathname.match(
          /^\/api\/operations\/tickets\/([a-zA-Z0-9-]+)\/work$/,
        );
        if (work && method === "POST") {
          created(response, { item: addWorkLog(db, user, work[1], body) });
          return true;
        }
        const operation = pathname.match(
          /^\/api\/operations\/(equipment|services|plans|meters|news|expenses|floorplans)(?:\/([a-zA-Z0-9-]+))?$/,
        );
        if (
          operation &&
          ((method === "POST" && !operation[2]) ||
            (method === "PUT" && operation[2]))
        ) {
          const item = saveOperation(
            db,
            user,
            operation[1],
            operation[2],
            body,
          );
          if (operation[1] === "plans") runMaintenance(db);
          (method === "POST" ? created : ok)(response, { item });
          return true;
        }
        notFound(response);
      } catch (error) {
        json(response, error.status ?? 400, {
          error: error.message,
          code: error.code ?? "REQUEST_ERROR",
          ...(error.fields ? { fields: error.fields } : {}),
        });
      }
      return true;
    }
    return false;
  };
}
