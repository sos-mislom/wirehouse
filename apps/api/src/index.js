import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import ExcelJS from "exceljs";

import { config } from "./config.js";
import {
  createToken,
  createTotpUri,
  generateTotpSecret,
  verifyPassword,
  verifyToken,
  verifyTotp
} from "./auth.js";
import { WarehouseDatabase } from "./database.js";
import { createFileStorage } from "./file-storage.js";
import { erFindings, openQuestions, solutionContour } from "./project-definition.js";

const db = new WarehouseDatabase(config.dbPath);
const importApprovalThreshold = Number.parseInt(process.env.IMPORT_APPROVAL_THRESHOLD ?? "25", 10);
const fileStorage = createFileStorage(config);
if (fileStorage.driver === "local") {
  fs.mkdirSync(config.documentStoragePath, { recursive: true });
  fs.mkdirSync(config.ticketAttachmentStoragePath, { recursive: true });
}

class TtlStore {
  constructor(prefix, redisUrl, redisCliBin) {
    this.prefix = prefix;
    this.redisUrl = redisUrl;
    this.redisCliBin = redisCliBin;
    this.fallback = new Map();
    this.redisEnabled = Boolean(redisUrl);
    if (this.redisEnabled) {
      try {
        execFileSync(this.redisCliBin, ["-u", redisUrl, "PING"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        });
      } catch {
        this.redisEnabled = false;
      }
    }
  }

  key(key) {
    return `${this.prefix}:${key}`;
  }

  runRedis(args) {
    return execFileSync(this.redisCliBin, ["-u", this.redisUrl, "--raw", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  }

  set(key, value, ttlMs) {
    if (this.redisEnabled) {
      this.runRedis(["SETEX", this.key(key), String(Math.max(1, Math.ceil(ttlMs / 1000))), JSON.stringify(value)]);
      return;
    }
    this.fallback.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  get(key) {
    if (this.redisEnabled) {
      const value = this.runRedis(["GET", this.key(key)]).trim();
      return value ? JSON.parse(value) : null;
    }
    const entry = this.fallback.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.fallback.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key) {
    if (this.redisEnabled) {
      this.runRedis(["DEL", this.key(key)]);
      return;
    }
    this.fallback.delete(key);
  }
}

const otpStore = new TtlStore("warehouse:otp", config.redisUrl, config.redisCliBin);
const mfaChallengeStore = new TtlStore("warehouse:mfa", config.redisUrl, config.redisCliBin);
const chatContextStore = new TtlStore("warehouse:chat-context", config.redisUrl, config.redisCliBin);
const chatContextTtlMs = 30 * 24 * 60 * 60 * 1000;

const json = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
  });
  response.end(JSON.stringify(body));
};

const ok = (response, body) => json(response, 200, body);
const created = (response, body) => json(response, 201, body);
const badRequest = (response, message) => json(response, 400, { error: message });
const unauthorized = (response) => json(response, 401, { error: "Unauthorized" });
const forbidden = (response, message = "Forbidden") => json(response, 403, { error: message });
const notFound = (response) => json(response, 404, { error: "Not found" });
const conflict = (response, message) => json(response, 409, { error: message });
const serviceUnavailable = (response, message) => json(response, 503, { error: message });

const safeCheck = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Check failed"
    };
  }
};

const parseJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

  return db.getUserById(payload.sub);
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
      db.runPsql(["-q", "-t", "-A", "-c", "select 1"]);
      return {
        ok: true,
        backend: "postgres",
        message: "PostgreSQL state store is active"
      };
    }

    return {
      ok: false,
      backend: "json",
      message: "JSON fallback is active; set DATABASE_URL for production"
    };
  });
  const redis = await safeCheck(async () => {
    const value = execFileSync(config.redisCliBin, ["-u", config.redisUrl, "PING"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return {
      ok: value === "PONG",
      message: value === "PONG" ? "Redis is reachable" : "Redis did not return PONG"
    };
  });
  const secrets = {
    jwtSecret: Boolean(config.jwtSecret && config.jwtSecret !== "skladkontur-demo-secret"),
    telegram: Boolean(config.telegramBotToken),
    vk: Boolean(config.vkGroupToken),
    smtp: Boolean(config.smtpHost)
  };
  const checks = [
    {
      id: "database",
      label: "PostgreSQL",
      ok: database.ok && database.backend === "postgres",
      status: database.backend ?? "unknown",
      message: database.message
    },
    {
      id: "redis",
      label: "Redis",
      ok: redis.ok,
      status: redis.ok ? "redis" : "unavailable",
      message: redis.message
    },
    {
      id: "storage",
      label: "File storage",
      ok: storage.ok && storage.driver === "s3",
      status: storage.driver ?? "unknown",
      message: storage.driver === "s3" ? storage.message : "Local file storage is active; set S3 env for production"
    },
    {
      id: "secrets",
      label: "Secrets",
      ok: secrets.jwtSecret,
      status: secrets.jwtSecret ? "configured" : "demo",
      message: secrets.jwtSecret ? "JWT secret is configured" : "JWT secret uses demo fallback"
    }
  ];

  return {
    status: checks.every((check) => check.ok) ? "ready" : "attention",
    generatedAt: new Date().toISOString(),
    database,
    redis,
    storage,
    secrets,
    checks
  };
};

const canAccessProperty = (user, propertyId) =>
  user.role === "admin" || user.role === "tenant" || !user.property_id || user.property_id === propertyId;

const requirePropertyScope = (user, response, propertyId) => {
  if (canAccessProperty(user, propertyId)) {
    return true;
  }

  forbidden(response);
  return false;
};

const propertyIdForUnit = (unitId) => db.getById("units", unitId)?.property_id ?? null;

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

const coerceBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  return value === 1 || value === "1" || value === "true";
};

const normalizeProperty = (record) => ({
  id: record.id,
  name: record.name,
  address: record.address,
  totalArea: Number(record.total_area),
  rentableArea: Number(record.rentable_area),
  warehouseClass: record.warehouse_class,
  description: record.description,
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const normalizeUnit = (record) => ({
  id: record.id,
  propertyId: record.property_id,
  number: record.number,
  floor: Number(record.floor),
  area: Number(record.area),
  type: record.type,
  status: record.status,
  ceilingHeight: Number(record.ceiling_height),
  temperatureRegime: record.temperature_regime,
  description: record.description ?? "",
  hasRamp: coerceBoolean(record.has_ramp),
  hasGate: coerceBoolean(record.has_gate),
  propertyName: record.property_name ?? null,
  tenantName: record.tenant_name ?? null,
  leaseStage: record.lease_stage ?? null,
  leaseEndDate: record.lease_end_date ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const normalizeTenant = (record) => ({
  id: record.id,
  name: record.name,
  inn: record.inn,
  contactName: record.contact_name,
  phone: record.phone,
  email: record.email,
  riskLevel: record.risk_level,
  status: record.status,
  leaseCount: Number(record.lease_count ?? 0),
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const normalizeTenantNote = (record) => ({
  id: record.id,
  tenantId: record.tenant_id,
  title: record.title,
  authorId: record.author_id ?? null,
  authorName: record.author_name ?? "Система",
  createdAt: record.created_at,
  content: record.content,
  attachments: Array.isArray(record.attachments) ? record.attachments.map(normalizeTenantNoteAttachment) : []
});

const normalizeTenantNoteAttachment = (record) => ({
  id: record.id,
  noteId: record.note_id,
  tenantId: record.tenant_id,
  fileName: record.file_name,
  mimeType: record.mime_type,
  sizeBytes: Number(record.size_bytes),
  uploadedBy: record.uploaded_by,
  uploadedByName: record.uploaded_by_name ?? null,
  createdAt: record.created_at
});

const normalizeLease = (record) => ({
  id: record.id,
  tenantId: record.tenant_id,
  unitId: record.unit_id,
  contractNumber: record.contract_number,
  stage: record.stage,
  startDate: record.start_date,
  endDate: record.end_date,
  ratePerSqm: Number(record.rate_per_sqm),
  deposit: Number(record.deposit),
  indexationPct: Number(record.indexation_pct),
  tenantName: record.tenant_name ?? null,
  unitNumber: record.unit_number ?? null,
  propertyName: record.property_name ?? null,
  documentName: record.document_name ?? `${record.contract_number}.html`,
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const normalizeTicket = (record) => ({
  id: record.id,
  number: record.number,
  unitId: record.unit_id,
  propertyId: record.property_id,
  tenantId: record.tenant_id,
  createdBy: record.created_by,
  assignedTo: record.assigned_to,
  category: record.category,
  priority: record.priority,
  status: record.status,
  sourceChannel: record.source_channel ?? "web",
  title: record.title,
  description: record.description,
  slaHours: Number(record.sla_hours ?? 0),
  slaDueAt: record.sla_due_at ?? null,
  checklistItems: Array.isArray(record.checklist_items)
    ? record.checklist_items.map((item) => ({
        id: item.id,
        label: item.label,
        required: Boolean(item.required),
        completed: Boolean(item.completed),
        completedAt: item.completed_at ?? null,
        completedBy: item.completed_by ?? null,
        completedByName: item.completed_by_name ?? null
      }))
    : [],
  propertyName: record.property_name ?? null,
  unitNumber: record.unit_number ?? null,
  tenantName: record.tenant_name ?? null,
  createdByName: record.created_by_name ?? null,
  assignedToName: record.assigned_to_name ?? null,
  commentCount: Number(record.comment_count ?? 0),
  attachmentCount: Number(record.attachment_count ?? 0),
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  resolvedAt: record.resolved_at,
  closedAt: record.closed_at
});

const normalizeTicketComment = (record) => ({
  id: record.id,
  ticketId: record.ticket_id,
  authorId: record.author_id,
  authorName: record.author_name ?? null,
  authorRole: record.author_role ?? null,
  sourceChannel: record.source_channel ?? "web",
  content: record.content,
  createdAt: record.created_at
});

const normalizeTicketHistory = (record) => ({
  id: record.id,
  ticketId: record.ticket_id,
  type: record.type,
  fromStatus: record.from_status,
  toStatus: record.to_status,
  reason: record.reason ?? null,
  createdBy: record.created_by,
  createdByName: record.created_by_name ?? null,
  createdAt: record.created_at
});

const normalizeLeaseDocument = (record) => ({
  id: record.id,
  leaseId: record.lease_id,
  fileName: record.file_name,
  category: record.document_category ?? "other",
  mimeType: record.mime_type,
  sizeBytes: Number(record.size_bytes),
  uploadedBy: record.uploaded_by,
  uploadedByName: record.uploaded_by_name ?? null,
  createdAt: record.created_at
});

const normalizeBillingInvoice = (record) => ({
  id: record.id,
  leaseId: record.lease_id,
  tenantId: record.tenant_id,
  unitId: record.unit_id,
  period: record.period,
  rentAmount: Number(record.rent_amount),
  variableAmount: Number(record.variable_amount),
  totalAmount: Number(record.total_amount),
  dueDate: record.due_date,
  status: record.status,
  tenantName: record.tenant_name ?? null,
  contractNumber: record.contract_number ?? null,
  propertyName: record.property_name ?? null,
  unitNumber: record.unit_number ?? null,
  paidAmount: Number(record.paid_amount ?? 0),
  paidAt: record.paid_at ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const normalizeBillingPayment = (record) => ({
  id: record.id,
  invoiceId: record.invoice_id,
  tenantId: record.tenant_id,
  amount: Number(record.amount),
  paidAt: record.paid_at,
  method: record.method,
  reference: record.reference,
  tenantName: record.tenant_name ?? null,
  contractNumber: record.contract_number ?? null,
  period: record.period ?? null,
  invoiceStatus: record.invoice_status ?? null,
  createdAt: record.created_at,
  invoice: record.invoice ? normalizeBillingInvoice(record.invoice) : null
});

const normalizeImportBatch = (record) => ({
  id: record.id,
  templateId: record.template_id,
  fileName: record.file_name,
  mode: record.mode,
  status: record.status,
  summary: record.summary ?? {},
  operationCount: Number(record.operation_count ?? record.operations?.length ?? 0),
  createdBy: record.created_by ?? null,
  createdByName: record.created_by_name ?? null,
  createdAt: record.created_at,
  rolledBackAt: record.rolled_back_at ?? null,
  rolledBackBy: record.rolled_back_by ?? null
});

const normalizeImportApproval = (record) => ({
  id: record.id,
  templateId: record.template_id,
  fileName: record.file_name,
  mode: record.mode,
  status: record.status,
  summary: record.summary ?? {},
  rowCount: Number(record.row_count ?? record.rows?.length ?? 0),
  requestedBy: record.requested_by ?? null,
  requestedByName: record.requested_by_name ?? null,
  createdAt: record.created_at,
  decidedAt: record.decided_at ?? null,
  decidedBy: record.decided_by ?? null,
  batchId: record.batch_id ?? null
});

const normalizeMeterReading = (record) => ({
  id: record.id,
  unitId: record.unit_id,
  tenantId: record.tenant_id,
  leaseId: record.lease_id ?? null,
  period: record.period,
  meterType: record.meter_type,
  value: Number(record.value),
  previousValue: Number(record.previous_value ?? 0),
  consumption: Number(record.consumption ?? Math.max(0, Number(record.value) - Number(record.previous_value ?? 0))),
  tariffRate: Number(record.tariff_rate ?? 0),
  chargeAmount: Number(record.charge_amount ?? 0),
  status: record.status,
  unitNumber: record.unit_number ?? null,
  tenantName: record.tenant_name ?? null,
  contractNumber: record.contract_number ?? null,
  recordedAt: record.recorded_at,
  createdAt: record.created_at ?? null,
  updatedAt: record.updated_at ?? null,
  invoice: record.invoice ? normalizeBillingInvoice(record.invoice) : null
});

const normalizeTicketAttachment = (record) => ({
  id: record.id,
  ticketId: record.ticket_id,
  fileName: record.file_name,
  mimeType: record.mime_type,
  mediaType: record.media_type,
  sizeBytes: Number(record.size_bytes),
  note: record.note ?? "",
  uploadedBy: record.uploaded_by,
  uploadedByName: record.uploaded_by_name ?? null,
  createdAt: record.created_at
});

const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  fullName: user.full_name,
  role: user.role,
  propertyId: user.property_id,
  tenantId: user.tenant_id,
  lastLoginAt: user.last_login_at,
  totpEnabled: Boolean(user.totp_enabled)
});

const validateRequired = (payload, keys) => {
  for (const key of keys) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
      return key;
    }
  }
  return null;
};

const activeLeaseStages = new Set(["signed", "active", "prolongation"]);
const sumBy = (items, selector) => items.reduce((total, item) => total + selector(item), 0);
const priorityWeights = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};
const notificationToneWeights = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1
};
const statusLabels = {
  new: "Новая",
  accepted: "Принята",
  in_progress: "В работе",
  completed: "Выполнена",
  waiting_tenant: "Ожидает арендатора",
  resolved: "Решена",
  closed: "Закрыта",
  rejected: "Отклонена"
};
const translateStatus = (status) => statusLabels[status] ?? status;
const roleWeights = {
  admin: 0,
  manager: 1,
  worker: 2,
  tenant: 3
};
const collectionWeights = {
  low: 0.985,
  medium: 0.945,
  high: 0.89
};
const startOfMonth = (value = new Date()) => new Date(value.getFullYear(), value.getMonth(), 1);
const addMonths = (value, months) => new Date(value.getFullYear(), value.getMonth() + months, 1);
const toIsoDay = (value) => value.toISOString().slice(0, 10);
const createOtpCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const normalizePhoneKey = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return String(value ?? "").replace(/[^\d+]/g, "");
};
const normalizeWhatsAppPhone = (value) => String(value ?? "").replace(/\D/g, "");
const getMappedValue = (map, ...keys) => {
  for (const key of keys) {
    const value = map[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
};
const timeoutSignal = (timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout)
  };
};
const fetchJson = async (url, options) => {
  const { signal, cancel } = timeoutSignal();
  try {
    const response = await fetch(url, {
      ...options,
      signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload?.description ?? payload?.error?.message ?? payload?.error_msg ?? `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    cancel();
  }
};
const buildOtpMessage = (code) =>
  `Код входа в склад контур: ${code}. Никому не сообщайте код. Он действует 5 минут.`;
const buildPasswordResetMessage = (code) =>
  `Код восстановления пароля склад контур: ${code}. Если вы не запрашивали сброс, сообщите администратору. Код действует 10 минут.`;
const hashResetCode = ({ userId, code }) =>
  crypto.createHash("sha256").update(`${userId}:${code}:${config.jwtSecret}`).digest("hex");
const encodeEmailHeader = (value) => {
  const text = String(value ?? "");
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
};
const smtpRead = (socket) =>
  new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
const smtpCommand = async (socket, command, okCodes = ["250"]) => {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!okCodes.some((code) => response.startsWith(code))) {
    throw new Error(response.trim());
  }
  return response;
};
const createSmtpSocket = () =>
  new Promise((resolve, reject) => {
    const socket = config.smtpSecure
      ? tls.connect(config.smtpPort, config.smtpHost, { servername: config.smtpHost })
      : net.connect(config.smtpPort, config.smtpHost);
    socket.setTimeout(10000);
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("SMTP timeout")));
    socket.once("connect", () => resolve(socket));
  });
const sendEmail = async ({ to, subject, text }) => {
  if (!config.smtpHost || !to) {
    throw new Error("SMTP is not configured");
  }

  let socket = await createSmtpSocket();
  try {
    await smtpRead(socket);
    await smtpCommand(socket, `EHLO ${config.smtpHost}`, ["250"]);
    if (!config.smtpSecure) {
      await smtpCommand(socket, "STARTTLS", ["220"]);
      socket = tls.connect({
        socket,
        servername: config.smtpHost
      });
      await smtpCommand(socket, `EHLO ${config.smtpHost}`, ["250"]);
    }
    if (config.smtpUser && config.smtpPassword) {
      await smtpCommand(socket, "AUTH LOGIN", ["334"]);
      await smtpCommand(socket, Buffer.from(config.smtpUser).toString("base64"), ["334"]);
      await smtpCommand(socket, Buffer.from(config.smtpPassword).toString("base64"), ["235"]);
    }
    const fromMatch = config.smtpFrom.match(/<([^>]+)>/);
    const fromEmail = fromMatch?.[1] ?? config.smtpFrom;
    await smtpCommand(socket, `MAIL FROM:<${fromEmail}>`, ["250"]);
    await smtpCommand(socket, `RCPT TO:<${to}>`, ["250", "251"]);
    await smtpCommand(socket, "DATA", ["354"]);
    const message = [
      `From: ${encodeEmailHeader(config.smtpFrom)}`,
      `To: ${to}`,
      `Subject: ${encodeEmailHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      String(text ?? "").replace(/\r?\n\./g, "\n.."),
      "."
    ].join("\r\n");
    await smtpCommand(socket, message, ["250"]);
    await smtpCommand(socket, "QUIT", ["221"]);
    return { messageId: crypto.randomUUID() };
  } finally {
    socket.destroy();
  }
};
const createMfaChallenge = (user) => {
  const challenge = crypto.randomUUID();
  mfaChallengeStore.set(
    challenge,
    {
      userId: user.id,
      attempts: 0
    },
    config.mfaChallengeTtlMs
  );
  return challenge;
};
const consumeMfaChallenge = (challenge) => {
  const entry = mfaChallengeStore.get(challenge);
  if (!entry) {
    mfaChallengeStore.delete(challenge);
    return null;
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    mfaChallengeStore.delete(challenge);
    return null;
  }
  mfaChallengeStore.set(challenge, entry, config.mfaChallengeTtlMs);
  return entry;
};
const sendTelegramText = async ({ chatId, text, replyMarkup = null }) => {
  const payload = await fetchJson(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });

  if (!payload.ok) {
    throw new Error(payload.description ?? "Telegram send failed");
  }
};
const answerTelegramCallback = async ({ callbackQueryId, text }) => {
  if (!callbackQueryId || !config.telegramBotToken) {
    return;
  }
  await fetchJson(`https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text
    })
  });
};
const sendTelegramOtp = async ({ chatId, code }) =>
  sendTelegramText({
    chatId,
    text: buildOtpMessage(code)
  });
const sendVkOtp = async ({ userId, code }) => {
  return sendVkText({
    userId,
    message: buildOtpMessage(code)
  });
};
const sendVkText = async ({ userId, message, keyboard = null }) => {
  const body = new URLSearchParams({
    access_token: config.vkGroupToken,
    v: config.vkApiVersion,
    user_id: userId,
    random_id: String(crypto.randomInt(1, 2147483647)),
    message
  });
  if (keyboard) {
    body.set("keyboard", JSON.stringify(keyboard));
  }
  const payload = await fetchJson("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (payload.error) {
    throw new Error(payload.error.error_msg ?? "VK send failed");
  }
};
const downloadUrlBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`File download failed: ${response.status}`);
  }

  return {
    content: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream"
  };
};
const extractTelegramMedia = (message) => {
  const photo =
    Array.isArray(message?.photo) && message.photo.length > 0
      ? [...message.photo].sort((left, right) => Number(right.file_size ?? 0) - Number(left.file_size ?? 0))[0]
      : null;
  if (photo?.file_id) {
    return {
      fileId: photo.file_id,
      fileName: `telegram-photo-${photo.file_unique_id ?? photo.file_id}.jpg`,
      mimeType: "image/jpeg",
      note: message.caption ?? ""
    };
  }

  if (message?.video?.file_id) {
    return {
      fileId: message.video.file_id,
      fileName: message.video.file_name ?? `telegram-video-${message.video.file_unique_id ?? message.video.file_id}.mp4`,
      mimeType: message.video.mime_type ?? "video/mp4",
      note: message.caption ?? ""
    };
  }

  if (message?.document?.file_id) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name ?? `telegram-document-${message.document.file_unique_id ?? message.document.file_id}`,
      mimeType: message.document.mime_type ?? "application/octet-stream",
      note: message.caption ?? ""
    };
  }

  return null;
};
const downloadTelegramMedia = async (media) => {
  if (!config.telegramBotToken) {
    throw new Error("Telegram bot token is not configured");
  }

  const metadataResponse = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(media.fileId)}`
  );
  const metadata = await metadataResponse.json();
  if (!metadataResponse.ok || !metadata.ok || !metadata.result?.file_path) {
    throw new Error(metadata.description ?? "Telegram file metadata failed");
  }

  const downloaded = await downloadUrlBuffer(
    `https://api.telegram.org/file/bot${config.telegramBotToken}/${metadata.result.file_path}`
  );
  return {
    content: downloaded.content,
    mimeType: media.mimeType || downloaded.mimeType,
    fileName: media.fileName || path.basename(metadata.result.file_path),
    note: media.note ?? ""
  };
};
const extractVkMedia = (message) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const photoAttachment = attachments.find((attachment) => attachment.type === "photo" && attachment.photo?.sizes?.length);
  if (photoAttachment) {
    const size = [...photoAttachment.photo.sizes].sort(
      (left, right) => Number((right.width ?? 0) * (right.height ?? 0)) - Number((left.width ?? 0) * (left.height ?? 0))
    )[0];
    if (size?.url) {
      return {
        downloadUrl: size.url,
        fileName: `vk-photo-${photoAttachment.photo.id ?? Date.now()}.jpg`,
        mimeType: "image/jpeg",
        note: message.text ?? ""
      };
    }
  }

  const docAttachment = attachments.find((attachment) => attachment.type === "doc" && attachment.doc?.url);
  if (docAttachment) {
    return {
      downloadUrl: docAttachment.doc.url,
      fileName: docAttachment.doc.title ?? `vk-document-${docAttachment.doc.id ?? Date.now()}.${docAttachment.doc.ext ?? "bin"}`,
      mimeType: "application/octet-stream",
      note: message.text ?? ""
    };
  }

  return null;
};
const isCompletionText = (value) =>
  /(^|\s)(готово|готов|завершено|завершил|выполнено|сделано|закрыть|закрыл)(\s|$)/i.test(String(value ?? ""));
const sendWhatsAppOtp = async ({ phone, code }) => {
  const payload = await fetchJson(
    `https://graph.facebook.com/v20.0/${config.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(phone),
        type: "template",
        template: {
          name: config.whatsappOtpTemplateName,
          language: {
            code: config.whatsappOtpTemplateLanguage
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: code
                }
              ]
            }
          ]
        }
      })
    }
  );

  if (payload.error) {
    throw new Error(payload.error.message ?? "WhatsApp send failed");
  }
};
const deliverTenantOtp = async ({ user, phone, code }) => {
  const phoneKey = normalizePhoneKey(phone);
  const tenant = user.tenant_id ? db.getTenant(user.tenant_id) : null;
  const telegramBinding = db.getOtpBinding("telegram", phoneKey);
  const vkBinding = db.getOtpBinding("vk", phoneKey);
  const telegramChatId =
    tenant?.telegram_chat_id ??
    telegramBinding?.recipient_id ??
    getMappedValue(config.telegramOtpChatIds, phone, phoneKey, user.id, user.tenant_id);
  const vkUserId =
    tenant?.vk_user_id ??
    vkBinding?.recipient_id ??
    getMappedValue(config.vkOtpUserIds, phone, phoneKey, user.id, user.tenant_id);
  const channels = new Set(config.otpDeliveryChannels);
  const tasks = [];

  if (channels.has("telegram") && config.telegramBotToken && telegramChatId) {
    tasks.push({
      channel: "telegram",
      run: () => sendTelegramOtp({ chatId: telegramChatId, code })
    });
  }

  if (channels.has("vk") && config.vkGroupToken && vkUserId) {
    tasks.push({
      channel: "vk",
      run: () => sendVkOtp({ userId: vkUserId, code })
    });
  }

  if (
    channels.has("whatsapp") &&
    config.whatsappAccessToken &&
    config.whatsappPhoneNumberId &&
    config.whatsappOtpTemplateName
  ) {
    tasks.push({
      channel: "whatsapp",
      run: () => sendWhatsAppOtp({ phone, code })
    });
  }

  if (tasks.length === 0) {
    return {
      delivered: false,
      channels: [],
      errors: ["Сначала привяжите Telegram или VK во вкладке арендатора, затем запросите код ещё раз"]
    };
  }

  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run();
        return {
          channel: task.channel,
          ok: true
        };
      } catch (error) {
        return {
          channel: task.channel,
          ok: false,
          error: error instanceof Error ? error.message : "Delivery failed"
        };
      }
    })
  );

  return {
    delivered: results.some((result) => result.ok),
    channels: results.filter((result) => result.ok).map((result) => result.channel),
    errors: results.filter((result) => !result.ok).map((result) => `${result.channel}: ${result.error}`)
  };
};
const deliverPasswordResetCode = async ({ user, code }) => {
  const bindings = db.getActiveOtpBindingsForUser(user);
  const tasks = bindings
    .filter((binding) => config.otpDeliveryChannels.includes(binding.channel))
    .map((binding) => ({
      channel: binding.channel,
      run: () => {
        if (binding.channel === "telegram" && config.telegramBotToken) {
          return sendTelegramText({
            chatId: binding.recipient_id,
            text: buildPasswordResetMessage(code)
          });
        }
        if (binding.channel === "vk" && config.vkGroupToken) {
          return sendVkText({
            userId: binding.recipient_id,
            message: buildPasswordResetMessage(code)
          });
        }
        throw new Error("Channel is not configured");
      }
    }));

  if (config.notificationChannels.includes("email") && user.email) {
    tasks.push({
      channel: "email",
      run: () =>
        sendEmail({
          to: user.email,
          subject: "Код восстановления пароля склад контур",
          text: buildPasswordResetMessage(code)
        })
    });
  }

  if (tasks.length === 0) {
    return {
      delivered: false,
      channels: [],
      errors: ["Сначала привяжите Telegram или VK к телефону сотрудника, затем запросите восстановление ещё раз"]
    };
  }

  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run();
        return {
          channel: task.channel,
          ok: true
        };
      } catch (error) {
        return {
          channel: task.channel,
          ok: false,
          error: error instanceof Error ? error.message : "Delivery failed"
        };
      }
    })
  );

  return {
    delivered: results.some((result) => result.ok),
    channels: results.filter((result) => result.ok).map((result) => result.channel),
    errors: results.filter((result) => !result.ok).map((result) => `${result.channel}: ${result.error}`)
  };
};
const normalizeNotification = (record) => ({
  id: record.delivery_id ?? record.id,
  tone: record.tone ?? "info",
  title: record.title,
  message: record.message,
  createdAt: record.created_at,
  propertyName: record.property_name ?? null,
  entityType: record.entity_type,
  entityId: record.entity_id,
  unread: Boolean(record.unread),
  deliveryStatus: record.delivery_status ?? "delivered"
});
const getNotificationRecipientUsers = ({ propertyId = null, tenantId = null, includeTenant = false } = {}) => {
  const users = db.listUsers().filter((user) => user.is_active === 1);
  return users.filter((user) => {
    if (["admin", "manager"].includes(user.role)) {
      return true;
    }
    if (user.role === "worker") {
      return !propertyId || !user.property_id || user.property_id === propertyId;
    }
    if (includeTenant && user.role === "tenant") {
      return tenantId && user.tenant_id === tenantId;
    }
    return false;
  });
};
const getNotificationEmailForUser = (user, tenantId = null) => {
  if (user.email) {
    return user.email;
  }
  if (user.role === "tenant" && tenantId) {
    return db.getTenant(tenantId)?.email ?? null;
  }
  return null;
};
const dispatchNotification = async ({
  type,
  title,
  message,
  tone = "info",
  entityType = null,
  entityId = null,
  propertyId = null,
  tenantId = null,
  recipients = [],
  createdBy = null,
  channels = config.notificationChannels
}) => {
  const uniqueRecipients = [...new Map(recipients.map((user) => [user.id, user])).values()];
  const deliveryRows = [];
  for (const recipient of uniqueRecipients) {
    if (channels.includes("in_app")) {
      deliveryRows.push({
        channel: "in_app",
        userId: recipient.id,
        status: "delivered"
      });
    }
    if (channels.includes("email")) {
      deliveryRows.push({
        channel: "email",
        userId: recipient.id,
        email: getNotificationEmailForUser(recipient, tenantId),
        status: config.smtpHost ? "pending" : "skipped",
        error: config.smtpHost ? null : "SMTP is not configured"
      });
    }
  }

  const created = db.createNotification({
    type,
    title,
    message,
    tone,
    entityType,
    entityId,
    propertyId,
    tenantId,
    createdBy,
    deliveries: deliveryRows
  });

  await Promise.all(
    created.deliveries
      .filter((delivery) => delivery.channel === "email" && delivery.status === "pending" && delivery.recipient_email)
      .map(async (delivery) => {
        try {
          const result = await sendEmail({
            to: delivery.recipient_email,
            subject: title,
            text: message
          });
          db.updateNotificationDelivery(delivery.id, {
            status: "delivered",
            attempts: Number(delivery.attempts ?? 0) + 1,
            externalMessageId: result.messageId
          });
        } catch (error) {
          db.updateNotificationDelivery(delivery.id, {
            status: "failed",
            attempts: Number(delivery.attempts ?? 0) + 1,
            error: error instanceof Error ? error.message : "Email delivery failed"
          });
        }
      })
  );

  return created;
};
const notifyTicketEvent = async ({ ticket, type, title, message, tone = "info", actor = null, includeTenant = true }) =>
  dispatchNotification({
    type,
    title,
    message,
    tone,
    entityType: "ticket",
    entityId: ticket.id,
    propertyId: ticket.propertyId ?? ticket.property_id,
    tenantId: ticket.tenantId ?? ticket.tenant_id,
    createdBy: actor?.id ?? null,
    recipients: getNotificationRecipientUsers({
      propertyId: ticket.propertyId ?? ticket.property_id,
      tenantId: ticket.tenantId ?? ticket.tenant_id,
      includeTenant
    })
  });
const formatMonthLabel = (value) =>
  new Intl.DateTimeFormat("ru-RU", {
    month: "short"
  })
    .format(value)
    .replace(".", "");
const roundMetric = (value) => Number(value.toFixed(1));
const money = (value) => Math.round(value);
const daysUntilIso = (isoDate) => {
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};
const isOpenTicket = (status) => !["completed", "resolved", "closed", "rejected"].includes(status);
const compareByDateDesc = (left, right) => new Date(right).getTime() - new Date(left).getTime();
const compareNotifications = (left, right) => {
  const toneDelta =
    (notificationToneWeights[right.tone] ?? 0) - (notificationToneWeights[left.tone] ?? 0);
  if (toneDelta !== 0) {
    return toneDelta;
  }

  return compareByDateDesc(left.createdAt, right.createdAt);
};
const buildLeaseRevenueRows = (scoped) => {
  const unitById = new Map(scoped.units.map((unit) => [unit.id, unit]));
  const tenantById = new Map(scoped.tenants.map((tenant) => [tenant.id, tenant]));

  return scoped.leases
    .filter((lease) => activeLeaseStages.has(lease.stage))
    .map((lease) => {
      const unit = unitById.get(lease.unitId);
      const tenant = tenantById.get(lease.tenantId);
      const monthlyAmount = (unit?.area ?? 0) * lease.ratePerSqm;

      return {
        lease,
        unit,
        tenant,
        monthlyAmount
      };
    });
};
const buildFinanceSummary = (scoped, scopedTickets) => {
  const tenantIds = new Set(scoped.tenants.map((tenant) => tenant.id));
  const invoices = db.listBillingInvoices().filter((invoice) => tenantIds.has(invoice.tenant_id));
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const currentInvoices = invoices.filter((invoice) => invoice.period === currentPeriod);
  const billedMonthly = sumBy(currentInvoices, (invoice) => invoice.total_amount);
  const collectedMonthly = sumBy(currentInvoices, (invoice) => invoice.paid_amount);
  const isDueOrTouched = (invoice) => {
    const dueTime = new Date(invoice.due_date).getTime();
    return (
      Number(invoice.paid_amount ?? 0) > 0 ||
      invoice.status !== "upcoming" ||
      (Number.isFinite(dueTime) && dueTime <= today.getTime())
    );
  };
  const currentCollectibleInvoices = currentInvoices.filter(isDueOrTouched);
  const fallbackPeriod =
    [...new Set(invoices.map((invoice) => invoice.period))]
      .filter((period) => period < currentPeriod)
      .sort((left, right) => right.localeCompare(left))[0] ?? currentPeriod;
  const collectionBaseInvoices =
    currentCollectibleInvoices.length > 0
      ? currentCollectibleInvoices
      : invoices.filter((invoice) => invoice.period === fallbackPeriod);
  const collectionBilled = sumBy(collectionBaseInvoices, (invoice) => invoice.total_amount);
  const collectionPaid = sumBy(collectionBaseInvoices, (invoice) => invoice.paid_amount);
  const collectionRate = collectionBilled > 0 ? roundMetric((collectionPaid / collectionBilled) * 100) : 0;
  const collectionPeriodLabel =
    collectionBaseInvoices.length > 0
      ? formatMonthLabel(new Date(`${collectionBaseInvoices[0].period}-01`))
      : formatMonthLabel(today);
  const effectiveCollectedMonthly =
    currentCollectibleInvoices.length > 0
      ? collectedMonthly
      : money(billedMonthly * Math.max(0.82, Math.min(1.01, collectionRate / 100 || 0.92)));
  const maintenanceUnits = scoped.units.filter((unit) => unit.status === "maintenance").length;
  const urgentTickets = scopedTickets.filter(
    (ticket) => isOpenTicket(ticket.status) && priorityWeights[ticket.priority] >= 3
  ).length;
  const openBillingTickets = scopedTickets.filter(
    (ticket) => isOpenTicket(ticket.status) && ticket.category === "billing"
  ).length;
  const budgetOpex = totalsSafe(scoped.units.filter((unit) => unit.status === "occupied"), (unit) => unit.area) * 82;
  const opexActual = budgetOpex * (1 + maintenanceUnits * 0.03 + urgentTickets * 0.018);
  const arrearsAmount = money(
    sumBy(invoices.filter((invoice) => ["late", "overdue"].includes(invoice.status)), (invoice) => Math.max(0, invoice.total_amount - invoice.paid_amount)) +
      openBillingTickets * 42000
  );
  const noi = money(effectiveCollectedMonthly - opexActual);
  const opexRatio = budgetOpex > 0 ? roundMetric((opexActual / budgetOpex) * 100) : 0;
  const currentMonth = startOfMonth();
  const expiringSoon = scoped.leases.filter(
    (lease) => activeLeaseStages.has(lease.stage) && daysUntilIso(lease.endDate) <= 60
  ).length;
  const series = [0, 1, 2].map((offset, index) => {
    const monthDate = addMonths(currentMonth, offset);
    const demandFactor = 1 - Math.max(0, expiringSoon - 1) * 0.015 + index * 0.01;
    const stressFactor = 1 + maintenanceUnits * 0.015 + openBillingTickets * 0.012;
    const period = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const periodInvoices = invoices.filter((invoice) => invoice.period === period);
    const periodBilled = sumBy(periodInvoices, (invoice) => invoice.total_amount);
    const periodCollected = sumBy(periodInvoices, (invoice) => invoice.paid_amount);
    const periodCollectibleInvoices = periodInvoices.filter(isDueOrTouched);
    const shouldUseActualCollection = period < currentPeriod || periodCollectibleInvoices.length > 0;
    const billed = periodBilled > 0 ? money(periodBilled) : money(billedMonthly * (0.98 + index * 0.015));
    const collected =
      periodBilled > 0 && shouldUseActualCollection
        ? money(periodCollected)
        : money(billed * Math.max(0.82, Math.min(1.01, (collectionRate / 100 || 0.92) * demandFactor)));
    const forecast = money(collected - budgetOpex * stressFactor);

    return {
      id: `finance-${offset}`,
      label: formatMonthLabel(monthDate),
      billed,
      collected,
      forecast
    };
  });

  return {
    collectionRate,
    collectionPeriod: collectionBaseInvoices[0]?.period ?? currentPeriod,
    collectionPeriodLabel,
    collectionBasis:
      currentCollectibleInvoices.length > 0
        ? "current_due"
        : fallbackPeriod < currentPeriod
          ? "last_closed"
          : "forecast",
    arrearsAmount,
    opexRatio,
    noi,
    forecastQuarter: money(sumBy(series, (entry) => entry.forecast)),
    forecastPeriodLabel: `${series[0]?.label ?? ""}–${series[series.length - 1]?.label ?? ""}`,
    series
  };
};
const buildNotifications = (scoped, scopedTickets) => {
  const ticketItems = scopedTickets
    .filter((ticket) => isOpenTicket(ticket.status))
    .map((ticket) => ({
      id: `ticket-${ticket.id}`,
      tone: priorityWeights[ticket.priority] >= 4 ? "critical" : priorityWeights[ticket.priority] >= 3 ? "warning" : "info",
      title: `${ticket.number} · ${ticket.title}`,
      message: `${ticket.propertyName ?? "Объект"} · ${ticket.unitNumber ?? "—"} · ${ticket.tenantName ?? "Без арендатора"}`,
      createdAt: ticket.updatedAt,
      propertyName: ticket.propertyName ?? null,
      entityType: "ticket",
      entityId: ticket.id,
      unread: priorityWeights[ticket.priority] >= 3
    }));
  const leaseItems = scoped.leases
    .filter((lease) => activeLeaseStages.has(lease.stage))
    .map((lease) => {
      const remainingDays = daysUntilIso(lease.endDate);
      return {
        id: `lease-${lease.id}`,
        tone: remainingDays <= 15 ? "critical" : remainingDays <= 45 ? "warning" : "info",
        title: `Договор ${lease.contractNumber}`,
        message: `${lease.tenantName ?? "Арендатор"} · ${lease.propertyName ?? "Объект"} · ${Math.max(remainingDays, 0)} дн. до завершения`,
        createdAt: lease.updatedAt,
        propertyName: lease.propertyName ?? null,
        entityType: "lease",
        entityId: lease.id,
        unread: remainingDays <= 45
      };
    })
    .filter((item) => item.tone !== "info" || scoped.leases.length <= 2);
  const unitItems = scoped.units
    .filter((unit) => ["vacant", "maintenance"].includes(unit.status))
    .map((unit) => ({
      id: `unit-${unit.id}`,
      tone: unit.status === "maintenance" ? "warning" : "info",
      title: `${unit.propertyName ?? "Объект"} · ${unit.number}`,
      message:
        unit.status === "maintenance"
          ? "Помещение находится в техобслуживании и давит на OPEX."
          : "Есть доступный вакантный блок для нового договора.",
      createdAt: unit.updatedAt,
      propertyName: unit.propertyName ?? null,
      entityType: "unit",
      entityId: unit.id,
      unread: unit.status === "maintenance"
    }));

  return [...ticketItems, ...leaseItems, ...unitItems].sort(compareNotifications).slice(0, 8);
};
const totalsSafe = (items, selector) => sumBy(items, selector);
const buildTeamSummary = (user, scopedProperties, scopedTickets) => {
  const propertyIds = new Set(scopedProperties.map((property) => property.id));
  const propertyById = new Map(scopedProperties.map((property) => [property.id, property]));
  const users = db
    .listUsers()
    .filter((member) => member.role !== "tenant")
    .filter((member) => {
      if (user.role === "admin") {
        return true;
      }

      if (member.role === "admin") {
        return true;
      }

      if (propertyIds.size === 0) {
        return member.id === user.id;
      }

      return member.property_id ? propertyIds.has(member.property_id) : true;
    })
    .sort((left, right) => {
      const roleDelta = (roleWeights[left.role] ?? 99) - (roleWeights[right.role] ?? 99);
      if (roleDelta !== 0) {
        return roleDelta;
      }

      return String(left.full_name).localeCompare(String(right.full_name), "ru");
    });

  return users.map((member) => {
    const assignedTickets = scopedTickets.filter((ticket) => ticket.assignedTo === member.id);
    const urgentTicketCount = assignedTickets.filter((ticket) => priorityWeights[ticket.priority] >= 3).length;
    const propertyName = member.property_id ? propertyById.get(member.property_id)?.name ?? null : null;
    const focusTicket = [...assignedTickets].sort((left, right) => {
      const priorityDelta = (priorityWeights[right.priority] ?? 0) - (priorityWeights[left.priority] ?? 0);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return compareByDateDesc(left.updatedAt, right.updatedAt);
    })[0];

    return {
      id: member.id,
      fullName: member.full_name,
      role: member.role,
      propertyId: member.property_id,
      propertyName,
      email: member.email,
      phone: member.phone,
      assignedTicketCount: assignedTickets.length,
      urgentTicketCount,
      openTicketCount: assignedTickets.filter((ticket) => isOpenTicket(ticket.status)).length,
      shift:
        member.role === "admin"
          ? "HQ / сквозной контроль"
          : member.role === "manager"
            ? "08:00–17:00"
            : "Сменный пост 24/7",
      focus: focusTicket?.title ?? (member.role === "admin" ? "Портфель и SLA" : "Текущая операционная смена"),
      lastLoginAt: member.last_login_at,
      isCurrentUser: member.id === user.id
    };
  });
};
const buildExportQueue = (scoped, scopedTickets) => {
  const latestLeaseUpdate =
    [...scoped.leases]
      .sort((left, right) => compareByDateDesc(left.updatedAt, right.updatedAt))[0]
      ?.updatedAt ?? new Date().toISOString();
  const latestTicketUpdate =
    [...scopedTickets]
      .sort((left, right) => compareByDateDesc(left.updatedAt, right.updatedAt))[0]
      ?.updatedAt ?? latestLeaseUpdate;
  const scopedLeaseIds = new Set(scoped.leases.map((lease) => lease.id));
  const scopedInvoices = db
    .listBillingInvoices()
    .map(normalizeBillingInvoice)
    .filter((invoice) => scopedLeaseIds.has(invoice.leaseId));
  const latestBillingUpdate =
    [...scopedInvoices]
      .sort((left, right) => compareByDateDesc(left.updatedAt, right.updatedAt))[0]
      ?.updatedAt ?? latestLeaseUpdate;

  return [
    {
      id: "rent-roll",
      name: "Rent roll",
      format: "XLSX",
      cadence: "Еженедельно",
      scope: `${scoped.tenants.length} арендаторов / ${scoped.leases.length} договоров`,
      status: "ready",
      updatedAt: latestLeaseUpdate
    },
    {
      id: "service-digest",
      name: "Service desk digest",
      format: "XLSX",
      cadence: "Ежедневно",
      scope: `${scopedTickets.length} заявок в контуре`,
      status: "scheduled",
      updatedAt: latestTicketUpdate
    },
    {
      id: "cashflow",
      name: "Cashflow forecast",
      format: "XLSX",
      cadence: "Ежемесячно",
      scope: `${scoped.properties.length} объекта`,
      status: "draft",
      updatedAt: latestLeaseUpdate
    },
    {
      id: "billing-ledger",
      name: "Billing ledger",
      format: "XLSX",
      cadence: "On demand",
      scope: `${scopedInvoices.length} invoices`,
      status: "ready",
      updatedAt: latestBillingUpdate
    }
  ];
};
const excelXmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const excelSheetName = (value) => excelXmlEscape(String(value).slice(0, 31));
const excelCell = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${excelXmlEscape(value)}</Data></Cell>`;
};
const excelRow = (values, styleId = null) =>
  `<Row>${values.map((value) => (styleId ? `<Cell ss:StyleID="${styleId}">${excelCell(value).replace(/^<Cell>|<\/Cell>$/g, "")}</Cell>` : excelCell(value))).join("")}</Row>`;
const tableRows = (headers, rows) => [
  excelRow(headers.map((header) => header.label), "Header"),
  ...rows.map((row) => excelRow(headers.map((header) => row[header.key])))
].join("");
const excelWorksheet = ({ name, rows }) => `<Worksheet ss:Name="${excelSheetName(name)}"><Table>${rows}</Table></Worksheet>`;
const buildExcelWorkbook = (sheets) => `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF4F3" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
 </Styles>
 ${sheets.map(excelWorksheet).join("")}
</Workbook>`;
const buildXlsxWorkbook = async (sheets) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "sklad kontur";
  workbook.created = new Date();
  for (const sheet of sheets) {
    const rows = parseSpreadsheetRows(`<Workbook><Worksheet><Table>${sheet.rows}</Table></Worksheet></Workbook>`);
    const worksheet = workbook.addWorksheet(String(sheet.name).slice(0, 31) || "Sheet");
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns.forEach((column) => {
      column.width = Math.min(
        42,
        Math.max(
          12,
          ...column.values.map((value) => String(value ?? "").length + 2)
        )
      );
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
const excelFile = async (filename, sheets) => ({
  filename: filename.replace(/\.xls$/i, ".xlsx"),
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  content: await buildXlsxWorkbook(sheets)
});
const buildExportFile = async (exportId, scoped, scopedTickets) => {
  const totals = {
    properties: scoped.properties.length,
    units: scoped.units.length,
    tenants: scoped.tenants.length,
    leases: scoped.leases.length,
    activeLeases: scoped.leases.filter((lease) => activeLeaseStages.has(lease.stage)).length,
    occupiedArea: sumBy(scoped.units.filter((unit) => unit.status === "occupied"), (unit) => unit.area),
    vacantArea: sumBy(scoped.units.filter((unit) => unit.status === "vacant"), (unit) => unit.area),
    totalRentableArea: sumBy(scoped.properties, (property) => property.rentableArea),
    openTickets: scopedTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length
  };
  const occupancyRate = totals.totalRentableArea > 0 ? roundMetric((totals.occupiedArea / totals.totalRentableArea) * 100) : 0;

  if (exportId === "rent-roll") {
    return excelFile("rent-roll.xls", [
      {
        name: "Сводная",
        rows: [
          excelRow(["Rent roll"], "Title"),
          excelRow(["Показатель", "Значение"], "Header"),
          excelRow(["Объектов", totals.properties]),
          excelRow(["Арендаторов", totals.tenants]),
          excelRow(["Договоров", totals.leases]),
          excelRow(["Активных договоров", totals.activeLeases]),
          excelRow(["Занятая площадь, м2", totals.occupiedArea]),
          excelRow(["Вакантная площадь, м2", totals.vacantArea]),
          excelRow(["Занятость, %", occupancyRate])
        ].join("")
      },
      {
        name: "Договоры",
        rows: tableRows(
          [
            { key: "contractNumber", label: "Номер договора" },
            { key: "tenantName", label: "Арендатор" },
            { key: "propertyName", label: "Объект" },
            { key: "unitNumber", label: "Помещение" },
            { key: "stage", label: "Стадия" },
            { key: "startDate", label: "Начало" },
            { key: "endDate", label: "Окончание" },
            { key: "ratePerSqm", label: "Ставка за м2" },
            { key: "deposit", label: "Депозит" },
            { key: "indexationPct", label: "Индексация %" }
          ],
          scoped.leases
        )
      },
      {
        name: "Арендаторы",
        rows: tableRows(
          [
            { key: "name", label: "Название" },
            { key: "inn", label: "ИНН" },
            { key: "contactName", label: "Контакт" },
            { key: "phone", label: "Телефон" },
            { key: "email", label: "Email" },
            { key: "riskLevel", label: "Риск" },
            { key: "leaseCount", label: "Договоров" }
          ],
          scoped.tenants
        )
      },
      {
        name: "Помещения",
        rows: tableRows(
          [
            { key: "propertyName", label: "Объект" },
            { key: "number", label: "Номер" },
            { key: "floor", label: "Этаж" },
            { key: "area", label: "Площадь" },
            { key: "type", label: "Тип" },
            { key: "status", label: "Статус" },
            { key: "tenantName", label: "Арендатор" }
          ],
          scoped.units
        )
      }
    ]);
  }

  if (exportId === "service-digest") {
    const byStatus = [...new Set(scopedTickets.map((ticket) => ticket.status))].map((status) => ({
      status,
      count: scopedTickets.filter((ticket) => ticket.status === status).length
    }));
    return excelFile("service-desk-digest.xls", [
      {
        name: "Сводная",
        rows: [
          excelRow(["Service desk digest"], "Title"),
          excelRow(["Показатель", "Значение"], "Header"),
          excelRow(["Всего заявок", scopedTickets.length]),
          excelRow(["Открытых заявок", totals.openTickets]),
          excelRow(["Критичных", scopedTickets.filter((ticket) => ticket.priority === "urgent").length]),
          excelRow(["Каналов Telegram/VK", scopedTickets.filter((ticket) => ["telegram", "vk"].includes(ticket.sourceChannel)).length])
        ].join("")
      },
      {
        name: "Заявки",
        rows: tableRows(
          [
            { key: "number", label: "Номер" },
            { key: "title", label: "Тема" },
            { key: "tenantName", label: "Арендатор" },
            { key: "propertyName", label: "Объект" },
            { key: "unitNumber", label: "Помещение" },
            { key: "category", label: "Категория" },
            { key: "priority", label: "Приоритет" },
            { key: "status", label: "Статус" },
            { key: "sourceChannel", label: "Канал" },
            { key: "assignedToName", label: "Исполнитель" },
            { key: "updatedAt", label: "Обновлено" }
          ],
          scopedTickets
        )
      },
      {
        name: "По статусам",
        rows: tableRows(
          [
            { key: "status", label: "Статус" },
            { key: "count", label: "Количество" }
          ],
          byStatus
        )
      }
    ]);
  }

  if (exportId === "cashflow") {
    const finance = buildFinanceSummary(scoped, scopedTickets);
    return excelFile("cashflow-forecast.xls", [
      {
        name: "Сводная",
        rows: [
          excelRow(["Cashflow forecast"], "Title"),
          excelRow(["Показатель", "Значение"], "Header"),
          excelRow(["Сбор платежей, %", finance.collectionRate]),
          excelRow(["Просрочка", finance.arrearsAmount]),
          excelRow(["NOI", finance.noi]),
          excelRow(["OPEX, %", finance.opexRatio]),
          excelRow(["Прогноз квартал", finance.forecastQuarter])
        ].join("")
      },
      {
        name: "Прогноз",
        rows: tableRows(
          [
            { key: "label", label: "Период" },
            { key: "billed", label: "Начислено" },
            { key: "forecast", label: "Прогноз" }
          ],
          finance.series
        )
      },
      {
        name: "Объекты",
        rows: tableRows(
          [
            { key: "name", label: "Объект" },
            { key: "address", label: "Адрес" },
            { key: "rentableArea", label: "Арендуемая площадь" },
            { key: "warehouseClass", label: "Класс" }
          ],
          scoped.properties
        )
      }
    ]);
  }

  if (exportId === "billing-ledger") {
    const leaseIds = new Set(scoped.leases.map((lease) => lease.id));
    const invoiceIds = new Set();
    const invoices = db
      .listBillingInvoices()
      .map(normalizeBillingInvoice)
      .filter((invoice) => {
        const allowed = leaseIds.has(invoice.leaseId);
        if (allowed) {
          invoiceIds.add(invoice.id);
        }
        return allowed;
      });
    const payments = db
      .listBillingPayments()
      .filter((payment) => invoiceIds.has(payment.invoice_id))
      .map(normalizeBillingPayment);
    const billed = sumBy(invoices, (invoice) => invoice.totalAmount);
    const paid = sumBy(invoices, (invoice) => invoice.paidAmount);

    return excelFile("billing-ledger.xls", [
      {
        name: "Summary",
        rows: [
          excelRow(["Billing ledger"], "Title"),
          excelRow(["Metric", "Value"], "Header"),
          excelRow(["Invoices", invoices.length]),
          excelRow(["Billed", billed]),
          excelRow(["Paid", paid]),
          excelRow(["Outstanding", Math.max(0, billed - paid)])
        ].join("")
      },
      {
        name: "Invoices",
        rows: tableRows(
          [
            { key: "period", label: "Period" },
            { key: "tenantName", label: "Tenant" },
            { key: "contractNumber", label: "Contract" },
            { key: "propertyName", label: "Property" },
            { key: "unitNumber", label: "Unit" },
            { key: "rentAmount", label: "Rent" },
            { key: "variableAmount", label: "Variable" },
            { key: "totalAmount", label: "Total" },
            { key: "paidAmount", label: "Paid" },
            { key: "dueDate", label: "Due" },
            { key: "status", label: "Status" }
          ],
          invoices
        )
      },
      {
        name: "Payments",
        rows: tableRows(
          [
            { key: "paidAt", label: "Paid at" },
            { key: "tenantName", label: "Tenant" },
            { key: "contractNumber", label: "Contract" },
            { key: "period", label: "Period" },
            { key: "amount", label: "Amount" },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" }
          ],
          payments
        )
      }
    ]);
  }

  return null;
};

const buildBillingInvoiceExportFile = async (invoice) => {
  const payments = db.listBillingPayments({ invoiceId: invoice.id }).map(normalizeBillingPayment);
  const readings = db
    .listMeterReadings({
      tenantId: invoice.tenantId,
      unitId: invoice.unitId,
      period: invoice.period
    })
    .map(normalizeMeterReading);
  const outstanding = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount));
  const filename = `invoice-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-");

  return excelFile(filename, [
    {
      name: "Invoice",
      rows: [
        excelRow(["sklad kontur invoice"], "Title"),
        excelRow(["Field", "Value"], "Header"),
        excelRow(["Period", invoice.period]),
        excelRow(["Tenant", invoice.tenantName ?? ""]),
        excelRow(["Contract", invoice.contractNumber ?? ""]),
        excelRow(["Property", invoice.propertyName ?? ""]),
        excelRow(["Unit", invoice.unitNumber ?? ""]),
        excelRow(["Rent amount", invoice.rentAmount]),
        excelRow(["Variable amount", invoice.variableAmount]),
        excelRow(["Total", invoice.totalAmount]),
        excelRow(["Paid", invoice.paidAmount]),
        excelRow(["Outstanding", outstanding]),
        excelRow(["Due date", invoice.dueDate]),
        excelRow(["Status", invoice.status])
      ].join("")
    },
    {
      name: "Meter readings",
      rows: tableRows(
        [
          { key: "period", label: "Period" },
          { key: "unitNumber", label: "Unit" },
          { key: "meterType", label: "Meter" },
          { key: "previousValue", label: "Previous" },
          { key: "value", label: "Current" },
          { key: "consumption", label: "Consumption" },
          { key: "tariffRate", label: "Tariff" },
          { key: "chargeAmount", label: "Charge" },
          { key: "recordedAt", label: "Recorded at" }
        ],
        readings
      )
    },
    {
      name: "Payments",
      rows: tableRows(
        [
          { key: "paidAt", label: "Paid at" },
          { key: "amount", label: "Amount" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" }
        ],
        payments
      )
    }
  ]);
};

const buildBillingClosingPackFile = async (invoice) => {
  const payments = db.listBillingPayments({ invoiceId: invoice.id }).map(normalizeBillingPayment);
  const readings = db
    .listMeterReadings({
      tenantId: invoice.tenantId,
      unitId: invoice.unitId,
      period: invoice.period
    })
    .map(normalizeMeterReading);
  const paidAmount = sumBy(payments, (payment) => payment.amount);
  const outstanding = Math.max(0, Number(invoice.totalAmount) - paidAmount);
  const overpaid = Math.max(0, paidAmount - Number(invoice.totalAmount));
  const reconciliationStatus = overpaid > 0 ? "overpaid" : outstanding <= 0 ? "matched" : paidAmount > 0 ? "partial" : "unpaid";
  const filename = `closing-pack-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-");
  const serviceRows = [
    {
      line: "Base rent",
      period: invoice.period,
      quantity: 1,
      amount: invoice.rentAmount
    },
    {
      line: "Variable charges",
      period: invoice.period,
      quantity: readings.length || 1,
      amount: invoice.variableAmount
    }
  ];

  return excelFile(filename, [
    {
      name: "Act",
      rows: [
        excelRow(["sklad kontur closing act"], "Title"),
        excelRow(["Field", "Value"], "Header"),
        excelRow(["Act period", invoice.period]),
        excelRow(["Tenant", invoice.tenantName ?? ""]),
        excelRow(["Contract", invoice.contractNumber ?? ""]),
        excelRow(["Property", invoice.propertyName ?? ""]),
        excelRow(["Unit", invoice.unitNumber ?? ""]),
        excelRow(["Service total", invoice.totalAmount]),
        excelRow(["Paid", paidAmount]),
        excelRow(["Outstanding", outstanding]),
        excelRow(["Status", reconciliationStatus])
      ].join("")
    },
    {
      name: "Service lines",
      rows: tableRows(
        [
          { key: "line", label: "Line" },
          { key: "period", label: "Period" },
          { key: "quantity", label: "Quantity" },
          { key: "amount", label: "Amount" }
        ],
        serviceRows
      )
    },
    {
      name: "Reconciliation",
      rows: [
        excelRow(["Payment reconciliation"], "Title"),
        excelRow(["Field", "Value"], "Header"),
        excelRow(["Invoice total", invoice.totalAmount]),
        excelRow(["Paid", paidAmount]),
        excelRow(["Outstanding", outstanding]),
        excelRow(["Overpaid", overpaid]),
        excelRow(["Due date", invoice.dueDate]),
        excelRow(["Last paid at", payments[0]?.paidAt ?? ""]),
        excelRow(["Invoice status", invoice.status]),
        excelRow(["Reconciliation status", reconciliationStatus])
      ].join("")
    },
    {
      name: "Payments",
      rows: tableRows(
        [
          { key: "paidAt", label: "Paid at" },
          { key: "amount", label: "Amount" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" }
        ],
        payments
      )
    },
    {
      name: "Meter readings",
      rows: tableRows(
        [
          { key: "period", label: "Period" },
          { key: "unitNumber", label: "Unit" },
          { key: "meterType", label: "Meter" },
          { key: "previousValue", label: "Previous" },
          { key: "value", label: "Current" },
          { key: "consumption", label: "Consumption" },
          { key: "tariffRate", label: "Tariff" },
          { key: "chargeAmount", label: "Charge" },
          { key: "recordedAt", label: "Recorded at" }
        ],
        readings
      )
    }
  ]);
};

const buildUnitExportFile = async (unitId, scoped, scopedTickets) => {
  const unit = scoped.units.find((item) => item.id === unitId);
  if (!unit) {
    return null;
  }

  const property = scoped.properties.find((item) => item.id === unit.propertyId) ?? null;
  const leases = scoped.leases.filter((lease) => lease.unitId === unit.id);
  const activeLease = leases.find((lease) => activeLeaseStages.has(lease.stage)) ?? null;
  const tenant = activeLease ? scoped.tenants.find((item) => item.id === activeLease.tenantId) ?? null : null;
  const tickets = scopedTickets.filter((ticket) => ticket.unitId === unit.id);
  const documents = leases.flatMap((lease) =>
    db.listLeaseDocuments(lease.id).map((document) => ({
      contractNumber: lease.contractNumber,
      tenantName: lease.tenantName,
      fileName: document.file_name,
      category: document.document_category ?? "other",
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
      uploadedByName: db.getById("users", document.uploaded_by)?.full_name ?? null,
      createdAt: document.created_at
    }))
  );
  const monthlyRent = activeLease ? unit.area * activeLease.ratePerSqm : 0;
  const openTickets = tickets.filter((ticket) => isOpenTicket(ticket.status));
  const filename = sanitizeFilename(`unit-${property?.name ?? "property"}-${unit.number}.xls`);

  return excelFile(filename, [
    {
      name: "Сводная",
      rows: [
        excelRow(["Паспорт помещения"], "Title"),
        excelRow(["Показатель", "Значение"], "Header"),
        excelRow(["Объект", property?.name ?? unit.propertyName ?? ""]),
        excelRow(["Адрес", property?.address ?? ""]),
        excelRow(["Помещение", unit.number]),
        excelRow(["Этаж", unit.floor]),
        excelRow(["Площадь, м2", unit.area]),
        excelRow(["Тип", unit.type]),
        excelRow(["Статус", unit.status]),
        excelRow(["Температурный режим", unit.temperatureRegime ?? ""]),
        excelRow(["Высота потолка", unit.ceilingHeight]),
        excelRow(["Рампа", unit.hasRamp ? "Да" : "Нет"]),
        excelRow(["Ворота", unit.hasGate ? "Да" : "Нет"]),
        excelRow(["Текущий арендатор", tenant?.name ?? unit.tenantName ?? ""]),
        excelRow(["Активный договор", activeLease?.contractNumber ?? ""]),
        excelRow(["Месячная аренда", monthlyRent]),
        excelRow(["Открытых заявок", openTickets.length])
      ].join("")
    },
    {
      name: "Договоры",
      rows: tableRows(
        [
          { key: "contractNumber", label: "Номер договора" },
          { key: "tenantName", label: "Арендатор" },
          { key: "stage", label: "Стадия" },
          { key: "startDate", label: "Начало" },
          { key: "endDate", label: "Окончание" },
          { key: "ratePerSqm", label: "Ставка за м2" },
          { key: "deposit", label: "Депозит" },
          { key: "indexationPct", label: "Индексация %" }
        ],
        leases
      )
    },
    {
      name: "Заявки",
      rows: tableRows(
        [
          { key: "number", label: "Номер" },
          { key: "title", label: "Тема" },
          { key: "tenantName", label: "Арендатор" },
          { key: "category", label: "Категория" },
          { key: "priority", label: "Приоритет" },
          { key: "status", label: "Статус" },
          { key: "sourceChannel", label: "Канал" },
          { key: "assignedToName", label: "Исполнитель" },
          { key: "createdAt", label: "Создано" },
          { key: "updatedAt", label: "Обновлено" }
        ],
        tickets
      )
    },
    {
      name: "Документы",
      rows: tableRows(
        [
          { key: "contractNumber", label: "Договор" },
          { key: "tenantName", label: "Арендатор" },
          { key: "fileName", label: "Файл" },
          { key: "mimeType", label: "Тип" },
          { key: "sizeBytes", label: "Размер, байт" },
          { key: "uploadedByName", label: "Загрузил" },
          { key: "createdAt", label: "Загружено" }
        ],
        documents
      )
    }
  ]);
};
const buildImportTemplateFile = async (templateId) => {
  const templates = {
    tenants: {
      filename: "template-tenants.xls",
      headers: [
        { key: "name", label: "Название" },
        { key: "inn", label: "ИНН" },
        { key: "contactName", label: "Контактное лицо" },
        { key: "phone", label: "Телефон" },
        { key: "email", label: "Email" },
        { key: "riskLevel", label: "Риск" }
      ]
    },
    units: {
      filename: "template-units.xls",
      headers: [
        { key: "property", label: "Объект" },
        { key: "number", label: "Номер" },
        { key: "floor", label: "Этаж" },
        { key: "area", label: "Площадь" },
        { key: "type", label: "Тип" },
        { key: "temperatureRegime", label: "Температурный режим" },
        { key: "ceilingHeight", label: "Высота потолка" }
      ]
    },
    leases: {
      filename: "template-leases.xls",
      headers: [
        { key: "contractNumber", label: "Номер договора" },
        { key: "tenant", label: "Арендатор" },
        { key: "unit", label: "Помещение" },
        { key: "startDate", label: "Начало" },
        { key: "endDate", label: "Окончание" },
        { key: "ratePerSqm", label: "Ставка за м2" },
        { key: "deposit", label: "Депозит" }
      ]
    }
  };
  templates.payments = {
    filename: "template-payments.xls",
    headers: [
      { key: "invoiceId", label: "Invoice ID" },
      { key: "contractNumber", label: "Contract number" },
      { key: "period", label: "Period YYYY-MM" },
      { key: "tenant", label: "Tenant" },
      { key: "amount", label: "Amount" },
      { key: "paidAt", label: "Paid at YYYY-MM-DD" },
      { key: "method", label: "Method" },
      { key: "reference", label: "Reference" }
    ]
  };

  const template = templates[templateId];
  if (!template) {
    return null;
  }

  return excelFile(template.filename, [
      {
        name: "Шаблон",
        rows: tableRows(template.headers, [])
      },
      {
        name: "Сводная",
        rows: [
          excelRow(["Шаблон импорта"], "Title"),
          excelRow(["Раздел", templateId]),
          excelRow(["Колонок", template.headers.length])
        ].join("")
      }
    ]);
};
const decodeXmlEntities = (value) =>
  String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const normalizeImportHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
const parseSpreadsheetRows = (text) => {
  const rows = [];
  const rowMatches = String(text).matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi);
  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = rowMatch[1].matchAll(/<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi);
    for (const cellMatch of cellMatches) {
      const indexMatch = cellMatch[1].match(/ss:Index="(\d+)"/i);
      if (indexMatch) {
        const targetIndex = Number(indexMatch[1]) - 1;
        while (cells.length < targetIndex) {
          cells.push("");
        }
      }
      const dataMatch = cellMatch[2].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      cells.push(decodeXmlEntities(dataMatch?.[1]?.replace(/<[^>]+>/g, "") ?? ""));
    }
    if (cells.some((cell) => String(cell).trim())) {
      rows.push(cells);
    }
  }
  return rows;
};
const parseDelimitedRows = (text) => {
  const delimiter = String(text).includes(";") ? ";" : ",";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const cells = [];
      let current = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"' && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === delimiter && !quoted) {
          cells.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current);
      return cells.map((cell) => cell.trim().replace(/^\uFEFF/, ""));
    });
};
const parseXlsxRows = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }
  const rows = [];
  worksheet.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      values[columnNumber - 1] = cell.text || String(cell.value ?? "");
    });
    if (values.some((value) => String(value ?? "").trim())) {
      rows.push(values);
    }
  });
  return rows;
};
const parseImportRows = async ({ filename, buffer }) => {
  const extension = path.extname(String(filename ?? "")).toLowerCase();
  if (extension === ".xlsx") {
    return parseXlsxRows(buffer);
  }

  const text = buffer.toString("utf8");
  return String(text).includes("<Workbook") ? parseSpreadsheetRows(text) : parseDelimitedRows(text);
};
const rowsToObjects = (rows, aliases) => {
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => aliases[normalizeImportHeader(cell)]));
  if (headerRowIndex < 0) {
    throw new Error("Header row not found");
  }
  const headers = rows[headerRowIndex].map((header) => aliases[normalizeImportHeader(header)] ?? null);
  return rows.slice(headerRowIndex + 1).map((row, index) => ({
    rowNumber: headerRowIndex + index + 2,
    values: Object.fromEntries(
      headers
        .map((key, cellIndex) => [key, row[cellIndex]])
        .filter(([key]) => key)
        .map(([key, value]) => [key, String(value ?? "").trim()])
    )
  }));
};
const findByIdOrName = (items, value, selectors) => {
  const needle = normalizeImportHeader(value);
  return items.find((item) => selectors.some((selector) => normalizeImportHeader(selector(item)) === needle)) ?? null;
};
const buildImportReportWorkbook = async ({ templateId, rows, dryRun = false }) =>
  excelFile(`import-report-${templateId}.xls`, [
    {
      name: "Отчет",
      rows: tableRows(
        [
          { key: "row", label: "Строка" },
          { key: "status", label: "Статус" },
          { key: "action", label: "Action" },
          { key: "changes", label: "Changes" },
          { key: "message", label: "Сообщение" },
          { key: "entityId", label: "ID записи" }
        ],
        rows
      )
    },
    {
      name: "Сводная",
      rows: [
        excelRow(["Отчет импорта"], "Title"),
        excelRow(["Раздел", templateId]),
        excelRow(["Mode", dryRun ? "preview" : "commit"]),
        excelRow(["Ready", rows.filter((row) => row.status === "ready").length]),
        excelRow(["Updated", rows.filter((row) => row.status === "updated").length]),
        excelRow(["Успешно", rows.filter((row) => row.status === "created").length]),
        excelRow(["Ошибок", rows.filter((row) => row.status === "error").length])
      ].join("")
    }
  ]);
const requireImportFields = (values, fields) => {
  const missing = fields.find((field) => !String(values[field] ?? "").trim());
  if (missing) {
    throw new Error(`Missing field: ${missing}`);
  }
};

const compactImportPayload = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
  );

const uniqueImportMatch = (items, predicates, label) => {
  const matches = items.filter((item) => predicates.some((predicate) => predicate(item)));
  const uniqueById = [...new Map(matches.map((item) => [item.id, item])).values()];
  if (uniqueById.length > 1) {
    throw new Error(`${label} keys match multiple records`);
  }
  return uniqueById[0] ?? null;
};

const getImportAction = ({ mode, existing }) => {
  if (mode === "create") {
    if (existing) {
      throw new Error("Record already exists");
    }
    return "create";
  }
  if (mode === "update") {
    if (!existing) {
      throw new Error("Record not found for update");
    }
    return "update";
  }
  return existing ? "update" : "create";
};

const formatImportValue = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "empty";
  }
  return String(value).trim();
};

const importValuesEqual = (left, right) => {
  const leftText = String(left ?? "").trim();
  const rightText = String(right ?? "").trim();
  if (leftText === "" && rightText === "") {
    return true;
  }
  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber;
  }
  return leftText === rightText;
};

const buildImportChanges = (existing, payload) => {
  if (!existing) {
    const fields = Object.entries(payload)
      .filter(([key]) => key !== "indexationPct")
      .map(([key, value]) => `${key}: ${formatImportValue(value)}`);
    return fields.length > 0 ? `New record; ${fields.join("; ")}` : "New record";
  }
  const changes = Object.entries(payload)
    .filter(([key]) => key !== "indexationPct")
    .filter(([key, value]) => !importValuesEqual(existing[key], value))
    .map(([key, value]) => `${key}: ${formatImportValue(existing[key])} -> ${formatImportValue(value)}`);

  return changes.length > 0 ? changes.join("; ") : "No changes";
};

const runImport = async ({ templateId, filename, buffer, dryRun = false, mode = "create", user = null }) => {
  const importMode = ["create", "update", "upsert"].includes(mode) ? mode : "create";
  const aliasesByTemplate = {
    tenants: {
      "название": "name",
      "name": "name",
      "инн": "inn",
      "inn": "inn",
      "контактное лицо": "contactName",
      "контакт": "contactName",
      "contact": "contactName",
      "contactname": "contactName",
      "contact name": "contactName",
      "телефон": "phone",
      "phone": "phone",
      "email": "email",
      "риск": "riskLevel",
      "risk": "riskLevel",
      "risklevel": "riskLevel",
      "risk level": "riskLevel"
    },
    units: {
      "объект": "property",
      "property": "property",
      "номер": "number",
      "number": "number",
      "этаж": "floor",
      "floor": "floor",
      "площадь": "area",
      "area": "area",
      "тип": "type",
      "type": "type",
      "статус": "status",
      "status": "status",
      "температурный режим": "temperatureRegime",
      "temperatureregime": "temperatureRegime",
      "temperature regime": "temperatureRegime",
      "высота потолка": "ceilingHeight",
      "ceilingheight": "ceilingHeight",
      "ceiling height": "ceilingHeight"
    },
    leases: {
      "номер договора": "contractNumber",
      "contractnumber": "contractNumber",
      "contract number": "contractNumber",
      "арендатор": "tenant",
      "tenant": "tenant",
      "помещение": "unit",
      "unit": "unit",
      "начало": "startDate",
      "startdate": "startDate",
      "start date": "startDate",
      "окончание": "endDate",
      "enddate": "endDate",
      "end date": "endDate",
      "ставка за м2": "ratePerSqm",
      "ставка за м²": "ratePerSqm",
      "ratepersqm": "ratePerSqm",
      "rate per sqm": "ratePerSqm",
      "депозит": "deposit",
      "deposit": "deposit",
      "стадия": "stage",
      "stage": "stage"
    }
  };
  aliasesByTemplate.payments = {
    "invoice id": "invoiceId",
    "invoice": "invoiceId",
    "contract number": "contractNumber",
    "contract": "contractNumber",
    "period": "period",
    "period yyyy-mm": "period",
    "tenant": "tenant",
    "amount": "amount",
    "paid at": "paidAt",
    "paid at yyyy-mm-dd": "paidAt",
    "method": "method",
    "reference": "reference"
  };

  const aliases = aliasesByTemplate[templateId];
  if (!aliases) {
    return null;
  }

  const parsedRows = rowsToObjects(await parseImportRows({ filename, buffer }), aliases);
  const reportRows = [];
  const rollbackOperations = [];
  const properties = db.listProperties().map(normalizeProperty);
  const tenants = db.listTenants().map(normalizeTenant);
  const units = db.listUnits().map(normalizeUnit);
  const leases = db.listLeases().map(normalizeLease);
  const invoices = db.listBillingInvoices().map(normalizeBillingInvoice);
  const payments = db.listBillingPayments().map(normalizeBillingPayment);

  for (const row of parsedRows) {
    try {
      let createdRecord = null;
      let action = "create";
      let changes = "";
      let entityId = "";
      let entityType = "";
      let rollbackBefore = null;
      if (templateId === "tenants") {
        entityType = "tenant";
        const existing = uniqueImportMatch(
          tenants,
          [
            (tenant) => row.values.inn && normalizeImportHeader(tenant.inn) === normalizeImportHeader(row.values.inn),
            (tenant) => row.values.phone && normalizeImportHeader(tenant.phone) === normalizeImportHeader(row.values.phone),
            (tenant) => row.values.email && normalizeImportHeader(tenant.email) === normalizeImportHeader(row.values.email)
          ],
          "Tenant"
        );
        action = getImportAction({ mode: importMode, existing });
        if (action === "create") {
          requireImportFields(row.values, ["name", "inn", "contactName", "phone", "email"]);
        }
        const payload = compactImportPayload({
          name: row.values.name,
          inn: row.values.inn,
          contactName: row.values.contactName,
          phone: row.values.phone,
          email: row.values.email,
          riskLevel: row.values.riskLevel || (action === "create" ? "medium" : undefined)
        });
        changes = buildImportChanges(action === "update" ? existing : null, payload);
        entityId = existing?.id ?? "";
        rollbackBefore = action === "update" ? existing : null;
        if (!dryRun) {
          createdRecord = action === "update" ? db.updateTenant(existing.id, payload) : db.createTenant(payload);
        }
      } else if (templateId === "units") {
        entityType = "unit";
        requireImportFields(row.values, ["property", "number"]);
        const property = findByIdOrName(properties, row.values.property, [
          (item) => item.id,
          (item) => item.name,
          (item) => item.address
        ]);
        if (!property) {
          throw new Error("Объект не найден");
        }
        const existing = units.find(
          (unit) =>
            unit.propertyId === property.id &&
            normalizeImportHeader(unit.number) === normalizeImportHeader(row.values.number)
        );
        action = getImportAction({ mode: importMode, existing });
        if (action === "create") {
          requireImportFields(row.values, ["area"]);
        }
        const payload = compactImportPayload({
          propertyId: property.id,
          number: row.values.number,
          floor: row.values.floor || (action === "create" ? "1" : undefined),
          area: row.values.area,
          type: row.values.type || (action === "create" ? "warm" : undefined),
          status: row.values.status || (action === "create" ? "vacant" : undefined),
          temperatureRegime: row.values.temperatureRegime,
          ceilingHeight: row.values.ceilingHeight
        });
        changes = buildImportChanges(action === "update" ? existing : null, payload);
        entityId = existing?.id ?? "";
        rollbackBefore = action === "update" ? existing : null;
        if (!dryRun) {
          createdRecord =
            action === "update"
              ? db.updateUnit(existing.id, payload)
              : db.createUnit({
                  ...payload,
                  hasRamp: true,
                  hasGate: true
                });
        }
      } else if (templateId === "leases") {
        entityType = "lease";
        requireImportFields(row.values, ["contractNumber"]);
        const existing = leases.find(
          (lease) => normalizeImportHeader(lease.contractNumber) === normalizeImportHeader(row.values.contractNumber)
        );
        action = getImportAction({ mode: importMode, existing });
        if (action === "create") {
          requireImportFields(row.values, ["tenant", "unit", "startDate", "endDate", "ratePerSqm"]);
        }
        const tenant = row.values.tenant ? findByIdOrName(tenants, row.values.tenant, [
          (item) => item.id,
          (item) => item.name,
          (item) => item.inn
        ]) : null;
        const unit = row.values.unit ? findByIdOrName(units, row.values.unit, [
          (item) => item.id,
          (item) => item.number,
          (item) => `${item.propertyName} ${item.number}`
        ]) : null;
        if (row.values.tenant && !tenant) {
          throw new Error("Арендатор не найден");
        }
        if (row.values.unit && !unit) {
          throw new Error("Помещение не найдено");
        }
        const nextUnitId = unit?.id ?? existing?.unitId;
        if (nextUnitId && leases.some((lease) => lease.id !== existing?.id && lease.unitId === nextUnitId)) {
          throw new Error("Unit already has a lease");
        }
        const payload = compactImportPayload({
          tenantId: tenant?.id,
          unitId: unit?.id,
          contractNumber: row.values.contractNumber,
          stage: row.values.stage || (action === "create" ? "draft" : undefined),
          startDate: row.values.startDate,
          endDate: row.values.endDate,
          ratePerSqm: row.values.ratePerSqm,
          deposit: row.values.deposit || (action === "create" ? 0 : undefined),
          indexationPct: action === "create" ? 0 : undefined
        });
        changes = buildImportChanges(action === "update" ? existing : null, payload);
        entityId = existing?.id ?? "";
        rollbackBefore = action === "update" ? existing : null;
        if (!dryRun) {
          createdRecord = action === "update" ? db.updateLease(existing.id, payload) : db.createLease(payload);
        }
      } else if (templateId === "payments") {
        entityType = "payment";
        requireImportFields(row.values, ["amount"]);
        const invoice =
          findByIdOrName(invoices, row.values.invoiceId, [(item) => item.id]) ??
          invoices.find((item) => {
            const lease = leases.find((candidate) => candidate.id === item.leaseId) ?? null;
            const matchesContract =
              row.values.contractNumber &&
              normalizeImportHeader(lease?.contractNumber ?? item.contractNumber) ===
                normalizeImportHeader(row.values.contractNumber);
            const matchesTenant =
              row.values.tenant &&
              normalizeImportHeader(item.tenantName ?? "") === normalizeImportHeader(row.values.tenant);
            const matchesPeriod = row.values.period && normalizeImportHeader(item.period) === normalizeImportHeader(row.values.period);
            return matchesPeriod && (matchesContract || matchesTenant);
          }) ??
          null;

        if (!invoice) {
          throw new Error("Invoice not found");
        }

        const existing = row.values.reference
          ? payments.find(
              (payment) =>
                payment.invoiceId === invoice.id &&
                normalizeImportHeader(payment.reference) === normalizeImportHeader(row.values.reference)
            )
          : null;
        if (importMode === "update" && !row.values.reference) {
          throw new Error("Payment reference is required for update");
        }
        action = getImportAction({ mode: importMode, existing });
        const payload = compactImportPayload({
          invoiceId: invoice.id,
          amount: row.values.amount,
          paidAt: row.values.paidAt,
          method: row.values.method || (action === "create" ? "bank_transfer" : undefined),
          reference: row.values.reference
        });
        changes = buildImportChanges(action === "update" ? existing : null, payload);
        entityId = existing?.id ?? "";
        rollbackBefore = action === "update" ? existing : null;
        if (!dryRun) {
          createdRecord =
            action === "update" ? db.updateBillingPayment(existing.id, payload) : db.createBillingPayment(payload);
        }
      }

      if (!dryRun && createdRecord) {
        rollbackOperations.push({
          row: row.rowNumber,
          entity_type: entityType,
          entity_id: createdRecord.id,
          action,
          before: rollbackBefore
        });
      }

      reportRows.push({
        row: row.rowNumber,
        status: dryRun ? "ready" : action === "update" ? "updated" : "created",
        action,
        changes,
        message: dryRun ? `Ready to ${action}` : action === "update" ? "Updated" : "Создано",
        entityId: createdRecord?.id ?? entityId
      });
    } catch (error) {
      reportRows.push({
        row: row.rowNumber,
        status: "error",
        action: "",
        changes: "",
        message: error instanceof Error ? error.message : "Import failed",
        entityId: ""
      });
    }
  }

  const reportFile = await buildImportReportWorkbook({ templateId, rows: reportRows, dryRun });
  const reportContent = Buffer.isBuffer(reportFile.content)
    ? reportFile.content
    : Buffer.from(reportFile.content, "utf8");
  const summary = {
    total: reportRows.length,
    ready: reportRows.filter((row) => row.status === "ready").length,
    created: reportRows.filter((row) => row.status === "created").length,
    updated: reportRows.filter((row) => row.status === "updated").length,
    errors: reportRows.filter((row) => row.status === "error").length
  };
  const batch =
    !dryRun && rollbackOperations.length > 0
      ? normalizeImportBatch(
          db.createImportBatch({
            templateId,
            fileName: filename,
            mode: importMode,
            summary,
            rows: reportRows,
            operations: rollbackOperations,
            createdBy: user?.id ?? null,
            createdByName: user?.fullName ?? user?.full_name ?? null
          })
        )
      : null;

  return {
    summary,
    rows: reportRows,
    batch,
    report: {
      filename: reportFile.filename,
      contentBase64: reportContent.toString("base64")
    }
  };
};

const buildImportBatchAuditFile = async (batch) => {
  const rows = Array.isArray(batch.rows) ? batch.rows : [];
  const operations = Array.isArray(batch.operations) ? batch.operations : [];
  const payloadHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: batch.id,
        templateId: batch.template_id,
        fileName: batch.file_name,
        mode: batch.mode,
        summary: batch.summary,
        rows,
        operations,
        createdAt: batch.created_at,
        createdBy: batch.created_by
      })
    )
    .digest("hex");

  return excelFile(`import-audit-${batch.id}.xlsx`, [
    {
      name: "Summary",
      rows: [
        excelRow(["sklad kontur import audit"], "Title"),
        excelRow(["Field", "Value"], "Header"),
        excelRow(["Batch ID", batch.id]),
        excelRow(["Template", batch.template_id]),
        excelRow(["File", batch.file_name]),
        excelRow(["Mode", batch.mode]),
        excelRow(["Status", batch.status]),
        excelRow(["Created by", batch.created_by_name ?? batch.created_by ?? ""]),
        excelRow(["Created at", batch.created_at]),
        excelRow(["Rolled back at", batch.rolled_back_at ?? ""]),
        excelRow(["Operations", operations.length]),
        excelRow(["Rows", rows.length]),
        excelRow(["SHA-256", payloadHash])
      ].join("")
    },
    {
      name: "Rows",
      rows: tableRows(
        [
          { key: "row", label: "Row" },
          { key: "status", label: "Status" },
          { key: "action", label: "Action" },
          { key: "changes", label: "Changes" },
          { key: "message", label: "Message" },
          { key: "entityId", label: "Entity ID" }
        ],
        rows
      )
    },
    {
      name: "Rollback log",
      rows: tableRows(
        [
          { key: "row", label: "Row" },
          { key: "entity_type", label: "Entity type" },
          { key: "entity_id", label: "Entity ID" },
          { key: "action", label: "Action" },
          { key: "before", label: "Before snapshot" }
        ],
        operations.map((operation) => ({
          ...operation,
          before: operation.before ? JSON.stringify(operation.before) : ""
        }))
      )
    }
  ]);
};
const sanitizeFilename = (value) => {
  const cleaned = path
    .basename(String(value ?? "document"))
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "document";
};
const documentPathFor = (storedName) => fileStorage.keyFor("documents", storedName);
const ticketAttachmentPathFor = (storedName) => fileStorage.keyFor("ticket-attachments", storedName);
const ensureDocumentWithinStorage = (filePath) => fileStorage.isSafeKey(filePath, "documents");
const ensureTicketAttachmentWithinStorage = (filePath) => fileStorage.isSafeKey(filePath, "ticket-attachments");
const inferMediaType = (mimeType) => {
  if (String(mimeType).startsWith("image/")) {
    return "image";
  }
  if (String(mimeType).startsWith("video/")) {
    return "video";
  }
  return "file";
};
const getScopedLease = (user, leaseId) => buildScopedCollections(user).leases.find((item) => item.id === leaseId) ?? null;
const getScopedBillingInvoices = (user) => {
  const leaseIds = new Set(buildScopedCollections(user).leases.map((lease) => lease.id));
  return db
    .listBillingInvoices()
    .map(normalizeBillingInvoice)
    .filter((invoice) => leaseIds.has(invoice.leaseId));
};
const getScopedBillingInvoice = (user, invoiceId) =>
  getScopedBillingInvoices(user).find((invoice) => invoice.id === invoiceId) ?? null;

const buildBillingReconciliation = (user) => {
  const invoices = getScopedBillingInvoices(user);
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const payments = db
    .listBillingPayments()
    .filter((payment) => invoiceIds.has(payment.invoice_id))
    .map(normalizeBillingPayment);
  const paymentsByInvoice = new Map();
  for (const payment of payments) {
    paymentsByInvoice.set(payment.invoiceId, [...(paymentsByInvoice.get(payment.invoiceId) ?? []), payment]);
  }

  const rows = invoices.map((invoice) => {
    const invoicePayments = paymentsByInvoice.get(invoice.id) ?? [];
    const paidAmount = sumBy(invoicePayments, (payment) => payment.amount);
    const outstandingAmount = Math.max(0, Number(invoice.totalAmount) - paidAmount);
    const overpaidAmount = Math.max(0, paidAmount - Number(invoice.totalAmount));
    const lastPaidAt = invoicePayments[0]?.paidAt ?? invoice.paidAt ?? null;
    const dueTime = new Date(invoice.dueDate).getTime();
    const isOverdue = outstandingAmount > 0 && Number.isFinite(dueTime) && dueTime < Date.now();
    const reconciliationStatus =
      overpaidAmount > 0
        ? "overpaid"
        : outstandingAmount <= 0
          ? "matched"
          : paidAmount > 0
            ? "partial"
            : isOverdue
              ? "overdue"
              : "unpaid";

    return {
      invoiceId: invoice.id,
      period: invoice.period,
      tenantName: invoice.tenantName ?? "",
      contractNumber: invoice.contractNumber ?? "",
      propertyName: invoice.propertyName ?? "",
      unitNumber: invoice.unitNumber ?? "",
      totalAmount: Number(invoice.totalAmount),
      paidAmount,
      outstandingAmount,
      overpaidAmount,
      dueDate: invoice.dueDate,
      lastPaidAt,
      invoiceStatus: invoice.status,
      reconciliationStatus,
      issue:
        reconciliationStatus === "matched"
          ? ""
          : reconciliationStatus === "overpaid"
            ? "Payment exceeds invoice amount"
            : reconciliationStatus === "partial"
              ? "Partial payment"
              : isOverdue
                ? "Overdue outstanding balance"
                : "Awaiting payment",
      paymentCount: invoicePayments.length
    };
  });

  const billed = sumBy(rows, (row) => row.totalAmount);
  const paid = sumBy(rows, (row) => row.paidAmount);
  return {
    summary: {
      invoices: rows.length,
      billed,
      paid,
      outstanding: sumBy(rows, (row) => row.outstandingAmount),
      overpaid: sumBy(rows, (row) => row.overpaidAmount),
      matched: rows.filter((row) => row.reconciliationStatus === "matched").length,
      issues: rows.filter((row) => row.reconciliationStatus !== "matched").length,
      collectionRate: billed > 0 ? roundMetric((paid / billed) * 100) : 0
    },
    rows
  };
};

const buildBillingReconciliationFile = async (user) => {
  const reconciliation = buildBillingReconciliation(user);
  return excelFile("billing-reconciliation.xlsx", [
    {
      name: "Summary",
      rows: [
        excelRow(["sklad kontur billing reconciliation"], "Title"),
        excelRow(["Metric", "Value"], "Header"),
        excelRow(["Invoices", reconciliation.summary.invoices]),
        excelRow(["Billed", reconciliation.summary.billed]),
        excelRow(["Paid", reconciliation.summary.paid]),
        excelRow(["Outstanding", reconciliation.summary.outstanding]),
        excelRow(["Overpaid", reconciliation.summary.overpaid]),
        excelRow(["Matched", reconciliation.summary.matched]),
        excelRow(["Issues", reconciliation.summary.issues]),
        excelRow(["Collection rate, %", reconciliation.summary.collectionRate])
      ].join("")
    },
    {
      name: "Reconciliation",
      rows: tableRows(
        [
          { key: "period", label: "Period" },
          { key: "tenantName", label: "Tenant" },
          { key: "contractNumber", label: "Contract" },
          { key: "propertyName", label: "Property" },
          { key: "unitNumber", label: "Unit" },
          { key: "totalAmount", label: "Invoice total" },
          { key: "paidAmount", label: "Paid" },
          { key: "outstandingAmount", label: "Outstanding" },
          { key: "overpaidAmount", label: "Overpaid" },
          { key: "dueDate", label: "Due date" },
          { key: "lastPaidAt", label: "Last paid at" },
          { key: "reconciliationStatus", label: "Reconciliation status" },
          { key: "issue", label: "Issue" },
          { key: "paymentCount", label: "Payments" }
        ],
        reconciliation.rows
      )
    }
  ]);
};
const getScopedMeterReadings = (user) => {
  const scoped = buildScopedCollections(user);
  const unitIds = new Set(scoped.units.map((unit) => unit.id));
  const tenantIds = new Set(scoped.tenants.map((tenant) => tenant.id));
  return db
    .listMeterReadings()
    .filter((reading) => unitIds.has(reading.unit_id) && tenantIds.has(reading.tenant_id))
    .map(normalizeMeterReading);
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
const buildScopedCollections = (user) => {
  const properties = db.listProperties().map(normalizeProperty);
  const units = db.listUnits().map(normalizeUnit);
  const leases = db.listLeases().map(normalizeLease);
  const tenants = db.listTenants().map(normalizeTenant);

  let scopedProperties = properties;
  let scopedUnits = units;
  let scopedLeases = leases;
  let scopedTenants = tenants;

  if (user.role === "tenant") {
    scopedTenants = user.tenant_id ? tenants.filter((tenant) => tenant.id === user.tenant_id) : [];
    scopedLeases = user.tenant_id ? leases.filter((lease) => lease.tenantId === user.tenant_id) : [];

    const unitIds = new Set(scopedLeases.map((lease) => lease.unitId));
    scopedUnits = units.filter((unit) => unitIds.has(unit.id));

    const propertyIds = new Set(scopedUnits.map((unit) => unit.propertyId));
    scopedProperties = properties.filter((property) => propertyIds.has(property.id));
  } else if (["manager", "worker"].includes(user.role) && user.property_id) {
    scopedProperties = properties.filter((property) => property.id === user.property_id);
    scopedUnits = units.filter((unit) => unit.propertyId === user.property_id);

    const unitIds = new Set(scopedUnits.map((unit) => unit.id));
    scopedLeases = leases.filter((lease) => unitIds.has(lease.unitId));

    const tenantIds = new Set(scopedLeases.map((lease) => lease.tenantId));
    scopedTenants = tenants.filter((tenant) => tenantIds.has(tenant.id));
  }

  const leaseCounts = new Map();
  for (const lease of scopedLeases) {
    if (lease.stage === "terminated") {
      continue;
    }

    leaseCounts.set(lease.tenantId, (leaseCounts.get(lease.tenantId) ?? 0) + 1);
  }

  return {
    properties: scopedProperties,
    units: scopedUnits,
    tenants: scopedTenants.map((tenant) => ({
      ...tenant,
      leaseCount: leaseCounts.get(tenant.id) ?? 0
    })),
    leases: scopedLeases
  };
};

const requireTenantScope = (user, response, tenantId) => {
  if (user.role === "admin" || !user.property_id) {
    return true;
  }

  if (buildScopedCollections(user).tenants.some((tenant) => tenant.id === tenantId)) {
    return true;
  }

  forbidden(response);
  return false;
};

const buildDashboardResponse = (user) => {
  const scoped = buildScopedCollections(user);
  const scopedTickets = getScopedTickets(user);
  const totals = {
    property_count: scoped.properties.length,
    total_rentable_area: sumBy(scoped.properties, (property) => property.rentableArea),
    unit_count: scoped.units.length,
    occupied_area: sumBy(scoped.units.filter((unit) => unit.status === "occupied"), (unit) => unit.area),
    vacant_area: sumBy(scoped.units.filter((unit) => unit.status === "vacant"), (unit) => unit.area),
    tenant_count: scoped.tenants.length,
    active_lease_count: scoped.leases.filter((lease) => activeLeaseStages.has(lease.stage)).length
  };

  const expiringLeaseCount = scoped.leases.filter((lease) => {
    if (!activeLeaseStages.has(lease.stage)) {
      return false;
    }

    const ms = new Date(lease.endDate).getTime() - Date.now();
    const remainingDays = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return remainingDays <= 45;
  }).length;

  const occupancyRate =
    totals.total_rentable_area > 0
      ? Number(((totals.occupied_area / totals.total_rentable_area) * 100).toFixed(1))
      : 0;
  const finance = buildFinanceSummary(scoped, scopedTickets);
  const persistedNotifications = db.listNotificationsForUser(user.id).map(normalizeNotification);
  const generatedNotifications = buildNotifications(scoped, scopedTickets);
  const notificationById = new Map(
    [...persistedNotifications, ...generatedNotifications].map((item) => [item.id, item])
  );
  const notifications = [...notificationById.values()].sort(compareNotifications).slice(0, 12);
  const team = buildTeamSummary(user, scoped.properties, scopedTickets);
  const exports = buildExportQueue(scoped, scopedTickets);

  if (user.role === "worker") {
    return {
      totals: {
        property_count: scoped.properties.length,
        unit_count: scoped.units.length,
        assigned_ticket_count: scopedTickets.length
      },
      occupancyRate: 0,
      expiringLeaseCount: 0,
      notifications,
      properties: scoped.properties,
      units: scoped.units,
      tenants: [],
      leases: []
    };
  }

  if (user.role === "tenant") {
    return {
      totals,
      occupancyRate,
      expiringLeaseCount,
      notifications,
      team: [],
      exports: [],
      ...scoped
    };
  }

  return {
    totals,
    occupancyRate,
    expiringLeaseCount,
    finance,
    notifications,
    team,
    exports,
    ...scoped
  };
};

const getScopedTickets = (user) => {
  const tickets = db.listTickets().map(normalizeTicket);

  if (user.role === "tenant") {
    return user.tenant_id ? tickets.filter((ticket) => ticket.tenantId === user.tenant_id) : [];
  }

  if (user.role === "manager" && user.property_id) {
    return tickets.filter((ticket) => ticket.propertyId === user.property_id);
  }

  if (user.role === "worker") {
    return tickets.filter((ticket) => ticket.assignedTo === user.id);
  }

  return tickets;
};

const getTicketForUser = (user, ticketId) => getScopedTickets(user).find((ticket) => ticket.id === ticketId) ?? null;
const getTenantForUser = (user, tenantId) =>
  buildScopedCollections(user).tenants.find((tenant) => tenant.id === tenantId) ?? null;

const canUseUnit = (user, unitId) => {
  const scoped = buildScopedCollections(user);
  return scoped.units.some((unit) => unit.id === unitId);
};

const hydrateTicket = (ticketId) =>
  db.listTickets().map(normalizeTicket).find((ticket) => ticket.id === ticketId) ?? null;

const hydrateTicketComment = (ticketId, commentId) =>
  db
    .listTicketComments(ticketId)
    .map(normalizeTicketComment)
    .find((comment) => comment.id === commentId) ?? null;
const buildTenantPayments = (tenant, leases, units, scopedTickets) => {
  const monthlyRent = sumBy(
    leases.filter((lease) => activeLeaseStages.has(lease.stage)),
    (lease) => {
      const unit = units.find((item) => item.id === lease.unitId);
      return (unit?.area ?? 0) * lease.ratePerSqm;
    }
  );
  const currentMonth = startOfMonth();
  const billingPressure = scopedTickets.filter(
    (ticket) => ticket.category === "billing" && isOpenTicket(ticket.status)
  ).length;
  const pattern =
    tenant.riskLevel === "high"
      ? ["paid", "late", "overdue", "upcoming"]
      : tenant.riskLevel === "medium"
        ? ["paid", "paid", "late", "upcoming"]
        : ["paid", "paid", "paid", "upcoming"];

  return [-2, -1, 0, 1].map((offset, index) => {
    const periodDate = addMonths(currentMonth, offset);
    const dueDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), 10);
    const status = pattern[index] ?? "upcoming";
    const paidDate =
      status === "paid"
        ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + 1)
        : status === "late"
          ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + 5 + billingPressure)
          : null;

    return {
      id: `payment-${tenant.id}-${offset}`,
      period: `${formatMonthLabel(periodDate)} ${periodDate.getFullYear()}`,
      amount: money(monthlyRent),
      dueDate: toIsoDay(dueDate),
      paidDate: paidDate ? toIsoDay(paidDate) : null,
      status,
      method: "Безналичный расчёт"
    };
  });
};
const buildTenantMeters = (units) =>
  units.map((unit, index) => ({
    id: `meter-${unit.id}`,
    name: unit.type === "office" ? "Электроэнергия" : unit.type === "freezer" ? "Холодильный контур" : "Энергопотребление",
    unitNumber: unit.number,
    lastValue: money(unit.area * (unit.type === "freezer" ? 4.6 : unit.type === "office" ? 2.1 : 3.2)),
    deltaPct: roundMetric((unit.status === "maintenance" ? 6.8 : 2.4) + index * 0.7),
    updatedAt: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    status: unit.status === "maintenance" ? "attention" : "stable"
  }));
const buildTenantLedgerPayments = (tenant) =>
  db.listBillingInvoices({ tenantId: tenant.id }).map((invoice) => {
    const periodDate = new Date(`${invoice.period}-01T00:00:00.000Z`);
    return {
      id: invoice.id,
      period: `${formatMonthLabel(periodDate)} ${periodDate.getFullYear()}`,
      amount: money(invoice.total_amount),
      dueDate: invoice.due_date,
      paidDate: invoice.paid_at,
      status: invoice.status,
      method: invoice.paid_at ? "bank_transfer" : "invoice"
    };
  });
const buildTenantLedgerMeters = (tenant) =>
  db.listMeterReadings({ tenantId: tenant.id }).map((reading) => ({
    id: reading.id,
    unitId: reading.unit_id,
    tenantId: reading.tenant_id,
    period: reading.period,
    meterType: reading.meter_type,
    name:
      reading.meter_type === "electricity"
        ? "Электроэнергия"
        : reading.meter_type === "cold_chain"
          ? "Холодильный контур"
          : "Энергопотребление",
    unitNumber: reading.unit_number,
    lastValue: Number(reading.value),
    previousValue: Number(reading.previous_value ?? 0),
    consumption: Number(reading.consumption ?? Math.max(0, Number(reading.value) - Number(reading.previous_value ?? 0))),
    tariffRate: Number(reading.tariff_rate ?? 0),
    chargeAmount: Number(reading.charge_amount ?? 0),
    deltaPct:
      reading.previous_value > 0 ? roundMetric(((reading.value - reading.previous_value) / reading.previous_value) * 100) : 0,
    updatedAt: reading.recorded_at,
    status: reading.status
  }));
const buildTenantNotes = (tenant, tickets, manualNotes = []) => {
  const derivedNotes = tickets.slice(0, 2).map((ticket, index) => ({
    id: `note-ticket-${ticket.id}`,
    title: index === 0 ? "Операционная коммуникация" : "Сервисное наблюдение",
    authorName: ticket.createdByName ?? tenant.contactName,
    createdAt: ticket.updatedAt,
    content: `${ticket.title}. Статус: ${translateStatus(ticket.status)}. Канал: ${ticket.sourceChannel}.`,
    attachments: []
  }));

  return [
    ...manualNotes,
    {
      id: `note-renewal-${tenant.id}`,
      title: "Контур пролонгации",
      authorName: "Система",
      createdAt: new Date().toISOString(),
      content: `Для ${tenant.name} удерживаем единый трек по срокам договора, платёжной дисциплине и сервисной истории.`,
      attachments: []
    },
    ...derivedNotes
  ].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
};
const buildTenantRisks = (tenant, leases, tickets) => {
  const activeLeases = leases.filter((lease) => activeLeaseStages.has(lease.stage));
  const leaseRisks = activeLeases.map((lease) => {
    const remainingDays = daysUntilIso(lease.endDate);
    return {
      id: `risk-lease-${lease.id}`,
      title: `Пролонгация ${lease.contractNumber}`,
      severity: remainingDays <= 15 ? "critical" : remainingDays <= 45 ? "warning" : "info",
      owner: "Менеджер договора",
      dueDate: lease.endDate,
      status: remainingDays <= 45 ? "monitoring" : "stable"
    };
  });
  const serviceRisk = {
    id: `risk-service-${tenant.id}`,
    title: "Сервисная нагрузка арендатора",
    severity:
      tickets.filter(
        (ticket) =>
          isOpenTicket(ticket.status) &&
          !["billing", "lease"].includes(ticket.category) &&
          priorityWeights[ticket.priority] >= 3
      ).length > 0
        ? "warning"
        : "info",
    owner: "Служба эксплуатации",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: tickets.some((ticket) => isOpenTicket(ticket.status) && !["billing", "lease"].includes(ticket.category))
      ? "active"
      : "stable"
  };
  const paymentRisk = {
    id: `risk-payment-${tenant.id}`,
    title: "Платёжная дисциплина",
    severity: tenant.riskLevel === "high" ? "critical" : tenant.riskLevel === "medium" ? "warning" : "info",
    owner: "Финансовый контролёр",
    dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    status: tenant.riskLevel === "low" ? "stable" : "monitoring"
  };

  return [...leaseRisks, serviceRisk, paymentRisk].sort((left, right) => {
    const severityDelta =
      (notificationToneWeights[right.severity] ?? 0) - (notificationToneWeights[left.severity] ?? 0);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return compareByDateDesc(left.dueDate, right.dueDate);
  });
};
const tenantOnboardingPayload = () => ({
  channels: [
    {
      id: "telegram",
      label: "Telegram",
      url: config.telegramBotUrl,
      enabled: Boolean(config.telegramBotUrl && config.telegramBotToken),
      instruction: "Откройте бота и отправьте номер телефона, закреплённый за договором."
    },
    {
      id: "vk",
      label: "VK",
      url: config.vkBotUrl,
      enabled: Boolean(config.vkBotUrl && config.vkGroupToken),
      instruction: "Откройте сообщения сообщества и отправьте номер телефона."
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      url: config.whatsappBotUrl,
      enabled: Boolean(config.whatsappBotUrl),
      instruction: "Напишите номер телефона в бизнес-чат WhatsApp."
    }
  ]
});
const chatContextKey = (channel, recipientId) => `${channel}:${recipientId}`;
const buildTenantChatContexts = (user) => {
  if (!user?.tenant_id) {
    return [];
  }
  return db
    .listLeases()
    .filter((lease) => lease.tenant_id === user.tenant_id && lease.stage !== "terminated")
    .map((lease) => {
      const unit = db.getUnit(lease.unit_id);
      const property = unit ? db.getProperty(unit.property_id) : null;
      return {
        leaseId: lease.id,
        unitId: lease.unit_id,
        propertyId: unit?.property_id ?? null,
        label: `${property?.name ?? "Объект"} · ${unit?.number ?? "помещение"}`,
        detail: `${lease.contract_number} · ${unit?.area ?? 0} м2`
      };
    });
};
const getSelectedChatContext = ({ channel, recipientId, contexts }) => {
  const selected = chatContextStore.get(chatContextKey(channel, recipientId));
  return selected ? contexts.find((context) => context.unitId === selected.unitId) ?? null : null;
};
const setSelectedChatContext = ({ channel, recipientId, context }) => {
  chatContextStore.set(
    chatContextKey(channel, recipientId),
    {
      unitId: context.unitId,
      leaseId: context.leaseId,
      propertyId: context.propertyId
    },
    chatContextTtlMs
  );
};
const telegramContextKeyboard = (contexts) => ({
  inline_keyboard: contexts.map((context) => [
    {
      text: context.label.slice(0, 60),
      callback_data: `ctx:${context.unitId}`
    }
  ])
});
const vkContextKeyboard = (contexts) => ({
  one_time: false,
  inline: true,
  buttons: contexts.map((context) => [
    {
      action: {
        type: "text",
        label: context.label.slice(0, 40),
        payload: JSON.stringify({
          ctx: context.unitId
        })
      },
      color: "primary"
    }
  ])
});
const sendChatContextChoice = async ({ channel, recipientId, contexts }) => {
  const text = [
    "У вас несколько объектов/помещений.",
    "Выберите, по какому объекту продолжить чат:",
    ...contexts.map((context, index) => `${index + 1}. ${context.label} (${context.detail})`)
  ].join("\n");

  if (channel === "telegram" && config.telegramBotToken) {
    await sendTelegramText({
      chatId: recipientId,
      text,
      replyMarkup: telegramContextKeyboard(contexts)
    });
  }
  if (channel === "vk" && config.vkGroupToken) {
    await sendVkText({
      userId: recipientId,
      message: text,
      keyboard: vkContextKeyboard(contexts)
    });
  }
};
const handleChatContextSelection = async ({ channel, recipientId, unitId }) => {
  const binding = db.getOtpBindingByRecipient(channel, recipientId);
  const user = binding?.user_id ? db.getUserById(binding.user_id) : null;
  const contexts = buildTenantChatContexts(user);
  const context = contexts.find((item) => item.unitId === unitId);
  if (!context) {
    return false;
  }
  setSelectedChatContext({ channel, recipientId, context });
  const text = `Выбран контекст: ${context.label}. Теперь напишите сообщение по этому объекту.`;
  if (channel === "telegram" && config.telegramBotToken) {
    await sendTelegramText({ chatId: recipientId, text });
  }
  if (channel === "vk" && config.vkGroupToken) {
    await sendVkText({ userId: recipientId, message: text });
  }
  return true;
};
const parseTelegramPhone = (message) => {
  const value = message?.contact?.phone_number ?? message?.text ?? "";
  const match = String(value).match(/\+?\d[\d\s().-]{8,}\d/);
  if (!match) {
    return "";
  }

  const raw = match[0].replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) {
    return raw;
  }
  if (raw.length === 11 && raw.startsWith("8")) {
    return `+7${raw.slice(1)}`;
  }
  return raw.length === 11 && raw.startsWith("7") ? `+${raw}` : raw;
};
const handleTelegramWebhook = async (request, response) => {
  if (config.telegramWebhookSecret) {
    const actualSecret = request.headers["x-telegram-bot-api-secret-token"];
    if (actualSecret !== config.telegramWebhookSecret) {
      forbidden(response);
      return;
    }
  }

  const update = await parseJsonBody(request);
  const callbackQuery = update.callback_query ?? null;
  if (callbackQuery?.data?.startsWith("ctx:")) {
    const chatId = callbackQuery.message?.chat?.id;
    const selected = chatId
      ? await handleChatContextSelection({
          channel: "telegram",
          recipientId: chatId,
          unitId: callbackQuery.data.slice(4)
        })
      : false;
    await answerTelegramCallback({
      callbackQueryId: callbackQuery.id,
      text: selected ? "Контекст выбран" : "Не удалось выбрать объект"
    });
    ok(response, { success: true, selected });
    return;
  }

  const message = update.message ?? update.edited_message ?? null;
  const chatId = message?.chat?.id;
  if (!chatId) {
    ok(response, { success: true });
    return;
  }

  const media = extractTelegramMedia(message);
  if (media) {
    const binding = db.getOtpBindingByRecipient("telegram", chatId);
    if (binding) {
      try {
        const result = await handleBotMediaMessage({
          channel: "telegram",
          binding,
          media
        });
        ok(response, { success: true, ...result });
      } catch (error) {
        ok(response, { success: false, error: error instanceof Error ? error.message : "Attachment failed" });
      }
      return;
    }
  }

  const phone = parseTelegramPhone(message);
  if (!phone) {
    const binding = db.getOtpBindingByRecipient("telegram", chatId);
    if (binding && message?.text && !String(message.text).startsWith("/")) {
      const completed = await handleBotWorkerTextCommand({
        channel: "telegram",
        binding,
        text: String(message.text)
      });
      if (completed) {
        if (config.telegramBotToken) {
          await sendTelegramText({ chatId, text: "Заявка завершена. Комментарий сохранён в карточке." });
        }
        ok(response, { success: true, completed: true });
        return;
      }
      if (/^(сменить объект|выбрать объект|\/object|\/objects)$/i.test(String(message.text).trim())) {
        const user = binding.user_id ? db.getUserById(binding.user_id) : null;
        const contexts = buildTenantChatContexts(user);
        await sendChatContextChoice({ channel: "telegram", recipientId: chatId, contexts });
        ok(response, { success: true, contextChoice: true });
        return;
      }
      await createCrossChannelTenantMessage({
        channel: "telegram",
        binding,
        text: String(message.text)
      });
      ok(response, { success: true, routed: true });
      return;
    }

    if (config.telegramBotToken) {
      await sendTelegramText({
        chatId,
        text: "Для привязки к склад контур отправьте номер телефона, закреплённый за договором. Например: +79990000001."
      });
    }
    ok(response, { success: true, bound: false });
    return;
  }

  const user = db.getTenantUserByNormalizedPhone(phone) ?? db.getUserByPredicate(
    (item) =>
      normalizePhoneKey(item.phone) === normalizePhoneKey(phone) &&
      item.role !== "tenant" &&
      item.is_active === 1
  );
  if (!user) {
    if (config.telegramBotToken) {
      await sendTelegramText({
        chatId,
        text: "Этот телефон не найден в склад контур. Проверьте номер или обратитесь к администратору."
      });
    }
    ok(response, { success: true, bound: false });
    return;
  }

  db.upsertOtpBinding({
    channel: "telegram",
    phone: user.phone,
    tenantId: user.tenant_id,
    userId: user.id,
    recipientId: chatId,
    displayName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ")
  });

  if (config.telegramBotToken) {
    await sendTelegramText({
      chatId,
      text:
        user.role === "tenant"
          ? "Телефон привязан. Теперь вернитесь на страницу входа арендатора и запросите код."
          : "Телефон сотрудника привязан. Теперь можно получать коды восстановления пароля в Telegram."
    });
  }

  if (user.role === "tenant") {
    const contexts = buildTenantChatContexts(user);
    if (contexts.length > 1) {
      await sendChatContextChoice({ channel: "telegram", recipientId: chatId, contexts });
    }
  }

  ok(response, { success: true, bound: true });
};
const createCrossChannelTenantMessage = async ({ channel, binding, text }) => {
  const user = binding.user_id ? db.getUserById(binding.user_id) : null;
  if (!user || user.role !== "tenant" || !user.tenant_id) {
    return null;
  }

  const scopedTickets = db
    .listTickets()
    .filter((ticket) => ticket.tenant_id === user.tenant_id)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
  const contexts = buildTenantChatContexts(user);
  if (contexts.length === 0) {
    return null;
  }

  let context = getSelectedChatContext({
    channel,
    recipientId: binding.recipient_id,
    contexts
  });
  if (!context && contexts.length === 1) {
    context = contexts[0];
    setSelectedChatContext({ channel, recipientId: binding.recipient_id, context });
  }
  if (!context && contexts.length > 1) {
    await sendChatContextChoice({
      channel,
      recipientId: binding.recipient_id,
      contexts
    });
    return null;
  }

  let ticket =
    scopedTickets.find((item) => item.unit_id === context.unitId && isOpenTicket(item.status)) ??
    scopedTickets.find((item) => item.unit_id === context.unitId) ??
    null;

  if (!ticket) {
    const lease = db.listLeases().find((item) => item.id === context.leaseId);
    if (!lease) {
      return null;
    }
    const unit = db.getUnit(lease.unit_id);
    ticket = db.createTicket({
      unitId: lease.unit_id,
      tenantId: user.tenant_id,
      propertyId: unit?.property_id,
      createdBy: user.id,
      category: "other",
      priority: "low",
      status: "new",
      sourceChannel: channel,
      title: channel === "telegram" ? "Сообщение из Telegram" : "Сообщение из VK",
      description: `${context.label}\n\n${text}`
    });
  }

  return db.createTicketComment({
    ticketId: ticket.id,
    authorId: user.id,
    sourceChannel: channel,
    content: text
  });
};
const resolveBotTicketTarget = async ({ channel, binding }) => {
  const user = binding.user_id ? db.getUserById(binding.user_id) : null;
  if (!user) {
    return { user: null, ticket: null };
  }

  if (user.role === "tenant" && user.tenant_id) {
    const contexts = buildTenantChatContexts(user);
    if (contexts.length === 0) {
      return { user, ticket: null };
    }

    let context = getSelectedChatContext({
      channel,
      recipientId: binding.recipient_id,
      contexts
    });
    if (!context && contexts.length === 1) {
      context = contexts[0];
      setSelectedChatContext({ channel, recipientId: binding.recipient_id, context });
    }
    if (!context && contexts.length > 1) {
      await sendChatContextChoice({ channel, recipientId: binding.recipient_id, contexts });
      return { user, ticket: null, needsContext: true };
    }

    const scopedTickets = db
      .listTickets()
      .filter((ticket) => ticket.tenant_id === user.tenant_id && ticket.unit_id === context.unitId)
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
    let ticket = scopedTickets.find((item) => isOpenTicket(item.status)) ?? scopedTickets[0] ?? null;
    if (!ticket) {
      const lease = db.listLeases().find((item) => item.id === context.leaseId);
      if (!lease) {
        return { user, ticket: null };
      }
      const unit = db.getUnit(lease.unit_id);
      ticket = db.createTicket({
        unitId: lease.unit_id,
        tenantId: user.tenant_id,
        propertyId: unit?.property_id,
        createdBy: user.id,
        category: "other",
        priority: "low",
        status: "new",
        sourceChannel: channel,
        title: channel === "telegram" ? "Вложение из Telegram" : "Вложение из VK",
        description: context.label
      });
    }
    return { user, ticket };
  }

  if (user.role === "worker") {
    const tickets = db
      .listTickets()
      .filter((ticket) => ticket.assigned_to === user.id)
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
    return {
      user,
      ticket: tickets.find((ticket) => isOpenTicket(ticket.status)) ?? tickets[0] ?? null
    };
  }

  return { user, ticket: null };
};
const persistBotTicketAttachment = async ({ ticket, user, channel, fileName, mimeType, content, note }) => {
  if (!ticket || !user) {
    return null;
  }
  if (content.length === 0) {
    throw new Error("Empty file");
  }
  if (content.length > 100 * 1024 * 1024) {
    throw new Error("File is too large");
  }

  const safeFileName = sanitizeFilename(fileName);
  const extension = path.extname(safeFileName);
  const storedName = `${crypto.randomUUID()}${extension || ".bin"}`;
  const filePath = ticketAttachmentPathFor(storedName);
  if (!ensureTicketAttachmentWithinStorage(filePath)) {
    throw new Error("Unsafe attachment path");
  }

  await fileStorage.put({
    key: filePath,
    content,
    contentType: mimeType
  });

  try {
    const attachment = db.createTicketAttachment({
      ticketId: ticket.id,
      fileName: safeFileName,
      storedName,
      mimeType,
      mediaType: inferMediaType(mimeType),
      sizeBytes: content.length,
      note: note ?? "",
      uploadedBy: user.id
    });
    const comment = db.createTicketComment({
      ticketId: ticket.id,
      authorId: user.id,
      sourceChannel: channel,
      content: note ? `Прикреплён файл: ${safeFileName}\n\n${note}` : `Прикреплён файл: ${safeFileName}`
    });
    return { attachment, comment };
  } catch (error) {
    await fileStorage.delete({ key: filePath });
    throw error;
  }
};
const handleBotMediaMessage = async ({ channel, binding, media }) => {
  const { user, ticket, needsContext } = await resolveBotTicketTarget({ channel, binding });
  if (!user || !ticket) {
    return { attached: false, needsContext: Boolean(needsContext) };
  }

  const payload =
    channel === "telegram"
      ? await downloadTelegramMedia(media)
      : {
          ...(await downloadUrlBuffer(media.downloadUrl)),
          fileName: media.fileName,
          mimeType: media.mimeType,
          note: media.note ?? ""
        };
  const result = await persistBotTicketAttachment({
    ticket,
    user,
    channel,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    content: payload.content,
    note: payload.note
  });

  if (user.role === "worker" && isCompletionText(payload.note)) {
    db.updateTicket(ticket.id, {
      status: "completed",
      updatedBy: user.id
    });
  }

  return {
    attached: true,
    ticketId: ticket.id,
    attachmentId: result?.attachment?.id ?? null
  };
};
const handleBotWorkerTextCommand = async ({ channel, binding, text }) => {
  const { user, ticket } = await resolveBotTicketTarget({ channel, binding });
  if (!user || user.role !== "worker" || !ticket || !isCompletionText(text)) {
    return false;
  }

  db.updateTicket(ticket.id, {
    status: "completed",
    updatedBy: user.id
  });
  db.createTicketComment({
    ticketId: ticket.id,
    authorId: user.id,
    sourceChannel: channel,
    content: text
  });
  return true;
};
const buildOutboundTicketMessage = ({ ticket, author, content }) =>
  [
    `склад контур: ${author.full_name ?? "Сотрудник"} ответил по заявке ${ticket.number ?? ""}`.trim(),
    ticket.title ? `Тема: ${ticket.title}` : null,
    content
  ]
    .filter(Boolean)
    .join("\n\n");
const deliverTicketCommentToTenant = async ({ ticket, author, content }) => {
  const tenantId = ticket?.tenant_id ?? ticket?.tenantId ?? null;
  if (!tenantId || author.role === "tenant") {
    return {
      delivered: false,
      channels: [],
      errors: []
    };
  }

  const tenantUser = db.getTenantPortalUser(tenantId);
  const bindings = db
    .getActiveOtpBindingsForUser(tenantUser)
    .filter((binding) => ["telegram", "vk"].includes(binding.channel));

  const message = buildOutboundTicketMessage({ ticket, author, content });
  const tasks = bindings
    .map((binding) => {
      if (binding.channel === "telegram" && config.telegramBotToken) {
        return {
          channel: "telegram",
          run: () => sendTelegramText({ chatId: binding.recipient_id, text: message })
        };
      }
      if (binding.channel === "vk" && config.vkGroupToken) {
        return {
          channel: "vk",
          run: () => sendVkText({ userId: binding.recipient_id, message })
        };
      }
      return null;
    })
    .filter(Boolean);

  if (tasks.length === 0) {
    return {
      delivered: false,
      channels: [],
      errors: ["У арендатора нет привязанного Telegram/VK для обратной отправки"]
    };
  }

  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run();
        return {
          channel: task.channel,
          ok: true
        };
      } catch (error) {
        return {
          channel: task.channel,
          ok: false,
          error: error instanceof Error ? error.message : "Delivery failed"
        };
      }
    })
  );

  return {
    delivered: results.some((result) => result.ok),
    channels: results.filter((result) => result.ok).map((result) => result.channel),
    errors: results.filter((result) => !result.ok).map((result) => `${result.channel}: ${result.error}`)
  };
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const buildLeaseDocumentHtml = (lease) => `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(lease.contractNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1f2933; line-height: 1.55; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .muted { color: #64748b; margin-bottom: 28px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    td { border: 1px solid #d9e0e8; padding: 12px 14px; vertical-align: top; }
    td:first-child { width: 32%; color: #52616f; background: #f6f8fa; }
    .sign { margin-top: 44px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .line { border-top: 1px solid #94a3b8; padding-top: 10px; color: #52616f; }
  </style>
</head>
<body>
  <h1>Договор аренды ${escapeHtml(lease.contractNumber)}</h1>
  <div class="muted">Сформировано системой склад контур</div>
  <table>
    <tr><td>Арендатор</td><td>${escapeHtml(lease.tenantName)}</td></tr>
    <tr><td>Объект</td><td>${escapeHtml(lease.propertyName)}</td></tr>
    <tr><td>Помещение</td><td>${escapeHtml(lease.unitNumber)}</td></tr>
    <tr><td>Стадия</td><td>${escapeHtml(lease.stage)}</td></tr>
    <tr><td>Срок</td><td>${escapeHtml(lease.startDate)} - ${escapeHtml(lease.endDate)}</td></tr>
    <tr><td>Ставка за м²</td><td>${Number(lease.ratePerSqm).toLocaleString("ru-RU")} ₽</td></tr>
    <tr><td>Депозит</td><td>${Number(lease.deposit).toLocaleString("ru-RU")} ₽</td></tr>
    <tr><td>Индексация</td><td>${Number(lease.indexationPct).toLocaleString("ru-RU")}%</td></tr>
  </table>
  <p>Документ является операционной карточкой договора. Для юридически значимой версии подключается файл договора или ЭДО.</p>
  <div class="sign">
    <div class="line">Управляющая компания</div>
    <div class="line">Арендатор</div>
  </div>
</body>
</html>`;
const handleVkWebhook = async (request, response) => {
  const update = await parseJsonBody(request);
  if (update.type === "confirmation") {
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    response.end(config.vkConfirmationCode);
    return;
  }

  if (config.vkWebhookSecret && update.secret !== config.vkWebhookSecret) {
    forbidden(response);
    return;
  }

  if (update.type !== "message_new") {
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    response.end("ok");
    return;
  }

  const message = update.object?.message ?? {};
  const userId = message.from_id;
  const payload =
    typeof message.payload === "string"
      ? (() => {
          try {
            return JSON.parse(message.payload);
          } catch {
            return {};
          }
        })()
      : {};
  if (payload?.ctx && userId) {
    await handleChatContextSelection({
      channel: "vk",
      recipientId: userId,
      unitId: payload.ctx
    });
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    response.end("ok");
    return;
  }

  const vkMedia = extractVkMedia(message);
  if (vkMedia && userId) {
    const binding = db.getOtpBindingByRecipient("vk", userId);
    if (binding) {
      await handleBotMediaMessage({
        channel: "vk",
        binding,
        media: vkMedia
      });
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      response.end("ok");
      return;
    }
  }

  const phone = parseTelegramPhone({ text: message.text });
  if (!phone) {
    const binding = userId ? db.getOtpBindingByRecipient("vk", userId) : null;
    if (binding && message.text) {
      const completed = await handleBotWorkerTextCommand({
        channel: "vk",
        binding,
        text: String(message.text)
      });
      if (completed) {
        await sendVkText({ userId, message: "Заявка завершена. Комментарий сохранён в карточке." });
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        });
        response.end("ok");
        return;
      }
      if (/^(сменить объект|выбрать объект|\/object|\/objects)$/i.test(String(message.text).trim())) {
        const user = binding.user_id ? db.getUserById(binding.user_id) : null;
        const contexts = buildTenantChatContexts(user);
        await sendChatContextChoice({ channel: "vk", recipientId: userId, contexts });
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        });
        response.end("ok");
        return;
      }
      await createCrossChannelTenantMessage({
        channel: "vk",
        binding,
        text: String(message.text)
      });
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      response.end("ok");
      return;
    }

    if (config.vkGroupToken && userId) {
      await sendVkText({
        userId,
        message: "Для привязки к склад контур отправьте номер телефона. Например: +79990000001."
      });
    }
    response.end("ok");
    return;
  }

  const user = db.getTenantUserByNormalizedPhone(phone) ?? db.getUserByPredicate(
    (item) =>
      normalizePhoneKey(item.phone) === normalizePhoneKey(phone) &&
      item.role !== "tenant" &&
      item.is_active === 1
  );
  if (!user) {
    if (config.vkGroupToken && userId) {
      await sendVkText({
        userId,
        message: "Этот телефон не найден в склад контур. Проверьте номер или обратитесь к администратору."
      });
    }
    response.end("ok");
    return;
  }

  db.upsertOtpBinding({
    channel: "vk",
    phone: user.phone,
    tenantId: user.tenant_id,
    userId: user.id,
    recipientId: userId,
    displayName: ""
  });

  if (config.vkGroupToken && userId) {
    await sendVkText({
      userId,
      message:
        user.role === "tenant"
          ? "Телефон привязан. Теперь вернитесь на страницу входа арендатора и запросите код."
          : "Телефон сотрудника привязан. Теперь можно получать коды восстановления пароля в VK."
    });
  }

  response.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  response.end("ok");
};
const buildTenantDetailResponse = (user, tenantId) => {
  const scoped = buildScopedCollections(user);
  const tenant = scoped.tenants.find((item) => item.id === tenantId) ?? null;
  if (!tenant) {
    return null;
  }

  const leases = scoped.leases.filter((lease) => lease.tenantId === tenant.id);
  const unitIds = new Set(leases.map((lease) => lease.unitId));
  const units = scoped.units.filter((unit) => unitIds.has(unit.id));
  const tickets = getScopedTickets(user).filter((ticket) => ticket.tenantId === tenant.id);
  const manualNotes = db.listTenantNotes(tenant.id).map(normalizeTenantNote);
  const payments = buildTenantLedgerPayments(tenant);
  const openTicketCount = tickets.filter((ticket) => isOpenTicket(ticket.status)).length;
  const monthlyRent = sumBy(
    leases.filter((lease) => activeLeaseStages.has(lease.stage)),
    (lease) => {
      const unit = units.find((item) => item.id === lease.unitId);
      return (unit?.area ?? 0) * lease.ratePerSqm;
    }
  );
  const billedAmount = sumBy(payments, (payment) => payment.amount);
  const paidAmount = sumBy(payments.filter((payment) => payment.paidDate), (payment) => payment.amount);
  const collectionRate = billedAmount > 0 ? roundMetric((paidAmount / billedAmount) * 100) : 0;
  const arrearsAmount =
    payments
      .filter((payment) => ["late", "overdue"].includes(payment.status))
      .reduce((total, payment) => total + payment.amount * (payment.status === "overdue" ? 0.22 : 0.08), 0) +
    tickets.filter((ticket) => ticket.category === "billing" && isOpenTicket(ticket.status)).length * 32000;
  const nextExpiry = [...leases]
    .filter((lease) => activeLeaseStages.has(lease.stage))
    .sort((left, right) => new Date(left.endDate).getTime() - new Date(right.endDate).getTime())[0]?.endDate ?? null;

  return {
    tenant,
    summary: {
      totalArea: sumBy(units, (unit) => unit.area),
      unitCount: units.length,
      activeLeaseCount: leases.filter((lease) => activeLeaseStages.has(lease.stage)).length,
      monthlyRent: money(monthlyRent),
      paymentDiscipline: collectionRate,
      openTicketCount,
      arrearsAmount: money(arrearsAmount),
      nextExpiry
    },
    units,
    leases,
    tickets,
    payments,
    meters: buildTenantLedgerMeters(tenant),
    notes: buildTenantNotes(tenant, tickets, manualNotes),
    risks: buildTenantRisks(tenant, leases, tickets)
  };
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const pathname = url.pathname;
    const method = request.method ?? "GET";

    if (method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
      });
      response.end();
      return;
    }

    if (method === "GET" && pathname === "/health") {
      ok(response, {
        status: "ok",
        service: "warehouse-api",
        databaseBackend: db.backend,
        databasePath: db.backend === "json" ? config.dbPath : undefined,
        fileStorage: fileStorage.driver,
        volatileStore: otpStore.redisEnabled && mfaChallengeStore.redisEnabled ? "redis" : "memory"
      });
      return;
    }

    if (method === "GET" && pathname === "/api/system/readiness") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      ok(response, await buildSystemReadiness());
      return;
    }

    if (method === "GET" && pathname === "/api/auth/tenant/onboarding") {
      ok(response, tenantOnboardingPayload());
      return;
    }

    if (method === "POST" && pathname === "/api/integrations/telegram/webhook") {
      await handleTelegramWebhook(request, response);
      return;
    }

    if (method === "POST" && pathname === "/api/integrations/vk/webhook") {
      await handleVkWebhook(request, response);
      return;
    }

    if (method === "GET" && pathname === "/api/solution-contour") {
      ok(response, solutionContour);
      return;
    }

    if (method === "GET" && pathname === "/api/visualization/concepts") {
      ok(response, {
        surfaces: solutionContour.visualizationSurfaces
      });
      return;
    }

    if (method === "GET" && pathname === "/api/requirements/er-findings") {
      ok(response, {
        findings: erFindings
      });
      return;
    }

    if (method === "GET" && pathname === "/api/requirements/open-questions") {
      ok(response, {
        questions: openQuestions
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/staff/login") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email", "password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const user = db.getUserByEmail(body.email);
      if (!user || !verifyPassword(body.password, user.password_hash)) {
        unauthorized(response);
        return;
      }

      if (user.totp_enabled) {
        ok(response, {
          mfaRequired: true,
          mfaToken: createMfaChallenge(user),
          user: {
            email: user.email,
            fullName: user.full_name
          }
        });
        return;
      }

      db.markUserLoggedIn(user.id);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role
        },
        config.jwtSecret
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser)
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/staff/verify-2fa") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["mfaToken", "code"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const challenge = consumeMfaChallenge(body.mfaToken);
      if (!challenge) {
        unauthorized(response);
        return;
      }

      const user = db.getUserById(challenge.userId);
      if (!user || !user.totp_enabled || !verifyTotp(user.totp_secret, body.code)) {
        unauthorized(response);
        return;
      }

      mfaChallengeStore.delete(body.mfaToken);
      db.markUserLoggedIn(user.id);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role
        },
        config.jwtSecret
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser)
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/password-reset/request") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const user = db.getUserByEmail(String(body.email).toLowerCase());
      if (!user || user.role === "tenant") {
        ok(response, { success: true, channels: [] });
        return;
      }

      const code = createOtpCode();
      const delivery = await deliverPasswordResetCode({ user, code });
      if (!delivery.delivered) {
        serviceUnavailable(response, delivery.errors[0] ?? "Password reset delivery is not configured");
        return;
      }

      db.createPasswordReset({
        userId: user.id,
        codeHash: hashResetCode({ userId: user.id, code }),
        expiresAt: new Date(Date.now() + config.passwordResetTtlMs).toISOString()
      });

      ok(response, {
        success: true,
        channels: delivery.channels
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/password-reset/confirm") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["email", "code", "password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (String(body.password).length < 8) {
        badRequest(response, "Password must be at least 8 characters");
        return;
      }

      const user = db.getUserByEmail(String(body.email).toLowerCase());
      if (!user || user.role === "tenant") {
        unauthorized(response);
        return;
      }

      const reset = db.getActivePasswordReset(user.id);
      if (!reset || reset.attempts >= 5) {
        unauthorized(response);
        return;
      }

      db.incrementPasswordResetAttempts(reset.id);
      if (reset.code_hash !== hashResetCode({ userId: user.id, code: body.code })) {
        unauthorized(response);
        return;
      }

      db.updateUserPassword(user.id, String(body.password));
      db.consumePasswordReset(reset.id);
      ok(response, {
        success: true
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/tenant/request-otp") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["phone"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const phoneKey = normalizePhoneKey(body.phone);
      const user = db.getTenantUserByPhone(phoneKey);
      if (!user) {
        notFound(response);
        return;
      }

      const otpCode = config.tenantOtpCode ?? createOtpCode();
      const delivery = await deliverTenantOtp({
        user,
        phone: phoneKey,
        code: otpCode
      });

      if (!delivery.delivered && !config.allowOtpWithoutDelivery) {
        serviceUnavailable(response, delivery.errors[0] ?? "OTP delivery is not configured");
        return;
      }

      otpStore.set(phoneKey, {
        code: otpCode,
        attempts: 0,
        channels: delivery.channels
      }, config.tenantOtpTtlMs);

      ok(response, {
        success: true,
        channels: delivery.channels
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/tenant/verify-otp") {
      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["phone", "otp"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const phoneKey = normalizePhoneKey(body.phone);
      const user = db.getTenantUserByPhone(phoneKey);
      const entry = otpStore.get(phoneKey);
      if (!user || !entry) {
        unauthorized(response);
        return;
      }

      entry.attempts += 1;
      if (entry.attempts > config.tenantOtpMaxAttempts) {
        otpStore.delete(phoneKey);
        unauthorized(response);
        return;
      }

      if (entry.code !== body.otp) {
        otpStore.set(phoneKey, entry, config.tenantOtpTtlMs);
        unauthorized(response);
        return;
      }

      db.markUserLoggedIn(user.id);
      otpStore.delete(phoneKey);
      const freshUser = db.getUserById(user.id);
      const token = createToken(
        {
          sub: freshUser.id,
          role: freshUser.role
        },
        config.jwtSecret
      );

      ok(response, {
        token,
        user: sanitizeUser(freshUser)
      });
      return;
    }

    if (method === "GET" && pathname === "/api/auth/me") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      ok(response, {
        user: sanitizeUser(user)
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/setup") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return;
      }

      const secret = generateTotpSecret();
      db.setUserTotpPending(user.id, secret);
      ok(response, {
        secret,
        otpauthUrl: createTotpUri({
          issuer: config.totpIssuer,
          accountName: user.email ?? user.full_name,
          secret
        })
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/confirm") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["code"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const freshUser = db.getUserById(user.id);
      if (!freshUser?.totp_pending_secret || !verifyTotp(freshUser.totp_pending_secret, body.code)) {
        unauthorized(response);
        return;
      }

      ok(response, {
        user: sanitizeUser(db.enableUserTotp(user.id))
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/2fa/disable") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (user.role === "tenant") {
        forbidden(response);
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["password"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const freshUser = db.getUserById(user.id);
      if (!freshUser || !verifyPassword(body.password, freshUser.password_hash)) {
        unauthorized(response);
        return;
      }

      if (freshUser.totp_enabled && !verifyTotp(freshUser.totp_secret, body.code)) {
        unauthorized(response);
        return;
      }

      ok(response, {
        user: sanitizeUser(db.disableUserTotp(user.id))
      });
      return;
    }

    if (method === "GET" && pathname === "/api/dashboard/overview") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      ok(response, buildDashboardResponse(user));
      return;
    }

    if (method === "GET" && pathname === "/api/notifications") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      ok(response, {
        items: db.listNotificationsForUser(user.id).map(normalizeNotification)
      });
      return;
    }

    const notificationReadMatch = pathname.match(/^\/api\/notifications\/([a-zA-Z0-9-]+)\/read$/);
    if (notificationReadMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const delivery = db.markNotificationRead({
        userId: user.id,
        deliveryId: notificationReadMatch[1]
      });
      if (!delivery) {
        notFound(response);
        return;
      }

      ok(response, { success: true });
      return;
    }

    const exportMatch = pathname.match(/^\/api\/exports\/([a-zA-Z0-9-]+)$/);
    if (exportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      const scopedTickets = getScopedTickets(user);
      const file = await buildExportFile(exportMatch[1], scoped, scopedTickets);
      if (!file) {
        notFound(response);
        return;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    const unitExportMatch = pathname.match(/^\/api\/units\/([a-zA-Z0-9-]+)\/export$/);
    if (unitExportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      const scopedTickets = getScopedTickets(user);
      const file = await buildUnitExportFile(unitExportMatch[1], scoped, scopedTickets);
      if (!file) {
        notFound(response);
        return;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    const billingInvoiceExportMatch = pathname.match(/^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/export$/);
    if (billingInvoiceExportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const invoice = getScopedBillingInvoice(user, billingInvoiceExportMatch[1]);
      if (!invoice) {
        notFound(response);
        return;
      }

      const file = await buildBillingInvoiceExportFile(invoice);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    const billingInvoiceClosingPackMatch = pathname.match(/^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/closing-pack$/);
    if (billingInvoiceClosingPackMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const invoice = getScopedBillingInvoice(user, billingInvoiceClosingPackMatch[1]);
      if (!invoice) {
        notFound(response);
        return;
      }

      const file = await buildBillingClosingPackFile(invoice);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    if (method === "GET" && pathname === "/api/billing/reconciliation") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      ok(response, buildBillingReconciliation(user));
      return;
    }

    if (method === "GET" && pathname === "/api/billing/reconciliation/export") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const file = await buildBillingReconciliationFile(user);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    if (method === "GET" && pathname === "/api/billing/invoices") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      let items = getScopedBillingInvoices(user);
      const tenantId = url.searchParams.get("tenantId");
      const leaseId = url.searchParams.get("leaseId");
      const status = url.searchParams.get("status");
      if (tenantId) {
        items = items.filter((invoice) => invoice.tenantId === tenantId);
      }
      if (leaseId) {
        items = items.filter((invoice) => invoice.leaseId === leaseId);
      }
      if (status) {
        items = items.filter((invoice) => invoice.status === status);
      }

      ok(response, { items });
      return;
    }

    if (method === "GET" && pathname === "/api/billing/payments") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const invoiceIds = new Set(getScopedBillingInvoices(user).map((invoice) => invoice.id));
      const items = db
        .listBillingPayments()
        .filter((payment) => invoiceIds.has(payment.invoice_id))
        .map(normalizeBillingPayment);
      ok(response, { items });
      return;
    }

    if (method === "GET" && pathname === "/api/meter-readings") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      let items = getScopedMeterReadings(user);
      const tenantId = url.searchParams.get("tenantId");
      const unitId = url.searchParams.get("unitId");
      const period = url.searchParams.get("period");
      if (tenantId) {
        items = items.filter((reading) => reading.tenantId === tenantId);
      }
      if (unitId) {
        items = items.filter((reading) => reading.unitId === unitId);
      }
      if (period) {
        items = items.filter((reading) => reading.period === period);
      }

      ok(response, { items });
      return;
    }

    if (method === "POST" && pathname === "/api/meter-readings") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["unitId", "period", "meterType", "value"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const scoped = buildScopedCollections(user);
      if (!scoped.units.some((unit) => unit.id === body.unitId)) {
        notFound(response);
        return;
      }

      try {
        const item = db.createMeterReading({
          unitId: String(body.unitId),
          tenantId: body.tenantId ? String(body.tenantId) : undefined,
          period: String(body.period),
          meterType: String(body.meterType),
          value: body.value,
          previousValue: body.previousValue,
          tariffRate: body.tariffRate,
          chargeAmount: body.chargeAmount,
          recordedAt: body.recordedAt ? String(body.recordedAt) : undefined
        });
        ok(response, { item: normalizeMeterReading(item) }, 201);
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Meter reading create failed");
      }
      return;
    }

    if (method === "GET" && pathname === "/api/checklist-templates") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }
      if (!["admin", "manager", "worker"].includes(user.role)) {
        forbidden(response);
        return;
      }

      ok(response, {
        items: db.listChecklistTemplates()
      });
      return;
    }

    if (method === "POST" && pathname === "/api/billing/invoices") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["leaseId", "period", "dueDate"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }
      if (!getScopedLease(user, body.leaseId)) {
        notFound(response);
        return;
      }

      try {
        const item = db.createBillingInvoice({
          leaseId: String(body.leaseId),
          period: String(body.period),
          rentAmount: body.rentAmount,
          variableAmount: body.variableAmount,
          totalAmount: body.totalAmount,
          dueDate: String(body.dueDate)
        });
        ok(response, { item: normalizeBillingInvoice(item) }, 201);
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Invoice create failed");
      }
      return;
    }

    const invoicePaymentMatch = pathname.match(/^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/payments$/);
    if (invoicePaymentMatch && method === "POST") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const invoice = getScopedBillingInvoice(user, invoicePaymentMatch[1]);
      if (!invoice) {
        notFound(response);
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["amount"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      try {
        const item = db.createBillingPayment({
          invoiceId: invoice.id,
          amount: body.amount,
          paidAt: body.paidAt ? String(body.paidAt) : undefined,
          method: body.method ? String(body.method) : undefined,
          reference: body.reference ? String(body.reference) : undefined
        });
        ok(response, { item: normalizeBillingPayment(item) }, 201);
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Payment create failed");
      }
      return;
    }

    const importTemplateMatch = pathname.match(/^\/api\/import-templates\/([a-zA-Z0-9-]+)$/);
    if (importTemplateMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const file = await buildImportTemplateFile(importTemplateMatch[1]);
      if (!file) {
        notFound(response);
        return;
      }

      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    const importRunMatch = pathname.match(/^\/api\/imports\/([a-zA-Z0-9-]+)$/);
    if (importRunMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["fileName", "contentBase64"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      const content = Buffer.from(String(body.contentBase64), "base64");
      if (content.length === 0) {
        badRequest(response, "Empty file");
        return;
      }
      if (content.length > 10 * 1024 * 1024) {
        badRequest(response, "File is too large");
        return;
      }

      try {
        if (!Boolean(body.dryRun) && user.role === "manager" && importApprovalThreshold > 0) {
          const preview = await runImport({
            templateId: importRunMatch[1],
            filename: body.fileName,
            buffer: content,
            dryRun: true,
            mode: String(body.mode ?? "create"),
            user
          });
          if (!preview) {
            notFound(response);
            return;
          }

          const readyRows = Number(preview.summary.ready ?? 0);
          if (preview.summary.errors === 0 && readyRows >= importApprovalThreshold) {
            const approval = db.createImportApproval({
              templateId: importRunMatch[1],
              fileName: body.fileName,
              mode: String(body.mode ?? "create"),
              contentBase64: String(body.contentBase64),
              summary: preview.summary,
              rows: preview.rows,
              report: preview.report,
              requestedBy: user.id,
              requestedByName: user.full_name ?? user.fullName ?? null
            });
            ok(response, {
              ...preview,
              requiresApproval: true,
              approval: normalizeImportApproval(approval)
            });
            return;
          }
        }

        const result = await runImport({
          templateId: importRunMatch[1],
          filename: body.fileName,
          buffer: content,
          dryRun: Boolean(body.dryRun),
          mode: String(body.mode ?? "create"),
          user
        });
        if (!result) {
          notFound(response);
          return;
        }
        ok(response, result);
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Import failed");
      }
      return;
    }

    if (method === "GET" && pathname === "/api/import-approvals") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      ok(response, {
        items: db.listImportApprovals().map(normalizeImportApproval)
      });
      return;
    }

    const importApprovalApproveMatch = pathname.match(/^\/api\/import-approvals\/([a-zA-Z0-9-]+)\/approve$/);
    if (importApprovalApproveMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (user.role !== "admin") {
        forbidden(response);
        return;
      }

      const approval = db.getImportApproval(importApprovalApproveMatch[1]);
      if (!approval) {
        notFound(response);
        return;
      }
      if (approval.status !== "pending") {
        conflict(response, "Import approval is already closed");
        return;
      }

      try {
        const content = Buffer.from(String(approval.content_base64 ?? ""), "base64");
        const preview = await runImport({
          templateId: approval.template_id,
          filename: approval.file_name,
          buffer: content,
          dryRun: true,
          mode: approval.mode,
          user
        });
        if (!preview || preview.summary.errors > 0) {
          badRequest(response, "Import approval has validation errors; upload a fresh file");
          return;
        }

        const result = await runImport({
          templateId: approval.template_id,
          filename: approval.file_name,
          buffer: content,
          dryRun: false,
          mode: approval.mode,
          user
        });
        const updated = db.markImportApprovalApproved(approval.id, user.id, result?.batch?.id ?? null);
        ok(response, {
          item: normalizeImportApproval(updated),
          result
        });
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Import approval failed");
      }
      return;
    }

    const importApprovalRejectMatch = pathname.match(/^\/api\/import-approvals\/([a-zA-Z0-9-]+)\/reject$/);
    if (importApprovalRejectMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (user.role !== "admin") {
        forbidden(response);
        return;
      }

      try {
        const approval = db.rejectImportApproval(importApprovalRejectMatch[1], user.id);
        if (!approval) {
          notFound(response);
          return;
        }
        ok(response, { item: normalizeImportApproval(approval) });
      } catch (error) {
        conflict(response, error instanceof Error ? error.message : "Import approval failed");
      }
      return;
    }

    if (method === "GET" && pathname === "/api/import-batches") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      ok(response, {
        items: db.listImportBatches().map(normalizeImportBatch)
      });
      return;
    }

    const importBatchRollbackMatch = pathname.match(/^\/api\/import-batches\/([a-zA-Z0-9-]+)\/rollback$/);
    if (importBatchRollbackMatch && method === "POST") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      try {
        const batch = db.rollbackImportBatch(importBatchRollbackMatch[1], user.id);
        if (!batch) {
          notFound(response);
          return;
        }
        ok(response, { item: normalizeImportBatch(batch) });
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : "Import rollback failed");
      }
      return;
    }

    const importBatchAuditMatch = pathname.match(/^\/api\/import-batches\/([a-zA-Z0-9-]+)\/audit-export$/);
    if (importBatchAuditMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const batch = db.getImportBatch(importBatchAuditMatch[1]);
      if (!batch) {
        notFound(response);
        return;
      }

      const file = await buildImportBatchAuditFile(batch);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(file.content);
      return;
    }

    if (method === "POST" && pathname === "/api/users") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["fullName", "email", "password", "role"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (body.role !== "admin" && !body.propertyId) {
        badRequest(response, "Missing field: propertyId");
        return;
      }

      if (user.role === "manager" && body.role !== "worker") {
        forbidden(response);
        return;
      }

      if (user.role === "manager" && user.property_id && body.propertyId !== user.property_id) {
        forbidden(response);
        return;
      }

      try {
        const createdUser = db.createUser({
          fullName: String(body.fullName),
          email: String(body.email).toLowerCase(),
          phone: body.phone ? String(body.phone) : null,
          password: String(body.password),
          role: String(body.role),
          propertyId: body.role === "admin" ? null : String(body.propertyId)
        });

        created(response, {
          item: sanitizeUser(createdUser)
        });
      } catch (caughtError) {
        conflict(response, caughtError instanceof Error ? caughtError.message : "Create user failed");
      }
      return;
    }

    if (method === "GET" && pathname === "/api/properties") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.properties
      });
      return;
    }

    if (method === "POST" && pathname === "/api/properties") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "name",
        "address",
        "totalArea",
        "rentableArea",
        "warehouseClass"
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (user.role === "manager" && user.property_id) {
        forbidden(response);
        return;
      }

      const createdRecord = db.createProperty(body);
      created(response, {
        item: normalizeProperty(createdRecord)
      });
      return;
    }

    const propertyMatch = pathname.match(/^\/api\/properties\/([a-zA-Z0-9-]+)$/);
    if (propertyMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const propertyId = propertyMatch[1];

      if (method === "PUT") {
        if (!requirePropertyScope(user, response, propertyId)) {
          return;
        }

        const body = await parseJsonBody(request);
        const updatedRecord = db.updateProperty(propertyId, body);
        if (!updatedRecord) {
          notFound(response);
          return;
        }
        ok(response, {
          item: normalizeProperty(updatedRecord)
        });
        return;
      }

      if (method === "DELETE") {
        if (!requirePropertyScope(user, response, propertyId)) {
          return;
        }

        try {
          const result = db.deleteProperty(propertyId);
          if (result.changes === 0) {
            notFound(response);
            return;
          }
          ok(response, {
            success: true
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    if (method === "GET" && pathname === "/api/units") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      const items = db.listUnits({
        propertyId: url.searchParams.get("propertyId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined
      }).map(normalizeUnit);

      ok(response, {
        items: items.filter((item) => scoped.units.some((unit) => unit.id === item.id))
      });
      return;
    }

    if (method === "POST" && pathname === "/api/units") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["propertyId", "number", "floor", "area", "type", "status"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (!requirePropertyScope(user, response, body.propertyId)) {
        return;
      }

      try {
        const createdRecord = db.createUnit(body);
        created(response, {
          item: normalizeUnit(createdRecord)
        });
      } catch (error) {
        conflict(response, error.message);
      }
      return;
    }

    const unitSplitMatch = pathname.match(/^\/api\/units\/([a-zA-Z0-9-]+)\/split$/);
    if (unitSplitMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const unitId = unitSplitMatch[1];
      if (!requireUnitScope(user, response, unitId)) {
        return;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["number", "area"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        try {
          const result = db.splitUnit(unitId, body);
          if (!result) {
            notFound(response);
            return;
          }
          created(response, {
            original: normalizeUnit(result.original),
            item: normalizeUnit(result.created)
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    const unitMatch = pathname.match(/^\/api\/units\/([a-zA-Z0-9-]+)$/);
    if (unitMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const unitId = unitMatch[1];

      if (method === "PUT") {
        try {
          const body = await parseJsonBody(request);
          if (!requireUnitScope(user, response, unitId)) {
            return;
          }
          if (body.propertyId && !requirePropertyScope(user, response, body.propertyId)) {
            return;
          }

          const updatedRecord = db.updateUnit(unitId, body);
          if (!updatedRecord) {
            notFound(response);
            return;
          }
          ok(response, {
            item: normalizeUnit(updatedRecord)
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }

      if (method === "DELETE") {
        if (!requireUnitScope(user, response, unitId)) {
          return;
        }

        try {
          const result = db.deleteUnit(unitId);
          if (result.changes === 0) {
            notFound(response);
            return;
          }
          ok(response, {
            success: true
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    if (method === "GET" && pathname === "/api/tenants") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.tenants
      });
      return;
    }

    if (method === "POST" && pathname === "/api/tenants") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "name",
        "inn",
        "contactName",
        "phone",
        "email",
        "riskLevel"
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      try {
        const createdRecord = db.createTenant(body);
        created(response, {
          item: normalizeTenant(createdRecord)
        });
      } catch (error) {
        conflict(response, error.message);
      }
      return;
    }

    const tenantDetailMatch = pathname.match(/^\/api\/tenants\/([a-zA-Z0-9-]+)\/detail$/);
    if (tenantDetailMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const tenantId = tenantDetailMatch[1];
      const tenant = getTenantForUser(user, tenantId);
      if (!tenant) {
        notFound(response);
        return;
      }

      if (method === "GET") {
        ok(response, buildTenantDetailResponse(user, tenantId));
        return;
      }
    }

    const tenantNotesMatch = pathname.match(/^\/api\/tenants\/([a-zA-Z0-9-]+)\/notes$/);
    if (tenantNotesMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const tenantId = tenantNotesMatch[1];
      const tenant = getTenantForUser(user, tenantId);
      if (!tenant) {
        notFound(response);
        return;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["title", "content"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        try {
          const createdRecord = db.createTenantNote({
            tenantId,
            title: body.title,
            content: body.content,
            authorId: user.id
          });
          created(response, {
            item: normalizeTenantNote(createdRecord)
          });
        } catch (error) {
          badRequest(response, error.message);
        }
        return;
      }
    }

    const tenantNoteAttachmentsMatch = pathname.match(/^\/api\/tenant-notes\/([a-zA-Z0-9-]+)\/attachments$/);
    if (tenantNoteAttachmentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const noteId = tenantNoteAttachmentsMatch[1];
      const note = db.getTenantNote(noteId);
      if (!note || !getTenantForUser(user, note.tenant_id)) {
        notFound(response);
        return;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listTenantNoteAttachments(noteId).map(normalizeTenantNoteAttachment)
        });
        return;
      }

      if (method === "POST") {
        if (!["admin", "manager"].includes(user.role)) {
          forbidden(response);
          return;
        }

        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["fileName", "mimeType", "contentBase64"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        const fileName = sanitizeFilename(body.fileName);
        const extension = path.extname(fileName);
        const storedName = `tenant-note-${crypto.randomUUID()}${extension || ".bin"}`;
        const filePath = documentPathFor(storedName);
        if (!ensureDocumentWithinStorage(filePath)) {
          forbidden(response);
          return;
        }

        const content = Buffer.from(String(body.contentBase64), "base64");
        if (content.length === 0) {
          badRequest(response, "Empty file");
          return;
        }

        if (content.length > 25 * 1024 * 1024) {
          badRequest(response, "File is too large");
          return;
        }

        const mimeType = String(body.mimeType || "application/octet-stream");
        await fileStorage.put({
          key: filePath,
          content,
          contentType: mimeType
        });
        try {
          const createdRecord = db.createTenantNoteAttachment({
            noteId,
            fileName,
            storedName,
            mimeType,
            sizeBytes: content.length,
            uploadedBy: user.id
          });
          created(response, {
            item: normalizeTenantNoteAttachment(createdRecord)
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error.message);
        }
        return;
      }
    }

    const tenantNoteAttachmentFileMatch = pathname.match(
      /^\/api\/tenant-notes\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)$/
    );
    if (tenantNoteAttachmentFileMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const noteId = tenantNoteAttachmentFileMatch[1];
      const attachmentId = tenantNoteAttachmentFileMatch[2];
      const note = db.getTenantNote(noteId);
      if (!note || !getTenantForUser(user, note.tenant_id)) {
        notFound(response);
        return;
      }

      const attachmentRecord = db.getTenantNoteAttachment(attachmentId);
      if (!attachmentRecord || attachmentRecord.note_id !== noteId) {
        notFound(response);
        return;
      }

      const filePath = documentPathFor(attachmentRecord.stored_name);
      if (!ensureDocumentWithinStorage(filePath)) {
        forbidden(response);
        return;
      }

      if (method === "GET") {
        const content = await fileStorage.get({ key: filePath });
        if (!content) {
          notFound(response);
          return;
        }

        const disposition = String(attachmentRecord.mime_type).startsWith("image/") ? "inline" : "attachment";
        response.writeHead(200, {
          "Content-Type": attachmentRecord.mime_type || "application/octet-stream",
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachmentRecord.file_name)}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition"
        });
        response.end(content);
        return;
      }

      if (method === "DELETE") {
        const canDeleteAttachment =
          ["admin", "manager"].includes(user.role) || attachmentRecord.uploaded_by === user.id;
        if (!canDeleteAttachment) {
          forbidden(response);
          return;
        }

        const deleted = db.deleteTenantNoteAttachment(attachmentId);
        if (deleted.result.changes === 0) {
          notFound(response);
          return;
        }
        await fileStorage.delete({ key: filePath });
        ok(response, {
          success: true
        });
        return;
      }
    }

    const tenantMatch = pathname.match(/^\/api\/tenants\/([a-zA-Z0-9-]+)$/);
    if (tenantMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const tenantId = tenantMatch[1];

      if (method === "PUT") {
        if (!requireTenantScope(user, response, tenantId)) {
          return;
        }

        try {
          const body = await parseJsonBody(request);
          const updatedRecord = db.updateTenant(tenantId, body);
          if (!updatedRecord) {
            notFound(response);
            return;
          }
          ok(response, {
            item: normalizeTenant(updatedRecord)
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }

      if (method === "DELETE") {
        if (!requireTenantScope(user, response, tenantId)) {
          return;
        }

        try {
          const result = db.deleteTenant(tenantId);
          if (result.changes === 0) {
            notFound(response);
            return;
          }
          ok(response, {
            success: true
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    if (method === "GET" && pathname === "/api/leases") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scoped = buildScopedCollections(user);
      ok(response, {
        items: scoped.leases
      });
      return;
    }

    if (method === "POST" && pathname === "/api/leases") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "tenantId",
        "unitId",
        "contractNumber",
        "stage",
        "startDate",
        "endDate",
        "ratePerSqm"
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (!requireUnitScope(user, response, body.unitId)) {
        return;
      }

      try {
        const createdRecord = db.createLease(body);
        created(response, {
          item: normalizeLease(createdRecord)
        });
      } catch (error) {
        conflict(response, error.message);
      }
      return;
    }

    const leaseDocumentMatch = pathname.match(/^\/api\/leases\/([a-zA-Z0-9-]+)\/document$/);
    if (leaseDocumentMatch && method === "GET") {
      const leaseId = leaseDocumentMatch[1];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return;
      }
      const lease = access.lease;

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${lease.contractNumber}.html"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition"
      });
      response.end(buildLeaseDocumentHtml(lease));
      return;
    }

    const leaseDocumentsMatch = pathname.match(/^\/api\/leases\/([a-zA-Z0-9-]+)\/documents$/);
    if (leaseDocumentsMatch) {
      const leaseId = leaseDocumentsMatch[1];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listLeaseDocuments(leaseId).map(normalizeLeaseDocument)
        });
        return;
      }

      if (method === "POST") {
        if (!["admin", "manager"].includes(access.user.role)) {
          forbidden(response);
          return;
        }

        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["fileName", "mimeType", "contentBase64"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        const fileName = sanitizeFilename(body.fileName);
        const extension = path.extname(fileName);
        const storedName = `${crypto.randomUUID()}${extension || ".bin"}`;
        const filePath = documentPathFor(storedName);
        if (!ensureDocumentWithinStorage(filePath)) {
          forbidden(response);
          return;
        }

        const content = Buffer.from(String(body.contentBase64), "base64");
        if (content.length === 0) {
          badRequest(response, "Empty file");
          return;
        }

        if (content.length > 25 * 1024 * 1024) {
          badRequest(response, "File is too large");
          return;
        }

        await fileStorage.put({
          key: filePath,
          content,
          contentType: String(body.mimeType || "application/octet-stream")
        });
        try {
          const createdRecord = db.createLeaseDocument({
            leaseId,
            fileName,
            storedName,
            category: ["lease", "appendix", "invoice", "act", "payment", "receipt", "other"].includes(body.category) ? body.category : "other",
            mimeType: String(body.mimeType || "application/octet-stream"),
            sizeBytes: content.length,
            uploadedBy: access.user.id
          });
          created(response, {
            item: normalizeLeaseDocument(createdRecord)
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error.message);
        }
        return;
      }
    }

    const leaseDocumentFileMatch = pathname.match(/^\/api\/leases\/([a-zA-Z0-9-]+)\/documents\/([a-zA-Z0-9-]+)$/);
    if (leaseDocumentFileMatch) {
      const leaseId = leaseDocumentFileMatch[1];
      const documentId = leaseDocumentFileMatch[2];
      const access = requireLeaseDocumentAccess(request, response, leaseId);
      if (!access) {
        return;
      }

      const documentRecord = db.getLeaseDocument(documentId);
      if (!documentRecord || documentRecord.lease_id !== leaseId) {
        notFound(response);
        return;
      }

      const filePath = documentPathFor(documentRecord.stored_name);
      if (!ensureDocumentWithinStorage(filePath)) {
        forbidden(response);
        return;
      }

      if (method === "GET") {
        const content = await fileStorage.get({ key: filePath });
        if (!content) {
          notFound(response);
          return;
        }

        response.writeHead(200, {
          "Content-Type": documentRecord.mime_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(documentRecord.file_name)}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition"
        });
        response.end(content);
        return;
      }

      if (method === "DELETE") {
        if (!["admin", "manager"].includes(access.user.role)) {
          forbidden(response);
          return;
        }

        const deleted = db.deleteLeaseDocument(documentId);
        if (deleted.result.changes === 0) {
          notFound(response);
          return;
        }
        await fileStorage.delete({ key: filePath });
        ok(response, {
          success: true
        });
        return;
      }
    }

    const leaseMatch = pathname.match(/^\/api\/leases\/([a-zA-Z0-9-]+)$/);
    if (leaseMatch) {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return;
      }

      const leaseId = leaseMatch[1];

      if (method === "PUT") {
        try {
          const body = await parseJsonBody(request);
          if (!requireLeaseScope(user, response, leaseId)) {
            return;
          }
          if (body.unitId && !requireUnitScope(user, response, body.unitId)) {
            return;
          }

          const updatedRecord = db.updateLease(leaseId, body);
          if (!updatedRecord) {
            notFound(response);
            return;
          }
          ok(response, {
            item: normalizeLease(updatedRecord)
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }

      if (method === "DELETE") {
        if (!requireLeaseScope(user, response, leaseId)) {
          return;
        }

        try {
          const documents = db.listLeaseDocuments(leaseId);
          const result = db.deleteLease(leaseId);
          if (result.changes === 0) {
            notFound(response);
            return;
          }
          for (const documentRecord of documents) {
            const filePath = documentPathFor(documentRecord.stored_name);
            if (ensureDocumentWithinStorage(filePath)) {
              await fileStorage.delete({ key: filePath });
            }
          }
          ok(response, {
            success: true
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    if (method === "GET" && pathname === "/api/tickets") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const scopedTickets = getScopedTickets(user);
      const status = url.searchParams.get("status");
      ok(response, {
        items: status ? scopedTickets.filter((ticket) => ticket.status === status) : scopedTickets
      });
      return;
    }

    if (method === "POST" && pathname === "/api/tickets") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["unitId", "category", "priority", "title", "description"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return;
      }

      if (!canUseUnit(user, body.unitId)) {
        forbidden(response);
        return;
      }

      if (user.role === "tenant" && !user.tenant_id) {
        forbidden(response);
        return;
      }

      const payload = {
        ...body,
        createdBy: user.id,
        tenantId: user.role === "tenant" ? user.tenant_id : (body.tenantId ?? null),
        assignedTo: user.role === "tenant" ? null : (body.assignedTo ?? null),
        status: user.role === "tenant" ? "new" : (body.status ?? "new"),
        sourceChannel: body.sourceChannel ?? "web"
      };

      try {
        const createdRecord = db.createTicket(payload);
        const ticket = hydrateTicket(createdRecord.id) ?? normalizeTicket(createdRecord);
        await notifyTicketEvent({
          ticket,
          type: "ticket_created",
          title: `${ticket.number} · ${ticket.title}`,
          message: `${ticket.propertyName ?? "Объект"} · ${ticket.unitNumber ?? "—"} · ${ticket.tenantName ?? "Без арендатора"}`,
          tone: priorityWeights[ticket.priority] >= 3 ? "warning" : "info",
          actor: user,
          includeTenant: user.role !== "tenant"
        });
        created(response, {
          item: ticket
        });
      } catch (error) {
        conflict(response, error.message);
      }
      return;
    }

    const ticketCommentsMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)\/comments$/);
    if (ticketCommentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const ticketId = ticketCommentsMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listTicketComments(ticketId).map(normalizeTicketComment)
        });
        return;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["content"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        try {
          const createdRecord = db.createTicketComment({
            ticketId,
            authorId: user.id,
            content: body.content
          });
          const delivery = await deliverTicketCommentToTenant({
            ticket,
            author: user,
            content: String(body.content)
          });
          await notifyTicketEvent({
            ticket,
            type: "ticket_comment_added",
            title: `${ticket.number} · новый комментарий`,
            message: String(body.content).slice(0, 240),
            tone: "info",
            actor: user,
            includeTenant: user.role !== "tenant"
          });
          created(response, {
            item: hydrateTicketComment(ticketId, createdRecord.id) ?? normalizeTicketComment(createdRecord),
            delivery
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    const ticketAttachmentsMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)\/attachments$/);
    if (ticketAttachmentsMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const ticketId = ticketAttachmentsMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      if (method === "GET") {
        ok(response, {
          items: db.listTicketAttachments(ticketId).map(normalizeTicketAttachment)
        });
        return;
      }

      if (method === "POST") {
        const body = await parseJsonBody(request);
        const missing = validateRequired(body, ["fileName", "mimeType", "contentBase64"]);
        if (missing) {
          badRequest(response, `Missing field: ${missing}`);
          return;
        }

        const fileName = sanitizeFilename(body.fileName);
        const extension = path.extname(fileName);
        const storedName = `${crypto.randomUUID()}${extension || ".bin"}`;
        const filePath = ticketAttachmentPathFor(storedName);
        if (!ensureTicketAttachmentWithinStorage(filePath)) {
          forbidden(response);
          return;
        }

        const content = Buffer.from(String(body.contentBase64), "base64");
        if (content.length === 0) {
          badRequest(response, "Empty file");
          return;
        }

        if (content.length > 100 * 1024 * 1024) {
          badRequest(response, "File is too large");
          return;
        }

        const mimeType = String(body.mimeType || "application/octet-stream");
        await fileStorage.put({
          key: filePath,
          content,
          contentType: mimeType
        });
        try {
          const createdRecord = db.createTicketAttachment({
            ticketId,
            fileName,
            storedName,
            mimeType,
            mediaType: inferMediaType(mimeType),
            sizeBytes: content.length,
            note: body.note ?? "",
            uploadedBy: user.id
          });
          created(response, {
            item: normalizeTicketAttachment(createdRecord)
          });
        } catch (error) {
          await fileStorage.delete({ key: filePath });
          conflict(response, error.message);
        }
        return;
      }
    }

    const ticketAttachmentFileMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)$/
    );
    if (ticketAttachmentFileMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const ticketId = ticketAttachmentFileMatch[1];
      const attachmentId = ticketAttachmentFileMatch[2];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      const attachmentRecord = db.getTicketAttachment(attachmentId);
      if (!attachmentRecord || attachmentRecord.ticket_id !== ticketId) {
        notFound(response);
        return;
      }

      const filePath = ticketAttachmentPathFor(attachmentRecord.stored_name);
      if (!ensureTicketAttachmentWithinStorage(filePath)) {
        forbidden(response);
        return;
      }

      if (method === "GET") {
        const content = await fileStorage.get({ key: filePath });
        if (!content) {
          notFound(response);
          return;
        }

        const disposition = ["image", "video"].includes(attachmentRecord.media_type) ? "inline" : "attachment";
        response.writeHead(200, {
          "Content-Type": attachmentRecord.mime_type || "application/octet-stream",
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachmentRecord.file_name)}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition"
        });
        response.end(content);
        return;
      }

      if (method === "DELETE") {
        const canDeleteAttachment =
          ["admin", "manager"].includes(user.role) || attachmentRecord.uploaded_by === user.id;
        if (!canDeleteAttachment) {
          forbidden(response);
          return;
        }

        const deleted = db.deleteTicketAttachment(attachmentId);
        if (deleted.result.changes === 0) {
          notFound(response);
          return;
        }
        await fileStorage.delete({ key: filePath });
        ok(response, {
          success: true
        });
        return;
      }
    }

    const ticketHistoryMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)\/history$/);
    if (ticketHistoryMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const ticketId = ticketHistoryMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      ok(response, {
        items: db.listTicketHistory(ticketId).map(normalizeTicketHistory)
      });
      return;
    }

    const ticketChecklistMatch = pathname.match(
      /^\/api\/tickets\/([a-zA-Z0-9-]+)\/checklist\/([a-zA-Z0-9-]+)$/
    );
    if (ticketChecklistMatch && method === "PUT") {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      if (!["admin", "manager", "worker"].includes(user.role)) {
        forbidden(response);
        return;
      }

      const ticketId = ticketChecklistMatch[1];
      const itemId = ticketChecklistMatch[2];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      const body = await parseJsonBody(request);
      const updatedItem = db.updateTicketChecklistItem(ticketId, itemId, {
        completed: body.completed,
        completedBy: user.id
      });
      if (!updatedItem) {
        notFound(response);
        return;
      }

      ok(response, {
        item: updatedItem,
        ticket: hydrateTicket(ticketId)
      });
      return;
    }

    const ticketMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9-]+)$/);
    if (ticketMatch) {
      const user = requireAuth(request, response);
      if (!user) {
        return;
      }

      const ticketId = ticketMatch[1];
      const ticket = getTicketForUser(user, ticketId);
      if (!ticket) {
        notFound(response);
        return;
      }

      if (method === "GET") {
        ok(response, {
          item: ticket
        });
        return;
      }

      if (method === "PUT") {
        const body = await parseJsonBody(request);
        if (user.role === "tenant") {
          if (
            body.status !== "rejected" ||
            ticket.tenantId !== user.tenant_id ||
            !["new", "accepted", "waiting_tenant"].includes(ticket.status)
          ) {
            forbidden(response);
            return;
          }
        }
        if (user.role === "worker" && body.status && !["in_progress", "completed"].includes(String(body.status))) {
          forbidden(response);
          return;
        }
        const nextPayload =
          user.role === "tenant"
            ? {
                status: "rejected"
              }
            : user.role === "worker"
            ? {
                status: body.status
              }
            : body;

        if (nextPayload.unitId && !canUseUnit(user, nextPayload.unitId)) {
          forbidden(response);
          return;
        }

        if (
          nextPayload.status &&
          !isOpenTicket(ticket.status) &&
          isOpenTicket(nextPayload.status) &&
          !String(body.reopenReason ?? "").trim()
        ) {
          badRequest(response, "Reopen reason is required");
          return;
        }

        try {
          const updatedRecord = db.updateTicket(ticketId, {
            ...nextPayload,
            reopenReason: body.reopenReason,
            updatedBy: user.id
          });
          if (!updatedRecord) {
            notFound(response);
            return;
          }
          const updatedTicket = hydrateTicket(ticketId) ?? normalizeTicket(updatedRecord);
          await notifyTicketEvent({
            ticket: updatedTicket,
            type: "ticket_updated",
            title: `${updatedTicket.number} · ${updatedTicket.title}`,
            message: `Статус: ${translateStatus(updatedTicket.status)}. Ответственный: ${updatedTicket.assignedToName ?? "не назначен"}`,
            tone: ["resolved", "closed"].includes(updatedTicket.status) ? "success" : "info",
            actor: user
          });
          ok(response, {
            item: updatedTicket
          });
        } catch (error) {
          conflict(response, error.message);
        }
        return;
      }
    }

    notFound(response);
  } catch (error) {
    console.error("warehouse-api error", error);
    json(response, 500, {
      error: "Internal server error",
      message: error.message
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`warehouse-api listening on http://${config.host}:${config.port}`);
});
