import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../..");
const defaultDbPath = path.resolve(__dirname, "../data/warehouse-data.json");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
};

[
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(__dirname, "../../../.env")
].forEach(loadEnvFile);

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toJsonObject = (value) => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const resolveWorkspacePath = (value, fallback) => {
  const candidate = String(value ?? fallback ?? "").trim();

  if (!candidate) {
    return "";
  }

  return path.isAbsolute(candidate) ? candidate : path.resolve(workspaceRoot, candidate);
};

const resolvedDbPath = resolveWorkspacePath(process.env.WAREHOUSE_DB_PATH, defaultDbPath);
const resolvedDocumentsPath = resolveWorkspacePath(
  process.env.WAREHOUSE_DOCUMENTS_PATH,
  path.resolve(path.dirname(resolvedDbPath), "documents")
);
const resolvedTicketAttachmentsPath = resolveWorkspacePath(
  process.env.WAREHOUSE_TICKET_ATTACHMENTS_PATH,
  path.resolve(path.dirname(resolvedDbPath), "ticket-attachments")
);

export const config = {
  host: process.env.API_HOST ?? "0.0.0.0",
  port: toNumber(process.env.API_PORT, 3001),
  dbPath: resolvedDbPath,
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  redisCliBin: process.env.REDIS_CLI_BIN ?? "redis-cli",
  psqlBin: process.env.PSQL_BIN ?? "psql",
  documentStoragePath: resolvedDocumentsPath,
  ticketAttachmentStoragePath: resolvedTicketAttachmentsPath,
  fileStorageDriver: process.env.FILE_STORAGE_DRIVER ?? "local",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "ru-central1",
  s3Bucket: process.env.S3_BUCKET ?? "warehouse-platform",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  jwtSecret: process.env.JWT_ACCESS_SECRET ?? "skladkontur-demo-secret",
  tenantOtpCode: process.env.TENANT_OTP_CODE ?? process.env.DEMO_TENANT_OTP ?? null,
  tenantOtpTtlMs: toNumber(process.env.TENANT_OTP_TTL_MS, 5 * 60 * 1000),
  tenantOtpMaxAttempts: toNumber(process.env.TENANT_OTP_MAX_ATTEMPTS, 5),
  passwordResetTtlMs: toNumber(process.env.PASSWORD_RESET_TTL_MS, 10 * 60 * 1000),
  mfaChallengeTtlMs: toNumber(process.env.MFA_CHALLENGE_TTL_MS, 5 * 60 * 1000),
  totpIssuer: process.env.TOTP_ISSUER ?? "склад контур",
  otpDeliveryChannels: toList(process.env.OTP_DELIVERY_CHANNELS ?? "telegram,vk,whatsapp"),
  allowOtpWithoutDelivery: process.env.ALLOW_OTP_WITHOUT_DELIVERY === "true",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT ?? "",
  telegramOtpChatIds: toJsonObject(process.env.TELEGRAM_OTP_CHAT_IDS_JSON),
  telegramBotUrl: process.env.TENANT_TELEGRAM_BOT_URL ?? "https://t.me/warehousecontourbot",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  vkGroupToken: process.env.VK_GROUP_TOKEN ?? process.env.VK_BOT ?? "",
  vkApiVersion: process.env.VK_API_VERSION ?? "5.199",
  vkOtpUserIds: toJsonObject(process.env.VK_OTP_USER_IDS_JSON),
  vkBotUrl: process.env.TENANT_VK_BOT_URL ?? "https://vk.com/club239116063",
  vkConfirmationCode: process.env.VK_CONFIRMATION_CODE ?? "",
  vkWebhookSecret: process.env.VK_WEBHOOK_SECRET ?? "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappBotUrl: process.env.TENANT_WHATSAPP_BOT_URL ?? "",
  whatsappOtpTemplateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "",
  whatsappOtpTemplateLanguage: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? "ru",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: toNumber(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "sklad kontur <noreply@skladkontur.ru>",
  notificationChannels: toList(process.env.NOTIFICATION_CHANNELS ?? "in_app,email")
};
