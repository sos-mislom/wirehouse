import { agendaQuery } from "../../../../packages/contracts/src/requests.ts";
import { agendaIcs, getAgenda, updateRenewal } from "../agenda.js";
import { parseDto, parseJsonBody } from "../http/body.js";
export function createAgendaRoutes({ requirePortfolioWriteAccess, db, ok }) {
  return async function agendaRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (
      method === "GET" &&
      ["/api/agenda", "/api/agenda/export.ics"].includes(pathname)
    ) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) return true;
      const query = parseDto(agendaQuery, Object.fromEntries(url.searchParams));
      const agenda = getAgenda(db, user, {
        days: query.days ? Number(query.days) : 30,
        propertyId: query.propertyId,
      });
      if (pathname.endsWith(".ics")) {
        response.writeHead(200, {
          "Content-Type": "text/calendar; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition",
          "Content-Disposition": 'attachment; filename="wirehouse-agenda.ics"',
          "Cache-Control": "no-store",
        });
        response.end(agendaIcs(agenda));
      } else ok(response, agenda);
      return true;
    }

    const renewalMatch = pathname.match(
      /^\/api\/leases\/([a-zA-Z0-9-]+)\/renewal$/,
    );

    if (method === "PUT" && renewalMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) return true;
      const body = await parseJsonBody(request);
      ok(response, { item: updateRenewal(db, user, renewalMatch[1], body) });
      return true;
    }
    return false;
  };
}
