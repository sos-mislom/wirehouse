import { config } from "../config.js";
export function createSystemRoutes({
  ok,
  db,
  fileStorage,
  otpStore,
  mfaChallengeStore,
  requireAuth,
  forbidden,
  buildSystemReadiness,
  tenantOnboardingPayload,
  handleTelegramWebhook,
  handleVkWebhook,
}) {
  return async function systemRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "GET" && pathname === "/health") {
      ok(response, {
        status: "ok",
        service: "warehouse-api",
        databaseBackend: db.backend,
        databasePath: db.backend === "json" ? config.dbPath : undefined,
        fileStorage: fileStorage.driver,
        volatileStore:
          otpStore.redisEnabled && mfaChallengeStore.redisEnabled
            ? "redis"
            : "memory",
      });
      return true;
    }

    if (method === "GET" && pathname === "/api/system/readiness") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      ok(response, await buildSystemReadiness());
      return true;
    }

    if (method === "GET" && pathname === "/api/auth/tenant/onboarding") {
      ok(response, tenantOnboardingPayload());
      return true;
    }

    if (
      method === "POST" &&
      pathname === "/api/integrations/telegram/webhook"
    ) {
      await handleTelegramWebhook(request, response);
      return true;
    }

    if (method === "POST" && pathname === "/api/integrations/vk/webhook") {
      await handleVkWebhook(request, response);
      return true;
    }
    return false;
  };
}
