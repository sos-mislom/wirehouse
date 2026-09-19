import {
  createToken,
  createTotpUri,
  generateTotpSecret,
  verifyPassword,
  verifyTotp,
} from "../auth.js";
import { issueBotLink } from "../bot-links.js";
import { config } from "../config.js";
import { parseJsonBody } from "../http/body.js";
export function createAuthRoutes({
  validateRequired,
  badRequest,
  db,
  unauthorized,
  ok,
  createMfaChallenge,
  sanitizeUser,
  consumeMfaChallenge,
  mfaChallengeStore,
  createOtpCode,
  deliverPasswordResetCode,
  serviceUnavailable,
  hashResetCode,
  normalizePhoneKey,
  notFound,
  deliverTenantOtp,
  otpStore,
  requireAuth,
  forbidden,
}) {
  return async function authRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "POST" && pathname === "/api/auth/staff/login") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email", "password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const user = db.getUserByEmail(body.email);
      if (
        !user ||
        user.is_active !== 1 ||
        !verifyPassword(body.password, user.password_hash)
      ) {
        unauthorized(response);
        return true;
      }

      if (user.totp_enabled) {
        ok(response, {
          mfaRequired: true,
          mfaToken: createMfaChallenge(user),
          user: {
            email: user.email,
            fullName: user.full_name,
          },
        });
        return true;
      }

      db.markUserLoggedIn(user.id);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role,
        },
        config.jwtSecret,
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/staff/verify-2fa") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["mfaToken", "code"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const challenge = consumeMfaChallenge(body.mfaToken);
      if (!challenge) {
        unauthorized(response);
        return true;
      }

      const user = db.getUserById(challenge.userId);
      if (
        !user ||
        !user.totp_enabled ||
        !verifyTotp(user.totp_secret, body.code)
      ) {
        unauthorized(response);
        return true;
      }

      mfaChallengeStore.delete(body.mfaToken);
      db.markUserLoggedIn(user.id);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role,
        },
        config.jwtSecret,
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/password-reset/request") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const user = db.getUserByEmail(String(body.email).toLowerCase());
      if (!user || user.role === "tenant") {
        ok(response, { success: true, channels: [] });
        return true;
      }

      const code = createOtpCode();
      const delivery = await deliverPasswordResetCode({ user, code });
      if (!delivery.delivered) {
        serviceUnavailable(
          response,
          delivery.errors[0] ?? "Password reset delivery is not configured",
        );
        return true;
      }

      db.createPasswordReset({
        userId: user.id,
        codeHash: hashResetCode({ userId: user.id, code }),
        expiresAt: new Date(
          Date.now() + config.passwordResetTtlMs,
        ).toISOString(),
      });

      ok(response, {
        success: true,
        channels: delivery.channels,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/password-reset/confirm") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email", "code", "password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (String(body.password).length < 8) {
        badRequest(response, "Password must be at least 8 characters");
        return true;
      }

      const user = db.getUserByEmail(String(body.email).toLowerCase());
      if (!user || user.role === "tenant") {
        unauthorized(response);
        return true;
      }

      const reset = db.getActivePasswordReset(user.id);
      if (!reset || reset.attempts >= 5) {
        unauthorized(response);
        return true;
      }

      db.incrementPasswordResetAttempts(reset.id);
      if (
        reset.code_hash !== hashResetCode({ userId: user.id, code: body.code })
      ) {
        unauthorized(response);
        return true;
      }

      db.updateUserPassword(user.id, String(body.password));
      db.consumePasswordReset(reset.id);
      ok(response, {
        success: true,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/tenant/request-otp") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["phone"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const phoneKey = normalizePhoneKey(body.phone);
      const user = db.getTenantUserByPhone(phoneKey);
      if (!user) {
        notFound(response);
        return true;
      }

      const otpCode = config.tenantOtpCode ?? createOtpCode();
      const delivery = await deliverTenantOtp({
        user,
        phone: phoneKey,
        code: otpCode,
      });

      if (!delivery.delivered && !config.allowOtpWithoutDelivery) {
        serviceUnavailable(
          response,
          delivery.errors[0] ?? "OTP delivery is not configured",
        );
        return true;
      }

      otpStore.set(
        phoneKey,
        {
          code: otpCode,
          attempts: 0,
          channels: delivery.channels,
        },
        config.tenantOtpTtlMs,
      );

      ok(response, {
        success: true,
        channels: delivery.channels,
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/tenant/verify-otp") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["phone", "otp"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const phoneKey = normalizePhoneKey(body.phone);
      const user = db.getTenantUserByPhone(phoneKey);
      const entry = otpStore.get(phoneKey);
      if (!user || !entry) {
        unauthorized(response);
        return true;
      }

      entry.attempts += 1;
      if (entry.attempts > config.tenantOtpMaxAttempts) {
        otpStore.delete(phoneKey);
        unauthorized(response);
        return true;
      }

      if (entry.code !== body.otp) {
        otpStore.set(phoneKey, entry, config.tenantOtpTtlMs);
        unauthorized(response);
        return true;
      }

      db.markUserLoggedIn(user.id);
      otpStore.delete(phoneKey);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role,
        },
        config.jwtSecret,
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/integrations/link-code") {
      const user = requireAuth(request, response);
      if (!user) return true;
      const body = await parseJsonBody(request);
      ok(response, issueBotLink(db, user, body.userId, body.channel));
      return true;
    }

    if (method === "GET" && pathname === "/api/auth/me") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }

      ok(response, {
        user: sanitizeUser(user),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/setup") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return true;
      }

      const secret = generateTotpSecret();
      db.setUserTotpPending(user.id, secret);
      ok(response, {
        secret,
        otpauthUrl: createTotpUri({
          issuer: config.totpIssuer,
          accountName: user.email ?? user.full_name,
          secret,
        }),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/confirm") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["code"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const freshUser = db.getUserById(user.id);
      if (
        !freshUser?.totp_pending_secret ||
        !verifyTotp(freshUser.totp_pending_secret, body.code)
      ) {
        unauthorized(response);
        return true;
      }

      ok(response, {
        user: sanitizeUser(db.enableUserTotp(user.id)),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/disable") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const freshUser = db.getUserById(user.id);
      if (
        !freshUser ||
        !verifyPassword(body.password, freshUser.password_hash)
      ) {
        unauthorized(response);
        return true;
      }

      if (
        freshUser.totp_enabled &&
        !verifyTotp(freshUser.totp_secret, body.code)
      ) {
        unauthorized(response);
        return true;
      }

      ok(response, {
        user: sanitizeUser(db.disableUserTotp(user.id)),
      });
      return true;
    }
    return false;
  };
}
