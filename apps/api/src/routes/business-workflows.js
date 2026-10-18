import { workflowView } from "../domain/ticket-view.js";
import { parseJsonBody } from "../http/body.js";
import { requireContext } from "../domain/context-access.js";
import { businessError } from "../domain/accounting.js";
import {
  workflowFor,
  saveTerms,
  decideTicket,
} from "../domain/ticket-workflow.js";
import {
  readingsWorkspace,
  saveReadingPeriod,
  submitReading,
  reviewReading,
} from "../domain/readings.js";
import {
  maintenanceProgress,
  changeMaintenanceTask,
} from "../domain/maintenance-progress.js";
export function createBusinessWorkflowRoutes({ db, requireAuth, ok, json }) {
  return async (request, response, url) => {
    const path = url.pathname,
      method = request.method;
    const workflow = path.match(
        /^\/api\/tickets\/([a-zA-Z0-9-]+)\/workflow(?:\/(terms|decision))?$/,
      ),
      review = path.match(
        /^\/api\/readings\/submissions\/([a-zA-Z0-9-]+)\/review$/,
      ),
      change = path.match(
        /^\/api\/maintenance\/tickets\/([a-zA-Z0-9-]+)\/change$/,
      );
    if (
      !workflow &&
      !path.startsWith("/api/readings") &&
      !change &&
      path !== "/api/maintenance/progress"
    )
      return false;
    const actor = requireAuth(request, response);
    if (!actor) return true;
    try {
      if (workflow) {
        requireContext(db, actor, "workspace.read", "tickets", workflow[1]);
        const ticket = db.getById("tickets", workflow[1]);
        if (actor.role === "worker" && ticket.assigned_to !== actor.id)
          throw businessError("Заявка назначена другому исполнителю", 403);
        if (method === "GET" && !workflow[2]) {
          ok(response, workflowView(db, actor, workflow[1]));
          return true;
        }
        if (method === "POST" && workflow[2]) {
          const body = await parseJsonBody(request);
          db.transaction(() =>
            workflow[2] === "terms"
              ? saveTerms(db, actor, workflow[1], body)
              : decideTicket(db, actor, workflow[1], body),
          );
          ok(response, workflowView(db, actor, workflow[1]));
          return true;
        }
      }
      if (path === "/api/readings" && method === "GET") {
        ok(response, readingsWorkspace(db, actor));
        return true;
      }
      if (path === "/api/maintenance/progress" && method === "GET") {
        ok(response, maintenanceProgress(db, actor));
        return true;
      }
      if (method === "POST") {
        const body = await parseJsonBody(request);
        const fn =
          path === "/api/readings/periods"
            ? () => saveReadingPeriod(db, actor, body)
            : path === "/api/readings/submissions"
              ? () => submitReading(db, actor, body)
              : review
                ? () => reviewReading(db, actor, review[1], body)
                : change
                  ? () => changeMaintenanceTask(db, actor, change[1], body)
                  : null;
        if (fn) {
          ok(response, { item: db.transaction(fn) });
          return true;
        }
      }
      throw businessError("Маршрут не найден", 404);
    } catch (error) {
      json(response, error.status ?? 400, {
        error: error.message,
        code: error.code ?? "INVALID_REQUEST",
      });
    }
    return true;
  };
}
