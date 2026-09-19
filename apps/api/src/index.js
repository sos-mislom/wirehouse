import fs from "node:fs";
import http from "node:http";
import { createAgendaRoutes } from "./routes/agenda.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createBillingRoutes } from "./routes/billing.js";
import { createDashboardRoutes } from "./routes/dashboard.js";
import { createExportsRoutes } from "./routes/exports.js";
import { createImportsRoutes } from "./routes/imports.js";
import { createLeasesRoutes } from "./routes/leases.js";
import { createOperationsRoutes } from "./routes/operations.js";
import { createPropertiesRoutes } from "./routes/properties.js";
import { createSystemRoutes } from "./routes/system.js";
import { createTenantsRoutes } from "./routes/tenants.js";
import { createTicketsRoutes } from "./routes/tickets.js";
import { createUnitsRoutes } from "./routes/units.js";
import { createUsersRoutes } from "./routes/users.js";
import { createAccessService } from "./services/access.js";
import { createBotsService } from "./services/bots.js";
import { createDeliveryService } from "./services/delivery.js";
import { createDocumentsService } from "./services/documents.js";
import { createDomainUtilsService } from "./services/domain-utils.js";
import { createExportsService } from "./services/exports.js";
import { createImportsService } from "./services/imports.js";
import { createNormalizersService } from "./services/normalizers.js";
import { createNotificationsService } from "./services/notifications.js";
import { createQueriesService } from "./services/queries.js";
import { createSpreadsheetService } from "./services/spreadsheet.js";
import { createStorageUtilsService } from "./services/storage-utils.js";

import { runMaintenance } from "./operations.js";

import { config } from "./config.js";
import { WarehouseDatabase } from "./database.js";
import { createFileStorage } from "./file-storage.js";
import { TtlStore } from "./infrastructure/ttl-store.js";

const db = new WarehouseDatabase(config.dbPath);
const importApprovalThreshold = Number.parseInt(
  process.env.IMPORT_APPROVAL_THRESHOLD ?? "25",
  10,
);
const fileStorage = createFileStorage(config);
if (fileStorage.driver === "local") {
  fs.mkdirSync(config.documentStoragePath, { recursive: true });
  fs.mkdirSync(config.ticketAttachmentStoragePath, { recursive: true });
}

const otpStore = new TtlStore(
  "warehouse:otp",
  config.redisUrl,
  config.redisCliBin,
);
const mfaChallengeStore = new TtlStore(
  "warehouse:mfa",
  config.redisUrl,
  config.redisCliBin,
);
const chatContextStore = new TtlStore(
  "warehouse:chat-context",
  config.redisUrl,
  config.redisCliBin,
);
const chatContextTtlMs = 30 * 24 * 60 * 60 * 1000;

const {
  validateRequired,
  activeLeaseStages,
  sumBy,
  priorityWeights,
  notificationToneWeights,
  statusLabels,
  translateStatus,
  roleWeights,
  collectionWeights,
  startOfMonth,
  addMonths,
  toIsoDay,
  createOtpCode,
  normalizePhoneKey,
  normalizeWhatsAppPhone,
  getMappedValue,
  formatMonthLabel,
  roundMetric,
  money,
  daysUntilIso,
  compareByDateDesc,
  compareNotifications,
} = createDomainUtilsService({});
const {
  coerceBoolean,
  normalizeProperty,
  normalizeUnit,
  normalizeTenant,
  normalizeTenantNote,
  normalizeTenantNoteAttachment,
  normalizeLease,
  normalizeTicket,
  normalizeTicketComment,
  normalizeTicketHistory,
  normalizeLeaseDocument,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeImportBatch,
  normalizeImportApproval,
  normalizeMeterReading,
  normalizeTicketAttachment,
  sanitizeUser,
  normalizeNotification,
} = createNormalizersService({});
const {
  buildLeaseRevenueRows,
  buildFinanceSummary,
  buildNotifications,
  totalsSafe,
  buildTeamSummary,
  buildExportQueue,
  getScopedLease,
  getScopedBillingInvoices,
  getScopedBillingInvoice,
  buildBillingReconciliation,
  getScopedMeterReadings,
  buildScopedCollections,
  buildDashboardResponse,
  getScopedTickets,
  getTicketForUser,
  getTenantForUser,
  canUseUnit,
  hydrateTicket,
  hydrateTicketComment,
  buildTenantMeters,
  buildTenantLedgerPayments,
  buildTenantLedgerMeters,
  buildTenantNotes,
  buildTenantRisks,
  buildTenantDetailResponse,
} = createQueriesService({
  activeLeaseStages,
  db,
  sumBy,
  roundMetric,
  addMonths,
  startOfMonth,
  formatMonthLabel,
  money,
  priorityWeights,
  daysUntilIso,
  compareNotifications,
  roleWeights,
  compareByDateDesc,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeMeterReading,
  normalizeProperty,
  normalizeUnit,
  normalizeLease,
  normalizeTenant,
  normalizeNotification,
  normalizeTicket,
  normalizeTicketComment,
  translateStatus,
  notificationToneWeights,
  normalizeTenantNote,
});
const {
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
} = createAccessService({
  db,
  fileStorage,
  buildScopedCollections,
  getScopedLease,
});
const {
  timeoutSignal,
  fetchJson,
  buildOtpMessage,
  buildPasswordResetMessage,
  hashResetCode,
  encodeEmailHeader,
  smtpRead,
  smtpCommand,
  createSmtpSocket,
  sendEmail,
  createMfaChallenge,
  consumeMfaChallenge,
  sendTelegramText,
  answerTelegramCallback,
  sendTelegramOtp,
  sendVkOtp,
  sendVkText,
  downloadUrlBuffer,
  extractTelegramMedia,
  downloadTelegramMedia,
  extractVkMedia,
  isCompletionText,
  sendWhatsAppOtp,
  deliverTenantOtp,
  deliverPasswordResetCode,
} = createDeliveryService({
  mfaChallengeStore,
  normalizeWhatsAppPhone,
  normalizePhoneKey,
  db,
  getMappedValue,
});
const {
  getNotificationRecipientUsers,
  getNotificationEmailForUser,
  dispatchNotification,
  notifyTicketEvent,
} = createNotificationsService({ db, sendEmail });
const {
  excelXmlEscape,
  excelSheetName,
  excelCell,
  excelRow,
  tableRows,
  excelWorksheet,
  buildExcelWorkbook,
  buildXlsxWorkbook,
  excelFile,
  decodeXmlEntities,
  normalizeImportHeader,
  parseSpreadsheetRows,
  parseDelimitedRows,
  parseXlsxRows,
  parseImportRows,
  rowsToObjects,
} = createSpreadsheetService({});
const {
  sanitizeFilename,
  documentPathFor,
  ticketAttachmentPathFor,
  ensureDocumentWithinStorage,
  ensureTicketAttachmentWithinStorage,
  inferMediaType,
} = createStorageUtilsService({ fileStorage });
const {
  buildExportFile,
  buildBillingInvoiceExportFile,
  buildBillingClosingPackFile,
  buildUnitExportFile,
  buildImportTemplateFile,
  buildBillingReconciliationFile,
} = createExportsService({
  activeLeaseStages,
  sumBy,
  roundMetric,
  excelFile,
  excelRow,
  tableRows,
  buildFinanceSummary,
  db,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeMeterReading,
  sanitizeFilename,
  buildBillingReconciliation,
});
const {
  findByIdOrName,
  buildImportReportWorkbook,
  requireImportFields,
  compactImportPayload,
  uniqueImportMatch,
  getImportAction,
  formatImportValue,
  importValuesEqual,
  buildImportChanges,
  runImport,
  buildImportBatchAuditFile,
} = createImportsService({
  normalizeImportHeader,
  excelFile,
  tableRows,
  excelRow,
  rowsToObjects,
  parseImportRows,
  db,
  normalizeProperty,
  normalizeTenant,
  normalizeUnit,
  normalizeLease,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeImportBatch,
});
const {
  tenantOnboardingPayload,
  chatContextKey,
  buildTenantChatContexts,
  getSelectedChatContext,
  setSelectedChatContext,
  telegramContextKeyboard,
  vkContextKeyboard,
  sendChatContextChoice,
  handleChatContextSelection,
  parseTelegramPhone,
  handleTelegramWebhook,
  createCrossChannelTenantMessage,
  resolveBotTicketTarget,
  persistBotTicketAttachment,
  handleBotMediaMessage,
  handleBotWorkerTextCommand,
  buildOutboundTicketMessage,
  deliverTicketCommentToTenant,
  handleVkWebhook,
} = createBotsService({
  db,
  chatContextStore,
  chatContextTtlMs,
  sendTelegramText,
  sendVkText,
  serviceUnavailable,
  forbidden,
  answerTelegramCallback,
  ok,
  extractTelegramMedia,
  normalizePhoneKey,
  sanitizeFilename,
  ticketAttachmentPathFor,
  ensureTicketAttachmentWithinStorage,
  fileStorage,
  inferMediaType,
  downloadTelegramMedia,
  downloadUrlBuffer,
  isCompletionText,
  extractVkMedia,
});
const { escapeHtml, buildLeaseDocumentHtml } = createDocumentsService({});

const routes = [
  createSystemRoutes({
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
  }),
  createAuthRoutes({
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
  }),
  createAgendaRoutes({ requirePortfolioWriteAccess, db, ok }),
  createDashboardRoutes({
    requireAuth,
    ok,
    buildDashboardResponse,
    notFound,
    db,
  }),
  createExportsRoutes({
    requireAuth,
    buildScopedCollections,
    getScopedTickets,
    buildExportFile,
    notFound,
    buildUnitExportFile,
  }),
  createBillingRoutes({
    requireAuth,
    forbidden,
    getScopedBillingInvoice,
    notFound,
    buildBillingInvoiceExportFile,
    buildBillingClosingPackFile,
    ok,
    buildBillingReconciliation,
    buildBillingReconciliationFile,
    getScopedBillingInvoices,
    db,
    normalizeBillingPayment,
    getScopedMeterReadings,
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    buildScopedCollections,
    created,
    normalizeMeterReading,
    getScopedLease,
    normalizeBillingInvoice,
  }),
  createImportsRoutes({
    requireAuth,
    forbidden,
    buildImportTemplateFile,
    notFound,
    validateRequired,
    badRequest,
    importApprovalThreshold,
    runImport,
    db,
    ok,
    normalizeImportApproval,
    conflict,
    normalizeImportBatch,
    buildImportBatchAuditFile,
  }),
  createOperationsRoutes({ requireAuth, ok, db, created, notFound, json }),
  createUsersRoutes({
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    forbidden,
    db,
    created,
    sanitizeUser,
    conflict,
  }),
  createPropertiesRoutes({
    requireAuth,
    buildScopedCollections,
    ok,
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    forbidden,
    db,
    created,
    normalizeProperty,
    requirePropertyScope,
    notFound,
    conflict,
  }),
  createUnitsRoutes({
    requireAuth,
    buildScopedCollections,
    db,
    normalizeUnit,
    ok,
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    requirePropertyScope,
    created,
    conflict,
    requireUnitScope,
    notFound,
  }),
  createTenantsRoutes({
    requireAuth,
    buildScopedCollections,
    ok,
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    db,
    created,
    normalizeTenant,
    conflict,
    getTenantForUser,
    notFound,
    buildTenantDetailResponse,
    normalizeTenantNote,
    normalizeTenantNoteAttachment,
    forbidden,
    sanitizeFilename,
    documentPathFor,
    ensureDocumentWithinStorage,
    fileStorage,
    requireTenantScope,
  }),
  createLeasesRoutes({
    requireAuth,
    buildScopedCollections,
    ok,
    requirePortfolioWriteAccess,
    validateRequired,
    badRequest,
    requireUnitScope,
    db,
    created,
    normalizeLease,
    conflict,
    requireLeaseDocumentAccess,
    buildLeaseDocumentHtml,
    normalizeLeaseDocument,
    forbidden,
    sanitizeFilename,
    documentPathFor,
    ensureDocumentWithinStorage,
    fileStorage,
    notFound,
    requireLeaseScope,
  }),
  createTicketsRoutes({
    requireAuth,
    getScopedTickets,
    ok,
    validateRequired,
    badRequest,
    canUseUnit,
    forbidden,
    db,
    hydrateTicket,
    normalizeTicket,
    notifyTicketEvent,
    priorityWeights,
    created,
    conflict,
    getTicketForUser,
    notFound,
    normalizeTicketComment,
    deliverTicketCommentToTenant,
    hydrateTicketComment,
    normalizeTicketAttachment,
    sanitizeFilename,
    ticketAttachmentPathFor,
    ensureTicketAttachmentWithinStorage,
    fileStorage,
    inferMediaType,
    normalizeTicketHistory,
    translateStatus,
  }),
];

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const pathname = url.pathname;
    const method = request.method ?? "GET";

    if (method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      });
      response.end();
      return;
    }

    for (const route of routes) {
      if (await route(request, response, url)) return;
    }

    notFound(response);
  } catch (error) {
    console.error("warehouse-api error", error);
    json(response, error.status ?? (error instanceof SyntaxError ? 400 : 500), {
      error:
        error.status || error instanceof SyntaxError
          ? error.message
          : "Внутренняя ошибка сервера",
      code: error.code ?? (error.status ? "REQUEST_ERROR" : "INTERNAL_ERROR"),
      ...(error.fields ? { fields: error.fields } : {}),
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `warehouse-api listening on http://${config.host}:${config.port}`,
  );
});

const maintenanceTimer = setInterval(() => {
  if (
    db.data.maintenance_plans.some(
      (p) => p.active && p.nextDate <= new Date().toISOString().slice(0, 10),
    )
  ) {
    try {
      runMaintenance(db);
    } catch (error) {
      console.error("Maintenance generation failed", error.message);
    }
  }
}, 60_000);
maintenanceTimer.unref();
if (
  db.data.maintenance_plans.some(
    (p) => p.active && p.nextDate <= new Date().toISOString().slice(0, 10),
  )
)
  runMaintenance(db);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(maintenanceTimer);
    server.close(() => process.exit(0));
  });
