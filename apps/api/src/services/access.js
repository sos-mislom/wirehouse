import { execFileSync } from "node:child_process";
import { verifyToken } from "../auth.js";
import { config } from "../config.js";
export function createAccessService({
  db,
  fileStorage,
  buildScopedCollections,
  getScopedLease,
}) {
  const json = (response, status, body) => {
    if (status >= 400 && !body.code) {
      const codes = {
        400: "INVALID_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        415: "UNSUPPORTED_MEDIA_TYPE",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        503: "SERVICE_UNAVAILABLE",
      };
      body = { ...body, code: codes[status] ?? "REQUEST_ERROR" };
    }
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    response.end(JSON.stringify(body));
  };

  const ok = (response, body) => json(response, 200, body);

  const created = (response, body) => json(response, 201, body);

  const badRequest = (response, message) =>
    json(response, 400, { error: message });

  const unauthorized = (response) =>
    json(response, 401, { error: "Требуется вход в систему" });

  const forbidden = (response, message = "Недостаточно прав") =>
    json(response, 403, { error: message });

  const notFound = (response) =>
    json(response, 404, { error: "Запись не найдена" });

  const conflict = (response, error) =>
    json(response, error?.status ?? 409, {
      error: typeof error === "string" ? error : error.message,
      code: error?.code ?? "CONFLICT",
      ...(error?.fields ? { fields: error.fields } : {}),
    });

  const serviceUnavailable = (response, message) =>
    json(response, 503, { error: message });

  const safeCheck = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Check failed",
      };
    }
  };

  const getBearerToken = (request) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return null;
    }

    return header.slice("Bearer ".length);
  };

  const authenticate = (request) => {
    const token = getBearerToken(request);
    const payload = verifyToken(token, config.jwtSecret);
    if (!payload) {
      return null;
    }

    const user = db.getUserById(payload.sub);
    return user?.is_active === 1 ? user : null;
  };

  const requireAuth = (request, response) => {
    const user = authenticate(request);
    if (!user) {
      unauthorized(response);
      return null;
    }

    return user;
  };

  const requirePortfolioWriteAccess = (request, response) => {
    const user = requireAuth(request, response);
    if (!user) {
      return null;
    }

    if (!["admin", "manager"].includes(user.role)) {
      forbidden(response);
      return null;
    }

    return user;
  };

  const buildSystemReadiness = async () => {
    const storage = await safeCheck(() => fileStorage.check());
    const database = await safeCheck(async () => {
      if (db.backend === "postgres") {
        await db.health();
        return {
          ok: true,
          backend: "postgres",
          message: "PostgreSQL relational storage is active",
        };
      }

      return {
        ok: false,
        backend: "json",
        message:
          "Local JSON development storage; PostgreSQL is required in production",
      };
    });
    const redis = await safeCheck(async () => {
      if (!config.redisUrl)
        return {
          ok: true,
          message:
            db.backend === "postgres"
              ? "Authentication challenges shared transactionally in PostgreSQL"
              : "Single API process: in-memory authentication challenges",
        };
      const value = execFileSync(
        config.redisCliBin,
        ["-u", config.redisUrl, "PING"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();
      return {
        ok: value === "PONG",
        message:
          value === "PONG" ? "Redis is reachable" : "Redis did not return PONG",
      };
    });
    const secrets = {
      jwtSecret: Boolean(
        config.jwtSecret && config.jwtSecret !== "skladkontur-demo-secret",
      ),
      telegram: Boolean(config.telegramBotToken),
      vk: Boolean(config.vkGroupToken),
      smtp: Boolean(config.smtpHost),
    };
    const checks = [
      {
        id: "database",
        label: "PostgreSQL",
        ok: database.ok && database.backend === "postgres",
        status: database.backend ?? "unknown",
        message: database.message,
      },
      {
        id: "redis",
        label: "Redis",
        ok: redis.ok,
        status: !config.redisUrl
          ? "memory"
          : redis.ok
            ? "redis"
            : "unavailable",
        message: redis.message,
      },
      {
        id: "storage",
        label: "File storage",
        ok: storage.ok,
        status: storage.driver ?? "unknown",
        message:
          storage.driver === "s3"
            ? storage.message
            : "Persistent local volume; included in scheduled backups",
      },
      {
        id: "secrets",
        label: "Secrets",
        ok: secrets.jwtSecret,
        status: secrets.jwtSecret ? "configured" : "demo",
        message: secrets.jwtSecret
          ? "JWT secret is configured"
          : "JWT secret uses demo fallback",
      },
    ];

    return {
      status: checks.every((check) => check.ok) ? "ready" : "attention",
      generatedAt: new Date().toISOString(),
      database,
      redis,
      storage,
      secrets,
      checks,
    };
  };

  const canAccessProperty = (user, propertyId) =>
    user.role === "admin" ||
    (user.role === "tenant"
      ? buildScopedCollections(user).properties.some((p) => p.id === propertyId)
      : Boolean(user.property_id && user.property_id === propertyId));

  const requirePropertyScope = (user, response, propertyId) => {
    if (canAccessProperty(user, propertyId)) {
      return true;
    }

    forbidden(response);
    return false;
  };

  const propertyIdForUnit = (unitId) =>
    db.getById("units", unitId)?.property_id ?? null;

  const requireUnitScope = (user, response, unitId) => {
    const propertyId = propertyIdForUnit(unitId);
    if (!propertyId) {
      notFound(response);
      return false;
    }

    return requirePropertyScope(user, response, propertyId);
  };

  const requireLeaseScope = (user, response, leaseId) => {
    const lease = db.getById("leases", leaseId);
    if (!lease) {
      notFound(response);
      return null;
    }

    const propertyId = propertyIdForUnit(lease.unit_id);
    if (!requirePropertyScope(user, response, propertyId)) {
      return null;
    }

    return lease;
  };

  const requireLeaseDocumentAccess = (request, response, leaseId) => {
    const user = requireAuth(request, response);
    if (!user) {
      return null;
    }

    const lease = getScopedLease(user, leaseId);
    if (!lease) {
      notFound(response);
      return null;
    }

    return { user, lease };
  };

  const requireTenantScope = (user, response, tenantId) => {
    if (user.role === "admin") {
      return true;
    }

    if (
      buildScopedCollections(user).tenants.some(
        (tenant) => tenant.id === tenantId,
      )
    ) {
      return true;
    }

    forbidden(response);
    return false;
  };
  return {
    json,
    ok,
    created,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    serviceUnavailable,
    safeCheck,
    getBearerToken,
    authenticate,
    requireAuth,
    requirePortfolioWriteAccess,
    buildSystemReadiness,
    canAccessProperty,
    requirePropertyScope,
    propertyIdForUnit,
    requireUnitScope,
    requireLeaseScope,
    requireLeaseDocumentAccess,
    requireTenantScope,
  };
}
