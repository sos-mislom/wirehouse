import { parseJsonBody } from "../http/body.js";

// Device registration for push notifications from the mobile app. Any signed-in
// account may register its own device; removal only affects the caller's row.
export function createPushRoutes({ db, requireAuth, ok }) {
  return async function pushRoutes(request, response, url) {
    if (request.method !== "POST") return false;
    const register = url.pathname === "/api/push/devices";
    if (!register && url.pathname !== "/api/push/devices/remove") return false;
    const user = requireAuth(request, response);
    if (!user) return true;
    const body = await parseJsonBody(request);
    if (register)
      await db.savePushDevice({
        token: body.token,
        userId: user.id,
        platform: body.platform,
      });
    else await db.removePushDevice({ token: body.token, userId: user.id });
    ok(response, { ok: true });
    return true;
  };
}
