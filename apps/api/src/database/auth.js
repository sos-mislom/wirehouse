import crypto from "node:crypto";
import { hashPassword } from "../auth.js";
import { WarehouseDatabaseBase } from "./base.js";
import {
  checklistTemplatesByCategory,
  clone,
  compareCreatedAtDesc,
  createId,
  normalizePhoneKey,
  nowIso,
} from "./constants.js";

export class AuthDatabase extends WarehouseDatabaseBase {
  getUserByEmail(email) {
    const user = this.getUserByPredicate(
      (item) => item.email === email && item.is_active === 1,
    );
    return user ? clone(user) : null;
  }

  getTenantUserByPhone(phone) {
    const normalized = normalizePhoneKey(phone);
    const user = this.getUserByPredicate(
      (item) =>
        normalizePhoneKey(item.phone) === normalized &&
        item.role === "tenant" &&
        item.is_active === 1,
    );
    return user ? clone(user) : null;
  }

  getTenantUserByNormalizedPhone(phone) {
    const normalized = normalizePhoneKey(phone);
    const user = this.getUserByPredicate(
      (item) =>
        normalizePhoneKey(item.phone) === normalized &&
        item.role === "tenant" &&
        item.is_active === 1,
    );
    return user ? clone(user) : null;
  }

  getOtpBinding(channel, phone) {
    const normalized = normalizePhoneKey(phone);
    const binding = this.data.otp_bindings.find(
      (item) =>
        item.channel === channel &&
        normalizePhoneKey(item.phone) === normalized,
    );
    const user = binding?.user_id ? this.getUserById(binding.user_id) : null;
    return binding &&
      user?.is_active &&
      normalizePhoneKey(user.phone) === normalized
      ? clone(binding)
      : null;
  }

  getOtpBindingByRecipient(channel, recipientId) {
    const binding = this.data.otp_bindings.find(
      (item) =>
        item.channel === channel &&
        String(item.recipient_id) === String(recipientId),
    );
    const user = binding?.user_id ? this.getUserById(binding.user_id) : null;
    return binding &&
      user?.is_active &&
      normalizePhoneKey(user.phone) === normalizePhoneKey(binding.phone)
      ? clone(binding)
      : null;
  }

  upsertOtpBinding(payload) {
    const normalized = normalizePhoneKey(payload.phone);
    const existing = this.data.otp_bindings.find(
      (item) =>
        item.channel === payload.channel &&
        normalizePhoneKey(item.phone) === normalized,
    );
    const next = {
      id: existing?.id ?? createId(),
      channel: payload.channel,
      phone: payload.phone,
      tenant_id: payload.tenantId ?? null,
      user_id: payload.userId ?? null,
      recipient_id: String(payload.recipientId),
      display_name: payload.displayName ?? "",
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
    };

    if (existing) {
      Object.assign(existing, next);
    } else {
      this.data.otp_bindings.push(next);
    }

    return clone(next);
  }

  getActiveOtpBindingsForUser(user) {
    const phone = String(user?.phone ?? "").replace(/[^\d+]/g, "");
    if (!phone) {
      return [];
    }

    return clone(
      this.data.otp_bindings.filter(
        (item) =>
          item.user_id === user.id &&
          user.is_active === 1 &&
          normalizePhoneKey(item.phone) === normalizePhoneKey(phone) &&
          item.recipient_id,
      ),
    );
  }

  createPasswordReset(payload) {
    this.data.password_resets = this.data.password_resets.filter(
      (item) =>
        item.user_id !== payload.userId &&
        new Date(item.expires_at).getTime() > Date.now(),
    );

    const record = {
      id: createId(),
      user_id: payload.userId,
      code_hash: payload.codeHash,
      expires_at: payload.expiresAt,
      attempts: 0,
      consumed_at: null,
      created_at: nowIso(),
    };
    this.data.password_resets.push(record);
    return clone(record);
  }

  getActivePasswordReset(userId) {
    const reset = [...this.data.password_resets]
      .filter(
        (item) =>
          item.user_id === userId &&
          !item.consumed_at &&
          new Date(item.expires_at).getTime() > Date.now(),
      )
      .sort(compareCreatedAtDesc)[0];
    return reset ? clone(reset) : null;
  }

  incrementPasswordResetAttempts(id) {
    const reset = this.getById("password_resets", id);
    if (!reset) {
      return null;
    }
    reset.attempts = Number(reset.attempts ?? 0) + 1;
    return clone(reset);
  }

  consumePasswordReset(id) {
    const reset = this.getById("password_resets", id);
    if (!reset) {
      return;
    }
    reset.consumed_at = nowIso();
  }

  updateUserPassword(id, password) {
    const user = this.getById("users", id);
    if (!user) {
      return null;
    }
    user.password_hash = hashPassword(password);
    return clone(user);
  }

  setUserTotpPending(id, secret) {
    const user = this.getById("users", id);
    if (!user) {
      return null;
    }
    user.totp_pending_secret = secret;
    return clone(user);
  }

  enableUserTotp(id) {
    const user = this.getById("users", id);
    if (!user || !user.totp_pending_secret) {
      return null;
    }
    user.totp_secret = user.totp_pending_secret;
    user.totp_pending_secret = null;
    user.totp_enabled = 1;
    return clone(user);
  }

  disableUserTotp(id) {
    const user = this.getById("users", id);
    if (!user) {
      return null;
    }
    user.totp_secret = null;
    user.totp_pending_secret = null;
    user.totp_enabled = 0;
    return clone(user);
  }

  getUserById(id) {
    const user = this.getById("users", id);
    return user ? clone(user) : null;
  }

  listUsers() {
    return clone([...this.data.users].sort(compareCreatedAtDesc));
  }

  listChecklistTemplates() {
    return clone(
      Object.entries(checklistTemplatesByCategory).map(([category, items]) => ({
        category,
        items: items.map((label, index) => ({
          id: `${category}-${index + 1}`,
          label,
          required: true,
        })),
      })),
    );
  }

  createUser(payload) {
    if (payload.role === "tenant") {
      throw new Error("Tenant users are managed from tenant records");
    }

    if (payload.propertyId) {
      this.requireProperty(payload.propertyId);
    }

    this.ensureUnique(
      this.data.users,
      (user) => user.email === payload.email,
      "User email must be unique",
    );

    if (payload.phone) {
      this.ensureUnique(
        this.data.users,
        (user) => user.phone === payload.phone,
        "User phone must be unique",
      );
    }

    const record = {
      id: createId(),
      email: payload.email,
      phone: payload.phone || null,
      password_hash: hashPassword(payload.password),
      full_name: payload.fullName,
      role: payload.role,
      property_id:
        payload.role === "admin" ? null : (payload.propertyId ?? null),
      tenant_id: null,
      is_active: 1,
      created_at: nowIso(),
      last_login_at: null,
    };

    this.validateUserPayload(record);
    this.data.users.push(record);
    return clone(record);
  }

  markUserLoggedIn(id) {
    const user = this.getById("users", id);
    if (!user) {
      return;
    }

    user.last_login_at = nowIso();
  }

}
