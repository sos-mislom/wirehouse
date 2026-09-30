import { parseJsonBody } from "../http/body.js";
import { assertPermission } from "../services/permissions.js";
import {
  prepareMaintenanceImport,
  commitMaintenanceImport,
} from "../services/maintenance-import.js";
import { maintenanceImportTemplate } from "../services/maintenance-sheet.js";
export function createMaintenanceImportRoutes({ db, requireAuth, ok, json }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith("/api/maintenance-import/")) return false;
    const actor = requireAuth(request, response);
    if (!actor) return true;
    try {
      assertPermission(actor, "maintenance.write");
      assertPermission(actor, "imports.write");
      if (
        url.pathname === "/api/maintenance-import/template" &&
        request.method === "GET"
      ) {
        const file = await maintenanceImportTemplate();
        response.writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="maintenance-plans.xlsx"',
        });
        response.end(file);
      } else if (
        request.method === "POST" &&
        [
          "/api/maintenance-import/preview",
          "/api/maintenance-import/commit",
        ].includes(url.pathname)
      ) {
        const input = await parseJsonBody(request);
        ok(
          response,
          url.pathname.endsWith("/preview")
            ? (await prepareMaintenanceImport(db, actor, input)).preview
            : await commitMaintenanceImport(db, actor, input),
        );
      } else json(response, 404, { error: "Маршрут не найден" });
    } catch (error) {
      json(response, error.status ?? 400, {
        error: error.message,
        code: error.code ?? "MAINTENANCE_IMPORT_ERROR",
        ...(error.fields ? { fields: error.fields } : {}),
      });
    }
    return true;
  };
}
