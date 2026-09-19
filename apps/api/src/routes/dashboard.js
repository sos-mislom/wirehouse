export function createDashboardRoutes({
  requireAuth,
  ok,
  buildDashboardResponse,
  notFound,
  db,
}) {
  return async function dashboardRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/api/dashboard/overview") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      ok(response, buildDashboardResponse(user));
      return true;
    }

    if (method === "GET" && pathname === "/api/notifications") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      ok(response, {
        items: buildDashboardResponse(user).notifications,
      });
      return true;
    }

    const notificationReadMatch = pathname.match(
      /^\/api\/notifications\/([a-zA-Z0-9-]+)\/read$/,
    );

    if (notificationReadMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      const notificationId = notificationReadMatch[1];
      const notification = buildDashboardResponse(user).notifications.find(
        (n) => n.id === notificationId,
      );
      if (!notification) {
        notFound(response);
        return true;
      }
      const delivery = db.markNotificationRead({
        userId: user.id,
        deliveryId: notificationId,
      });
      if (!delivery) {
        const receipt = db.data.notification_reads.find(
          (r) => r.userId === user.id && r.notificationId === notificationId,
        );
        const values = {
          userId: user.id,
          notificationId,
          version: notification.createdAt,
          readAt: new Date().toISOString(),
        };
        if (receipt) Object.assign(receipt, values);
        else db.data.notification_reads.push(values);
        db.save();
      }

      ok(response, { success: true });
      return true;
    }
    return false;
  };
}
