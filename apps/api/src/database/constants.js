import crypto from "node:crypto";
export {
  isOpenTicket,
  leaseOverlaps,
  requireDate,
  requireNumber,
} from "../../../../packages/contracts/src/domain.js";
export { hashPassword } from "../auth.js";

export const nowIso = () => new Date().toISOString();
export const createId = () => crypto.randomUUID();
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const normalizePhoneKey = (value) => {
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
export const activeLeaseStages = new Set(["signed", "active", "prolongation"]);
export const warehouseClasses = new Set(["A+", "A", "B+", "B", "C", "D"]);
export const unitTypes = new Set(["warm", "cold", "freezer", "open", "office"]);
export const unitStatuses = new Set(["vacant", "occupied", "maintenance"]);
export const riskLevels = new Set(["low", "medium", "high"]);
export const leaseStages = new Set([
  "draft",
  "formed",
  "sent",
  "signed",
  "active",
  "prolongation",
  "terminated",
]);
export const ticketCategories = new Set([
  "gates_ramps",
  "electrical",
  "plumbing",
  "heating",
  "security",
  "territory",
  "loading_equipment",
  "ventilation",
  "maintenance",
  "billing",
  "access",
  "damage",
  "cleaning",
  "other",
]);
export const ticketPriorities = new Set(["low", "medium", "high", "urgent"]);
export const ticketStatuses = new Set([
  "new",
  "accepted",
  "in_progress",
  "completed",
  "closed",
  "rejected",
  "waiting_tenant",
  "deferred",
  "resolved",
]);
export const userRoles = new Set(["admin", "manager", "worker", "tenant"]);
export const billingStatuses = new Set([
  "paid",
  "partial",
  "late",
  "overdue",
  "upcoming",
]);
export const meterTypes = new Set([
  "power",
  "electricity",
  "cold_chain",
  "heating",
  "water",
]);
export const meterTariffs = {
  power: 7.2,
  electricity: 7.2,
  cold_chain: 14.5,
  heating: 2100,
  water: 95,
};

export const createChangeResult = (changes) => ({
  lastInsertRowid: 0,
  changes,
});

export const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const createEmptyData = () => ({
  properties: [],
  units: [],
  tenants: [],
  leases: [],
  users: [],
  tickets: [],
  ticket_history: [],
  ticket_comments: [],
  ticket_attachments: [],
  tenant_notes: [],
  tenant_note_attachments: [],
  lease_documents: [],
  lease_followups: [],
  billing_invoices: [],
  billing_payments: [],
  meter_readings: [],
  notification_events: [],
  notification_deliveries: [],
  otp_bindings: [],
  bot_link_codes: [],
  password_resets: [],
  import_batches: [],
  notification_reads: [],
  audit_log: [],
  floor_plans: [],
  equipment: [],
  service_catalog: [],
  maintenance_plans: [],
  meters: [],
  resource_readings: [],
  announcements: [],
  operating_expenses: [],
  import_approvals: [],
  auth_challenges: [],
});

export const assertEnum = (value, allowedValues, field) => {
  if (!allowedValues.has(value)) {
    throw new Error(`Invalid ${field}`);
  }
};

export const compareCreatedAtDesc = (left, right) =>
  String(right.created_at).localeCompare(String(left.created_at));

export const compareUnits = (left, right) => {
  const propertyNameOrder = String(left.property_name ?? "").localeCompare(
    String(right.property_name ?? ""),
  );
  if (propertyNameOrder !== 0) {
    return propertyNameOrder;
  }

  return String(left.number).localeCompare(String(right.number));
};

export const compareLeases = (left, right) =>
  String(right.created_at).localeCompare(String(left.created_at));
export const compareTickets = (left, right) =>
  String(right.created_at).localeCompare(String(left.created_at));
export const compareComments = (left, right) =>
  String(left.created_at).localeCompare(String(right.created_at));

export const ticketSlaHoursByPriority = {
  urgent: 4,
  high: 12,
  medium: 48,
  low: 96,
};

export const checklistTemplatesByCategory = {
  gates_ramps: [
    "Проверить механизм подъема",
    "Смазать направляющие",
    "Проверить датчики безопасности",
    "Тестовый подъем/опускание",
    "Фото результата",
  ],
  electrical: [
    "Обесточить участок",
    "Проверить щит/автомат",
    "Устранить неисправность",
    "Проверить нагрузку",
    "Фото результата",
  ],
  plumbing: [
    "Локализовать течь/засор",
    "Перекрыть участок при необходимости",
    "Выполнить ремонт",
    "Проверить давление/слив",
    "Фото результата",
  ],
  heating: [
    "Снять показания температуры",
    "Проверить узел отопления/холода",
    "Настроить режим",
    "Повторный замер",
    "Фото/акт результата",
  ],
  security: [
    "Проверить устройство доступа",
    "Проверить журнал событий",
    "Восстановить доступ/камеру",
    "Тест с арендатором",
  ],
  territory: [
    "Осмотреть участок",
    "Оградить опасную зону",
    "Назначить подрядчика/работу",
    "Проверить результат",
  ],
  loading_equipment: [
    "Остановить оборудование",
    "Диагностика узла",
    "Ремонт/замена",
    "Тест под нагрузкой",
    "Фото результата",
  ],
  ventilation: [
    "Проверить вентиляционный узел",
    "Замерить воздухообмен/шум",
    "Очистить/настроить",
    "Повторная проверка",
  ],
  maintenance: [
    "Осмотр места",
    "Фото до работ",
    "Назначить исполнителя",
    "Выполнить работы",
    "Фото после работ",
  ],
  billing: [
    "Проверить начисление",
    "Сверить договор",
    "Согласовать с арендатором",
    "Закрыть обращение",
  ],
  access: [
    "Проверить права доступа",
    "Выдать пропуск/ключ",
    "Подтвердить доступ с арендатором",
  ],
  damage: [
    "Зафиксировать повреждение",
    "Фото до работ",
    "Оценить риск",
    "Назначить ремонт",
    "Фото после работ",
  ],
  cleaning: [
    "Осмотр зоны",
    "Назначить подрядчика",
    "Проверить качество уборки",
  ],
  other: [
    "Уточнить детали",
    "Назначить ответственного",
    "Подтвердить результат",
  ],
};

export const addHours = (date, hours) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
export const toIsoDay = (date) => date.toISOString().slice(0, 10);
export const startOfMonth = () => {
  const current = new Date();
  return new Date(current.getFullYear(), current.getMonth(), 1);
};
export const addMonths = (date, offset) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);
export const formatPeriod = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const buildChecklistItems = (category) =>
  (
    checklistTemplatesByCategory[category] ?? checklistTemplatesByCategory.other
  ).map((label) => ({
    id: createId(),
    label,
    required: true,
    completed: false,
    completed_at: null,
    completed_by: null,
    completed_by_name: null,
  }));

