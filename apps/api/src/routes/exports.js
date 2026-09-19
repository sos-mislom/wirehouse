export function createExportsRoutes({
  requireAuth,
  buildScopedCollections,
  getScopedTickets,
  buildExportFile,
  notFound,
  buildUnitExportFile,
}) {
  return async function exportsRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    const exportMatch = pathname.match(/^\/api\/exports\/([a-zA-Z0-9-]+)$/);

    if (exportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      const scopedTickets = getScopedTickets(user);
      const file = await buildExportFile(exportMatch[1], scoped, scopedTickets);
      if (!file) {
        notFound(response);
        return true;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }

    const unitExportMatch = pathname.match(
      /^\/api\/units\/([a-zA-Z0-9-]+)\/export$/,
    );

    if (unitExportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const scoped = buildScopedCollections(user);
      const scopedTickets = getScopedTickets(user);
      const file = await buildUnitExportFile(
        unitExportMatch[1],
        scoped,
        scopedTickets,
      );
      if (!file) {
        notFound(response);
        return true;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }
    return false;
  };
}
