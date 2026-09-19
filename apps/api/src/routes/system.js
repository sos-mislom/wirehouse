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
      await db.health();
      ok(response, {
        status: "ok",
        service: "warehouse-api",
        databaseBackend: "postgres",
        databaseSchema: "relational-v2",
        fileStorage: fileStorage.driver,
        volatileStore:
          otpStore.backend === "redis" && mfaChallengeStore.backend === "redis"
            ? "redis"
            : "postgres",
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
