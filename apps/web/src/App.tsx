import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";

import {
  brand,
  copy,
  leaseStageOptions,
  type Locale,
  riskLevelOptions,
  ticketCategoryOptions,
  ticketPriorityOptions,
  ticketStatusOptions,
  unitStatusOptions,
  unitTypeOptions
} from "./projectData";

type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: "admin" | "manager" | "worker" | "tenant";
  propertyId: string | null;
  tenantId: string | null;
  lastLoginAt: string | null;
  totpEnabled: boolean;
};

type Property = {
  id: string;
  name: string;
  address: string;
  totalArea: number;
  rentableArea: number;
  warehouseClass: string;
  description: string;
};

type Unit = {
  id: string;
  propertyId: string;
  number: string;
  floor: number;
  area: number;
  type: string;
  status: string;
  ceilingHeight: number;
  temperatureRegime: string;
  description: string;
  hasRamp: boolean;
  hasGate: boolean;
  propertyName: string | null;
  tenantName: string | null;
  leaseStage: string | null;
  leaseEndDate: string | null;
};

type Tenant = {
  id: string;
  name: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  riskLevel: string;
  status: string;
  leaseCount: number;
};

type Lease = {
  id: string;
  tenantId: string;
  unitId: string;
  contractNumber: string;
  stage: string;
  startDate: string;
  endDate: string;
  ratePerSqm: number;
  deposit: number;
  indexationPct: number;
  tenantName: string | null;
  unitNumber: string | null;
  propertyName: string | null;
  documentName: string;
};

type LeaseDocument = {
  id: string;
  leaseId: string;
  fileName: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

const documentCategoryOptions = ["lease", "appendix", "invoice", "act", "payment", "receipt", "other"] as const;

type Ticket = {
  id: string;
  number: string;
  unitId: string;
  propertyId: string;
  tenantId: string | null;
  createdBy: string;
  assignedTo: string | null;
  category: string;
  priority: string;
  status: string;
  sourceChannel: string;
  title: string;
  description: string;
  slaHours: number;
  slaDueAt: string | null;
  checklistItems: TicketChecklistItem[];
  propertyName: string | null;
  unitNumber: string | null;
  tenantName: string | null;
  createdByName: string | null;
  assignedToName: string | null;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

type TicketChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
};

type ChecklistTemplate = {
  category: string;
  items: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
};

type TicketComment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string | null;
  authorRole: string | null;
  sourceChannel: string;
  content: string;
  createdAt: string;
};

type TicketAttachment = {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video" | "file";
  sizeBytes: number;
  note: string;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

type FinancePoint = {
  id: string;
  label: string;
  billed: number;
  collected: number;
  forecast: number;
};

type FinanceSummary = {
  collectionRate: number;
  arrearsAmount: number;
  opexRatio: number;
  noi: number;
  forecastQuarter: number;
  series: FinancePoint[];
};

type NotificationItem = {
  id: string;
  tone: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  createdAt: string;
  propertyName: string | null;
  entityType: string;
  entityId: string | null;
  unread: boolean;
};

type TeamMember = {
  id: string;
  fullName: string;
  role: "admin" | "manager" | "worker" | "tenant";
  propertyId: string | null;
  propertyName: string | null;
  email: string | null;
  phone: string | null;
  assignedTicketCount: number;
  urgentTicketCount: number;
  openTicketCount: number;
  shift: string;
  focus: string;
  lastLoginAt: string | null;
  isCurrentUser: boolean;
};

type ExportSnapshot = {
  id: string;
  name: string;
  format: string;
  cadence: string;
  scope: string;
  status: "ready" | "scheduled" | "draft";
  updatedAt: string;
};

type TenantPayment = {
  id: string;
  period: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  status: "paid" | "partial" | "late" | "overdue" | "upcoming";
  method: string;
};

type BillingInvoice = {
  id: string;
  leaseId: string;
  tenantId: string;
  unitId: string;
  period: string;
  rentAmount: number;
  variableAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: "paid" | "partial" | "late" | "overdue" | "upcoming";
  tenantName: string | null;
  contractNumber: string | null;
  propertyName: string | null;
  unitNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

type BillingReconciliation = {
  summary: {
    invoices: number;
    billed: number;
    paid: number;
    outstanding: number;
    overpaid: number;
    matched: number;
    issues: number;
    collectionRate: number;
  };
  rows: Array<{
    invoiceId: string;
    period: string;
    tenantName: string;
    contractNumber: string;
    propertyName: string;
    unitNumber: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    overpaidAmount: number;
    dueDate: string;
    lastPaidAt: string | null;
    invoiceStatus: string;
    reconciliationStatus: "matched" | "partial" | "overdue" | "unpaid" | "overpaid";
    issue: string;
    paymentCount: number;
  }>;
};

type TenantMeter = {
  id: string;
  unitId: string;
  tenantId: string;
  period: string;
  meterType: "power" | "electricity" | "cold_chain" | "heating" | "water";
  name: string;
  unitNumber: string;
  lastValue: number;
  previousValue: number;
  consumption: number;
  tariffRate: number;
  chargeAmount: number;
  deltaPct: number;
  updatedAt: string;
  status: "stable" | "attention";
};

type TenantNote = {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
  content: string;
};

type CommentDelivery = {
  delivered: boolean;
  channels: string[];
  errors: string[];
};

type ImportResult = {
  templateId: string;
  fileName: string;
  summary: {
    total: number;
    ready?: number;
    created: number;
    updated?: number;
    errors: number;
  };
  rows: Array<{
    row: number;
    status: string;
    action?: string;
    changes?: string;
    message: string;
    entityId: string;
  }>;
  report: {
    filename: string;
    contentBase64: string;
  };
  batch?: ImportBatch | null;
  requiresApproval?: boolean;
  approval?: ImportApproval | null;
};

type ImportDraft = {
  templateId: string;
  fileName: string;
  contentBase64: string;
  mode: "create" | "update" | "upsert";
};

type ImportBatch = {
  id: string;
  templateId: string;
  fileName: string;
  mode: "create" | "update" | "upsert";
  status: "applied" | "rolled_back";
  summary: {
    total?: number;
    created?: number;
    updated?: number;
    errors?: number;
  };
  operationCount: number;
  createdByName: string | null;
  createdAt: string;
  rolledBackAt: string | null;
};

type ImportApproval = {
  id: string;
  templateId: string;
  fileName: string;
  mode: "create" | "update" | "upsert";
  status: "pending" | "approved" | "rejected";
  summary: {
    total?: number;
    ready?: number;
    created?: number;
    updated?: number;
    errors?: number;
  };
  rowCount: number;
  requestedByName: string | null;
  createdAt: string;
  decidedAt: string | null;
  batchId: string | null;
};

type SystemReadiness = {
  status: "ready" | "attention";
  generatedAt: string;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    status: string;
    message: string;
  }>;
  database: {
    ok: boolean;
    backend?: string;
    message: string;
  };
  storage: {
    ok: boolean;
    driver?: string;
    message: string;
  };
  redis: {
    ok: boolean;
    message: string;
  };
  secrets: Record<string, boolean>;
};

type TenantRisk = {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  owner: string;
  dueDate: string;
  status: string;
};

type TenantDetail = {
  tenant: Tenant;
  summary: {
    totalArea: number;
    unitCount: number;
    activeLeaseCount: number;
    monthlyRent: number;
    paymentDiscipline: number;
    openTicketCount: number;
    arrearsAmount: number;
    nextExpiry: string | null;
  };
  units: Unit[];
  leases: Lease[];
  tickets: Ticket[];
  payments: TenantPayment[];
  meters: TenantMeter[];
  notes: TenantNote[];
  risks: TenantRisk[];
};

type Overview = {
  totals: {
    property_count: number;
    total_rentable_area: number;
    unit_count: number;
    occupied_area: number;
    vacant_area: number;
    tenant_count: number;
    active_lease_count: number;
  };
  occupancyRate: number;
  expiringLeaseCount: number;
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  finance: FinanceSummary;
  notifications: NotificationItem[];
  team: TeamMember[];
  exports: ExportSnapshot[];
};

type ManagerScreen =
  | "dashboard"
  | "tenants"
  | "tenant-detail"
  | "tenant-add"
  | "objects"
  | "property-add"
  | "object-launch"
  | "units"
  | "unit-detail"
  | "unit-add"
  | "leases"
  | "lease-add"
  | "billing"
  | "tickets"
  | "ticket-detail"
  | "ticket-create"
  | "chat"
  | "notifications"
  | "staff"
  | "staff-add"
  | "import"
  | "profile";

type TenantDetailTab = "info" | "contracts" | "payments" | "meters" | "notes" | "tickets" | "risks";

type ChatThread = {
  tenantId: string;
  tenantName: string;
  propertyName: string | null;
  preview: string;
  lastActivity: string;
  unreadCount: number;
  ticketCount: number;
};

type ChatMessage = {
  id: string;
  ticketId: string;
  ticketNumber: string;
  authorName: string;
  authorRole: string | null;
  sourceChannel: string;
  content: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
};

type TicketHistoryEvent = {
  id: string;
  ticketId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
};

type TenantOnboardingChannel = {
  id: "telegram" | "vk" | "whatsapp";
  label: string;
  url: string;
  enabled: boolean;
  instruction: string;
};

type TenantOnboarding = {
  channels: TenantOnboardingChannel[];
};

const TOKEN_KEY = "warehouse-platform-token";
const runtimeApiBase =
  import.meta.env.VITE_WAREHOUSE_API_BASE_URL ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:3001"
    : "");

const navSections = ["overview", "portfolio", "leases", "service", "chat", "admin"] as const;
type Section = (typeof navSections)[number];
type TicketFilter = "all" | (typeof ticketStatusOptions)[number];
type AdminPanel = "property" | "tenant" | "unit" | "lease";
type PaymentStatus = TenantPayment["status"];

const industrialCopy = {
  ru: {
    overviewTag: "Промышленный контур",
    finance: "Финансы",
    notifications: "Уведомления",
    team: "Команда",
    tenantRegistry: "Арендаторы",
    tenantPassport: "Паспорт арендатора",
    payments: "Платежи",
    meters: "Счётчики",
    notes: "Переговоры",
    risks: "Риски",
    exports: "Импорт / экспорт",
    cashflow: "Прогноз денежного потока",
    collectionRate: "Сбор платежей",
    arrears: "Просрочка",
    noi: "NOI",
    opex: "OPEX vs бюджет",
    forecast: "Прогноз 3 мес.",
    monthlyRent: "Мес. поток",
    paymentDiscipline: "Платёжная дисциплина",
    nextExpiry: "Договор до",
    assigned: "Назначено",
    urgent: "Критично",
    shift: "Смена",
    focus: "Фокус",
    cadence: "Частота",
    scope: "Контур",
    exportStatus: {
      ready: "Готов",
      scheduled: "По расписанию",
      draft: "Черновик"
    },
    paymentStatus: {
      paid: "Оплачен",
      partial: "Частично",
      late: "С задержкой",
      overdue: "Просрочен",
      upcoming: "Ожидается"
    },
    riskSeverity: {
      critical: "Критично",
      warning: "Контроль",
      info: "Норма"
    },
    emptyTenant: "Выберите арендатора из реестра.",
    noNotifications: "Нет активных уведомлений.",
    noTeam: "Команда не найдена.",
    noExports: "Нет доступных выгрузок."
  },
  en: {
    overviewTag: "Industrial contour",
    finance: "Finance",
    notifications: "Notifications",
    team: "Team",
    tenantRegistry: "Tenants",
    tenantPassport: "Tenant passport",
    payments: "Payments",
    meters: "Meters",
    notes: "Negotiations",
    risks: "Risks",
    exports: "Import / export",
    cashflow: "Cash flow forecast",
    collectionRate: "Collection rate",
    arrears: "Arrears",
    noi: "NOI",
    opex: "OPEX vs budget",
    forecast: "3M forecast",
    monthlyRent: "Monthly flow",
    paymentDiscipline: "Payment discipline",
    nextExpiry: "Lease until",
    assigned: "Assigned",
    urgent: "Critical",
    shift: "Shift",
    focus: "Focus",
    cadence: "Cadence",
    scope: "Scope",
    exportStatus: {
      ready: "Ready",
      scheduled: "Scheduled",
      draft: "Draft"
    },
    paymentStatus: {
      paid: "Paid",
      partial: "Partial",
      late: "Late",
      overdue: "Overdue",
      upcoming: "Upcoming"
    },
    riskSeverity: {
      critical: "Critical",
      warning: "Watch",
      info: "Stable"
    },
    emptyTenant: "Select a tenant from the registry.",
    noNotifications: "No active notifications.",
    noTeam: "No team members found.",
    noExports: "No exports available."
  }
} as const;

const managerPrimaryNav = [
  "dashboard",
  "tenants",
  "units",
  "leases",
  "billing",
  "tickets",
  "chat",
  "notifications"
] as const satisfies readonly ManagerScreen[];

const managerSecondaryNav = ["objects", "staff", "import", "profile"] as const satisfies readonly ManagerScreen[];

const managerCopy = {
  ru: {
    shellRole: "Менеджерский контур",
    nav: {
      dashboard: "Дашборд",
      tenants: "Арендаторы",
      units: "Помещения",
      leases: "Договоры",
      billing: "Биллинг",
      payments: "Платежи",
      tickets: "Заявки",
      chat: "Чат",
      notifications: "Уведомления",
      objects: "Объекты",
      objectLaunch: "Запуск объекта",
      staff: "Пользователи",
      import: "Импорт / экспорт",
      profile: "Профиль"
    },
    titles: {
      dashboard: "Дашборд",
      tenants: "Арендаторы",
      tenantDetail: "Карточка арендатора",
      tenantAdd: "Новый арендатор",
      objects: "Мой объект",
      propertyAdd: "Новый объект",
      objectLaunch: "Запуск объекта",
      units: "Помещения",
      unitDetail: "Карточка помещения",
      unitAdd: "Новое помещение",
      leases: "Договоры",
      leaseAdd: "Новый договор",
      billing: "Биллинг",
      tickets: "Заявки",
      ticketDetail: "Карточка заявки",
      ticketCreate: "Новая заявка",
      chat: "Чат с арендаторами",
      notifications: "Уведомления",
      staff: "Пользователи",
      staffAdd: "Новый сотрудник",
      import: "Импорт / экспорт",
      profile: "Профиль"
    },
    subtitles: {
      dashboard: "Операционная сводка по объекту, платежам и сервису.",
      tenants: "Реестр арендаторов с переходом в детальную карточку.",
      tenantDetail: "Договоры, платежи, заметки, риски и заявки в одном месте.",
      tenantAdd: "Добавление арендатора без перехода в отдельную админ-панель.",
      objects: "Карта объекта, фонд и оперативное перевыделение по площадям.",
      propertyAdd: "Создание нового объекта в том же контуре работы менеджера.",
      objectLaunch: "Пошаговый запуск: объект, помещение, арендатор и первый договор.",
      units: "Реестр помещений и их текущее состояние.",
      unitDetail: "Параметры помещения, аренда и сервисная нагрузка.",
      unitAdd: "Создание помещения без ухода в технический раздел.",
      leases: "Сроки, ставки и точки пролонгации по договорам.",
      leaseAdd: "Новый договор с выбором арендатора и помещения.",
      billing: "Счета, частичные оплаты, просрочка и платежные документы.",
      tickets: "Очередь сервисных заявок по объекту.",
      ticketDetail: "Статус, история и комментарии по заявке.",
      ticketCreate: "Создание новой заявки из подтвержденного потока.",
      chat: "Коммуникация с арендаторами на основе связанных заявок.",
      notifications: "События по SLA, договорам и эксплуатации.",
      staff: "Сотрудники и роли по объекту.",
      staffAdd: "Добавление сотрудника с привязкой к объекту.",
      import: "Шаблоны загрузки и готовые выгрузки.",
      profile: "Текущая учетная запись и границы доступа."
    },
    back: "Назад",
    add: "Добавить",
    import: "Импорт",
    open: "Открыть",
    emptyChat: "Для этого арендатора пока нет сообщений. Новое сообщение уйдет в комментарии по его последней заявке.",
    noThreadTarget: "Нет связанной заявки, куда можно отправить сообщение.",
    chatPlaceholder: "Сообщение арендатору",
    chatThreadMeta: "связанные заявки",
    unitMeta: "Текущее состояние",
    templates: "Шаблоны импорта",
    readyExports: "Готовые выгрузки",
    profileScope: "Контур доступа",
    linkedTickets: "Связанные заявки",
    leaseHistory: "История договоров",
    baseInfo: "Основная информация",
    access: "Доступ в систему",
    operations: "Операции",
    createStaff: "Создать сотрудника",
    send: "Отправить",
    phoneOptional: "Телефон",
    passwordTemp: "Временный пароль",
    objectScope: "Привязка к объекту",
    allObjects: "Без привязки",
    security: "Безопасность",
    totpEnabled: "2FA включена",
    totpDisabled: "2FA выключена",
    totpSetup: "Подключить 2FA",
    totpDisable: "Отключить 2FA",
    totpSecret: "Ключ TOTP",
    totpConfirmHint: "Добавьте ключ в Authenticator и введите 6-значный код.",
    totpDisableHint: "Введите пароль и текущий код 2FA.",
    confirm: "Подтвердить"
  },
  en: {
    shellRole: "Manager contour",
    nav: {
      dashboard: "Dashboard",
      tenants: "Tenants",
      units: "Units",
      leases: "Leases",
      billing: "Billing",
      payments: "Payments",
      tickets: "Tickets",
      chat: "Chat",
      notifications: "Notifications",
      objects: "Objects",
      objectLaunch: "Object launch",
      staff: "Users",
      import: "Import / export",
      profile: "Profile"
    },
    titles: {
      dashboard: "Dashboard",
      tenants: "Tenants",
      tenantDetail: "Tenant detail",
      tenantAdd: "New tenant",
      objects: "My property",
      propertyAdd: "New property",
      objectLaunch: "Object launch",
      units: "Units",
      unitDetail: "Unit detail",
      unitAdd: "New unit",
      leases: "Leases",
      leaseAdd: "New lease",
      billing: "Billing",
      tickets: "Tickets",
      ticketDetail: "Ticket detail",
      ticketCreate: "New ticket",
      chat: "Tenant chat",
      notifications: "Notifications",
      staff: "Users",
      staffAdd: "New staff member",
      import: "Import / export",
      profile: "Profile"
    },
    subtitles: {
      dashboard: "Operational summary for the property, payments, and service load.",
      tenants: "Tenant registry with direct access to the detail card.",
      tenantDetail: "Leases, payments, notes, risks, and tickets in one place.",
      tenantAdd: "Add a tenant without switching to a technical admin panel.",
      objects: "Property map, stock, and fast context switching by property.",
      propertyAdd: "Create a new property inside the same manager flow.",
      objectLaunch: "Step-by-step launch: property, unit, tenant, and first lease.",
      units: "Unit registry and current condition.",
      unitDetail: "Unit parameters, lease state, and service load.",
      unitAdd: "Create a unit without leaving the operating contour.",
      leases: "Terms, rates, and renewal points across leases.",
      leaseAdd: "New lease with tenant and unit selection.",
      billing: "Invoices, partial payments, arrears, and payment ledger.",
      tickets: "Service queue for the assigned portfolio.",
      ticketDetail: "Status, history, and comments for the ticket.",
      ticketCreate: "Create a new ticket in the confirmed flow.",
      chat: "Tenant communication backed by related tickets.",
      notifications: "Events across SLA, leases, and operations.",
      staff: "Staff and roles for the property.",
      staffAdd: "Add a staff member and attach them to a property.",
      import: "Upload templates and export queue.",
      profile: "Current account and access boundaries."
    },
    back: "Back",
    add: "Add",
    import: "Import",
    open: "Open",
    emptyChat: "No messages for this tenant yet. A new message will be posted into comments for the latest related ticket.",
    noThreadTarget: "There is no related ticket to send the message to.",
    chatPlaceholder: "Message to tenant",
    chatThreadMeta: "linked tickets",
    unitMeta: "Current condition",
    templates: "Import templates",
    readyExports: "Ready exports",
    profileScope: "Access scope",
    linkedTickets: "Linked tickets",
    leaseHistory: "Lease history",
    baseInfo: "Base information",
    access: "System access",
    operations: "Operations",
    createStaff: "Create staff member",
    send: "Send",
    phoneOptional: "Phone",
    passwordTemp: "Temporary password",
    objectScope: "Property scope",
    allObjects: "No property binding",
    security: "Security",
    totpEnabled: "2FA enabled",
    totpDisabled: "2FA disabled",
    totpSetup: "Enable 2FA",
    totpDisable: "Disable 2FA",
    totpSecret: "TOTP key",
    totpConfirmHint: "Add the key to an Authenticator app and enter the 6-digit code.",
    totpDisableHint: "Enter your password and current 2FA code.",
    confirm: "Confirm"
  }
} as const;

const apiRequest = async <T,>(
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> => {
  const response = await fetch(`${runtimeApiBase}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }

  return payload as T;
};

const formatDate = (value: string | null, locale: Locale) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
};

const daysUntil = (isoDate: string | null) => {
  if (!isoDate) {
    return null;
  }

  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const formatMoney = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);

const formatCompactMoney = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "RUB",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

const formatArea = (value: number, locale: Locale) =>
  `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 0
  }).format(value)} м²`;

const formatDateTime = (value: string | null, locale: Locale) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};
const formatChannel = (value: string, locale: Locale) => {
  if (value === "telegram") {
    return "Telegram";
  }
  if (value === "vk") {
    return "VK";
  }
  if (value === "whatsapp") {
    return "WhatsApp";
  }
  return locale === "ru" ? "Система" : "System";
};

const formatFileSize = (value: number, locale: Locale) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MB`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return window.btoa(chunks.join(""));
};

const formatDeliveryNotice = (baseMessage: string, delivery: CommentDelivery | undefined, locale: Locale) => {
  if (!delivery || delivery.channels.length === 0) {
    return baseMessage;
  }
  const channels = delivery.channels.map((channel) => formatChannel(channel, locale)).join(", ");
  return locale === "ru" ? `${baseMessage}. Отправлено: ${channels}` : `${baseMessage}. Sent to: ${channels}`;
};

const isOpenTicket = (status: string) => !["completed", "resolved", "closed", "rejected"].includes(status);
const priorityWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

const getSlaState = (ticket: Ticket | null, locale: Locale) => {
  if (!ticket?.slaDueAt) {
    return { tone: "info", label: "SLA" };
  }

  if (["resolved", "closed"].includes(ticket.status)) {
    return { tone: "success", label: locale === "ru" ? "SLA закрыт" : "SLA closed" };
  }

  const minutesLeft = Math.round((new Date(ticket.slaDueAt).getTime() - Date.now()) / 60000);
  const hours = Math.max(1, Math.abs(minutesLeft < 0 ? Math.floor(minutesLeft / 60) : Math.ceil(minutesLeft / 60)));
  if (minutesLeft < 0) {
    return { tone: "critical", label: locale === "ru" ? `Просрочено ${hours}ч` : `${hours}h overdue` };
  }
  if (minutesLeft <= 120) {
    return { tone: "warning", label: locale === "ru" ? `Осталось ${hours}ч` : `${hours}h left` };
  }
  return { tone: "info", label: locale === "ru" ? `Осталось ${hours}ч` : `${hours}h left` };
};

const getTicketStatusLabel = (status: string, locale: Locale) => {
  const labels = copy[locale].ticketStatuses as Record<string, string>;
  return labels[status] ?? status;
};

const getImportApprovalStatusLabel = (status: string, locale: Locale) => {
  if (status === "pending") {
    return locale === "ru" ? "ожидает" : "pending";
  }
  if (status === "approved") {
    return locale === "ru" ? "подтверждён" : "approved";
  }
  if (status === "rejected") {
    return locale === "ru" ? "отклонён" : "rejected";
  }
  return status;
};

const App = () => {
  const [locale, setLocale] = useState<Locale>("ru");
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section>("overview");
  const [managerScreen, setManagerScreen] = useState<ManagerScreen>("dashboard");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedChatTicketId, setSelectedChatTicketId] = useState("");
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoice[]>([]);
  const [billingReconciliation, setBillingReconciliation] = useState<BillingReconciliation | null>(null);
  const [selectedBillingInvoiceId, setSelectedBillingInvoiceId] = useState("");
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [tenantDetailTab, setTenantDetailTab] = useState<TenantDetailTab>("info");
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("all");
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryEvent[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantRiskFilter, setTenantRiskFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState("all");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [unitRampFilter, setUnitRampFilter] = useState("all");
  const [leaseStageFilter, setLeaseStageFilter] = useState("all");
  const [leaseTermFilter, setLeaseTermFilter] = useState("all");
  const [ticketStatusDraft, setTicketStatusDraft] = useState<string>("new");
  const [ticketAssigneeDraft, setTicketAssigneeDraft] = useState("");
  const [adminPanel, setAdminPanel] = useState<AdminPanel>("property");
  const [editingAdmin, setEditingAdmin] = useState<Record<AdminPanel, string | null>>({
    property: null,
    tenant: null,
    unit: null,
    lease: null
  });
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authMode, setAuthMode] = useState<"staff" | "tenant">("staff");
  const [tenantOtpRequested, setTenantOtpRequested] = useState(false);
  const [staffAuthStep, setStaffAuthStep] = useState<"password" | "mfa" | "reset-request" | "reset-confirm">("password");
  const [mfaToken, setMfaToken] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [tenantOnboarding, setTenantOnboarding] = useState<TenantOnboarding | null>(null);
  const [tenantDetailBusy, setTenantDetailBusy] = useState(false);
  const [selectedChatTenantId, setSelectedChatTenantId] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const [staffForm, setStaffForm] = useState({
    email: "",
    password: ""
  });
  const [staffMfaForm, setStaffMfaForm] = useState({
    code: ""
  });
  const [resetForm, setResetForm] = useState({
    email: "",
    code: "",
    password: ""
  });
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    code: string;
    password: string;
  } | null>(null);
  const [tenantForm, setTenantForm] = useState({
    phone: "",
    otp: ""
  });
  const [propertyForm, setPropertyForm] = useState({
    name: "",
    address: "",
    totalArea: "",
    rentableArea: "",
    warehouseClass: "A",
    description: ""
  });
  const [tenantCreateForm, setTenantCreateForm] = useState({
    name: "",
    inn: "",
    contactName: "",
    phone: "",
    email: "",
    riskLevel: "medium"
  });
  const [unitForm, setUnitForm] = useState({
    propertyId: "",
    number: "",
    floor: "1",
    area: "",
    type: "warm",
    status: "vacant",
    temperatureRegime: "",
    ceilingHeight: "",
    hasRamp: true,
    hasGate: true
  });
  const [leaseForm, setLeaseForm] = useState({
    tenantId: "",
    unitId: "",
    contractNumber: "",
    stage: "draft",
    startDate: "",
    endDate: "",
    ratePerSqm: "",
    deposit: "0",
    indexationPct: "0"
  });
  const [ticketForm, setTicketForm] = useState({
    unitId: "",
    category: "maintenance",
    priority: "medium",
    title: "",
    description: ""
  });
  const [commentForm, setCommentForm] = useState({
    content: ""
  });
  const [chatDraft, setChatDraft] = useState({
    content: ""
  });
  const [billingPaymentForm, setBillingPaymentForm] = useState({
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    method: "bank_transfer",
    reference: ""
  });
  const [meterReadingForm, setMeterReadingForm] = useState({
    unitId: "",
    period: new Date().toISOString().slice(0, 7),
    meterType: "power",
    value: "",
    previousValue: "",
    tariffRate: ""
  });
  const [paymentProofForm, setPaymentProofForm] = useState({
    leaseId: "",
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    reference: ""
  });
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [documentPanelLease, setDocumentPanelLease] = useState<Lease | null>(null);
  const [leaseDocuments, setLeaseDocuments] = useState<LeaseDocument[]>([]);
  const [documentUploadCategory, setDocumentUploadCategory] = useState<(typeof documentCategoryOptions)[number]>("lease");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
  const [importMode, setImportMode] = useState<"create" | "update" | "upsert">("create");
  const [importApprovals, setImportApprovals] = useState<ImportApproval[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [systemReadiness, setSystemReadiness] = useState<SystemReadiness | null>(null);
  const [staffCreateForm, setStaffCreateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "worker",
    propertyId: ""
  });
  const [launchForm, setLaunchForm] = useState({
    propertyName: "",
    address: "",
    totalArea: "",
    rentableArea: "",
    warehouseClass: "A",
    unitNumber: "",
    floor: "1",
    unitArea: "",
    unitType: "warm",
    temperatureRegime: "",
    ceilingHeight: "",
    tenantName: "",
    inn: "",
    contactName: "",
    phone: "",
    email: "",
    riskLevel: "medium",
    contractNumber: "",
    startDate: "",
    endDate: "",
    ratePerSqm: "",
    deposit: "0"
  });

  const t = copy[locale];
  const ui = industrialCopy[locale];
  const managerUi = managerCopy[locale];
  const productBrand = brand[locale];
  const adminEditLabel = locale === "ru" ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c" : "Edit";
  const adminCancelLabel = locale === "ru" ? "\u041e\u0442\u043c\u0435\u043d\u0430" : "Cancel";
  const adminSaveChangesLabel =
    locale === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f" : "Save changes";
  const unitExportLabel = locale === "ru" ? "\u0412\u044b\u0433\u0440\u0443\u0437\u043a\u0430" : "Export";
  const isWorker = session?.user.role === "worker";
  const isTenant = session?.user.role === "tenant";
  const canManagePortfolio = session ? ["admin", "manager"].includes(session.user.role) : false;
  const canManageDocuments = session ? ["admin", "manager"].includes(session.user.role) : false;
  const isManagerShell = session ? ["admin", "manager"].includes(session.user.role) : false;
  const canUpdateTickets = session ? ["admin", "manager", "worker"].includes(session.user.role) : false;
  const canAssignTickets = session ? ["admin", "manager"].includes(session.user.role) : false;
  const canDeletePortfolioItems = session?.user.role === "admin";
  const visibleSections: Section[] = isWorker
    ? ["service"]
    : isTenant
      ? ["leases", "service", "chat"]
      : canManagePortfolio
        ? [...navSections]
        : navSections.filter((item) => item !== "admin");
  const activeWorkspaceSection = visibleSections.includes(selectedSection) ? selectedSection : (visibleSections[0] ?? "service");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets]
  );
  const selectedBillingInvoice = useMemo(
    () => billingInvoices.find((invoice) => invoice.id === selectedBillingInvoiceId) ?? null,
    [billingInvoices, selectedBillingInvoiceId]
  );
  const selectedBillingLease = useMemo(
    () => (selectedBillingInvoice ? (overview?.leases.find((lease) => lease.id === selectedBillingInvoice.leaseId) ?? null) : null),
    [overview, selectedBillingInvoice]
  );
  const selectedChecklistTemplate = useMemo(
    () => checklistTemplates.find((template) => template.category === ticketForm.category) ?? null,
    [checklistTemplates, ticketForm.category]
  );
  const billingTotals = useMemo(
    () => ({
      billed: billingInvoices.reduce((total, invoice) => total + invoice.totalAmount, 0),
      paid: billingInvoices.reduce((total, invoice) => total + invoice.paidAmount, 0),
      overdue: billingInvoices
        .filter((invoice) => ["overdue", "partial"].includes(invoice.status))
        .reduce((total, invoice) => total + Math.max(0, invoice.totalAmount - invoice.paidAmount), 0)
    }),
    [billingInvoices]
  );
  const pendingPaymentProofTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => {
          const searchable = `${ticket.title} ${ticket.description}`;
          return ticket.category === "billing" && isOpenTicket(ticket.status) && /\u043e\u043f\u043b\u0430\u0442|payment/i.test(searchable);
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [tickets]
  );

  const serviceTickets = useMemo(
    () => tickets.filter((ticket) => !["billing", "lease"].includes(ticket.category)),
    [tickets]
  );

  const filteredTickets = useMemo(
    () => (ticketFilter === "all" ? serviceTickets : serviceTickets.filter((ticket) => ticket.status === ticketFilter)),
    [serviceTickets, ticketFilter]
  );

  const ticketUnits = useMemo(() => overview?.units ?? [], [overview]);

  const twinUnits = useMemo(() => {
    const items = overview?.units ?? [];
    return items.filter((unit) => unit.propertyId === selectedPropertyId);
  }, [overview, selectedPropertyId]);

  const propertySnapshots = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.properties.map((property) => {
      const propertyUnits = overview.units.filter((unit) => unit.propertyId === property.id);
      const occupiedArea = propertyUnits
        .filter((unit) => unit.status === "occupied")
        .reduce((total, unit) => total + unit.area, 0);

      return {
        ...property,
        unitCount: propertyUnits.length,
        occupiedArea,
        occupancy:
          property.rentableArea > 0 ? Number(((occupiedArea / property.rentableArea) * 100).toFixed(1)) : 0
      };
    });
  }, [overview]);

  const leaseWatch = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [...overview.leases]
      .filter((lease) => ["signed", "active", "prolongation"].includes(lease.stage))
      .sort((left, right) => new Date(left.endDate).getTime() - new Date(right.endDate).getTime())
      .slice(0, 8);
  }, [overview]);

  const propertyOperations = useMemo(() => {
    return propertySnapshots
      .map((property) => {
        const propertyTickets = tickets.filter(
          (ticket) => ticket.propertyId === property.id && isOpenTicket(ticket.status)
        );

        return {
          ...property,
          openTicketCount: propertyTickets.length,
          urgentTicketCount: propertyTickets.filter((ticket) => priorityWeight[ticket.priority] >= 3).length
        };
      })
      .sort((left, right) => {
        if (right.openTicketCount !== left.openTicketCount) {
          return right.openTicketCount - left.openTicketCount;
        }

        return right.occupancy - left.occupancy;
      });
  }, [propertySnapshots, tickets]);

  const boardFloors = useMemo(() => {
    const grouped = new Map<number, Unit[]>();

    twinUnits.forEach((unit) => {
      const bucket = grouped.get(unit.floor) ?? [];
      bucket.push(unit);
      grouped.set(unit.floor, bucket);
    });

    return [...grouped.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([floor, units]) => ({
        floor,
        units: [...units].sort((left, right) => left.number.localeCompare(right.number, "ru"))
      }));
  }, [twinUnits]);

  const focusTickets = useMemo(() => {
    return [...serviceTickets]
      .filter((ticket) => isOpenTicket(ticket.status))
      .sort((left, right) => {
        const priorityDelta = (priorityWeight[right.priority] ?? 0) - (priorityWeight[left.priority] ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, 4);
  }, [serviceTickets]);

  const openTicketCount = useMemo(
    () => serviceTickets.filter((ticket) => isOpenTicket(ticket.status)).length,
    [serviceTickets]
  );
  const selectedProperty = useMemo(
    () => overview?.properties.find((item) => item.id === selectedPropertyId) ?? null,
    [overview, selectedPropertyId]
  );
  const selectedTenant = useMemo(
    () => overview?.tenants.find((item) => item.id === selectedTenantId) ?? null,
    [overview, selectedTenantId]
  );
  const selectedUnit = useMemo(
    () => overview?.units.find((item) => item.id === selectedUnitId) ?? null,
    [overview, selectedUnitId]
  );
  const criticalNotifications = useMemo(
    () => (overview?.notifications ?? []).filter((item) => ["critical", "warning"].includes(item.tone)).slice(0, 4),
    [overview]
  );
  const tenantTableRows = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.tenants.map((tenant) => {
      const tenantLeases = overview.leases.filter((lease) => lease.tenantId === tenant.id && lease.stage !== "terminated");
      const tenantUnits = overview.units.filter((unit) => tenantLeases.some((lease) => lease.unitId === unit.id));
      const monthlyRent = tenantLeases.reduce((total, lease) => {
        const unit = overview.units.find((item) => item.id === lease.unitId);
        return total + (unit?.area ?? 0) * lease.ratePerSqm;
      }, 0);
      const nextExpiry =
        [...tenantLeases].sort((left, right) => new Date(left.endDate).getTime() - new Date(right.endDate).getTime())[0]
          ?.endDate ?? null;
      const tenantTickets = tickets.filter((ticket) => ticket.tenantId === tenant.id);
      const paymentDiscipline = tenant.riskLevel === "high" ? 89 : tenant.riskLevel === "medium" ? 94.5 : 98.5;

      return {
        ...tenant,
        propertyIds: [...new Set(tenantUnits.map((unit) => unit.propertyId))],
        unitLabel: tenantUnits.map((unit) => unit.number).join(", ") || "—",
        totalArea: tenantUnits.reduce((total, unit) => total + unit.area, 0),
        monthlyRent,
        nextExpiry,
        paymentDiscipline,
        openTicketCount: tenantTickets.filter((ticket) => isOpenTicket(ticket.status)).length
      };
    });
  }, [overview, tickets]);
  const propertyScopedTenantRows = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();

    return tenantTableRows.filter((tenant) => {
      const matchesProperty = !selectedPropertyId || tenant.propertyIds.includes(selectedPropertyId);
      const matchesRisk = tenantRiskFilter === "all" || tenant.riskLevel === tenantRiskFilter;
      const matchesSearch =
        !query ||
        [tenant.name, tenant.inn, tenant.contactName, tenant.phone, tenant.email, tenant.unitLabel]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesProperty && matchesRisk && matchesSearch;
    });
  }, [selectedPropertyId, tenantRiskFilter, tenantSearch, tenantTableRows]);
  const propertyScopedUnits = useMemo(() => {
    if (!overview) {
      return [];
    }

    if (!selectedPropertyId) {
      return overview.units;
    }

    return overview.units.filter((unit) => unit.propertyId === selectedPropertyId);
  }, [overview, selectedPropertyId]);
  const filteredPropertyScopedUnits = useMemo(
    () =>
      propertyScopedUnits.filter((unit) => {
        const matchesType = unitTypeFilter === "all" || unit.type === unitTypeFilter;
        const matchesStatus = unitStatusFilter === "all" || unit.status === unitStatusFilter;
        const matchesRamp =
          unitRampFilter === "all" ||
          (unitRampFilter === "ramp" && unit.hasRamp) ||
          (unitRampFilter === "no-ramp" && !unit.hasRamp);

        return matchesType && matchesStatus && matchesRamp;
      }),
    [propertyScopedUnits, unitRampFilter, unitStatusFilter, unitTypeFilter]
  );
  const managerLeaseRows = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.leases.filter((lease) => {
      const matchesStage = leaseStageFilter === "all" || lease.stage === leaseStageFilter;
      const daysLeft = daysUntil(lease.endDate);
      const matchesTerm =
        leaseTermFilter === "all" ||
        (leaseTermFilter === "30" && daysLeft !== null && daysLeft <= 30) ||
        (leaseTermFilter === "90" && daysLeft !== null && daysLeft <= 90) ||
        (leaseTermFilter === "expired" && daysLeft !== null && daysLeft < 0);

      return matchesStage && matchesTerm;
    });
  }, [leaseStageFilter, leaseTermFilter, overview]);
  const ticketAssigneeOptions = useMemo(
    () => (overview?.team ?? []).filter((member) => member.role === "worker"),
    [overview]
  );
  const selectedUnitLeases = useMemo(() => {
    if (!overview || !selectedUnit) {
      return [];
    }

    return overview.leases.filter((lease) => lease.unitId === selectedUnit.id);
  }, [overview, selectedUnit]);
  const selectedUnitTickets = useMemo(() => {
    if (!selectedUnit) {
      return [];
    }

    return tickets.filter((ticket) => ticket.unitId === selectedUnit.id);
  }, [selectedUnit, tickets]);
  const chatThreads = useMemo(() => {
    if (!overview) {
      return [];
    }

    const tenantById = new Map(overview.tenants.map((tenant) => [tenant.id, tenant]));
    const grouped = new Map<string, ChatThread>();

    tickets
      .filter((ticket) => ticket.tenantId)
      .forEach((ticket) => {
        const tenantId = ticket.tenantId as string;
        const tenant = tenantById.get(tenantId);

        if (!tenant) {
          return;
        }

        const current = grouped.get(tenantId);
        const unreadIncrement =
          ticket.status === "new" || ticket.status === "waiting_tenant" || priorityWeight[ticket.priority] >= 3 ? 1 : 0;

        if (!current) {
          grouped.set(tenantId, {
            tenantId,
            tenantName: tenant.name,
            propertyName: ticket.propertyName ?? null,
            preview: ticket.title,
            lastActivity: ticket.updatedAt,
            unreadCount: unreadIncrement,
            ticketCount: 1
          });
          return;
        }

        const isNewer = new Date(ticket.updatedAt).getTime() > new Date(current.lastActivity).getTime();

        grouped.set(tenantId, {
          ...current,
          propertyName: current.propertyName ?? ticket.propertyName ?? null,
          preview: isNewer ? ticket.title : current.preview,
          lastActivity: isNewer ? ticket.updatedAt : current.lastActivity,
          unreadCount: current.unreadCount + unreadIncrement,
          ticketCount: current.ticketCount + 1
        });
      });

    return [...grouped.values()].sort(
      (left, right) => new Date(right.lastActivity).getTime() - new Date(left.lastActivity).getTime()
    );
  }, [overview, tickets]);
  const selectedChatThread = useMemo(
    () => chatThreads.find((thread) => thread.tenantId === selectedChatTenantId) ?? null,
    [chatThreads, selectedChatTenantId]
  );
  const selectedChatTickets = useMemo(() => {
    if (!selectedChatTenantId) {
      return [];
    }

    return [...tickets]
      .filter((ticket) => ticket.tenantId === selectedChatTenantId)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }, [selectedChatTenantId, tickets]);
  const selectedChatTicketIdsKey = useMemo(
    () => selectedChatTickets.map((ticket) => ticket.id).join(","),
    [selectedChatTickets]
  );
  const selectedChatTargetTicket = useMemo(() => {
    if (!selectedChatTickets.length) {
      return null;
    }

    const explicitTicket = selectedChatTickets.find((ticket) => ticket.id === selectedChatTicketId);
    if (explicitTicket) {
      return explicitTicket;
    }

    return [...selectedChatTickets].sort((left, right) => {
      const openDelta = Number(isOpenTicket(right.status)) - Number(isOpenTicket(left.status));
      if (openDelta !== 0) {
        return openDelta;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })[0] ?? null;
  }, [selectedChatTicketId, selectedChatTickets]);

  const sectionTitle = (() => {
    if (!session) {
      return "";
    }

    if (isWorker && activeWorkspaceSection === "service") {
      return locale === "ru" ? "Мои заявки" : "My jobs";
    }

    if (isTenant) {
      if (activeWorkspaceSection === "leases") {
        return locale === "ru" ? "Договоры и оплаты" : "Leases and payments";
      }

      if (activeWorkspaceSection === "service") {
        return locale === "ru" ? "Мои заявки" : "My tickets";
      }

      if (activeWorkspaceSection === "chat") {
        return locale === "ru" ? "Чат с командой" : "Team chat";
      }
    }

    return t.sectionHeads[activeWorkspaceSection];
  })();

  const handlePropertySelect = (propertyId: string, nextSection?: Section) => {
    if (nextSection && nextSection !== selectedSection) {
      setSelectedSection(nextSection);
    }

    if (propertyId !== selectedPropertyId) {
      setSelectedPropertyId(propertyId);
    }
  };
  const handleManagerPropertySelect = (propertyId: string, nextScreen?: ManagerScreen) => {
    if (propertyId !== selectedPropertyId) {
      setSelectedPropertyId(propertyId);
    }

    if (nextScreen) {
      setManagerScreen(nextScreen);
    }
  };
  const openTenantDetail = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setTenantDetailTab("info");
    setManagerScreen("tenant-detail");
  };
  const openUnitDetail = (unitId: string) => {
    setSelectedUnitId(unitId);
    setManagerScreen("unit-detail");
  };
  const openTicketDetail = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    if (isManagerShell) {
      setManagerScreen("ticket-detail");
      return;
    }

    setSelectedSection("service");
  };
  const openNotification = async (item: NotificationItem) => {
    if (session && item.unread) {
      setOverview((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((notification) =>
                notification.id === item.id ? { ...notification, unread: false } : notification
              )
            }
          : current
      );
      try {
        await apiRequest(`/api/notifications/${item.id}/read`, {
          method: "POST",
          token: session.token
        });
      } catch {
        // Navigation should still work if a delivery was already read elsewhere.
      }
    }

    if (item.entityType === "ticket" && item.entityId) {
      openTicketDetail(item.entityId);
      return;
    }

    if (item.entityType === "lease") {
      if (isManagerShell) {
        setManagerScreen("leases");
      } else {
        setSelectedSection("leases");
      }
      return;
    }

    if (item.entityType === "unit" && item.entityId) {
      if (isManagerShell) {
        openUnitDetail(item.entityId);
      } else {
        setSelectedSection("portfolio");
      }
      return;
    }

    if (isManagerShell) {
      setManagerScreen("dashboard");
    }
  };
  const markAllNotificationsRead = async () => {
    if (!session || !overview) {
      return;
    }

    const unread = overview.notifications.filter((item) => item.unread);
    if (unread.length === 0) {
      return;
    }

    setOverview((current) =>
      current
        ? {
            ...current,
            notifications: current.notifications.map((notification) => ({ ...notification, unread: false }))
          }
        : current
    );

    await Promise.allSettled(
      unread.map((item) =>
        apiRequest(`/api/notifications/${item.id}/read`, {
          method: "POST",
          token: session.token
        })
      )
    );
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${brand[locale].name} | ${brand[locale].subtitle}`;
  }, [locale]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setBootstrapping(false);
      return;
    }

    void hydrateSession(token, { silentAuthFailure: true });
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiRequest<TenantOnboarding>("/api/auth/tenant/onboarding")
      .then((payload) => {
        if (!cancelled) {
          setTenantOnboarding(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantOnboarding({
            channels: [
              {
                id: "telegram",
                label: "Telegram",
                url: "https://t.me/warehousecontourbot",
                enabled: true,
                instruction: ""
              },
              {
                id: "vk",
                label: "VK",
                url: "https://vk.com/club239116063",
                enabled: true,
                instruction: ""
              }
            ]
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!overview?.properties.length) {
      setSelectedPropertyId("");
      return;
    }

    if (!overview.properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(overview.properties[0].id);
    }
  }, [overview, selectedPropertyId]);

  useEffect(() => {
    if (!propertyScopedTenantRows.length) {
      setSelectedTenantId("");
      setTenantDetail(null);
      return;
    }

    if (!propertyScopedTenantRows.some((tenant) => tenant.id === selectedTenantId)) {
      setSelectedTenantId(propertyScopedTenantRows[0].id);
    }
  }, [propertyScopedTenantRows, selectedTenantId]);

  useEffect(() => {
    if (!propertyScopedUnits.length) {
      setSelectedUnitId("");
      return;
    }

    if (!propertyScopedUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(propertyScopedUnits[0].id);
    }
  }, [propertyScopedUnits, selectedUnitId]);

  useEffect(() => {
    if (!visibleSections.includes(selectedSection)) {
      setSelectedSection(visibleSections[0] ?? "service");
    }
  }, [selectedSection, visibleSections]);

  useEffect(() => {
    if (!isTenant || paymentProofForm.leaseId || !overview?.leases.length) {
      return;
    }

    setPaymentProofForm((current) => ({
      ...current,
      leaseId: overview.leases[0].id
    }));
  }, [isTenant, overview?.leases, paymentProofForm.leaseId]);

  useEffect(() => {
    if (overview?.properties.length && !unitForm.propertyId) {
      setUnitForm((current) => ({
        ...current,
        propertyId: overview.properties[0].id
      }));
    }
  }, [overview, unitForm.propertyId]);

  useEffect(() => {
    if (overview?.properties.length && !staffCreateForm.propertyId) {
      setStaffCreateForm((current) => ({
        ...current,
        propertyId: overview.properties[0].id
      }));
    }
  }, [overview, staffCreateForm.propertyId]);

  useEffect(() => {
    if (overview?.tenants.length && !leaseForm.tenantId) {
      setLeaseForm((current) => ({
        ...current,
        tenantId: overview.tenants[0].id
      }));
    }
  }, [overview, leaseForm.tenantId]);

  useEffect(() => {
    const editingLease = overview?.leases.find((lease) => lease.id === editingAdmin.lease) ?? null;
    const availableLeaseUnits = (overview?.units ?? []).filter(
      (unit) => !unit.leaseStage || unit.leaseStage === "terminated" || unit.id === editingLease?.unitId
    );

    if (availableLeaseUnits.length && !availableLeaseUnits.some((unit) => unit.id === leaseForm.unitId)) {
      setLeaseForm((current) => ({
        ...current,
        unitId: availableLeaseUnits[0].id
      }));
    }
  }, [editingAdmin.lease, overview, leaseForm.unitId]);

  useEffect(() => {
    if (ticketUnits.length && !ticketUnits.some((unit) => unit.id === ticketForm.unitId)) {
      setTicketForm((current) => ({
        ...current,
        unitId: ticketUnits[0].id
      }));
    }
  }, [ticketForm.unitId, ticketUnits]);

  useEffect(() => {
    if (!tickets.length) {
      setSelectedTicketId("");
      return;
    }

    if (!tickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [selectedTicketId, tickets]);

  useEffect(() => {
    if (!chatThreads.length) {
      setSelectedChatTenantId("");
      setChatMessages([]);
      return;
    }

    if (!chatThreads.some((thread) => thread.tenantId === selectedChatTenantId)) {
      setSelectedChatTenantId(chatThreads[0].tenantId);
    }
  }, [chatThreads, selectedChatTenantId]);

  useEffect(() => {
    if (!selectedChatTickets.length) {
      setSelectedChatTicketId("");
      return;
    }

    if (!selectedChatTickets.some((ticket) => ticket.id === selectedChatTicketId)) {
      setSelectedChatTicketId(selectedChatTargetTicket?.id ?? selectedChatTickets[0].id);
    }
  }, [selectedChatTargetTicket?.id, selectedChatTicketId, selectedChatTickets]);

  useEffect(() => {
    if (!selectedTicket) {
      setTicketStatusDraft("new");
      setTicketAssigneeDraft("");
      return;
    }

    setTicketStatusDraft(isWorker && !["in_progress", "completed"].includes(selectedTicket.status) ? "in_progress" : selectedTicket.status);
    setTicketAssigneeDraft(selectedTicket.assignedTo ?? "");
  }, [isWorker, selectedTicket]);

  useEffect(() => {
    if (!session || !selectedTicketId) {
      setTicketComments([]);
      setTicketAttachments([]);
      setTicketHistory([]);
      return;
    }

    const loadTicketThread = async () => {
      try {
        const [commentsResult, attachmentsResult, historyResult] = await Promise.all([
          apiRequest<{ items: TicketComment[] }>(`/api/tickets/${selectedTicketId}/comments`, {
            token: session.token
          }),
          apiRequest<{ items: TicketAttachment[] }>(`/api/tickets/${selectedTicketId}/attachments`, {
            token: session.token
          }),
          apiRequest<{ items: TicketHistoryEvent[] }>(`/api/tickets/${selectedTicketId}/history`, {
            token: session.token
          })
        ]);
        startTransition(() => {
          setTicketComments(commentsResult.items);
          setTicketAttachments(attachmentsResult.items);
          setTicketHistory(historyResult.items);
        });
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Ticket thread load failed");
      }
    };

    void loadTicketThread();
  }, [selectedTicketId, session]);

  useEffect(() => {
    if (!session || managerScreen !== "billing") {
      return;
    }

    void loadBillingInvoices().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Billing load failed");
    });
  }, [managerScreen, session]);

  useEffect(() => {
    if (!session || !["admin", "manager", "worker"].includes(session.user.role)) {
      setChecklistTemplates([]);
      return;
    }

    apiRequest<{ items: ChecklistTemplate[] }>("/api/checklist-templates", {
      token: session.token
    })
      .then((result) => setChecklistTemplates(result.items))
      .catch(() => setChecklistTemplates([]));
  }, [session]);

  useEffect(() => {
    if (!selectedBillingInvoice) {
      return;
    }

    const remainder = Math.max(0, selectedBillingInvoice.totalAmount - selectedBillingInvoice.paidAmount);
    setBillingPaymentForm((current) => ({
      ...current,
      amount: remainder > 0 ? String(remainder) : current.amount
    }));
  }, [selectedBillingInvoice]);

  useEffect(() => {
    if (!session || !selectedTenantId || !overview?.tenants.length) {
      setTenantDetail(null);
      return;
    }

    const loadTenantDetail = async () => {
      setTenantDetailBusy(true);

      try {
        const result = await apiRequest<TenantDetail>(`/api/tenants/${selectedTenantId}/detail`, {
          token: session.token
        });
        startTransition(() => {
          setTenantDetail(result);
        });
      } catch (caughtError) {
        setTenantDetail(null);
        setError(caughtError instanceof Error ? caughtError.message : "Tenant detail load failed");
      } finally {
        setTenantDetailBusy(false);
      }
    };

    void loadTenantDetail();
  }, [overview, selectedTenantId, session]);

  useEffect(() => {
    if (!tenantDetail?.units.length) {
      return;
    }

    setMeterReadingForm((current) => ({
      ...current,
      unitId: tenantDetail.units.some((unit) => unit.id === current.unitId) ? current.unitId : tenantDetail.units[0].id
    }));
  }, [tenantDetail?.tenant.id, tenantDetail?.units]);

  useEffect(() => {
    if (!(isManagerShell || isTenant) || !session || !selectedChatTenantId || !selectedChatTickets.length) {
      setChatMessages([]);
      return;
    }

    let isCancelled = false;

    const loadChatMessages = async () => {
      setChatBusy(true);

      try {
        const commentCollections = await Promise.all(
          selectedChatTickets.map((ticket) =>
            apiRequest<{ items: TicketComment[] }>(`/api/tickets/${ticket.id}/comments`, {
              token: session.token
            }).then((payload) => ({
              ticket,
              items: payload.items
            }))
          )
        );

        if (isCancelled) {
          return;
        }

        const flattened = commentCollections.flatMap(({ ticket, items }) =>
          items.map((comment) => ({
            id: comment.id,
            ticketId: ticket.id,
            ticketNumber: ticket.number,
            authorName: comment.authorName ?? "—",
            authorRole: comment.authorRole,
            sourceChannel: comment.sourceChannel,
            content: comment.content,
            createdAt: comment.createdAt,
            direction: isTenant
              ? comment.authorRole === "tenant" ? "outgoing" : "incoming"
              : comment.authorRole === "tenant" ? "incoming" : "outgoing"
          }))
        );

        const fallbackMessages =
          flattened.length === 0
            ? selectedChatTickets.map((ticket) => ({
                id: `seed-${ticket.id}`,
                ticketId: ticket.id,
                ticketNumber: ticket.number,
                authorName: ticket.tenantName ?? "Tenant",
                authorRole: "tenant",
                sourceChannel: ticket.sourceChannel,
                content: ticket.description,
                createdAt: ticket.createdAt,
                direction: isTenant ? "outgoing" as const : "incoming" as const
              }))
            : [];

        startTransition(() => {
          setChatMessages(
            [...flattened, ...fallbackMessages].sort(
              (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
            )
          );
        });
      } catch (caughtError) {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Chat load failed");
        }
      } finally {
        if (!isCancelled) {
          setChatBusy(false);
        }
      }
    };

    void loadChatMessages();

    return () => {
      isCancelled = true;
    };
  }, [isManagerShell, isTenant, selectedChatTenantId, selectedChatTicketIdsKey, selectedChatTickets, session]);

  const applyWorkspaceData = (
    nextOverview: Overview,
    nextTickets: Ticket[],
    preferredTicketId?: string
  ) => {
    startTransition(() => {
      setOverview(nextOverview);
      setTickets(nextTickets);
      setSelectedTicketId((current) => {
        const candidate = preferredTicketId ?? current;
        if (nextTickets.some((ticket) => ticket.id === candidate)) {
          return candidate;
        }

        return nextTickets.find((ticket) => !["billing", "lease"].includes(ticket.category))?.id ?? "";
      });
    });
  };

  const fetchWorkspaceData = async (token: string) => {
    const [me, nextOverview, nextTickets] = await Promise.all([
      apiRequest<{ user: SessionUser }>("/api/auth/me", { token }),
      apiRequest<Overview>("/api/dashboard/overview", { token }),
      apiRequest<{ items: Ticket[] }>("/api/tickets", { token })
    ]);

    return {
      me,
      nextOverview,
      nextTickets: nextTickets.items
    };
  };

  const hydrateSession = async (token: string, options: { silentAuthFailure?: boolean } = {}) => {
    setBootstrapping(true);
    setError("");

    try {
      const { me, nextOverview, nextTickets } = await fetchWorkspaceData(token);
      window.localStorage.setItem(TOKEN_KEY, token);
      setSession({
        token,
        user: me.user
      });
      applyWorkspaceData(nextOverview, nextTickets);
    } catch (caughtError) {
      window.localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setOverview(null);
      setTickets([]);
      setTicketComments([]);
      setTenantDetail(null);
      setError(options.silentAuthFailure ? "" : caughtError instanceof Error ? caughtError.message : "Auth failed");
    } finally {
      setBootstrapping(false);
    }
  };

  const refreshWorkspace = async (preferredTicketId?: string) => {
    if (!session) {
      return;
    }

    const [{ nextOverview }, { items }] = await Promise.all([
      apiRequest<Overview>("/api/dashboard/overview", {
        token: session.token
      }).then((payload) => ({ nextOverview: payload })),
      apiRequest<{ items: Ticket[] }>("/api/tickets", {
        token: session.token
      })
    ]);

    applyWorkspaceData(nextOverview, items, preferredTicketId);
  };

  const loadImportBatches = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setImportBatches([]);
      return;
    }

    const result = await apiRequest<{ items: ImportBatch[] }>("/api/import-batches", {
      token: session.token
    });
    setImportBatches(result.items);
  };

  const loadImportApprovals = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setImportApprovals([]);
      return;
    }

    const result = await apiRequest<{ items: ImportApproval[] }>("/api/import-approvals", {
      token: session.token
    });
    setImportApprovals(result.items);
  };

  const loadSystemReadiness = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setSystemReadiness(null);
      return;
    }

    const result = await apiRequest<SystemReadiness>("/api/system/readiness", {
      token: session.token
    });
    setSystemReadiness(result);
  };

  useEffect(() => {
    if (!isManagerShell) {
      setImportApprovals([]);
      setImportBatches([]);
      setSystemReadiness(null);
      return;
    }

    void Promise.all([loadImportApprovals(), loadImportBatches(), loadSystemReadiness()]);
  }, [isManagerShell, session?.token]);

  const loadBillingInvoices = async () => {
    if (!session || !["admin", "manager"].includes(session.user.role)) {
      setBillingInvoices([]);
      setBillingReconciliation(null);
      return;
    }

    const [result, reconciliation] = await Promise.all([
      apiRequest<{ items: BillingInvoice[] }>("/api/billing/invoices", {
        token: session.token
      }),
      apiRequest<BillingReconciliation>("/api/billing/reconciliation", {
        token: session.token
      })
    ]);
    setBillingInvoices(result.items);
    setBillingReconciliation(reconciliation);
    setSelectedBillingInvoiceId((current) =>
      result.items.some((invoice) => invoice.id === current) ? current : (result.items[0]?.id ?? "")
    );
  };

  const handleFieldChange =
    <T extends Record<string, string | boolean>>(setter: Dispatch<SetStateAction<T>>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = event.target;
      const nextValue = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;

      setter((current) => ({
        ...current,
        [target.name]: nextValue
      }));
    };

  const handleStaffLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("staff-login");
    setError("");

    try {
      const result = await apiRequest<
        { token: string; user: SessionUser } | { mfaRequired: true; mfaToken: string; user: { email: string; fullName: string } }
      >("/api/auth/staff/login", {
        method: "POST",
        body: staffForm
      });
      if ("mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        setStaffAuthStep("mfa");
        setNotice("");
        return;
      }
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Login failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleStaffMfaVerify = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("staff-mfa");
    setError("");

    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>("/api/auth/staff/verify-2fa", {
        method: "POST",
        body: {
          mfaToken,
          code: staffMfaForm.code
        }
      });
      setMfaToken("");
      setStaffMfaForm({ code: "" });
      setStaffAuthStep("password");
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "2FA failed");
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordResetRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("reset-request");
    setError("");

    try {
      await apiRequest("/api/auth/password-reset/request", {
        method: "POST",
        body: {
          email: resetForm.email
        }
      });
      setStaffAuthStep("reset-confirm");
      setNotice(t.auth.resetHint);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Password reset failed");
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordResetConfirm = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("reset-confirm");
    setError("");

    try {
      await apiRequest("/api/auth/password-reset/confirm", {
        method: "POST",
        body: resetForm
      });
      setStaffForm((current) => ({ ...current, email: resetForm.email, password: "" }));
      setResetForm({ email: "", code: "", password: "" });
      setStaffAuthStep("password");
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Password reset failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleTenantOtpRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("tenant-request");
    setError("");

    try {
      await apiRequest("/api/auth/tenant/request-otp", {
        method: "POST",
        body: {
          phone: tenantForm.phone
        }
      });
      setTenantOtpRequested(true);
      setNotice(t.messages.otpSent);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "OTP request failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleTenantVerify = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("tenant-verify");
    setError("");

    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>("/api/auth/tenant/verify-otp", {
        method: "POST",
        body: tenantForm
      });
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "OTP verification failed");
    } finally {
      setBusyAction("");
    }
  };

  const resetPropertyForm = () =>
    setPropertyForm({
      name: "",
      address: "",
      totalArea: "",
      rentableArea: "",
      warehouseClass: "A",
      description: ""
    });

  const resetTenantCreateForm = () =>
    setTenantCreateForm({
      name: "",
      inn: "",
      contactName: "",
      phone: "",
      email: "",
      riskLevel: "medium"
    });

  const resetUnitForm = () =>
    setUnitForm((current) => ({
      ...current,
      number: "",
      floor: "1",
      area: "",
      type: "warm",
      status: "vacant",
      temperatureRegime: "",
      ceilingHeight: "",
      hasRamp: true,
      hasGate: true
    }));

  const resetLeaseForm = () =>
    setLeaseForm((current) => ({
      ...current,
      contractNumber: "",
      startDate: "",
      endDate: "",
      ratePerSqm: "",
      deposit: "0",
      indexationPct: "0",
      stage: "draft"
    }));

  const resetLaunchForm = () =>
    setLaunchForm({
      propertyName: "",
      address: "",
      totalArea: "",
      rentableArea: "",
      warehouseClass: "A",
      unitNumber: "",
      floor: "1",
      unitArea: "",
      unitType: "warm",
      temperatureRegime: "",
      ceilingHeight: "",
      tenantName: "",
      inn: "",
      contactName: "",
      phone: "",
      email: "",
      riskLevel: "medium",
      contractNumber: "",
      startDate: "",
      endDate: "",
      ratePerSqm: "",
      deposit: "0"
    });

  const cancelAdminEdit = (panel: AdminPanel) => {
    setEditingAdmin((current) => ({
      ...current,
      [panel]: null
    }));

    if (panel === "property") {
      resetPropertyForm();
    } else if (panel === "tenant") {
      resetTenantCreateForm();
    } else if (panel === "unit") {
      resetUnitForm();
    } else {
      resetLeaseForm();
    }
  };

  const startEditProperty = (property: Property) => {
    setAdminPanel("property");
    setEditingAdmin((current) => ({
      ...current,
      property: property.id
    }));
    setPropertyForm({
      name: property.name,
      address: property.address,
      totalArea: String(property.totalArea),
      rentableArea: String(property.rentableArea),
      warehouseClass: property.warehouseClass,
      description: property.description ?? ""
    });
  };

  const startEditTenant = (tenant: Tenant) => {
    setAdminPanel("tenant");
    setEditingAdmin((current) => ({
      ...current,
      tenant: tenant.id
    }));
    setTenantCreateForm({
      name: tenant.name,
      inn: tenant.inn,
      contactName: tenant.contactName,
      phone: tenant.phone,
      email: tenant.email,
      riskLevel: tenant.riskLevel
    });
  };

  const startEditUnit = (unit: Unit) => {
    setAdminPanel("unit");
    setEditingAdmin((current) => ({
      ...current,
      unit: unit.id
    }));
    setUnitForm({
      propertyId: unit.propertyId,
      number: unit.number,
      floor: String(unit.floor),
      area: String(unit.area),
      type: unit.type,
      status: unit.status,
      temperatureRegime: unit.temperatureRegime ?? "",
      ceilingHeight: unit.ceilingHeight ? String(unit.ceilingHeight) : "",
      hasRamp: unit.hasRamp,
      hasGate: unit.hasGate
    });
  };

  const startEditLease = (lease: Lease) => {
    setAdminPanel("lease");
    setEditingAdmin((current) => ({
      ...current,
      lease: lease.id
    }));
    setLeaseForm({
      tenantId: lease.tenantId,
      unitId: lease.unitId,
      contractNumber: lease.contractNumber,
      stage: lease.stage,
      startDate: lease.startDate,
      endDate: lease.endDate,
      ratePerSqm: String(lease.ratePerSqm),
      deposit: String(lease.deposit),
      indexationPct: String(lease.indexationPct)
    });
  };

  const openManagerPropertyEdit = (property: Property) => {
    startEditProperty(property);
    setManagerScreen("property-add");
  };

  const openManagerTenantEdit = (tenant: Tenant) => {
    startEditTenant(tenant);
    setManagerScreen("tenant-add");
  };

  const openManagerUnitEdit = (unit: Unit) => {
    startEditUnit(unit);
    setManagerScreen("unit-add");
  };

  const openManagerLeaseEdit = (lease: Lease) => {
    startEditLease(lease);
    setManagerScreen("lease-add");
  };

  const submitAdminSave = async (
    event: FormEvent,
    panel: AdminPanel,
    createPath: string,
    body: Record<string, unknown>,
    reset: () => void,
    afterSuccess?: () => void
  ) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const editingId = editingAdmin[panel];
    const path = editingId ? `${createPath}/${editingId}` : createPath;

    setBusyAction(path);
    setError("");

    try {
      await apiRequest(path, {
        method: editingId ? "PUT" : "POST",
        token: session.token,
        body
      });
      reset();
      setEditingAdmin((current) => ({
        ...current,
        [panel]: null
      }));
      afterSuccess?.();
      setNotice(t.messages.saved);
      await refreshWorkspace();
      if (isManagerShell && ["property-add", "tenant-add", "unit-add", "lease-add"].includes(managerScreen)) {
        setManagerScreen(
          panel === "property"
            ? "objects"
            : panel === "tenant"
              ? "tenants"
              : panel === "unit"
                ? "units"
                : "leases"
        );
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Save failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async (path: string) => {
    if (!session || !window.confirm(t.actions.confirmDelete)) {
      return;
    }

    setBusyAction(path);
    setError("");

    try {
      await apiRequest(path, {
        method: "DELETE",
        token: session.token
      });
      setNotice(t.messages.deleted);
      await refreshWorkspace();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Delete failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleCreateTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !overview) {
      return;
    }

    setBusyAction("ticket-create");
    setError("");

    const relatedLease = overview.leases.find(
      (lease) => lease.unitId === ticketForm.unitId && lease.stage !== "terminated"
    );

    try {
      const result = await apiRequest<{ item: Ticket }>("/api/tickets", {
        method: "POST",
        token: session.token,
        body: {
          ...ticketForm,
          tenantId: session.user.role === "tenant" ? session.user.tenantId : (relatedLease?.tenantId ?? null)
        }
      });
      setTicketForm((current) => ({
        ...current,
        title: "",
        description: "",
        category: "maintenance",
        priority: "medium"
      }));
      setNotice(t.messages.ticketCreated);
      if (isManagerShell) {
        setManagerScreen("ticket-detail");
      } else {
        setSelectedSection("service");
      }
      await refreshWorkspace(result.item.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ticket create failed");
    } finally {
      setBusyAction("");
    }
  };

  const handlePaymentProofSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !overview || !isTenant) {
      return;
    }

    const lease = overview.leases.find((item) => item.id === paymentProofForm.leaseId) ?? overview.leases[0];
    if (!lease) {
      setError(locale === "ru" ? "Договор не найден" : "Lease not found");
      return;
    }

    setBusyAction("payment-proof");
    setError("");

    try {
      const result = await apiRequest<{ item: Ticket }>("/api/tickets", {
        method: "POST",
        token: session.token,
        body: {
          unitId: lease.unitId,
          category: "billing",
          priority: "medium",
          title: locale === "ru" ? `Подтверждение оплаты ${lease.contractNumber}` : `Payment proof ${lease.contractNumber}`,
          description:
            `${locale === "ru" ? "Арендатор отправил оплату на проверку." : "Tenant submitted payment for review."}\n` +
            `${locale === "ru" ? "Договор" : "Contract"}: ${lease.contractNumber}\n` +
            `${locale === "ru" ? "Сумма" : "Amount"}: ${paymentProofForm.amount || "—"}\n` +
            `${locale === "ru" ? "Дата оплаты" : "Paid at"}: ${paymentProofForm.paidAt || "—"}\n` +
            `${locale === "ru" ? "Референс" : "Reference"}: ${paymentProofForm.reference || "—"}`
        }
      });

      if (paymentProofFile) {
        const buffer = await paymentProofFile.arrayBuffer();
        await apiRequest(`/api/tickets/${result.item.id}/attachments`, {
          method: "POST",
          token: session.token,
          body: {
            fileName: paymentProofFile.name,
            mimeType: paymentProofFile.type || "application/octet-stream",
            contentBase64: arrayBufferToBase64(buffer)
          }
        });
      }

      setPaymentProofForm((current) => ({
        ...current,
        amount: "",
        paidAt: new Date().toISOString().slice(0, 10),
        reference: ""
      }));
      setPaymentProofFile(null);
      setNotice(locale === "ru" ? "Оплата отправлена менеджеру на проверку" : "Payment proof sent for manager review");
      await refreshWorkspace();
      setSelectedSection("leases");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Payment proof failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleUpdateTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedTicket) {
      return;
    }

    setBusyAction("ticket-update");
    setError("");

    try {
      const reopening =
        ["resolved", "closed"].includes(selectedTicket.status) &&
        !["resolved", "closed", "rejected"].includes(ticketStatusDraft);
      const reopenReason = reopening
        ? window.prompt(locale === "ru" ? "Причина переоткрытия заявки" : "Reopen reason")
        : "";
      if (reopening && !reopenReason?.trim()) {
        setError(locale === "ru" ? "Нужна причина переоткрытия" : "Reopen reason is required");
        setBusyAction("");
        return;
      }

      await apiRequest(`/api/tickets/${selectedTicket.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          status: ticketStatusDraft,
          reopenReason,
          ...(canAssignTickets ? { assignedTo: ticketAssigneeDraft || null } : {})
        }
      });
      setNotice(t.messages.statusUpdated);
      await refreshWorkspace(selectedTicket.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ticket update failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleCancelTicket = async (ticket: Ticket) => {
    if (!session || !isTenant) {
      return;
    }

    setBusyAction(`ticket-cancel-${ticket.id}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticket.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          status: "rejected"
        }
      });
      setNotice(locale === "ru" ? "Заявка отменена" : "Ticket cancelled");
      await refreshWorkspace(ticket.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ticket cancel failed");
    } finally {
      setBusyAction("");
    }
  };

  const toggleChecklistItem = async (ticketId: string, item: TicketChecklistItem) => {
    if (!session || !canUpdateTickets) {
      return;
    }

    setBusyAction(`ticket-checklist-${item.id}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticketId}/checklist/${item.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          completed: !item.completed
        }
      });
      await refreshWorkspace(ticketId);
      setNotice(locale === "ru" ? "Чек-лист обновлен" : "Checklist updated");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Checklist update failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleCommentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedTicket) {
      return;
    }

    setBusyAction("ticket-comment");
    setError("");

    try {
      const result = await apiRequest<{ item: TicketComment; delivery?: CommentDelivery }>(`/api/tickets/${selectedTicket.id}/comments`, {
        method: "POST",
        token: session.token,
        body: commentForm
      });
      setCommentForm({
        content: ""
      });
      setNotice(formatDeliveryNotice(t.messages.commentAdded, result.delivery, locale));
      await refreshWorkspace(selectedTicket.id);
      const refreshedComments = await apiRequest<{ items: TicketComment[] }>(
        `/api/tickets/${selectedTicket.id}/comments`,
        {
          token: session.token
        }
      );
      startTransition(() => {
        setTicketComments(refreshedComments.items);
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Comment create failed");
    } finally {
      setBusyAction("");
    }
  };

  const reloadTicketAttachments = async (ticketId: string) => {
    if (!session) {
      return;
    }

    const result = await apiRequest<{ items: TicketAttachment[] }>(`/api/tickets/${ticketId}/attachments`, {
      token: session.token
    });
    setTicketAttachments(result.items);
  };

  const handleTicketAttachmentUpload = async (ticketId: string, file: File | null) => {
    if (!session || !file) {
      return;
    }

    setBusyAction(`ticket-attachment-upload-${ticketId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      await apiRequest(`/api/tickets/${ticketId}/attachments`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          category: documentUploadCategory,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer)
        }
      });
      await reloadTicketAttachments(ticketId);
      await refreshWorkspace(ticketId);
      setNotice(locale === "ru" ? "Р¤Р°Р№Р» РїСЂРёРєСЂРµРїР»РµРЅ" : "File attached");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Attachment upload failed");
    } finally {
      setBusyAction("");
    }
  };

  const openTicketAttachment = (ticketId: string, attachment: TicketAttachment) =>
    openAuthenticatedFile(`/api/tickets/${ticketId}/attachments/${attachment.id}`);

  const deleteTicketAttachment = async (ticketId: string, attachmentId: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`ticket-attachment-delete-${attachmentId}`);
    setError("");

    try {
      await apiRequest(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
        method: "DELETE",
        token: session.token
      });
      await reloadTicketAttachments(ticketId);
      await refreshWorkspace(ticketId);
      setNotice(t.messages.deleted);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Attachment delete failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedChatTargetTicket || !chatDraft.content.trim()) {
      if (!selectedChatTargetTicket) {
        setError(managerUi.noThreadTarget);
      }
      return;
    }

    setBusyAction("chat-submit");
    setError("");

    try {
      const result = await apiRequest<{ item: TicketComment; delivery?: CommentDelivery }>(`/api/tickets/${selectedChatTargetTicket.id}/comments`, {
        method: "POST",
        token: session.token,
        body: {
          content: chatDraft.content.trim()
        }
      });
      setChatDraft({
        content: ""
      });
      setNotice(formatDeliveryNotice(t.messages.commentAdded, result.delivery, locale));
      await refreshWorkspace(selectedChatTargetTicket.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Chat send failed");
    } finally {
      setBusyAction("");
    }
  };

  const openLeaseDocument = async (leaseId: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-document-${leaseId}`);
    setError("");

    try {
      const response = await fetch(`${runtimeApiBase}/api/leases/${leaseId}/document`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Document open failed");
    } finally {
      setBusyAction("");
    }
  };

  const loadLeaseDocuments = async (lease: Lease) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-documents-${lease.id}`);
    setError("");

    try {
      const result = await apiRequest<{ items: LeaseDocument[] }>(`/api/leases/${lease.id}/documents`, {
        token: session.token
      });
      setDocumentPanelLease(lease);
      setLeaseDocuments(result.items);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Documents load failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleLeaseDocumentUpload = async (leaseId: string, file: File | null) => {
    if (!session || !file) {
      return;
    }

    setBusyAction(`lease-document-upload-${leaseId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      await apiRequest(`/api/leases/${leaseId}/documents`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer)
        }
      });
      const lease = documentPanelLease ?? overview.leases.find((item) => item.id === leaseId);
      if (lease) {
        await loadLeaseDocuments(lease);
      }
      setNotice(locale === "ru" ? "Документ загружен" : "Document uploaded");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Document upload failed");
    } finally {
      setBusyAction("");
    }
  };

  const downloadLeaseDocument = (leaseId: string, documentItem: LeaseDocument) =>
    downloadFile(`/api/leases/${leaseId}/documents/${documentItem.id}`, documentItem.fileName);

  const deleteLeaseDocument = async (leaseId: string, documentId: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`lease-document-delete-${documentId}`);
    setError("");

    try {
      await apiRequest(`/api/leases/${leaseId}/documents/${documentId}`, {
        method: "DELETE",
        token: session.token
      });
      const lease = documentPanelLease ?? overview.leases.find((item) => item.id === leaseId);
      if (lease) {
        await loadLeaseDocuments(lease);
      }
      setNotice(t.messages.deleted);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Document delete failed");
    } finally {
      setBusyAction("");
    }
  };

  const downloadFile = async (path: string, fallbackName: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`download-${fallbackName}`);
    setError("");

    try {
      const response = await fetch(`${runtimeApiBase}${path}`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const rawFilename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
      const filename = rawFilename.includes("%") ? decodeURIComponent(rawFilename) : rawFilename;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Download failed");
    } finally {
      setBusyAction("");
    }
  };

  const openAuthenticatedFile = async (path: string) => {
    if (!session) {
      return;
    }

    setBusyAction(`open-${path}`);
    setError("");

    try {
      const response = await fetch(`${runtimeApiBase}${path}`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "File open failed");
    } finally {
      setBusyAction("");
    }
  };

  const downloadExport = (exportId: string) => downloadFile(`/api/exports/${exportId}`, `${exportId}.xlsx`);
  const downloadImportTemplate = (templateId: string) => downloadFile(`/api/import-templates/${templateId}`, `template-${templateId}.xlsx`);
  const downloadUnitExport = (unit: Unit) => downloadFile(`/api/units/${unit.id}/export`, `unit-${unit.number}.xlsx`);
  const downloadBillingInvoice = (invoice: BillingInvoice) =>
    downloadFile(`/api/billing/invoices/${invoice.id}/export`, `invoice-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`);
  const downloadBillingClosingPack = (invoice: BillingInvoice) =>
    downloadFile(`/api/billing/invoices/${invoice.id}/closing-pack`, `closing-pack-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`);
  const downloadBillingReconciliation = () => downloadFile("/api/billing/reconciliation/export", "billing-reconciliation.xlsx");

  const getDocumentCategoryLabel = (category: string) => {
    const labels: Record<string, { ru: string; en: string }> = {
      lease: { ru: "Договор", en: "Lease" },
      appendix: { ru: "Приложение", en: "Appendix" },
      invoice: { ru: "Счет", en: "Invoice" },
      act: { ru: "Акт", en: "Act" },
      payment: { ru: "Платежка", en: "Payment order" },
      receipt: { ru: "Чек", en: "Receipt" },
      other: { ru: "Другое", en: "Other" }
    };
    return labels[category]?.[locale] ?? labels.other[locale];
  };

  const getFileKind = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf"].includes(extension)) {
      return "PDF";
    }
    if (["doc", "docx"].includes(extension)) {
      return "DOC";
    }
    if (["xls", "xlsx", "csv"].includes(extension)) {
      return "XLS";
    }
    if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
      return "IMG";
    }
    if (["mp4", "mov", "webm"].includes(extension)) {
      return "VID";
    }
    return "FILE";
  };

  const renderTicketAttachmentBlock = (ticket: Ticket) => (
    <div className="attachment-block">
      <div className="attachment-head">
        <div>
          <h4>{locale === "ru" ? "Фото и файлы заявки" : "Ticket files"}</h4>
          <span>
            {ticketAttachments.length} · {formatFileSize(
              ticketAttachments.reduce((total, item) => total + item.sizeBytes, 0),
              locale
            )}
          </span>
        </div>
        <label className="secondary-button secondary-button--compact attachment-upload">
          {locale === "ru" ? "Прикрепить" : "Attach"}
          <input
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            disabled={busyAction === `ticket-attachment-upload-${ticket.id}`}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleTicketAttachmentUpload(ticket.id, file);
            }}
            type="file"
          />
        </label>
      </div>
      {ticketAttachments.length > 0 ? (
        <div className="attachment-grid">
          {ticketAttachments.map((item) => (
            <article className={`attachment-card attachment-card--${item.mediaType}`} key={item.id}>
              <button className="attachment-preview" onClick={() => void openTicketAttachment(ticket.id, item)} type="button">
                <span>{item.mediaType === "image" ? "IMG" : item.mediaType === "video" ? "VID" : "FILE"}</span>
              </button>
              <div>
                <strong>{item.fileName}</strong>
                <small>
                  {formatFileSize(item.sizeBytes, locale)} · {formatDateTime(item.createdAt, locale)}
                </small>
                <small>{item.uploadedByName ?? "—"}</small>
              </div>
              {session && (["admin", "manager"].includes(session.user.role) || item.uploadedBy === session.user.id) ? (
                <button className="text-button" onClick={() => void deleteTicketAttachment(ticket.id, item.id)} type="button">
                  {t.actions.delete}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">{locale === "ru" ? "Файлы к заявке еще не прикреплены." : "No ticket files yet."}</div>
      )}
    </div>
  );

  const renderTicketOperationsBlock = (ticket: Ticket) => {
    const slaState = getSlaState(ticket, locale);
    const completedCount = ticket.checklistItems.filter((item) => item.completed).length;

    return (
      <div className="ticket-ops">
        <div className="ticket-ops-summary">
          <span className={`status-pill status-pill--${slaState.tone}`}>{slaState.label}</span>
          <strong>{ticket.slaDueAt ? formatDateTime(ticket.slaDueAt, locale) : "—"}</strong>
          <small>
            {completedCount}/{ticket.checklistItems.length} {locale === "ru" ? "пунктов" : "items"}
          </small>
        </div>
        <div className="checklist">
          {ticket.checklistItems.map((item) => (
            <label className={item.completed ? "checklist-item checklist-item--done" : "checklist-item"} key={item.id}>
              <input
                checked={item.completed}
                disabled={!canUpdateTickets || busyAction === `ticket-checklist-${item.id}`}
                onChange={() => void toggleChecklistItem(ticket.id, item)}
                type="checkbox"
              />
              <span>{item.label}</span>
              {item.completedByName ? <small>{item.completedByName}</small> : null}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const handleImportUpload = async (templateId: string, file: File | null) => {
    if (!session || !file) {
      return;
    }

    setBusyAction(`import-${templateId}`);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);
      const result = await apiRequest<Omit<ImportResult, "templateId" | "fileName">>(`/api/imports/${templateId}`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: file.name,
          contentBase64,
          dryRun: true,
          mode: importMode
        }
      });
      setImportDrafts((current) => [
        {
          templateId,
          fileName: file.name,
          contentBase64,
          mode: importMode
        },
        ...current.filter((item) => item.templateId !== templateId)
      ]);
      setImportResults((current) => [
        {
          ...result,
          templateId,
          fileName: file.name
        },
        ...current.filter((item) => item.templateId !== templateId)
      ]);
      setNotice(
        locale === "ru"
          ? `Файл проверен: готово ${result.summary.ready ?? 0}, ошибок ${result.summary.errors}. После проверки нажмите «Применить».`
          : `File checked: ready ${result.summary.ready ?? 0}, errors ${result.summary.errors}. Apply it after review.`
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleImportCommit = async (templateId: string) => {
    if (!session) {
      return;
    }

    const draft = importDrafts.find((item) => item.templateId === templateId);
    if (!draft) {
      return;
    }

    setBusyAction(`import-commit-${templateId}`);
    setError("");

    try {
      const result = await apiRequest<Omit<ImportResult, "templateId" | "fileName">>(`/api/imports/${templateId}`, {
        method: "POST",
        token: session.token,
        body: {
          fileName: draft.fileName,
          contentBase64: draft.contentBase64,
          dryRun: false,
          mode: draft.mode
        }
      });
      setImportResults((current) => [
        {
          ...result,
          templateId,
          fileName: draft.fileName
        },
        ...current.filter((item) => item.templateId !== templateId)
      ]);
      if (result.requiresApproval && result.approval) {
        setImportApprovals((current) => [result.approval as ImportApproval, ...current.filter((item) => item.id !== result.approval?.id)]);
        setImportDrafts((current) => current.filter((item) => item.templateId !== templateId));
        setNotice(locale === "ru" ? "Большой импорт отправлен администратору на подтверждение." : "Large import sent for admin approval.");
        await loadImportApprovals();
        return;
      }
      setImportDrafts((current) => current.filter((item) => item.templateId !== templateId));
      if (result.batch) {
        setImportBatches((current) => [result.batch as ImportBatch, ...current.filter((item) => item.id !== result.batch?.id)]);
      }
      setNotice(
        locale === "ru"
          ? `Импорт применен: создано ${result.summary.created}, обновлено ${result.summary.updated ?? 0}, ошибок ${result.summary.errors}`
          : `Import applied: created ${result.summary.created}, updated ${result.summary.updated ?? 0}, errors ${result.summary.errors}`
      );
      await refreshWorkspace();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleImportRollback = async (batch: ImportBatch) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-rollback-${batch.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: ImportBatch }>(`/api/import-batches/${batch.id}/rollback`, {
        method: "POST",
        token: session.token
      });
      setImportBatches((current) => current.map((item) => (item.id === batch.id ? result.item : item)));
      setNotice(locale === "ru" ? "Импортная партия откатилась." : "Import batch rolled back.");
      await refreshWorkspace();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import rollback failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleImportApprovalApprove = async (approval: ImportApproval) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-approval-approve-${approval.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: ImportApproval; result: Omit<ImportResult, "templateId" | "fileName"> }>(
        `/api/import-approvals/${approval.id}/approve`,
        {
          method: "POST",
          token: session.token
        }
      );
      setImportApprovals((current) => current.map((item) => (item.id === approval.id ? result.item : item)));
      if (result.result.batch) {
        setImportBatches((current) => [
          result.result.batch as ImportBatch,
          ...current.filter((item) => item.id !== result.result.batch?.id)
        ]);
      }
      setNotice(locale === "ru" ? "Импорт подтвержден и применен." : "Import approved and applied.");
      await Promise.all([loadImportApprovals(), loadImportBatches(), refreshWorkspace()]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import approval failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleImportApprovalReject = async (approval: ImportApproval) => {
    if (!session) {
      return;
    }

    setBusyAction(`import-approval-reject-${approval.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: ImportApproval }>(`/api/import-approvals/${approval.id}/reject`, {
        method: "POST",
        token: session.token
      });
      setImportApprovals((current) => current.map((item) => (item.id === approval.id ? result.item : item)));
      setNotice(locale === "ru" ? "Импорт отклонен." : "Import rejected.");
      await loadImportApprovals();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import approval failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleBillingPaymentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedBillingInvoice) {
      return;
    }

    setBusyAction("billing-payment");
    setError("");

    try {
      const relatedProofTicket = pendingPaymentProofTickets.find((ticket) => ticket.number === billingPaymentForm.reference);
      await apiRequest(`/api/billing/invoices/${selectedBillingInvoice.id}/payments`, {
        method: "POST",
        token: session.token,
        body: {
          amount: billingPaymentForm.amount,
          paidAt: billingPaymentForm.paidAt,
          method: billingPaymentForm.method,
          reference: billingPaymentForm.reference || undefined
        }
      });
      if (relatedProofTicket) {
        await apiRequest(`/api/tickets/${relatedProofTicket.id}`, {
          method: "PUT",
          token: session.token,
          body: {
            status: "completed"
          }
        });
      }
      setBillingPaymentForm({
        amount: "",
        paidAt: new Date().toISOString().slice(0, 10),
        method: "bank_transfer",
        reference: ""
      });
      await Promise.all([loadBillingInvoices(), refreshWorkspace()]);
      setNotice(locale === "ru" ? "Оплата проведена" : "Payment posted");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Payment failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleMeterReadingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !tenantDetail) {
      return;
    }

    setBusyAction("meter-reading");
    setError("");

    try {
      await apiRequest("/api/meter-readings", {
        method: "POST",
        token: session.token,
        body: {
          tenantId: tenantDetail.tenant.id,
          unitId: meterReadingForm.unitId,
          period: meterReadingForm.period,
          meterType: meterReadingForm.meterType,
          value: meterReadingForm.value,
          previousValue: meterReadingForm.previousValue || undefined,
          tariffRate: meterReadingForm.tariffRate || undefined
        }
      });

      const refreshedTenant = await apiRequest<TenantDetail>(`/api/tenants/${tenantDetail.tenant.id}/detail`, {
        token: session.token
      });
      setTenantDetail(refreshedTenant);
      setMeterReadingForm((current) => ({
        ...current,
        value: "",
        previousValue: "",
        tariffRate: ""
      }));
      await Promise.all([loadBillingInvoices(), refreshWorkspace()]);
      setNotice(locale === "ru" ? "Показание сохранено, переменная часть счета пересчитана" : "Reading saved and invoice variable charge recalculated");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Meter reading failed");
    } finally {
      setBusyAction("");
    }
  };

  const downloadImportReport = (result: ImportResult) => {
    const bytes = Uint8Array.from(window.atob(result.report.contentBase64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.report.filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadImportBatchAudit = (batch: ImportBatch) =>
    downloadFile(`/api/import-batches/${batch.id}/audit-export`, `import-audit-${batch.id}.xlsx`);

  const handleCreateStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusyAction("staff-create");
    setError("");

    try {
      await apiRequest("/api/users", {
        method: "POST",
        token: session.token,
        body: {
          ...staffCreateForm,
          propertyId: staffCreateForm.role === "admin" ? null : staffCreateForm.propertyId
        }
      });
      setStaffCreateForm((current) => ({
        ...current,
        fullName: "",
        email: "",
        phone: "",
        password: "",
        role: "worker"
      }));
      setNotice(t.messages.saved);
      setManagerScreen("staff");
      await refreshWorkspace();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Staff create failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleLaunchObject = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusyAction("object-launch");
    setError("");

    try {
      const propertyResult = await apiRequest<{ item: Property }>("/api/properties", {
        method: "POST",
        token: session.token,
        body: {
          name: launchForm.propertyName,
          address: launchForm.address,
          totalArea: Number(launchForm.totalArea),
          rentableArea: Number(launchForm.rentableArea),
          warehouseClass: launchForm.warehouseClass,
          description: locale === "ru" ? "Создано мастером запуска объекта" : "Created by object launch wizard"
        }
      });

      const unitResult = await apiRequest<{ item: Unit }>("/api/units", {
        method: "POST",
        token: session.token,
        body: {
          propertyId: propertyResult.item.id,
          number: launchForm.unitNumber,
          floor: launchForm.floor,
          area: Number(launchForm.unitArea),
          type: launchForm.unitType,
          status: "vacant",
          temperatureRegime: launchForm.temperatureRegime,
          ceilingHeight: Number(launchForm.ceilingHeight || 0),
          hasRamp: true,
          hasGate: true
        }
      });

      const tenantResult = await apiRequest<{ item: Tenant }>("/api/tenants", {
        method: "POST",
        token: session.token,
        body: {
          name: launchForm.tenantName,
          inn: launchForm.inn,
          contactName: launchForm.contactName,
          phone: launchForm.phone,
          email: launchForm.email,
          riskLevel: launchForm.riskLevel
        }
      });

      const leaseResult = await apiRequest<{ item: Lease }>("/api/leases", {
        method: "POST",
        token: session.token,
        body: {
          tenantId: tenantResult.item.id,
          unitId: unitResult.item.id,
          contractNumber: launchForm.contractNumber,
          stage: "active",
          startDate: launchForm.startDate,
          endDate: launchForm.endDate,
          ratePerSqm: Number(launchForm.ratePerSqm),
          deposit: Number(launchForm.deposit || 0),
          indexationPct: 0
        }
      });

      resetLaunchForm();
      setSelectedPropertyId(propertyResult.item.id);
      setSelectedUnitId(unitResult.item.id);
      setSelectedTenantId(tenantResult.item.id);
      setNotice(locale === "ru" ? "Объект запущен: создан объект, помещение, арендатор и договор" : "Object launched");
      await refreshWorkspace();
      setManagerScreen("unit-detail");
      void leaseResult;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Object launch failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpSetup = async () => {
    if (!session) {
      return;
    }

    setBusyAction("totp-setup");
    setError("");

    try {
      const result = await apiRequest<{ secret: string; otpauthUrl: string }>("/api/auth/2fa/setup", {
        method: "POST",
        token: session.token
      });
      setTotpSetup({
        ...result,
        code: "",
        password: ""
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "2FA setup failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !totpSetup) {
      return;
    }

    setBusyAction("totp-confirm");
    setError("");

    try {
      const result = await apiRequest<{ user: SessionUser }>("/api/auth/2fa/confirm", {
        method: "POST",
        token: session.token,
        body: {
          code: totpSetup.code
        }
      });
      setSession({
        ...session,
        user: result.user
      });
      setTotpSetup(null);
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "2FA confirm failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpDisable = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !totpSetup) {
      return;
    }

    setBusyAction("totp-disable");
    setError("");

    try {
      const result = await apiRequest<{ user: SessionUser }>("/api/auth/2fa/disable", {
        method: "POST",
        token: session.token,
        body: {
          password: totpSetup.password,
          code: totpSetup.code
        }
      });
      setSession({
        ...session,
        user: result.user
      });
      setTotpSetup(null);
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "2FA disable failed");
    } finally {
      setBusyAction("");
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setOverview(null);
    setTickets([]);
    setTicketComments([]);
    setTenantDetail(null);
    setTenantOtpRequested(false);
    setManagerScreen("dashboard");
    setSelectedUnitId("");
    setTenantDetailTab("info");
    setSelectedChatTenantId("");
    setChatMessages([]);
    setChatDraft({
      content: ""
    });
    setStaffCreateForm({
      fullName: "",
      email: "",
      phone: "",
      password: "",
      role: "worker",
      propertyId: ""
    });
    setNotice("");
    setError("");
  };

  if (bootstrapping) {
    return <main className="loading-shell">{t.loading}</main>;
  }

  if (!session || !overview) {
    return (
      <main className="auth-shell auth-shell--mvp">
        <section className="login-card">
          <div className="login-head">
            <div className="login-brand">
              <div>
                <strong>{productBrand.name}</strong>
                <span>{productBrand.subtitle}</span>
              </div>
            </div>

            <div className="locale-switcher" role="group" aria-label={t.localeLabel}>
              <button
                className={locale === "ru" ? "locale-button locale-button--active" : "locale-button"}
                onClick={() => setLocale("ru")}
                type="button"
              >
                RU
              </button>
              <button
                className={locale === "en" ? "locale-button locale-button--active" : "locale-button"}
                onClick={() => setLocale("en")}
                type="button"
              >
                EN
              </button>
            </div>
          </div>

          <div className="login-title">
            <p>{authMode === "staff" ? t.auth.staffTitle : t.auth.tenantTitle}</p>
          </div>

          <div className="auth-tabs auth-tabs--mvp">
            <button
              className={authMode === "staff" ? "auth-tab auth-tab--active" : "auth-tab"}
              onClick={() => setAuthMode("staff")}
              type="button"
            >
              {t.auth.staffTab}
            </button>
            <button
              className={authMode === "tenant" ? "auth-tab auth-tab--active" : "auth-tab"}
              onClick={() => setAuthMode("tenant")}
              type="button"
            >
              {t.auth.tenantTab}
            </button>
          </div>

          {error ? <div className="banner banner--error">{error}</div> : null}
          {notice ? <div className="banner banner--notice">{notice}</div> : null}

          {authMode === "staff" ? (
            <>
              {staffAuthStep === "password" ? (
                <form className="auth-form" onSubmit={handleStaffLogin}>
                  <label>
                    <span>{t.auth.email}</span>
                    <input
                      name="email"
                      onChange={handleFieldChange(setStaffForm)}
                      placeholder="name@company.ru"
                      value={staffForm.email}
                    />
                  </label>
                  <label>
                    <span>{t.auth.password}</span>
                    <input
                      name="password"
                      onChange={handleFieldChange(setStaffForm)}
                      type="password"
                      value={staffForm.password}
                    />
                  </label>
                  <button className="primary-button" disabled={busyAction === "staff-login"} type="submit">
                    {t.auth.signIn}
                  </button>
                  <button
                    className="text-button text-button--neutral"
                    onClick={() => {
                      setResetForm((current) => ({ ...current, email: staffForm.email }));
                      setStaffAuthStep("reset-request");
                    }}
                    type="button"
                  >
                    {t.auth.forgotPassword}
                  </button>
                </form>
              ) : null}

              {staffAuthStep === "mfa" ? (
                <form className="auth-form" onSubmit={handleStaffMfaVerify}>
                  <label>
                    <span>{t.auth.mfaCode}</span>
                    <input
                      inputMode="numeric"
                      name="code"
                      onChange={handleFieldChange(setStaffMfaForm)}
                      value={staffMfaForm.code}
                    />
                  </label>
                  <button className="primary-button" disabled={busyAction === "staff-mfa"} type="submit">
                    {t.auth.verifyMfa}
                  </button>
                </form>
              ) : null}

              {staffAuthStep === "reset-request" ? (
                <form className="auth-form" onSubmit={handlePasswordResetRequest}>
                  <h2>{t.auth.resetTitle}</h2>
                  <p className="auth-inline-copy">{t.auth.resetHint}</p>
                  <label>
                    <span>{t.auth.email}</span>
                    <input name="email" onChange={handleFieldChange(setResetForm)} value={resetForm.email} />
                  </label>
                  <button className="primary-button" disabled={busyAction === "reset-request"} type="submit">
                    {t.auth.requestReset}
                  </button>
                  <button className="text-button text-button--neutral" onClick={() => setStaffAuthStep("password")} type="button">
                    {t.auth.backToLogin}
                  </button>
                </form>
              ) : null}

              {staffAuthStep === "reset-confirm" ? (
                <form className="auth-form" onSubmit={handlePasswordResetConfirm}>
                  <h2>{t.auth.resetTitle}</h2>
                  <label>
                    <span>{t.auth.resetCode}</span>
                    <input inputMode="numeric" name="code" onChange={handleFieldChange(setResetForm)} value={resetForm.code} />
                  </label>
                  <label>
                    <span>{t.auth.newPassword}</span>
                    <input name="password" onChange={handleFieldChange(setResetForm)} type="password" value={resetForm.password} />
                  </label>
                  <button className="primary-button" disabled={busyAction === "reset-confirm"} type="submit">
                    {t.auth.confirmReset}
                  </button>
                  <button className="text-button text-button--neutral" onClick={() => setStaffAuthStep("password")} type="button">
                    {t.auth.backToLogin}
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <>
              <div className="tenant-onboarding">
                <div>
                  <strong>{t.auth.tenantFirstTimeTitle}</strong>
                  <p>{t.auth.tenantFirstTimeText}</p>
                </div>
                <div className="tenant-channel-grid">
                  {(tenantOnboarding?.channels ?? []).map((channel) =>
                    channel.enabled && channel.url ? (
                      <a
                        className={`tenant-channel tenant-channel--${channel.id}`}
                        href={channel.url}
                        key={channel.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>{channel.label}</span>
                      </a>
                    ) : (
                      <span className="tenant-channel tenant-channel--disabled" key={channel.id}>
                        <span>{channel.label}</span>
                        <small>{t.auth.channelUnavailable}</small>
                      </span>
                    )
                  )}
                </div>
              </div>

              <form className="auth-form" onSubmit={tenantOtpRequested ? handleTenantVerify : handleTenantOtpRequest}>
                <label>
                  <span>{t.auth.phone}</span>
                  <input name="phone" onChange={handleFieldChange(setTenantForm)} value={tenantForm.phone} />
                </label>
                {tenantOtpRequested ? (
                  <label>
                    <span>{t.auth.otp}</span>
                    <input name="otp" onChange={handleFieldChange(setTenantForm)} value={tenantForm.otp} />
                  </label>
                ) : null}
                <button
                  className="primary-button"
                  disabled={busyAction === "tenant-request" || busyAction === "tenant-verify"}
                  type="submit"
                >
                  {tenantOtpRequested ? t.auth.verifyOtp : t.auth.requestOtp}
                </button>
              </form>
            </>
          )}

        </section>
      </main>
    );
  }

  const renderOverview = () => (
    <section className="section-grid overview-grid">
      <article className="surface surface--hero surface--wide">
        <div className="industrial-hero">
          <div className="industrial-hero-copy">
            <div className="section-label">{ui.overviewTag}</div>
            <h2>{sectionTitle}</h2>
          </div>

          <div className="metrics-grid">
            <div className="metric-panel">
              <span>{t.metrics.occupancy}</span>
              <strong>{overview.occupancyRate}%</strong>
              <small>{formatArea(overview.totals.occupied_area, locale)}</small>
            </div>
            <div className="metric-panel">
              <span>{ui.collectionRate}</span>
              <strong>{overview.finance.collectionRate}%</strong>
              <small>{formatCompactMoney(overview.finance.forecastQuarter, locale)}</small>
            </div>
            <div className="metric-panel metric-panel--alert">
              <span>{ui.arrears}</span>
              <strong>{formatCompactMoney(overview.finance.arrearsAmount, locale)}</strong>
              <small>{overview.expiringLeaseCount} {t.metrics.expiring.toLowerCase()}</small>
            </div>
            <div className="metric-panel">
              <span>{t.metrics.openTickets}</span>
              <strong>{openTicketCount}</strong>
              <small>{focusTickets.length} {ui.urgent.toLowerCase()}</small>
            </div>
            <div className="metric-panel">
              <span>{ui.noi}</span>
              <strong>{formatCompactMoney(overview.finance.noi, locale)}</strong>
              <small>{ui.opex}: {overview.finance.opexRatio}%</small>
            </div>
            <div className="metric-panel">
              <span>{ui.forecast}</span>
              <strong>{formatCompactMoney(overview.finance.forecastQuarter, locale)}</strong>
              <small>{t.metrics.activeLeases}: {overview.totals.active_lease_count}</small>
            </div>
          </div>
        </div>
      </article>

      {canManagePortfolio ? (
        <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.finance}</div>
            <h3>{ui.cashflow}</h3>
          </div>
        </div>
        <div className="finance-chart">
          {overview.finance.series.map((point) => (
            <div className="finance-bar" key={point.id}>
              <div className="finance-bar-track">
                <span className="finance-bar-fill finance-bar-fill--billed" style={{ height: `${Math.max(14, point.billed / 180000)}px` }} />
                <span
                  className="finance-bar-fill finance-bar-fill--forecast"
                  style={{ height: `${Math.max(14, point.forecast / 180000)}px` }}
                />
                <div className="finance-value">
                  <strong>{formatCompactMoney(point.forecast, locale)}</strong>
                  <span>{point.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="summary-strip">
          <div className="summary-chip">
            <span>{ui.collectionRate}</span>
            <strong>{overview.finance.collectionRate}%</strong>
          </div>
          <div className="summary-chip">
            <span>{ui.arrears}</span>
            <strong>{formatMoney(overview.finance.arrearsAmount, locale)}</strong>
          </div>
          <div className="summary-chip">
            <span>{ui.noi}</span>
            <strong>{formatMoney(overview.finance.noi, locale)}</strong>
          </div>
          <div className="summary-chip">
            <span>{ui.opex}</span>
            <strong>{overview.finance.opexRatio}%</strong>
          </div>
        </div>
        </article>
      ) : null}

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.notifications}</div>
            <h3>{ui.notifications}</h3>
          </div>
        </div>
        <div className="notification-stack">
          {criticalNotifications.length > 0 ? (
            criticalNotifications.map((item) => (
              <button
                className={`notification-card notification-card--${item.tone}`}
                key={item.id}
                onClick={() => void openNotification(item)}
                type="button"
              >
                <div className="notification-card-top">
                  <span className="notification-dot" />
                  <strong>{item.title}</strong>
                </div>
                <p>{item.message}</p>
                <small>{formatDateTime(item.createdAt, locale)}</small>
              </button>
            ))
          ) : (
            <div className="empty-state">{ui.noNotifications}</div>
          )}
        </div>
      </article>

      <article className="surface surface--board selection-stage" key={`overview-board-${selectedPropertyId}`}>
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.twin}</div>
            <h3>{selectedProperty?.name ?? t.sections.twin}</h3>
          </div>
          <div className="chip-row">
            {overview.properties.map((property) => (
              <button
                className={selectedPropertyId === property.id ? "chip-button chip-button--active" : "chip-button"}
                key={property.id}
                onClick={() => handlePropertySelect(property.id)}
                type="button"
              >
                {property.name}
              </button>
            ))}
          </div>
        </div>
        <p className="surface-copy">{t.hints.twin}</p>
        <div className="board-shell">
          {boardFloors.length > 0 ? (
            boardFloors.map((entry) => (
              <div className="board-floor" key={entry.floor}>
                <div className="board-floor-label">{entry.floor > 0 ? `${t.fields.floor} ${entry.floor}` : "G"}</div>
                <div className="board-floor-track">
                  {entry.units.map((unit) => {
                    const remainingDays = daysUntil(unit.leaseEndDate);
                    const tone =
                      unit.status === "maintenance"
                        ? "maintenance"
                        : unit.status === "vacant"
                          ? "vacant"
                          : remainingDays !== null && remainingDays <= 15
                            ? "critical"
                            : remainingDays !== null && remainingDays <= 45
                              ? "warning"
                              : "occupied";

                    return (
                      <article className={`board-unit board-unit--${tone}`} key={unit.id}>
                        <div className="board-unit-head">
                          <strong>{unit.number}</strong>
                          <span>{formatArea(unit.area, locale)}</span>
                        </div>
                        <p>{unit.tenantName ?? t.hints.noData}</p>
                        <small>
                          {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
                          {remainingDays !== null ? ` · ${remainingDays} дн.` : ""}
                        </small>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.watchlist}</div>
            <h3>{t.sections.watchlist}</h3>
          </div>
        </div>
        <div className="lease-rail">
          {leaseWatch.length > 0 ? (
            leaseWatch.map((lease) => {
              const remainingDays = daysUntil(lease.endDate);
              const tone =
                remainingDays !== null && remainingDays <= 15
                  ? "critical"
                  : remainingDays !== null && remainingDays <= 45
                    ? "warning"
                    : "calm";

              return (
                <article className={`lease-node lease-node--${tone}`} key={lease.id}>
                  <small>{lease.propertyName ?? "—"}</small>
                  <strong>{lease.contractNumber}</strong>
                  <p>
                    {lease.tenantName ?? "—"} · {lease.unitNumber ?? "—"}
                  </p>
                  <span>{formatDate(lease.endDate, locale)}</span>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.serviceFeed}</div>
            <h3>{isWorker ? (locale === "ru" ? "Мои заявки на обслуживание" : "My service jobs") : t.sections.serviceFeed}</h3>
          </div>
          <button className="secondary-button" onClick={() => setSelectedSection("service")} type="button">
            {t.nav.service}
          </button>
        </div>
        <div className="focus-grid">
          {focusTickets.length > 0 ? (
            focusTickets.map((ticket) => (
              <button
                className="focus-card"
                key={ticket.id}
                onClick={() => {
                  setSelectedSection("service");
                  setSelectedTicketId(ticket.id);
                }}
                type="button"
              >
                <div className="focus-card-top">
                  <span className={`priority-pill priority-pill--${ticket.priority}`}>
                    {t.ticketPriorities[ticket.priority as keyof typeof t.ticketPriorities]}
                  </span>
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}
                  </span>
                </div>
                <strong>{ticket.title}</strong>
                <p>
                  {ticket.number} · {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}
                </p>
                <small>{ticket.tenantName ?? t.hints.noData}</small>
              </button>
            ))
          ) : (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          )}
        </div>
      </article>

      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.portfolio}</div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="property-rail">
          {propertyOperations.map((property) => (
            <button
              className={selectedPropertyId === property.id ? "property-stat property-stat--active" : "property-stat"}
              key={property.id}
              onClick={() => {
                handlePropertySelect(property.id, "portfolio");
              }}
              type="button"
            >
              <div className="property-stat-head">
                <div>
                  <strong>{property.name}</strong>
                  <p>{property.address}</p>
                </div>
                <span>{property.warehouseClass}</span>
              </div>
              <div className="property-progress">
                <span style={{ width: `${Math.max(0, Math.min(property.occupancy, 100))}%` }} />
              </div>
              <div className="property-stat-meta">
                <small>{property.occupancy}% {t.metrics.occupancy.toLowerCase()}</small>
                <small>{property.openTicketCount} {t.metrics.openTickets.toLowerCase()}</small>
                <small>
                  {property.urgentTicketCount} {ui.urgent.toLowerCase()}
                </small>
              </div>
            </button>
          ))}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.team}</div>
            <h3>{ui.team}</h3>
          </div>
        </div>
        <div className="team-stack">
          {overview.team.length > 0 ? (
            overview.team.slice(0, 4).map((member) => (
              <div className="team-card" key={member.id}>
                <div className="team-card-top">
                  <strong>{member.fullName}</strong>
                  <span>{t.roles[member.role]}</span>
                </div>
                <p>{member.focus}</p>
                <small>
                  {ui.assigned}: {member.assignedTicketCount} · {ui.urgent}: {member.urgentTicketCount}
                </small>
              </div>
            ))
          ) : (
            <div className="empty-state">{ui.noTeam}</div>
          )}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.exports}</div>
            <h3>{ui.exports}</h3>
          </div>
        </div>
        <div className="export-stack">
          {overview.exports.length > 0 ? (
            overview.exports.map((item) => (
              <div className="export-card" key={item.id}>
                <div className="export-card-top">
                  <strong>{item.name}</strong>
                  <span className={`status-pill status-pill--${item.status}`}>{ui.exportStatus[item.status]}</span>
                </div>
                <p>{item.scope}</p>
                <small>{item.format} · {item.cadence}</small>
                <button className="secondary-button secondary-button--compact" onClick={() => void downloadExport(item.id)} type="button">
                  {managerUi.open}
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">{ui.noExports}</div>
          )}
        </div>
      </article>
    </section>
  );

  const renderPortfolio = () => (
    <section className="section-grid portfolio-grid">
      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.portfolio}</div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="property-grid">
          {propertySnapshots.map((property) => (
            <button
              className={selectedPropertyId === property.id ? "property-card property-card--active" : "property-card"}
              key={property.id}
              onClick={() => handlePropertySelect(property.id)}
              type="button"
            >
              <strong>{property.name}</strong>
              <p>{property.address}</p>
              <div className="property-meta">
                <span>{property.warehouseClass}</span>
                <span>{formatArea(property.rentableArea, locale)}</span>
                <span>{property.occupancy}%</span>
              </div>
            </button>
          ))}
        </div>
      </article>

      <article className="surface surface--wide selection-stage" key={`portfolio-tenants-${selectedPropertyId}`}>
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.tenantRegistry}</div>
            <h3>{ui.tenantRegistry}</h3>
          </div>
        </div>
        <div className="table-shell">
          <table className="industrial-table">
            <thead>
              <tr>
                <th>{ui.tenantRegistry}</th>
                <th>{t.fields.unit}</th>
                <th>{ui.monthlyRent}</th>
                <th>{ui.nextExpiry}</th>
                <th>{ui.paymentDiscipline}</th>
                <th>{t.metrics.openTickets}</th>
              </tr>
            </thead>
            <tbody>
              {propertyScopedTenantRows.map((tenant) => (
                <tr
                  className={selectedTenantId === tenant.id ? "table-row-active" : ""}
                  key={tenant.id}
                  onClick={() => setSelectedTenantId(tenant.id)}
                >
                  <td>
                    <strong>{tenant.name}</strong>
                    <small>{t.riskLevels[tenant.riskLevel as keyof typeof t.riskLevels]}</small>
                  </td>
                  <td>{tenant.unitLabel}</td>
                  <td>{formatCompactMoney(tenant.monthlyRent, locale)}</td>
                  <td>{formatDate(tenant.nextExpiry, locale)}</td>
                  <td>{tenant.paymentDiscipline}%</td>
                  <td>{tenant.openTicketCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {propertyScopedTenantRows.length === 0 ? <div className="empty-state">{t.hints.noData}</div> : null}
      </article>

      <article className="surface surface--wide selection-stage" key={`portfolio-detail-${selectedPropertyId}-${selectedTenantId}`}>
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.tenantPassport}</div>
            <h3>{tenantDetail?.tenant.name ?? selectedTenant?.name ?? ui.tenantPassport}</h3>
          </div>
        </div>

        {tenantDetailBusy ? (
          <div className="empty-state">{t.loading}</div>
        ) : tenantDetail ? (
          <div className="tenant-detail-shell">
            <div className="tenant-summary-grid">
              <div className="summary-tile">
                <span>{t.fields.area}</span>
                <strong>{formatArea(tenantDetail.summary.totalArea, locale)}</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.monthlyRent}</span>
                <strong>{formatCompactMoney(tenantDetail.summary.monthlyRent, locale)}</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.paymentDiscipline}</span>
                <strong>{tenantDetail.summary.paymentDiscipline}%</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.arrears}</span>
                <strong>{formatCompactMoney(tenantDetail.summary.arrearsAmount, locale)}</strong>
              </div>
              <div className="summary-tile">
                <span>{t.metrics.openTickets}</span>
                <strong>{tenantDetail.summary.openTicketCount}</strong>
              </div>
              <div className="summary-tile">
                <span>{ui.nextExpiry}</span>
                <strong>{formatDate(tenantDetail.summary.nextExpiry, locale)}</strong>
              </div>
            </div>

            <div className="tenant-detail-grid">
              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.payments}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.payments.map((payment) => (
                    <div className="list-row" key={payment.id}>
                      <div>
                        <strong>{payment.period}</strong>
                        <p>{formatMoney(payment.amount, locale)} · {payment.method}</p>
                      </div>
                      <div className="list-aside">
                        <span className={`status-pill status-pill--${payment.status}`}>
                          {ui.paymentStatus[payment.status as PaymentStatus]}
                        </span>
                        <small>{formatDate(payment.paidDate ?? payment.dueDate, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.meters}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.meters.map((meter) => (
                    <div className="list-row" key={meter.id}>
                      <div>
                        <strong>{meter.name}</strong>
                        <p>{meter.unitNumber} · {meter.lastValue}</p>
                      </div>
                      <div className="list-aside">
                        <span className={`status-pill status-pill--${meter.status}`}>{meter.deltaPct}%</span>
                        <small>{formatDateTime(meter.updatedAt, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.notes}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.notes.map((note) => (
                    <div className="list-row list-row--stacked" key={note.id}>
                      <div>
                        <strong>{note.title}</strong>
                        <p>{note.content}</p>
                      </div>
                      <div className="list-aside">
                        <span>{note.authorName}</span>
                        <small>{formatDateTime(note.createdAt, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card-head">
                  <strong>{ui.risks}</strong>
                </div>
                <div className="stack-list">
                  {tenantDetail.risks.map((risk) => (
                    <div className="list-row" key={risk.id}>
                      <div>
                        <strong>{risk.title}</strong>
                        <p>{risk.owner}</p>
                      </div>
                      <div className="list-aside">
                        <span className={`status-pill status-pill--${risk.severity}`}>
                          {ui.riskSeverity[risk.severity]}
                        </span>
                        <small>{formatDate(risk.dueDate, locale)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="empty-state">{ui.emptyTenant}</div>
        )}
      </article>

      <article className="surface surface--wide selection-stage" key={`portfolio-units-${selectedPropertyId}`}>
        <div className="surface-head">
          <div>
            <div className="section-label">{t.fields.unit}</div>
            <h3>{t.sectionHeads.portfolio}</h3>
          </div>
        </div>
        <div className="stack-list">
          {propertyScopedUnits.length > 0 ? (
            propertyScopedUnits.map((unit) => (
              <div className="list-row" key={unit.id}>
                <div>
                  <strong>
                    {unit.propertyName ?? "—"} · {unit.number}
                  </strong>
                  <p>
                    {t.unitTypes[unit.type as keyof typeof t.unitTypes]} · {formatArea(unit.area, locale)} ·{" "}
                    {unit.tenantName ?? t.hints.noData}
                  </p>
                </div>
                <div className="list-aside">
                  <span className={`status-pill status-pill--${unit.status}`}>
                    {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
                  </span>
                  <small>{unit.temperatureRegime || "—"}</small>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>
    </section>
  );

  const renderLeases = () => (
    <section className="section-grid">
      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.leases}</div>
            <h3>{t.sectionHeads.leases}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.leases.map((lease) => (
            <div className="list-row" key={lease.id}>
              <div>
                <strong>{lease.contractNumber}</strong>
                <p>
                  {lease.tenantName ?? "—"} · {lease.propertyName ?? "—"} · {lease.unitNumber ?? "—"}
                </p>
                <button className="secondary-button secondary-button--compact" onClick={() => void loadLeaseDocuments(lease)} type="button">
                  {t.fields.document}
                </button>
              </div>
              <div className="list-aside">
                <span className={`status-pill status-pill--${lease.stage}`}>
                  {t.leaseStages[lease.stage as keyof typeof t.leaseStages]}
                </span>
                <small>{formatDate(lease.endDate, locale)}</small>
              </div>
            </div>
          ))}
        </div>
      </article>

      {isTenant ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <div className="section-label">{locale === "ru" ? "Оплата" : "Payment"}</div>
              <h3>{locale === "ru" ? "Отправить оплату на проверку" : "Send payment for review"}</h3>
            </div>
          </div>
          <form className="form-grid form-grid--single" onSubmit={handlePaymentProofSubmit}>
            <label>
              <span>{t.fields.contractNumber}</span>
              <select name="leaseId" onChange={handleFieldChange(setPaymentProofForm)} value={paymentProofForm.leaseId}>
                {overview.leases.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.contractNumber} · {lease.unitNumber ?? "—"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{locale === "ru" ? "Сумма" : "Amount"}</span>
              <input name="amount" onChange={handleFieldChange(setPaymentProofForm)} type="number" value={paymentProofForm.amount} />
            </label>
            <label>
              <span>{locale === "ru" ? "Дата оплаты" : "Paid at"}</span>
              <input name="paidAt" onChange={handleFieldChange(setPaymentProofForm)} type="date" value={paymentProofForm.paidAt} />
            </label>
            <label>
              <span>{locale === "ru" ? "Номер платежки / комментарий" : "Payment reference / comment"}</span>
              <input name="reference" onChange={handleFieldChange(setPaymentProofForm)} value={paymentProofForm.reference} />
            </label>
            <label className={paymentProofFile ? "document-upload document-upload--ready" : "document-upload"}>
              <span>{locale === "ru" ? "Чек, платежка или скрин" : "Receipt, payment order, or screenshot"}</span>
              <select
                className="document-category-select"
                onChange={(event) => setDocumentUploadCategory(event.target.value as (typeof documentCategoryOptions)[number])}
                value={documentUploadCategory}
              >
                {documentCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {getDocumentCategoryLabel(category)}
                  </option>
                ))}
              </select>
              <span className="file-picker-control">
                <span className="file-picker-button">{paymentProofFile ? (locale === "ru" ? "Заменить файл" : "Replace file") : (locale === "ru" ? "Прикрепить файл" : "Attach file")}</span>
                <span className="file-picker-name">{paymentProofFile ? paymentProofFile.name : (locale === "ru" ? "Файл не выбран" : "No file selected")}</span>
              </span>
              <input
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
                onChange={(event) => {
                  setPaymentProofFile(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            {paymentProofFile ? (
              <div className="file-picked-summary">
                <span>{getFileKind(paymentProofFile.name)}</span>
                <strong>{paymentProofFile.name}</strong>
                <button className="text-button" onClick={() => setPaymentProofFile(null)} type="button">
                  {t.actions.delete}
                </button>
              </div>
            ) : null}
            <button className="primary-button" disabled={busyAction === "payment-proof"} type="submit">
              {locale === "ru" ? "Отправить менеджеру" : "Send to manager"}
            </button>
          </form>
        </article>
      ) : canManagePortfolio ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <div className="section-label">{ui.finance}</div>
              <h3>{ui.finance}</h3>
            </div>
          </div>
          <div className="summary-strip summary-strip--vertical">
            <div className="summary-chip">
              <span>{ui.collectionRate}</span>
              <strong>{overview.finance.collectionRate}%</strong>
            </div>
            <div className="summary-chip">
              <span>{ui.arrears}</span>
              <strong>{formatCompactMoney(overview.finance.arrearsAmount, locale)}</strong>
            </div>
            <div className="summary-chip">
              <span>{ui.noi}</span>
              <strong>{formatCompactMoney(overview.finance.noi, locale)}</strong>
            </div>
            <div className="summary-chip">
              <span>{ui.forecast}</span>
              <strong>{formatCompactMoney(overview.finance.forecastQuarter, locale)}</strong>
            </div>
          </div>
        </article>
      ) : null}

      {canManagePortfolio ? (
      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.exports}</div>
            <h3>{ui.exports}</h3>
          </div>
        </div>
        <div className="table-shell">
          <table className="industrial-table">
            <thead>
              <tr>
                <th>{ui.exports}</th>
                <th>{ui.scope}</th>
                <th>{ui.cadence}</th>
                <th>Status</th>
                <th>{locale === "ru" ? "Обновлено" : "Updated"}</th>
                <th>{t.fields.document}</th>
              </tr>
            </thead>
            <tbody>
              {overview.exports.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>{item.format}</small>
                  </td>
                  <td>{item.scope}</td>
                  <td>{item.cadence}</td>
                  <td>
                    <span className={`status-pill status-pill--${item.status}`}>{ui.exportStatus[item.status]}</span>
                  </td>
                  <td>{formatDateTime(item.updatedAt, locale)}</td>
                  <td>
                    <button className="secondary-button secondary-button--compact" onClick={() => void downloadExport(item.id)} type="button">
                      {managerUi.open}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      ) : null}

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.watchlist}</div>
            <h3>{t.sections.watchlist}</h3>
          </div>
        </div>
        <div className="lease-rail">
          {leaseWatch.length > 0 ? (
            leaseWatch.map((lease) => {
              const remainingDays = daysUntil(lease.endDate);
              const tone =
                remainingDays !== null && remainingDays <= 15
                  ? "critical"
                  : remainingDays !== null && remainingDays <= 45
                    ? "warning"
                    : "calm";

              return (
                <article className={`lease-node lease-node--${tone}`} key={lease.id}>
                  <small>{lease.propertyName ?? "—"}</small>
                  <strong>{lease.contractNumber}</strong>
                  <p>
                    {lease.tenantName ?? "—"} · {lease.unitNumber ?? "—"}
                  </p>
                  <span>{formatDate(lease.endDate, locale)}</span>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{t.hints.noData}</div>
          )}
        </div>
      </article>
    </section>
  );

  const renderService = () => (
    <section className="section-grid service-grid">
      {!isWorker ? (
      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.ticketCreate}</div>
            <h3>{t.sections.ticketCreate}</h3>
          </div>
        </div>
        <form className="form-grid form-grid--single" onSubmit={handleCreateTicket}>
          <label>
            <span>{t.fields.unit}</span>
            <select name="unitId" onChange={handleFieldChange(setTicketForm)} value={ticketForm.unitId}>
              {ticketUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.propertyName} · {unit.number}
                </option>
              ))}
            </select>
          </label>
          <div className="split-grid">
            <label>
              <span>{t.fields.category}</span>
              <select name="category" onChange={handleFieldChange(setTicketForm)} value={ticketForm.category}>
                {ticketCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {t.ticketCategories[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.fields.priority}</span>
              <select name="priority" onChange={handleFieldChange(setTicketForm)} value={ticketForm.priority}>
                {ticketPriorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {t.ticketPriorities[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedChecklistTemplate ? (
            <div className="checklist-template-preview">
              <strong>{locale === "ru" ? "Шаблон чек-листа" : "Checklist template"}</strong>
              {selectedChecklistTemplate.items.map((item) => (
                <span key={item.id}>{item.label}</span>
              ))}
            </div>
          ) : null}
          <label>
            <span>{t.fields.title}</span>
            <input name="title" onChange={handleFieldChange(setTicketForm)} value={ticketForm.title} />
          </label>
          <label>
            <span>{t.fields.description}</span>
            <textarea
              name="description"
              onChange={handleFieldChange(setTicketForm)}
              rows={5}
              value={ticketForm.description}
            />
          </label>
          <button className="primary-button" disabled={busyAction === "ticket-create"} type="submit">
            {t.actions.create}
          </button>
        </form>
      </article>
      ) : null}

      <article className="surface">
          <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.serviceFeed}</div>
            <h3>{isWorker ? (locale === "ru" ? "Мои заявки на обслуживание" : "My service jobs") : t.sections.serviceFeed}</h3>
          </div>
          <select
            className="filter-select"
            onChange={(event) => setTicketFilter(event.target.value as TicketFilter)}
            value={ticketFilter}
          >
            <option value="all">{locale === "ru" ? "Все статусы" : "All"}</option>
            {ticketStatusOptions.map((status) => (
              <option key={status} value={status}>
                {t.ticketStatuses[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="ticket-list">
          {filteredTickets.length > 0 ? (
            filteredTickets.map((ticket) => (
              <button
                className={selectedTicketId === ticket.id ? "ticket-card ticket-card--active" : "ticket-card"}
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                type="button"
              >
                <div className="ticket-card-top">
                  <span className={`priority-pill priority-pill--${ticket.priority}`}>
                    {t.ticketPriorities[ticket.priority as keyof typeof t.ticketPriorities]}
                  </span>
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}
                  </span>
                </div>
                <strong>{ticket.title}</strong>
                <p>
                  {ticket.number} · {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}
                </p>
                <small>
                  {isWorker ? formatDate(ticket.updatedAt, locale) : `${ticket.tenantName ?? t.hints.noData} · ${formatDate(ticket.updatedAt, locale)}`}
                </small>
              </button>
            ))
          ) : (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          )}
        </div>
      </article>

      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.sections.ticketDetail}</div>
            <h3>{selectedTicket?.title ?? t.sections.ticketDetail}</h3>
          </div>
        </div>

        {selectedTicket ? (
          <div className="ticket-detail">
            <div className="detail-grid">
              <div>
                <strong>{selectedTicket.number}</strong>
                <p>{selectedTicket.description}</p>
              </div>
              <div className="detail-meta">
                <span>{selectedTicket.propertyName ?? "—"}</span>
                <span>{selectedTicket.unitNumber ?? "—"}</span>
                {!isWorker ? <span>{selectedTicket.tenantName ?? "—"}</span> : null}
                {!isWorker ? <span>{selectedTicket.createdByName ?? "—"}</span> : null}
                <span>{selectedTicket.assignedToName ?? "—"}</span>
              </div>
            </div>

            {canUpdateTickets ? (
              <form className="inline-form" onSubmit={handleUpdateTicket}>
                <label>
                  <span>{t.fields.status}</span>
                  <select onChange={(event) => setTicketStatusDraft(event.target.value)} value={ticketStatusDraft}>
                    {(isWorker ? ticketStatusOptions.filter((status) => ["in_progress", "completed"].includes(status)) : ticketStatusOptions).map((status) => (
                      <option key={status} value={status}>
                        {t.ticketStatuses[status]}
                      </option>
                    ))}
                  </select>
                </label>
                {canAssignTickets ? (
                  <label>
                    <span>{locale === "ru" ? "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c" : "Assignee"}</span>
                    <select onChange={(event) => setTicketAssigneeDraft(event.target.value)} value={ticketAssigneeDraft}>
                      <option value="">{locale === "ru" ? "\u041d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d" : "Unassigned"}</option>
                      {ticketAssigneeOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="secondary-button" disabled={busyAction === "ticket-update"} type="submit">
                  {t.actions.updateStatus}
                </button>
              </form>
            ) : null}
            {isTenant && ["new", "accepted", "waiting_tenant"].includes(selectedTicket.status) ? (
              <button
                className="secondary-button"
                disabled={busyAction === `ticket-cancel-${selectedTicket.id}`}
                onClick={() => void handleCancelTicket(selectedTicket)}
                type="button"
              >
                {locale === "ru" ? "Отменить заявку" : "Cancel ticket"}
              </button>
            ) : null}

            {renderTicketOperationsBlock(selectedTicket)}
            {renderTicketAttachmentBlock(selectedTicket)}

            <div className="comment-block">
              <h4>{t.fields.content}</h4>
              <div className="comment-list">
                {ticketComments.length > 0 ? (
                  ticketComments.map((comment) => (
                    <div className="comment-card" key={comment.id}>
                      <div className="comment-meta">
                        <strong>{comment.authorName ?? "—"}</strong>
                        <span>{formatDateTime(comment.createdAt, locale)}</span>
                      </div>
                      <p>{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">{t.hints.commentEmpty}</div>
                )}
              </div>
              <form className="comment-form" onSubmit={handleCommentSubmit}>
                <textarea
                  name="content"
                  onChange={handleFieldChange(setCommentForm)}
                  rows={4}
                  value={commentForm.content}
                />
                <button className="primary-button" disabled={busyAction === "ticket-comment"} type="submit">
                  {t.actions.addComment}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="empty-state">{t.hints.ticketEmpty}</div>
        )}
      </article>

      {!isWorker ? (
        <article className="surface">
          <div className="surface-head">
            <div>
              <div className="section-label">{ui.notifications}</div>
              <h3>{ui.notifications}</h3>
            </div>
          </div>
          <div className="notification-stack">
            {overview.notifications.length > 0 ? (
              overview.notifications.map((item) => (
                <button
                  className={`notification-card notification-card--${item.tone}`}
                  key={item.id}
                  onClick={() => void openNotification(item)}
                  type="button"
                >
                  <div className="notification-card-top">
                    <span className="notification-dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.message}</p>
                  <small>{formatDateTime(item.createdAt, locale)}</small>
                </button>
              ))
            ) : (
              <div className="empty-state">{ui.noNotifications}</div>
            )}
          </div>
        </article>
      ) : null}
    </section>
  );

  const renderAdminRegistry = () => {
    if (adminPanel === "property") {
      return overview.properties.map((property) => (
        <div className="list-row" key={property.id}>
          <div>
            <strong>{property.name}</strong>
            <p>
              {property.address} · {property.warehouseClass}
            </p>
          </div>
          <div className="list-aside">
            <span>{property.rentableArea} м²</span>
            <button className="text-button" onClick={() => startEditProperty(property)} type="button">
              {adminEditLabel}
            </button>
            <button className="text-button" onClick={() => handleDelete(`/api/properties/${property.id}`)} type="button">
              {t.actions.delete}
            </button>
          </div>
        </div>
      ));
    }

    if (adminPanel === "tenant") {
      return overview.tenants.map((tenant) => (
        <div className="list-row" key={tenant.id}>
          <div>
            <strong>{tenant.name}</strong>
            <p>
              {tenant.contactName} · {t.riskLevels[tenant.riskLevel as keyof typeof t.riskLevels]}
            </p>
          </div>
          <div className="list-aside">
            <span>{tenant.leaseCount}</span>
            <button className="text-button" onClick={() => startEditTenant(tenant)} type="button">
              {adminEditLabel}
            </button>
            <button className="text-button" onClick={() => handleDelete(`/api/tenants/${tenant.id}`)} type="button">
              {t.actions.delete}
            </button>
          </div>
        </div>
      ));
    }

    if (adminPanel === "unit") {
      return overview.units.map((unit) => (
        <div className="list-row" key={unit.id}>
          <div>
            <strong>
              {unit.propertyName} · {unit.number}
            </strong>
            <p>
              {t.unitTypes[unit.type as keyof typeof t.unitTypes]} · {unit.area} м²
            </p>
          </div>
          <div className="list-aside">
            <span className={`status-pill status-pill--${unit.status}`}>
              {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
            </span>
            <button className="text-button" onClick={() => startEditUnit(unit)} type="button">
              {adminEditLabel}
            </button>
            <button className="text-button" onClick={() => handleDelete(`/api/units/${unit.id}`)} type="button">
              {t.actions.delete}
            </button>
          </div>
        </div>
      ));
    }

    return overview.leases.map((lease) => (
      <div className="list-row" key={lease.id}>
        <div>
          <strong>{lease.contractNumber}</strong>
          <p>
            {lease.tenantName} · {lease.unitNumber}
          </p>
        </div>
        <div className="list-aside">
          <span>{t.leaseStages[lease.stage as keyof typeof t.leaseStages]}</span>
          <button className="text-button" onClick={() => startEditLease(lease)} type="button">
            {adminEditLabel}
          </button>
          <button className="text-button" onClick={() => handleDelete(`/api/leases/${lease.id}`)} type="button">
            {t.actions.delete}
          </button>
        </div>
      </div>
    ));
  };

  const renderAdminForm = () => {
    if (adminPanel === "property") {
      return (
        <form
          className="form-grid"
          onSubmit={(event) =>
            submitAdminSave(
              event,
              "property",
              "/api/properties",
              {
                ...propertyForm,
                totalArea: Number(propertyForm.totalArea),
                rentableArea: Number(propertyForm.rentableArea)
              },
              resetPropertyForm
            )
          }
        >
          <label>
            <span>{t.fields.name}</span>
            <input name="name" onChange={handleFieldChange(setPropertyForm)} value={propertyForm.name} />
          </label>
          <label>
            <span>{t.fields.address}</span>
            <input name="address" onChange={handleFieldChange(setPropertyForm)} value={propertyForm.address} />
          </label>
          <label>
            <span>{t.fields.totalArea}</span>
            <input name="totalArea" onChange={handleFieldChange(setPropertyForm)} type="number" value={propertyForm.totalArea} />
          </label>
          <label>
            <span>{t.fields.rentableArea}</span>
            <input
              name="rentableArea"
              onChange={handleFieldChange(setPropertyForm)}
              type="number"
              value={propertyForm.rentableArea}
            />
          </label>
          <label>
            <span>{t.fields.warehouseClass}</span>
            <select
              name="warehouseClass"
              onChange={handleFieldChange(setPropertyForm)}
              value={propertyForm.warehouseClass}
            >
              {t.warehouseClasses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="full-width">
            <span>{t.fields.description}</span>
            <textarea
              name="description"
              onChange={handleFieldChange(setPropertyForm)}
              rows={4}
              value={propertyForm.description}
            />
          </label>
          <button className="primary-button" disabled={busyAction.startsWith("/api/properties")} type="submit">
            {editingAdmin.property ? adminSaveChangesLabel : t.actions.save}
          </button>
          {editingAdmin.property ? (
            <button className="secondary-button" onClick={() => cancelAdminEdit("property")} type="button">
              {adminCancelLabel}
            </button>
          ) : null}
        </form>
      );
    }

    if (adminPanel === "tenant") {
      return (
        <form
          className="form-grid"
          onSubmit={(event) =>
            submitAdminSave(event, "tenant", "/api/tenants", tenantCreateForm, resetTenantCreateForm)
          }
        >
          <label>
            <span>{t.fields.name}</span>
            <input name="name" onChange={handleFieldChange(setTenantCreateForm)} value={tenantCreateForm.name} />
          </label>
          <label>
            <span>{t.fields.inn}</span>
            <input name="inn" onChange={handleFieldChange(setTenantCreateForm)} value={tenantCreateForm.inn} />
          </label>
          <label>
            <span>{t.fields.contactName}</span>
            <input
              name="contactName"
              onChange={handleFieldChange(setTenantCreateForm)}
              value={tenantCreateForm.contactName}
            />
          </label>
          <label>
            <span>{t.fields.phone}</span>
            <input name="phone" onChange={handleFieldChange(setTenantCreateForm)} value={tenantCreateForm.phone} />
          </label>
          <label>
            <span>{t.fields.email}</span>
            <input name="email" onChange={handleFieldChange(setTenantCreateForm)} value={tenantCreateForm.email} />
          </label>
          <label>
            <span>{t.fields.riskLevel}</span>
            <select name="riskLevel" onChange={handleFieldChange(setTenantCreateForm)} value={tenantCreateForm.riskLevel}>
              {riskLevelOptions.map((option) => (
                <option key={option} value={option}>
                  {t.riskLevels[option]}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busyAction.startsWith("/api/tenants")} type="submit">
            {editingAdmin.tenant ? adminSaveChangesLabel : t.actions.save}
          </button>
          {editingAdmin.tenant ? (
            <button className="secondary-button" onClick={() => cancelAdminEdit("tenant")} type="button">
              {adminCancelLabel}
            </button>
          ) : null}
        </form>
      );
    }

    if (adminPanel === "unit") {
      return (
        <form
          className="form-grid"
          onSubmit={(event) =>
            submitAdminSave(
              event,
              "unit",
              "/api/units",
              {
                ...unitForm,
                floor: Number(unitForm.floor),
                area: Number(unitForm.area),
                ceilingHeight: Number(unitForm.ceilingHeight || 0)
              },
              resetUnitForm
            )
          }
        >
          <label>
            <span>{t.fields.property}</span>
            <select name="propertyId" onChange={handleFieldChange(setUnitForm)} value={unitForm.propertyId}>
              {overview.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.fields.number}</span>
            <input name="number" onChange={handleFieldChange(setUnitForm)} value={unitForm.number} />
          </label>
          <label>
            <span>{t.fields.floor}</span>
            <input name="floor" onChange={handleFieldChange(setUnitForm)} type="number" value={unitForm.floor} />
          </label>
          <label>
            <span>{t.fields.area}</span>
            <input name="area" onChange={handleFieldChange(setUnitForm)} type="number" value={unitForm.area} />
          </label>
          <label>
            <span>{t.fields.type}</span>
            <select name="type" onChange={handleFieldChange(setUnitForm)} value={unitForm.type}>
              {unitTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {t.unitTypes[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.fields.status}</span>
            <select name="status" onChange={handleFieldChange(setUnitForm)} value={unitForm.status}>
              {unitStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {t.unitStatuses[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.fields.temperatureRegime}</span>
            <input name="temperatureRegime" onChange={handleFieldChange(setUnitForm)} value={unitForm.temperatureRegime} />
          </label>
          <label>
            <span>{t.fields.ceilingHeight}</span>
            <input
              name="ceilingHeight"
              onChange={handleFieldChange(setUnitForm)}
              type="number"
              value={unitForm.ceilingHeight}
            />
          </label>
          <label className="checkbox">
            <input checked={unitForm.hasRamp} name="hasRamp" onChange={handleFieldChange(setUnitForm)} type="checkbox" />
            <span>{t.fields.hasRamp}</span>
          </label>
          <label className="checkbox">
            <input checked={unitForm.hasGate} name="hasGate" onChange={handleFieldChange(setUnitForm)} type="checkbox" />
            <span>{t.fields.hasGate}</span>
          </label>
          <button className="primary-button" disabled={busyAction.startsWith("/api/units")} type="submit">
            {editingAdmin.unit ? adminSaveChangesLabel : t.actions.save}
          </button>
          {editingAdmin.unit ? (
            <button className="secondary-button" onClick={() => cancelAdminEdit("unit")} type="button">
              {adminCancelLabel}
            </button>
          ) : null}
        </form>
      );
    }

    const editingLease = overview.leases.find((lease) => lease.id === editingAdmin.lease) ?? null;
    const availableLeaseUnits = overview.units.filter(
      (unit) => !unit.leaseStage || unit.leaseStage === "terminated" || unit.id === editingLease?.unitId
    );

    return (
      <form
        className="form-grid"
        onSubmit={(event) =>
          submitAdminSave(
            event,
            "lease",
            "/api/leases",
            {
              ...leaseForm,
              ratePerSqm: Number(leaseForm.ratePerSqm),
              deposit: Number(leaseForm.deposit),
              indexationPct: Number(leaseForm.indexationPct)
            },
            resetLeaseForm
          )
        }
      >
        <label>
          <span>{t.fields.tenant}</span>
          <select name="tenantId" onChange={handleFieldChange(setLeaseForm)} value={leaseForm.tenantId}>
            {overview.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.fields.unit}</span>
          <select name="unitId" onChange={handleFieldChange(setLeaseForm)} value={leaseForm.unitId}>
            {availableLeaseUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} · {unit.number}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.fields.contractNumber}</span>
          <input name="contractNumber" onChange={handleFieldChange(setLeaseForm)} value={leaseForm.contractNumber} />
        </label>
        <label>
          <span>{t.fields.stage}</span>
          <select name="stage" onChange={handleFieldChange(setLeaseForm)} value={leaseForm.stage}>
            {leaseStageOptions.map((option) => (
              <option key={option} value={option}>
                {t.leaseStages[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.fields.startDate}</span>
          <input name="startDate" onChange={handleFieldChange(setLeaseForm)} type="date" value={leaseForm.startDate} />
        </label>
        <label>
          <span>{t.fields.endDate}</span>
          <input name="endDate" onChange={handleFieldChange(setLeaseForm)} type="date" value={leaseForm.endDate} />
        </label>
        <label>
          <span>{t.fields.ratePerSqm}</span>
          <input name="ratePerSqm" onChange={handleFieldChange(setLeaseForm)} type="number" value={leaseForm.ratePerSqm} />
        </label>
        <label>
          <span>{t.fields.deposit}</span>
          <input name="deposit" onChange={handleFieldChange(setLeaseForm)} type="number" value={leaseForm.deposit} />
        </label>
        <label>
          <span>{t.fields.indexationPct}</span>
          <input
            name="indexationPct"
            onChange={handleFieldChange(setLeaseForm)}
            type="number"
            value={leaseForm.indexationPct}
          />
        </label>
        <button className="primary-button" disabled={busyAction.startsWith("/api/leases")} type="submit">
          {editingAdmin.lease ? adminSaveChangesLabel : t.actions.save}
        </button>
        {editingAdmin.lease ? (
          <button className="secondary-button" onClick={() => cancelAdminEdit("lease")} type="button">
            {adminCancelLabel}
          </button>
        ) : null}
      </form>
    );
  };

  const renderAdmin = () => (
    <section className="section-grid admin-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.admin}</div>
            <h3>{t.sectionHeads.admin}</h3>
          </div>
        </div>
        <div className="chip-row">
          {(["property", "tenant", "unit", "lease"] as const).map((panel) => (
            <button
              className={adminPanel === panel ? "chip-button chip-button--active" : "chip-button"}
              key={panel}
              onClick={() => setAdminPanel(panel)}
              type="button"
            >
              {panel === "property"
                ? t.sections.propertyForm
                : panel === "tenant"
                  ? t.sections.tenantForm
                  : panel === "unit"
                    ? t.sections.unitForm
                    : t.sections.leaseForm}
            </button>
          ))}
        </div>
        {renderAdminForm()}
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.admin}</div>
            <h3>{t.sectionHeads.admin}</h3>
          </div>
        </div>
        <div className="stack-list">{renderAdminRegistry()}</div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.team}</div>
            <h3>{ui.team}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.team.map((member) => (
            <div className="list-row" key={member.id}>
              <div>
                <strong>{member.fullName}</strong>
                <p>
                  {t.roles[member.role]} · {member.propertyName ?? productBrand.name}
                </p>
              </div>
              <div className="list-aside">
                <span>{member.assignedTicketCount}</span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{ui.exports}</div>
            <h3>{ui.exports}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.exports.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.scope} · {item.format}
                </p>
              </div>
              <div className="list-aside">
                <span className={`status-pill status-pill--${item.status}`}>{ui.exportStatus[item.status]}</span>
                <small>{formatDateTime(item.updatedAt, locale)}</small>
                <button className="secondary-button secondary-button--compact" onClick={() => void downloadExport(item.id)} type="button">
                  {managerUi.open}
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );

  const activeManagerNav = (() => {
    if (managerScreen === "tenant-detail" || managerScreen === "tenant-add") {
      return "tenants";
    }

    if (managerScreen === "property-add" || managerScreen === "object-launch") {
      return "objects";
    }

    if (managerScreen === "unit-detail" || managerScreen === "unit-add") {
      return "units";
    }

    if (managerScreen === "lease-add") {
      return "leases";
    }

    if (managerScreen === "ticket-detail" || managerScreen === "ticket-create") {
      return "tickets";
    }

    if (managerScreen === "staff-add") {
      return "staff";
    }

    return managerScreen;
  })();

  const renderManagerDashboard = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.dashboard}</h2>
          <p>{managerUi.subtitles.dashboard}</p>
        </div>
      </div>

      <div className="mvp-metrics">
        <article className="mvp-metric">
          <span>{t.metrics.occupancy}</span>
          <strong>{overview.occupancyRate}%</strong>
          <small>{formatArea(overview.totals.occupied_area, locale)}</small>
        </article>
        <article className="mvp-metric">
          <span>{ui.collectionRate}</span>
          <strong>{overview.finance.collectionRate}%</strong>
          <small>{formatCompactMoney(overview.finance.forecastQuarter, locale)}</small>
        </article>
        <article className="mvp-metric">
          <span>{ui.arrears}</span>
          <strong>{formatCompactMoney(overview.finance.arrearsAmount, locale)}</strong>
          <small>{overview.expiringLeaseCount} {t.metrics.expiring.toLowerCase()}</small>
        </article>
        <article className="mvp-metric">
          <span>{t.metrics.openTickets}</span>
          <strong>{openTicketCount}</strong>
          <small>{focusTickets.length} {ui.urgent.toLowerCase()}</small>
        </article>
        <article className="mvp-metric">
          <span>{ui.opex}</span>
          <strong>{overview.finance.opexRatio}%</strong>
          <small>{ui.noi}: {formatCompactMoney(overview.finance.noi, locale)}</small>
        </article>
        <article className="mvp-metric">
          <span>{ui.forecast}</span>
          <strong>{formatCompactMoney(overview.finance.forecastQuarter, locale)}</strong>
          <small>{t.metrics.activeLeases}: {overview.totals.active_lease_count}</small>
        </article>
      </div>

      <div className="mvp-grid mvp-grid--dashboard">
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{ui.finance}</div>
              <h3>{ui.cashflow}</h3>
            </div>
          </div>
          <div className="finance-chart">
            {overview.finance.series.map((point) => (
              <div className="finance-bar" key={point.id}>
                <div className="finance-bar-track">
                  <span className="finance-bar-fill finance-bar-fill--billed" style={{ height: `${Math.max(14, point.billed / 180000)}px` }} />
                  <span
                    className="finance-bar-fill finance-bar-fill--forecast"
                    style={{ height: `${Math.max(14, point.forecast / 180000)}px` }}
                  />
                  <div className="finance-value">
                    <strong>{formatCompactMoney(point.forecast, locale)}</strong>
                    <span>{point.label}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{ui.urgent}</div>
              <h3>{ui.notifications}</h3>
            </div>
          </div>
          <div className="mvp-stack">
            {criticalNotifications.length > 0 ? (
              criticalNotifications.map((item) => (
                <button
                className={`notification-card notification-card--${item.tone}`}
                key={item.id}
                  onClick={() => void openNotification(item)}
                  type="button"
                >
                  <div className="notification-card-top">
                    <span className="notification-dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.message}</p>
                  <small>{formatDateTime(item.createdAt, locale)}</small>
                </button>
              ))
            ) : (
              <div className="empty-state">{ui.noNotifications}</div>
            )}
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.nav.chat}</div>
              <h3>{managerUi.nav.chat}</h3>
            </div>
            <button className="secondary-button" onClick={() => setManagerScreen("chat")} type="button">
              {managerUi.open}
            </button>
          </div>
          <div className="mvp-stack">
            {chatThreads.length > 0 ? (
              chatThreads.slice(0, 3).map((thread) => (
                <button
                  className="mvp-list-button"
                  key={thread.tenantId}
                  onClick={() => {
                    setSelectedChatTenantId(thread.tenantId);
                    setManagerScreen("chat");
                  }}
                  type="button"
                >
                  <strong>{thread.tenantName}</strong>
                  <p>{thread.preview}</p>
                  <small>
                    {thread.propertyName ?? "—"} · {thread.ticketCount} {managerUi.chatThreadMeta}
                  </small>
                </button>
              ))
            ) : (
              <div className="empty-state">{ui.noNotifications}</div>
            )}
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{ui.team}</div>
              <h3>{ui.team}</h3>
            </div>
            <button className="secondary-button" onClick={() => setManagerScreen("staff")} type="button">
              {managerUi.open}
            </button>
          </div>
          <div className="mvp-stack">
            {overview.team.slice(0, 4).map((member) => (
              <div className="mvp-list-row" key={member.id}>
                <div>
                  <strong>{member.fullName}</strong>
                  <p>{t.roles[member.role]}</p>
                </div>
                <div className="mvp-list-aside">
                  <span>{member.assignedTicketCount}</span>
                  <small>{member.propertyName ?? productBrand.name}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

      </div>
    </section>
  );

  const renderManagerTenants = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.tenants}</h2>
          <p>{propertyScopedTenantRows.length} · {managerUi.subtitles.tenants}</p>
        </div>
        <div className="mvp-actions">
          <input
            className="filter-select"
            onChange={(event) => setTenantSearch(event.target.value)}
            placeholder={locale === "ru" ? "\u041f\u043e\u0438\u0441\u043a" : "Search"}
            value={tenantSearch}
          />
          <select className="filter-select" onChange={(event) => setTenantRiskFilter(event.target.value)} value={tenantRiskFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0440\u0438\u0441\u043a\u0438" : "All risks"}</option>
            {riskLevelOptions.map((option) => (
              <option key={option} value={option}>
                {t.riskLevels[option]}
              </option>
            ))}
          </select>
          <button className="secondary-button" onClick={() => setManagerScreen("import")} type="button">
            {managerUi.import}
          </button>
          <button
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("tenant");
              setAdminPanel("tenant");
              setManagerScreen("tenant-add");
            }}
            type="button"
          >
            {managerUi.add}
          </button>
        </div>
      </div>

      <div className="chip-row">
        {overview.properties.map((property) => (
          <button
            className={selectedPropertyId === property.id ? "chip-button chip-button--active" : "chip-button"}
            key={property.id}
            onClick={() => handleManagerPropertySelect(property.id, "tenants")}
            type="button"
          >
            {property.name}
          </button>
        ))}
      </div>

      <article className="mvp-card">
        <div className="mvp-table-wrap selection-stage" key={`manager-tenants-${selectedPropertyId}`}>
          <table className="mvp-table">
            <thead>
              <tr>
                <th>{managerUi.nav.tenants}</th>
                <th>{t.fields.unit}</th>
                <th>{t.fields.area}</th>
                <th>{ui.monthlyRent}</th>
                <th>{ui.nextExpiry}</th>
                <th>{t.metrics.openTickets}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {propertyScopedTenantRows.map((tenant) => (
                <tr key={tenant.id} onClick={() => openTenantDetail(tenant.id)}>
                  <td>
                    <strong>{tenant.name}</strong>
                    <small>{t.riskLevels[tenant.riskLevel as keyof typeof t.riskLevels]}</small>
                  </td>
                  <td>{tenant.unitLabel}</td>
                  <td>{formatArea(tenant.totalArea, locale)}</td>
                  <td>{formatCompactMoney(tenant.monthlyRent, locale)}</td>
                  <td>{formatDate(tenant.nextExpiry, locale)}</td>
                  <td>{tenant.openTicketCount}</td>
                  <td>
                    <button
                      className="secondary-button secondary-button--compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        openManagerTenantEdit(tenant);
                      }}
                      type="button"
                    >
                      {adminEditLabel}
                    </button>
                    {canDeletePortfolioItems ? (
                      <button
                        className="text-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(`/api/tenants/${tenant.id}`);
                        }}
                        type="button"
                      >
                        {t.actions.delete}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {propertyScopedTenantRows.length === 0 ? <div className="empty-state">{t.hints.noData}</div> : null}
      </article>
    </section>
  );

  const renderManagerTenantDetail = () => {
    const tenantTabs: { id: TenantDetailTab; label: string }[] = [
      { id: "info", label: managerUi.baseInfo },
      { id: "contracts", label: t.nav.leases },
      { id: "payments", label: ui.payments },
      { id: "meters", label: locale === "ru" ? "\u0421\u0447\u0435\u0442\u0447\u0438\u043a\u0438" : "Meters" },
      { id: "notes", label: ui.notes },
      { id: "tickets", label: managerUi.nav.tickets },
      { id: "risks", label: ui.risks }
    ];
    const meterTypeLabels: Record<TenantMeter["meterType"], string> = {
      power: locale === "ru" ? "Энергопотребление" : "Power",
      electricity: locale === "ru" ? "Электроэнергия" : "Electricity",
      cold_chain: locale === "ru" ? "Холодильный контур" : "Cold chain",
      heating: locale === "ru" ? "Отопление" : "Heating",
      water: locale === "ru" ? "Вода" : "Water"
    };

    return (
      <section className="mvp-page">
        <div className="mvp-detail-head">
          <button className="mvp-back" onClick={() => setManagerScreen("tenants")} type="button">
            {managerUi.back}
          </button>
          <div>
            <h2>{tenantDetail?.tenant.name ?? selectedTenant?.name ?? managerUi.titles.tenantDetail}</h2>
            <p>{managerUi.subtitles.tenantDetail}</p>
          </div>
          {tenantDetail ? (
            <div className="mvp-actions">
              <button className="secondary-button" onClick={() => openManagerTenantEdit(tenantDetail.tenant)} type="button">
                {adminEditLabel}
              </button>
              {canDeletePortfolioItems ? (
                <button className="text-button" onClick={() => void handleDelete(`/api/tenants/${tenantDetail.tenant.id}`)} type="button">
                  {t.actions.delete}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {tenantDetailBusy ? (
          <div className="mvp-card"><div className="empty-state">{t.loading}</div></div>
        ) : tenantDetail ? (
          <>
            <div className="mvp-tabs">
              {tenantTabs.map((tab) => (
                <button
                  className={tenantDetailTab === tab.id ? "mvp-tab mvp-tab--active" : "mvp-tab"}
                  key={tab.id}
                  onClick={() => setTenantDetailTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {tenantDetailTab === "info" ? (
              <div className="mvp-grid">
                <article className="mvp-card">
                  <div className="mvp-card-head">
                    <div>
                      <div className="section-label">{managerUi.baseInfo}</div>
                      <h3>{tenantDetail.tenant.name}</h3>
                    </div>
                  </div>
                  <div className="mvp-info-list">
                    <div className="mvp-info-row"><span>{t.fields.inn}</span><strong>{tenantDetail.tenant.inn}</strong></div>
                    <div className="mvp-info-row"><span>{t.fields.contactName}</span><strong>{tenantDetail.tenant.contactName}</strong></div>
                    <div className="mvp-info-row"><span>{t.fields.phone}</span><strong>{tenantDetail.tenant.phone}</strong></div>
                    <div className="mvp-info-row"><span>{t.fields.email}</span><strong>{tenantDetail.tenant.email}</strong></div>
                    <div className="mvp-info-row"><span>{t.fields.riskLevel}</span><strong>{t.riskLevels[tenantDetail.tenant.riskLevel as keyof typeof t.riskLevels]}</strong></div>
                  </div>
                </article>

                <article className="mvp-card">
                  <div className="mvp-card-head">
                    <div>
                      <div className="section-label">{ui.tenantPassport}</div>
                      <h3>{ui.tenantPassport}</h3>
                    </div>
                  </div>
                  <div className="mvp-metrics mvp-metrics--compact">
                    <article className="mvp-metric"><span>{t.fields.area}</span><strong>{formatArea(tenantDetail.summary.totalArea, locale)}</strong></article>
                    <article className="mvp-metric"><span>{ui.monthlyRent}</span><strong>{formatCompactMoney(tenantDetail.summary.monthlyRent, locale)}</strong></article>
                    <article className="mvp-metric"><span>{ui.paymentDiscipline}</span><strong>{tenantDetail.summary.paymentDiscipline}%</strong></article>
                    <article className="mvp-metric"><span>{ui.arrears}</span><strong>{formatCompactMoney(tenantDetail.summary.arrearsAmount, locale)}</strong></article>
                  </div>
                </article>
              </div>
            ) : null}

            {tenantDetailTab === "contracts" ? (
              <article className="mvp-card">
                <div className="mvp-table-wrap">
                  <table className="mvp-table">
                    <thead>
                      <tr>
                        <th>{t.fields.contractNumber}</th>
                        <th>{t.fields.unit}</th>
                          <th>{t.fields.stage}</th>
                          <th>{t.fields.ratePerSqm}</th>
                          <th>{t.fields.endDate}</th>
                          <th>{t.fields.document}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantDetail.leases.map((lease) => (
                        <tr key={lease.id}>
                          <td>{lease.contractNumber}</td>
                          <td>{lease.unitNumber ?? "—"}</td>
                          <td>{t.leaseStages[lease.stage as keyof typeof t.leaseStages]}</td>
                          <td>{formatMoney(lease.ratePerSqm, locale)}</td>
                          <td>{formatDate(lease.endDate, locale)}</td>
                          <td>
                            <button className="secondary-button secondary-button--compact" onClick={() => void loadLeaseDocuments(lease)} type="button">
                              {managerUi.open}
                            </button>
                          </td>
                          <td>
                            <button
                              className="secondary-button secondary-button--compact"
                              onClick={() => openManagerLeaseEdit(lease)}
                              type="button"
                            >
                              {adminEditLabel}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}

            {tenantDetailTab === "payments" ? (
              <article className="mvp-card">
                <div className="mvp-table-wrap">
                  <table className="mvp-table">
                    <thead>
                      <tr>
                        <th>{ui.payments}</th>
                        <th>{t.fields.status}</th>
                        <th>{t.fields.endDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantDetail.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{payment.period}</strong>
                            <small>{formatMoney(payment.amount, locale)} · {payment.method}</small>
                          </td>
                          <td>{ui.paymentStatus[payment.status]}</td>
                          <td>{formatDate(payment.paidDate ?? payment.dueDate, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}

            {tenantDetailTab === "meters" ? (
              <article className="mvp-card">
                <form className="mvp-form" onSubmit={handleMeterReadingSubmit}>
                  <label>
                    <span>{t.fields.unit}</span>
                    <select name="unitId" onChange={handleFieldChange(setMeterReadingForm)} required value={meterReadingForm.unitId}>
                      {tenantDetail.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.number} · {formatArea(unit.area, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{locale === "ru" ? "Период" : "Period"}</span>
                    <input name="period" onChange={handleFieldChange(setMeterReadingForm)} required type="month" value={meterReadingForm.period} />
                  </label>
                  <label>
                    <span>{locale === "ru" ? "Счетчик" : "Meter"}</span>
                    <select name="meterType" onChange={handleFieldChange(setMeterReadingForm)} value={meterReadingForm.meterType}>
                      {Object.entries(meterTypeLabels).map(([meterType, label]) => (
                        <option key={meterType} value={meterType}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{locale === "ru" ? "Предыдущее" : "Previous"}</span>
                    <input name="previousValue" onChange={handleFieldChange(setMeterReadingForm)} type="number" value={meterReadingForm.previousValue} />
                  </label>
                  <label>
                    <span>{locale === "ru" ? "Текущее" : "Current"}</span>
                    <input name="value" onChange={handleFieldChange(setMeterReadingForm)} required type="number" value={meterReadingForm.value} />
                  </label>
                  <label>
                    <span>{locale === "ru" ? "Тариф" : "Tariff"}</span>
                    <input name="tariffRate" onChange={handleFieldChange(setMeterReadingForm)} type="number" value={meterReadingForm.tariffRate} />
                  </label>
                  <button className="primary-button" disabled={busyAction === "meter-reading"} type="submit">
                    {locale === "ru" ? "Сохранить показание" : "Save reading"}
                  </button>
                </form>
                <div className="mvp-table-wrap">
                  <table className="mvp-table">
                    <thead>
                      <tr>
                        <th>{locale === "ru" ? "\u0421\u0447\u0435\u0442\u0447\u0438\u043a" : "Meter"}</th>
                        <th>{t.fields.unit}</th>
                        <th>{locale === "ru" ? "Период" : "Period"}</th>
                        <th>{locale === "ru" ? "\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u0438\u0435" : "Reading"}</th>
                        <th>{locale === "ru" ? "Расход" : "Consumption"}</th>
                        <th>{locale === "ru" ? "Сумма" : "Charge"}</th>
                        <th>{locale === "ru" ? "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430" : "Delta"}</th>
                        <th>{t.fields.status}</th>
                        <th>{t.fields.endDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantDetail.meters.map((meter) => (
                        <tr key={meter.id}>
                          <td>{meterTypeLabels[meter.meterType] ?? meter.name}</td>
                          <td>{meter.unitNumber}</td>
                          <td>{meter.period}</td>
                          <td>{meter.lastValue}</td>
                          <td>{meter.consumption}</td>
                          <td>{formatMoney(meter.chargeAmount, locale)}</td>
                          <td>{meter.deltaPct}%</td>
                          <td>{meter.status === "attention" ? ui.riskSeverity.warning : ui.paymentStatus.paid}</td>
                          <td>{formatDateTime(meter.updatedAt, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tenantDetail.meters.length === 0 ? <div className="empty-state">{t.hints.noData}</div> : null}
              </article>
            ) : null}

            {tenantDetailTab === "notes" ? (
              <div className="mvp-stack">
                {tenantDetail.notes.map((note) => (
                  <article className="mvp-card" key={note.id}>
                    <strong>{note.title}</strong>
                    <p>{note.content}</p>
                    <small>{note.authorName} · {formatDateTime(note.createdAt, locale)}</small>
                  </article>
                ))}
              </div>
            ) : null}

            {tenantDetailTab === "tickets" ? (
              <article className="mvp-card">
                <div className="mvp-table-wrap">
                  <table className="mvp-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>{t.fields.category}</th>
                        <th>{t.fields.priority}</th>
                        <th>{t.fields.status}</th>
                        <th>{t.fields.endDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantDetail.tickets.map((ticket) => (
                        <tr key={ticket.id} onClick={() => openTicketDetail(ticket.id)}>
                          <td>{ticket.number}</td>
                          <td>{t.ticketCategories[ticket.category as keyof typeof t.ticketCategories]}</td>
                          <td>{t.ticketPriorities[ticket.priority as keyof typeof t.ticketPriorities]}</td>
                          <td>{t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}</td>
                          <td>{formatDate(ticket.updatedAt, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}

            {tenantDetailTab === "risks" ? (
              <div className="mvp-stack">
                {tenantDetail.risks.length > 0 ? (
                  tenantDetail.risks.map((risk) => (
                    <article className="mvp-card" key={risk.id}>
                      <strong>{risk.title}</strong>
                      <p>{risk.owner}</p>
                      <small>{ui.riskSeverity[risk.severity]} · {formatDate(risk.dueDate, locale)}</small>
                    </article>
                  ))
                ) : (
                  <div className="mvp-card"><div className="empty-state">{t.hints.noData}</div></div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="mvp-card"><div className="empty-state">{ui.emptyTenant}</div></div>
        )}
      </section>
    );
  };

  const renderManagerFormScreen = (
    screen: "tenant-add" | "property-add" | "unit-add" | "lease-add",
    backScreen: ManagerScreen
  ) => {
    const panel: AdminPanel =
      screen === "tenant-add" ? "tenant" : screen === "property-add" ? "property" : screen === "unit-add" ? "unit" : "lease";
    const isEditing = Boolean(editingAdmin[panel]);
    const title = isEditing
      ? adminSaveChangesLabel
      : screen === "tenant-add"
        ? managerUi.titles.tenantAdd
        : screen === "property-add"
          ? managerUi.titles.propertyAdd
          : screen === "unit-add"
            ? managerUi.titles.unitAdd
            : managerUi.titles.leaseAdd;
    const subtitle =
      screen === "tenant-add"
        ? managerUi.subtitles.tenantAdd
        : screen === "property-add"
          ? managerUi.subtitles.propertyAdd
          : screen === "unit-add"
            ? managerUi.subtitles.unitAdd
            : managerUi.subtitles.leaseAdd;

    return (
      <section className="mvp-page">
        <div className="mvp-detail-head">
          <button
            className="mvp-back"
            onClick={() => {
              if (isEditing) {
                cancelAdminEdit(panel);
              }
              setManagerScreen(backScreen);
            }}
            type="button"
          >
            {managerUi.back}
          </button>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        <article className="mvp-card">
          {renderAdminForm()}
        </article>
      </section>
    );
  };

  const renderManagerUnits = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.units}</h2>
          <p>{managerUi.subtitles.units}</p>
        </div>
        <div className="mvp-actions">
          <select className="filter-select" onChange={(event) => setUnitTypeFilter(event.target.value)} value={unitTypeFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0442\u0438\u043f\u044b" : "All types"}</option>
            {unitTypeOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitTypes[option]}
              </option>
            ))}
          </select>
          <select className="filter-select" onChange={(event) => setUnitStatusFilter(event.target.value)} value={unitStatusFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044b" : "All statuses"}</option>
            {unitStatusOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitStatuses[option]}
              </option>
            ))}
          </select>
          <select className="filter-select" onChange={(event) => setUnitRampFilter(event.target.value)} value={unitRampFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0440\u0430\u043c\u043f\u044b" : "All ramps"}</option>
            <option value="ramp">{t.fields.hasRamp}</option>
            <option value="no-ramp">{locale === "ru" ? "\u0411\u0435\u0437 \u0440\u0430\u043c\u043f\u044b" : "No ramp"}</option>
          </select>
          <button
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("unit");
              setAdminPanel("unit");
              setManagerScreen("unit-add");
            }}
            type="button"
          >
            {managerUi.add}
          </button>
        </div>
      </div>

      <div className="chip-row">
        {overview.properties.map((property) => (
          <button
            className={selectedPropertyId === property.id ? "chip-button chip-button--active" : "chip-button"}
            key={property.id}
            onClick={() => handleManagerPropertySelect(property.id, "units")}
            type="button"
          >
            {property.name}
          </button>
        ))}
      </div>

      <article className="mvp-card selection-stage" key={`manager-units-${selectedPropertyId}`}>
        <div className="mvp-table-wrap">
          <table className="mvp-table">
            <thead>
              <tr>
                <th>{t.fields.unit}</th>
                <th>{t.fields.area}</th>
                <th>{t.fields.type}</th>
                <th>{managerUi.unitMeta}</th>
                <th>{t.fields.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPropertyScopedUnits.map((unit) => (
                <tr key={unit.id} onClick={() => openUnitDetail(unit.id)}>
                  <td>
                    <strong>{unit.propertyName ?? "—"} · {unit.number}</strong>
                    <small>{unit.tenantName ?? t.hints.noData}</small>
                  </td>
                  <td>{formatArea(unit.area, locale)}</td>
                  <td>{t.unitTypes[unit.type as keyof typeof t.unitTypes]}</td>
                  <td>{unit.temperatureRegime || "—"}</td>
                  <td>{t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}</td>
                  <td>
                    <button
                      className="secondary-button secondary-button--compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        openManagerUnitEdit(unit);
                      }}
                      type="button"
                    >
                      {adminEditLabel}
                    </button>
                    {canDeletePortfolioItems ? (
                      <button
                        className="text-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(`/api/units/${unit.id}`);
                        }}
                        type="button"
                      >
                        {t.actions.delete}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPropertyScopedUnits.length === 0 ? <div className="empty-state">{t.hints.noData}</div> : null}
      </article>
    </section>
  );

  const renderManagerUnitDetail = () => (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <button className="mvp-back" onClick={() => setManagerScreen("units")} type="button">
          {managerUi.back}
        </button>
        <div>
          <h2>{selectedUnit ? `${selectedUnit.propertyName ?? "—"} · ${selectedUnit.number}` : managerUi.titles.unitDetail}</h2>
          <p>{managerUi.subtitles.unitDetail}</p>
        </div>
        {selectedUnit ? (
          <div className="mvp-actions">
            <button className="secondary-button" onClick={() => void downloadUnitExport(selectedUnit)} type="button">
              {unitExportLabel}
            </button>
            <button className="secondary-button" onClick={() => openManagerUnitEdit(selectedUnit)} type="button">
              {adminEditLabel}
            </button>
            {canDeletePortfolioItems ? (
              <button className="text-button" onClick={() => void handleDelete(`/api/units/${selectedUnit.id}`)} type="button">
                {t.actions.delete}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedUnit ? (
        <div className="mvp-grid">
          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.baseInfo}</div>
                <h3>{selectedUnit.number}</h3>
              </div>
            </div>
            <div className="mvp-info-list">
              <div className="mvp-info-row"><span>{t.fields.property}</span><strong>{selectedUnit.propertyName ?? "—"}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.area}</span><strong>{formatArea(selectedUnit.area, locale)}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.type}</span><strong>{t.unitTypes[selectedUnit.type as keyof typeof t.unitTypes]}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.status}</span><strong>{t.unitStatuses[selectedUnit.status as keyof typeof t.unitStatuses]}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.temperatureRegime}</span><strong>{selectedUnit.temperatureRegime || "—"}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.ceilingHeight}</span><strong>{selectedUnit.ceilingHeight || "—"}</strong></div>
              {selectedUnit.description ? (
                <div className="mvp-info-row">
                  <span>{t.fields.legend}</span>
                  <strong>{selectedUnit.description}</strong>
                </div>
              ) : null}
            </div>
          </article>

          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.leaseHistory}</div>
                <h3>{managerUi.leaseHistory}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {selectedUnitLeases.length > 0 ? (
                selectedUnitLeases.map((lease) => (
                  <div className="mvp-list-row" key={lease.id}>
                    <div>
                      <strong>{lease.contractNumber}</strong>
                      <p>{lease.tenantName ?? "—"}</p>
                    </div>
                    <div className="mvp-list-aside">
                      <span>{t.leaseStages[lease.stage as keyof typeof t.leaseStages]}</span>
                      <small>{formatDate(lease.endDate, locale)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">{t.hints.noData}</div>
              )}
            </div>
          </article>

          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.linkedTickets}</div>
                <h3>{managerUi.linkedTickets}</h3>
              </div>
            </div>
            <div className="mvp-table-wrap">
              <table className="mvp-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>{t.fields.title}</th>
                    <th>{t.fields.priority}</th>
                    <th>{t.fields.status}</th>
                    <th>{t.fields.endDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUnitTickets.map((ticket) => (
                    <tr key={ticket.id} onClick={() => openTicketDetail(ticket.id)}>
                      <td>{ticket.number}</td>
                      <td>{ticket.title}</td>
                      <td>{t.ticketPriorities[ticket.priority as keyof typeof t.ticketPriorities]}</td>
                      <td>{t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}</td>
                      <td>{formatDate(ticket.updatedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedUnitTickets.length === 0 ? <div className="empty-state">{t.hints.ticketEmpty}</div> : null}
          </article>
        </div>
      ) : (
        <div className="mvp-card"><div className="empty-state">{t.hints.noData}</div></div>
      )}
    </section>
  );

  const renderManagerLeases = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.leases}</h2>
          <p>{managerUi.subtitles.leases}</p>
        </div>
        <div className="mvp-actions">
          <select className="filter-select" onChange={(event) => setLeaseStageFilter(event.target.value)} value={leaseStageFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0441\u0442\u0430\u0434\u0438\u0438" : "All stages"}</option>
            {leaseStageOptions.map((option) => (
              <option key={option} value={option}>
                {t.leaseStages[option]}
              </option>
            ))}
          </select>
          <select className="filter-select" onChange={(event) => setLeaseTermFilter(event.target.value)} value={leaseTermFilter}>
            <option value="all">{locale === "ru" ? "\u0412\u0441\u0435 \u0441\u0440\u043e\u043a\u0438" : "All terms"}</option>
            <option value="30">{locale === "ru" ? "\u0414\u043e 30 \u0434\u043d\u0435\u0439" : "Within 30 days"}</option>
            <option value="90">{locale === "ru" ? "\u0414\u043e 90 \u0434\u043d\u0435\u0439" : "Within 90 days"}</option>
            <option value="expired">{locale === "ru" ? "\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u044b" : "Expired"}</option>
          </select>
          <button
            className="primary-button"
            onClick={() => {
              cancelAdminEdit("lease");
              setAdminPanel("lease");
              setManagerScreen("lease-add");
            }}
            type="button"
          >
            {managerUi.add}
          </button>
        </div>
      </div>

      <article className="mvp-card">
        <div className="mvp-table-wrap">
          <table className="mvp-table">
            <thead>
              <tr>
                <th>{t.fields.contractNumber}</th>
                <th>{t.fields.tenant}</th>
                <th>{t.fields.unit}</th>
                <th>{t.fields.stage}</th>
                <th>{t.fields.ratePerSqm}</th>
                <th>{t.fields.endDate}</th>
                <th>{t.fields.document}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {managerLeaseRows.map((lease) => (
                <tr key={lease.id}>
                  <td>{lease.contractNumber}</td>
                  <td>{lease.tenantName ?? "—"}</td>
                  <td>{lease.propertyName ?? "—"} · {lease.unitNumber ?? "—"}</td>
                  <td>{t.leaseStages[lease.stage as keyof typeof t.leaseStages]}</td>
                  <td>{formatMoney(lease.ratePerSqm, locale)}</td>
                  <td>{formatDate(lease.endDate, locale)}</td>
                  <td>
                    <button className="secondary-button secondary-button--compact" onClick={() => void loadLeaseDocuments(lease)} type="button">
                      {managerUi.open}
                    </button>
                  </td>
                  <td>
                    <button
                      className="secondary-button secondary-button--compact"
                      onClick={() => openManagerLeaseEdit(lease)}
                      type="button"
                    >
                      {adminEditLabel}
                    </button>
                    {canDeletePortfolioItems ? (
                      <button className="text-button" onClick={() => void handleDelete(`/api/leases/${lease.id}`)} type="button">
                        {t.actions.delete}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {managerLeaseRows.length === 0 ? <div className="empty-state">{t.hints.noData}</div> : null}
      </article>
    </section>
  );

  const renderManagerTickets = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.tickets}</h2>
          <p>{managerUi.subtitles.tickets}</p>
        </div>
        <div className="mvp-actions">
          <select className="filter-select" onChange={(event) => setTicketFilter(event.target.value as TicketFilter)} value={ticketFilter}>
            <option value="all">{locale === "ru" ? "Все статусы" : "All"}</option>
            {ticketStatusOptions.map((status) => (
              <option key={status} value={status}>
                {t.ticketStatuses[status]}
              </option>
            ))}
          </select>
          <button className="primary-button" onClick={() => setManagerScreen("ticket-create")} type="button">
            {managerUi.add}
          </button>
        </div>
      </div>

      <article className="mvp-card">
        <div className="mvp-table-wrap">
          <table className="mvp-table">
            <thead>
              <tr>
                <th>№</th>
                <th>{t.fields.title}</th>
                <th>{t.fields.tenant}</th>
                <th>{t.fields.priority}</th>
                <th>{t.fields.status}</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} onClick={() => openTicketDetail(ticket.id)}>
                  <td>{ticket.number}</td>
                  <td>
                    <strong>{ticket.title}</strong>
                    <small>{ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}</small>
                  </td>
                  <td>{ticket.tenantName ?? "—"}</td>
                  <td>{t.ticketPriorities[ticket.priority as keyof typeof t.ticketPriorities]}</td>
                  <td>{t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}</td>
                  <td>{formatDate(ticket.updatedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTickets.length === 0 ? <div className="empty-state">{t.hints.ticketEmpty}</div> : null}
      </article>
    </section>
  );

  const renderManagerTicketCreate = () => (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <button className="mvp-back" onClick={() => setManagerScreen("tickets")} type="button">
          {managerUi.back}
        </button>
        <div>
          <h2>{managerUi.titles.ticketCreate}</h2>
          <p>{managerUi.subtitles.ticketCreate}</p>
        </div>
      </div>

      <article className="mvp-card">
        <form className="form-grid form-grid--single" onSubmit={handleCreateTicket}>
          <label>
            <span>{t.fields.unit}</span>
            <select name="unitId" onChange={handleFieldChange(setTicketForm)} value={ticketForm.unitId}>
              {ticketUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.propertyName} · {unit.number}
                </option>
              ))}
            </select>
          </label>
          <div className="split-grid">
            <label>
              <span>{t.fields.category}</span>
              <select name="category" onChange={handleFieldChange(setTicketForm)} value={ticketForm.category}>
                {ticketCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {t.ticketCategories[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.fields.priority}</span>
              <select name="priority" onChange={handleFieldChange(setTicketForm)} value={ticketForm.priority}>
                {ticketPriorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {t.ticketPriorities[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>{t.fields.title}</span>
            <input name="title" onChange={handleFieldChange(setTicketForm)} value={ticketForm.title} />
          </label>
          <label>
            <span>{t.fields.description}</span>
            <textarea name="description" onChange={handleFieldChange(setTicketForm)} rows={5} value={ticketForm.description} />
          </label>
          <button className="primary-button" disabled={busyAction === "ticket-create"} type="submit">
            {t.actions.create}
          </button>
        </form>
      </article>
    </section>
  );

  const renderManagerTicketDetail = () => (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <button className="mvp-back" onClick={() => setManagerScreen("tickets")} type="button">
          {managerUi.back}
        </button>
        <div>
          <h2>{selectedTicket?.title ?? managerUi.titles.ticketDetail}</h2>
          <p>{managerUi.subtitles.ticketDetail}</p>
        </div>
      </div>

      {selectedTicket ? (
        <div className="mvp-grid">
          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{selectedTicket.number}</div>
                <h3>{selectedTicket.title}</h3>
              </div>
            </div>
            <p>{selectedTicket.description}</p>
            <div className="mvp-info-list">
              <div className="mvp-info-row"><span>{t.fields.property}</span><strong>{selectedTicket.propertyName ?? "—"}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.unit}</span><strong>{selectedTicket.unitNumber ?? "—"}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.tenant}</span><strong>{selectedTicket.tenantName ?? "—"}</strong></div>
              <div className="mvp-info-row"><span>{t.fields.priority}</span><strong>{t.ticketPriorities[selectedTicket.priority as keyof typeof t.ticketPriorities]}</strong></div>
            </div>

            {canUpdateTickets ? (
              <form className="inline-form" onSubmit={handleUpdateTicket}>
                <label>
                  <span>{t.fields.status}</span>
                  <select onChange={(event) => setTicketStatusDraft(event.target.value)} value={ticketStatusDraft}>
                    {ticketStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {t.ticketStatuses[status]}
                      </option>
                    ))}
                  </select>
                </label>
                {canAssignTickets ? (
                  <label>
                    <span>{locale === "ru" ? "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c" : "Assignee"}</span>
                    <select onChange={(event) => setTicketAssigneeDraft(event.target.value)} value={ticketAssigneeDraft}>
                      <option value="">{locale === "ru" ? "\u041d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d" : "Unassigned"}</option>
                      {ticketAssigneeOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="secondary-button" disabled={busyAction === "ticket-update"} type="submit">
                  {t.actions.updateStatus}
                </button>
              </form>
            ) : null}
          </article>

          <article className="mvp-card mvp-card--wide">
            {renderTicketOperationsBlock(selectedTicket)}
            {renderTicketAttachmentBlock(selectedTicket)}

            <div className="mvp-card-head">
              <div>
                <div className="section-label">{locale === "ru" ? "История" : "History"}</div>
                <h3>{locale === "ru" ? "История заявки" : "Ticket history"}</h3>
              </div>
            </div>
            <div className="comment-list">
              {ticketHistory.length > 0 ? (
                ticketHistory.map((event) => (
                  <div className="comment-card" key={event.id}>
                    <div className="comment-meta">
                      <strong>
                        {event.fromStatus
                          ? `${getTicketStatusLabel(event.fromStatus, locale)} → ${getTicketStatusLabel(event.toStatus, locale)}`
                          : getTicketStatusLabel(event.toStatus, locale)}
                      </strong>
                      <span>{formatDateTime(event.createdAt, locale)}</span>
                    </div>
                    <p>{event.reason ?? (event.createdByName ?? "—")}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">{locale === "ru" ? "История пока пустая." : "No history yet."}</div>
              )}
            </div>

            <div className="mvp-card-head">
              <div>
                <div className="section-label">{t.fields.content}</div>
                <h3>{t.fields.content}</h3>
              </div>
            </div>
            <div className="comment-list">
              {ticketComments.length > 0 ? (
                ticketComments.map((comment) => (
                  <div className="comment-card" key={comment.id}>
                    <div className="comment-meta">
                      <strong>{comment.authorName ?? "—"}</strong>
                      <span>{formatDateTime(comment.createdAt, locale)}</span>
                    </div>
                    <p>{comment.content}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">{t.hints.commentEmpty}</div>
              )}
            </div>
            <form className="comment-form" onSubmit={handleCommentSubmit}>
              <textarea name="content" onChange={handleFieldChange(setCommentForm)} rows={4} value={commentForm.content} />
              <button className="primary-button" disabled={busyAction === "ticket-comment"} type="submit">
                {t.actions.addComment}
              </button>
            </form>
          </article>
        </div>
      ) : (
        <div className="mvp-card"><div className="empty-state">{t.hints.ticketEmpty}</div></div>
      )}
    </section>
  );

  const renderManagerChat = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.chat}</h2>
          <p>{managerUi.subtitles.chat}</p>
        </div>
      </div>

      <div className="mvp-chat-layout">
        <article className="mvp-card">
          <div className="mvp-thread-list">
            {chatThreads.length > 0 ? (
              chatThreads.map((thread) => (
                <button
                  className={selectedChatTenantId === thread.tenantId ? "mvp-thread mvp-thread--active" : "mvp-thread"}
                  key={thread.tenantId}
                  onClick={() => setSelectedChatTenantId(thread.tenantId)}
                  type="button"
                >
                  <div className="mvp-thread-head">
                    <strong>{thread.tenantName}</strong>
                    {thread.unreadCount > 0 ? <span>{thread.unreadCount}</span> : null}
                  </div>
                  <p>{thread.preview}</p>
                  <small>
                    {thread.propertyName ?? "—"} · {thread.ticketCount} {managerUi.chatThreadMeta}
                  </small>
                </button>
              ))
            ) : (
              <div className="empty-state">{t.hints.noData}</div>
            )}
          </div>
        </article>

        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.nav.chat}</div>
              <h3>{selectedChatThread?.tenantName ?? managerUi.nav.chat}</h3>
            </div>
            <small>{selectedChatThread?.propertyName ?? "—"}</small>
          </div>

          <div className="mvp-chat-body">
            {chatBusy ? (
              <div className="empty-state">{t.loading}</div>
            ) : chatMessages.length > 0 ? (
              chatMessages.map((message) => (
                <div
                  className={message.direction === "incoming" ? "mvp-chat-message" : "mvp-chat-message mvp-chat-message--outgoing"}
                  key={message.id}
                >
                  <strong>
                    {message.ticketNumber}
                    <span className={`channel-pill channel-pill--${message.sourceChannel}`}>
                      {formatChannel(message.sourceChannel, locale)}
                    </span>
                  </strong>
                  <p>{message.content}</p>
                  <small>{message.authorName} · {formatDateTime(message.createdAt, locale)}</small>
                </div>
              ))
            ) : (
              <div className="empty-state">{managerUi.emptyChat}</div>
            )}
          </div>

          <form className="mvp-chat-form" onSubmit={handleChatSubmit}>
            {selectedChatTickets.length > 1 ? (
              <select onChange={(event) => setSelectedChatTicketId(event.target.value)} value={selectedChatTargetTicket?.id ?? ""}>
                {selectedChatTickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"} · {ticket.number}
                  </option>
                ))}
              </select>
            ) : null}
            <textarea
              name="content"
              onChange={handleFieldChange(setChatDraft)}
              placeholder={managerUi.chatPlaceholder}
              rows={3}
              value={chatDraft.content}
            />
            <button
              className="primary-button"
              disabled={busyAction === "chat-submit" || !selectedChatTargetTicket}
              type="submit"
            >
              {managerUi.send}
            </button>
          </form>
        </article>
      </div>
    </section>
  );

  const renderTenantChat = () => (
    <section className="section-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <div className="section-label">{t.nav.chat}</div>
            <h3>{locale === "ru" ? "Диалог по заявкам" : "Ticket chat"}</h3>
          </div>
        </div>
        <div className="stack-list">
          {selectedChatTickets.length > 0 ? (
            selectedChatTickets.map((ticket) => (
              <button
                className={selectedChatTargetTicket?.id === ticket.id ? "list-row table-row-active" : "list-row"}
                key={ticket.id}
                onClick={() => setSelectedChatTicketId(ticket.id)}
                type="button"
              >
                <div>
                  <strong>{ticket.number} · {ticket.title}</strong>
                  <p>{ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}</p>
                </div>
                <div className="list-aside">
                  <span className={`status-pill status-pill--${ticket.status}`}>
                    {getTicketStatusLabel(ticket.status, locale)}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">{t.hints.ticketEmpty}</div>
          )}
        </div>
      </article>

      <article className="surface surface--wide">
        <div className="surface-head">
          <div>
            <div className="section-label">{selectedChatTargetTicket?.number ?? t.nav.chat}</div>
            <h3>{selectedChatTargetTicket?.title ?? t.nav.chat}</h3>
          </div>
          <small>{selectedChatTargetTicket?.propertyName ?? "—"} · {selectedChatTargetTicket?.unitNumber ?? "—"}</small>
        </div>

        <div className="mvp-chat-body">
          {(() => {
            const visibleMessages = selectedChatTargetTicket
              ? chatMessages.filter((message) => message.ticketId === selectedChatTargetTicket.id)
              : chatMessages;

            if (chatBusy) {
              return <div className="empty-state">{t.loading}</div>;
            }

            if (visibleMessages.length === 0) {
              return <div className="empty-state">{managerUi.emptyChat}</div>;
            }

            return visibleMessages.map((message) => (
              <div
                className={message.direction === "incoming" ? "mvp-chat-message" : "mvp-chat-message mvp-chat-message--outgoing"}
                key={message.id}
              >
                <strong>
                  {message.ticketNumber}
                  <span className={`channel-pill channel-pill--${message.sourceChannel}`}>
                    {formatChannel(message.sourceChannel, locale)}
                  </span>
                </strong>
                <p>{message.content}</p>
                <small>{message.authorName} · {formatDateTime(message.createdAt, locale)}</small>
              </div>
            ));
          })()}
        </div>

        <form className="mvp-chat-form" onSubmit={handleChatSubmit}>
          <textarea
            name="content"
            onChange={handleFieldChange(setChatDraft)}
            placeholder={managerUi.chatPlaceholder}
            rows={3}
            value={chatDraft.content}
          />
          <button
            className="primary-button"
            disabled={busyAction === "chat-submit" || !selectedChatTargetTicket}
            type="submit"
          >
            {managerUi.send}
          </button>
        </form>
      </article>
    </section>
  );

  const renderManagerNotifications = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.notifications}</h2>
          <p>{managerUi.subtitles.notifications}</p>
        </div>
        {overview.notifications.some((item) => item.unread) ? (
          <button className="secondary-button" onClick={() => void markAllNotificationsRead()} type="button">
            {locale === "ru" ? "Отметить прочитанными" : "Mark as read"}
          </button>
        ) : null}
      </div>

      <div className="mvp-stack">
        {overview.notifications.length > 0 ? (
          overview.notifications.map((item) => (
            <button
              className={`notification-card notification-card--${item.tone}`}
              key={item.id}
              onClick={() => void openNotification(item)}
              type="button"
            >
              <div className="notification-card-top">
                <span className="notification-dot" />
                <strong>{item.title}</strong>
              </div>
              <p>{item.message}</p>
              <small>{formatDateTime(item.createdAt, locale)}</small>
            </button>
          ))
        ) : (
          <div className="mvp-card"><div className="empty-state">{ui.noNotifications}</div></div>
        )}
      </div>
    </section>
  );

  const renderManagerObjectLaunch = () => (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <button className="mvp-back" onClick={() => setManagerScreen("objects")} type="button">
          {managerUi.back}
        </button>
        <div>
          <h2>{managerUi.titles.objectLaunch}</h2>
          <p>{managerUi.subtitles.objectLaunch}</p>
        </div>
      </div>

      <form className="launch-wizard" onSubmit={handleLaunchObject}>
        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">1</div>
              <h3>{locale === "ru" ? "Объект" : "Property"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.name}</span>
              <input name="propertyName" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.propertyName} />
            </label>
            <label>
              <span>{t.fields.address}</span>
              <input name="address" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.address} />
            </label>
            <label>
              <span>{t.fields.totalArea}</span>
              <input name="totalArea" onChange={handleFieldChange(setLaunchForm)} required type="number" value={launchForm.totalArea} />
            </label>
            <label>
              <span>{t.fields.rentableArea}</span>
              <input name="rentableArea" onChange={handleFieldChange(setLaunchForm)} required type="number" value={launchForm.rentableArea} />
            </label>
            <label>
              <span>{t.fields.warehouseClass}</span>
              <select name="warehouseClass" onChange={handleFieldChange(setLaunchForm)} value={launchForm.warehouseClass}>
                {t.warehouseClasses.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">2</div>
              <h3>{locale === "ru" ? "Первое помещение" : "First unit"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.unit}</span>
              <input name="unitNumber" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.unitNumber} />
            </label>
            <label>
              <span>{t.fields.floor}</span>
              <input name="floor" onChange={handleFieldChange(setLaunchForm)} required type="number" value={launchForm.floor} />
            </label>
            <label>
              <span>{t.fields.area}</span>
              <input name="unitArea" onChange={handleFieldChange(setLaunchForm)} required type="number" value={launchForm.unitArea} />
            </label>
            <label>
              <span>{t.fields.type}</span>
              <select name="unitType" onChange={handleFieldChange(setLaunchForm)} value={launchForm.unitType}>
                {unitTypeOptions.map((option) => (
                  <option key={option} value={option}>{t.unitTypes[option]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.fields.temperatureRegime}</span>
              <input name="temperatureRegime" onChange={handleFieldChange(setLaunchForm)} value={launchForm.temperatureRegime} />
            </label>
            <label>
              <span>{t.fields.ceilingHeight}</span>
              <input name="ceilingHeight" onChange={handleFieldChange(setLaunchForm)} type="number" value={launchForm.ceilingHeight} />
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">3</div>
              <h3>{locale === "ru" ? "Арендатор" : "Tenant"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.name}</span>
              <input name="tenantName" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.tenantName} />
            </label>
            <label>
              <span>{t.fields.inn}</span>
              <input name="inn" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.inn} />
            </label>
            <label>
              <span>{t.fields.contactName}</span>
              <input name="contactName" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.contactName} />
            </label>
            <label>
              <span>{t.fields.phone}</span>
              <input name="phone" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.phone} />
            </label>
            <label>
              <span>{t.fields.email}</span>
              <input name="email" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.email} />
            </label>
            <label>
              <span>{t.fields.riskLevel}</span>
              <select name="riskLevel" onChange={handleFieldChange(setLaunchForm)} value={launchForm.riskLevel}>
                <option value="low">{t.riskLevels.low}</option>
                <option value="medium">{t.riskLevels.medium}</option>
                <option value="high">{t.riskLevels.high}</option>
              </select>
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">4</div>
              <h3>{locale === "ru" ? "Договор и запуск" : "Lease launch"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.contractNumber}</span>
              <input name="contractNumber" onChange={handleFieldChange(setLaunchForm)} required value={launchForm.contractNumber} />
            </label>
            <label>
              <span>{t.fields.startDate}</span>
              <input name="startDate" onChange={handleFieldChange(setLaunchForm)} required type="date" value={launchForm.startDate} />
            </label>
            <label>
              <span>{t.fields.endDate}</span>
              <input name="endDate" onChange={handleFieldChange(setLaunchForm)} required type="date" value={launchForm.endDate} />
            </label>
            <label>
              <span>{t.fields.ratePerSqm}</span>
              <input name="ratePerSqm" onChange={handleFieldChange(setLaunchForm)} required type="number" value={launchForm.ratePerSqm} />
            </label>
            <label>
              <span>{t.fields.deposit}</span>
              <input name="deposit" onChange={handleFieldChange(setLaunchForm)} type="number" value={launchForm.deposit} />
            </label>
          </div>
          <button className="primary-button" disabled={busyAction === "object-launch"} type="submit">
            {locale === "ru" ? "Создать и запустить" : "Create and launch"}
          </button>
        </article>
      </form>
    </section>
  );

  const renderManagerObjects = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.objects}</h2>
          <p>{managerUi.subtitles.objects}</p>
        </div>
        <div className="mvp-actions">
          <button
            className="primary-button"
            onClick={() => setManagerScreen("object-launch")}
            type="button"
          >
            {locale === "ru" ? "Запустить объект" : "Launch"}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              cancelAdminEdit("property");
              setAdminPanel("property");
              setManagerScreen("property-add");
            }}
            type="button"
          >
            {managerUi.add}
          </button>
        </div>
      </div>

      <div className="property-rail">
        {propertyOperations.map((property) => (
          <button
            className={selectedPropertyId === property.id ? "property-stat property-stat--active" : "property-stat"}
            key={property.id}
            onClick={() => handleManagerPropertySelect(property.id, "objects")}
            type="button"
          >
            <div className="property-stat-head">
              <div>
                <strong>{property.name}</strong>
                <p>{property.address}</p>
              </div>
              <span>{property.warehouseClass}</span>
            </div>
            <div className="property-progress">
              <span style={{ width: `${Math.max(0, Math.min(property.occupancy, 100))}%` }} />
            </div>
            <div className="property-stat-meta">
              <small>{property.occupancy}% {t.metrics.occupancy.toLowerCase()}</small>
              <small>{property.openTicketCount} {t.metrics.openTickets.toLowerCase()}</small>
            </div>
          </button>
        ))}
      </div>

      <div className="mvp-grid">
        <article className="surface surface--board selection-stage" key={`manager-objects-board-${selectedPropertyId}`}>
          <div className="surface-head">
            <div>
              <div className="section-label">{t.sections.twin}</div>
              <h3>{selectedProperty?.name ?? t.sections.twin}</h3>
            </div>
            {selectedProperty ? (
              <div className="mvp-actions">
                <button className="secondary-button" onClick={() => openManagerPropertyEdit(selectedProperty)} type="button">
                  {adminEditLabel}
                </button>
                {canDeletePortfolioItems ? (
                  <button className="text-button" onClick={() => void handleDelete(`/api/properties/${selectedProperty.id}`)} type="button">
                    {t.actions.delete}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="board-shell">
            {boardFloors.length > 0 ? (
              boardFloors.map((entry) => (
                <div className="board-floor" key={entry.floor}>
                  <div className="board-floor-label">{entry.floor > 0 ? `${t.fields.floor} ${entry.floor}` : "G"}</div>
                  <div className="board-floor-track">
                    {entry.units.map((unit) => (
                      <button className={`board-unit board-unit--${unit.status}`} key={unit.id} onClick={() => openUnitDetail(unit.id)} type="button">
                        <div className="board-unit-head">
                          <strong>{unit.number}</strong>
                          <span>{formatArea(unit.area, locale)}</span>
                        </div>
                        <p>{unit.tenantName ?? t.hints.noData}</p>
                        <small>{t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">{t.hints.noData}</div>
            )}
          </div>
        </article>

        <article className="mvp-card selection-stage" key={`manager-objects-units-${selectedPropertyId}`}>
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{t.fields.unit}</div>
              <h3>{t.fields.unit}</h3>
            </div>
            <button className="secondary-button" onClick={() => setManagerScreen("units")} type="button">
              {managerUi.open}
            </button>
          </div>
          <div className="mvp-stack">
            {propertyScopedUnits.map((unit) => (
              <button className="mvp-list-button" key={unit.id} onClick={() => openUnitDetail(unit.id)} type="button">
                <strong>{unit.number}</strong>
                <p>{unit.tenantName ?? t.hints.noData}</p>
                <small>{formatArea(unit.area, locale)} · {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}</small>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );

  const renderManagerStaff = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.staff}</h2>
          <p>{managerUi.subtitles.staff}</p>
        </div>
        <div className="mvp-actions">
          <button className="primary-button" onClick={() => setManagerScreen("staff-add")} type="button">
            {managerUi.add}
          </button>
        </div>
      </div>

      <article className="mvp-card">
        <div className="mvp-table-wrap">
          <table className="mvp-table">
            <thead>
              <tr>
                <th>{managerUi.nav.staff}</th>
                <th>{t.fields.email}</th>
                <th>{managerUi.objectScope}</th>
                <th>{t.fields.status}</th>
              </tr>
            </thead>
            <tbody>
              {overview.team.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.fullName}</strong>
                    <small>{t.roles[member.role]}</small>
                  </td>
                  <td>{member.email ?? "—"}</td>
                  <td>{member.propertyName ?? managerUi.allObjects}</td>
                  <td>{member.lastLoginAt ? formatDateTime(member.lastLoginAt, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );

  const renderManagerStaffCreate = () => (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <button className="mvp-back" onClick={() => setManagerScreen("staff")} type="button">
          {managerUi.back}
        </button>
        <div>
          <h2>{managerUi.titles.staffAdd}</h2>
          <p>{managerUi.subtitles.staffAdd}</p>
        </div>
      </div>

      <article className="mvp-card">
        <form className="form-grid" onSubmit={handleCreateStaff}>
          <label>
            <span>{t.fields.name}</span>
            <input name="fullName" onChange={handleFieldChange(setStaffCreateForm)} value={staffCreateForm.fullName} />
          </label>
          <label>
            <span>{t.fields.email}</span>
            <input name="email" onChange={handleFieldChange(setStaffCreateForm)} value={staffCreateForm.email} />
          </label>
          <label>
            <span>{managerUi.phoneOptional}</span>
            <input name="phone" onChange={handleFieldChange(setStaffCreateForm)} value={staffCreateForm.phone} />
          </label>
          <label>
            <span>{managerUi.passwordTemp}</span>
            <input name="password" onChange={handleFieldChange(setStaffCreateForm)} type="password" value={staffCreateForm.password} />
          </label>
          <label>
            <span>{locale === "ru" ? "Роль" : "Role"}</span>
            <select name="role" onChange={handleFieldChange(setStaffCreateForm)} value={staffCreateForm.role}>
              <option value="worker">{t.roles.worker}</option>
              {session?.user.role === "admin" ? <option value="manager">{t.roles.manager}</option> : null}
              {session?.user.role === "admin" ? <option value="admin">{t.roles.admin}</option> : null}
            </select>
          </label>
          <label>
            <span>{managerUi.objectScope}</span>
            <select
              disabled={staffCreateForm.role === "admin"}
              name="propertyId"
              onChange={handleFieldChange(setStaffCreateForm)}
              value={staffCreateForm.role === "admin" ? "" : staffCreateForm.propertyId}
            >
              {staffCreateForm.role === "admin" ? <option value="">{managerUi.allObjects}</option> : null}
              {overview.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busyAction === "staff-create"} type="submit">
            {managerUi.createStaff}
          </button>
        </form>
      </article>
    </section>
  );

  const renderManagerBilling = () => {
    const remaining = selectedBillingInvoice
      ? Math.max(0, selectedBillingInvoice.totalAmount - selectedBillingInvoice.paidAmount)
      : 0;

    return (
      <section className="mvp-page">
        <div className="mvp-page-header">
          <div>
            <h2>{managerUi.titles.billing}</h2>
            <p>{managerUi.subtitles.billing}</p>
          </div>
          <div className="mvp-actions">
            <button className="secondary-button" onClick={() => void downloadBillingReconciliation()} type="button">
              {locale === "ru" ? "Сверка XLSX" : "Reconciliation XLSX"}
            </button>
            <button className="secondary-button" onClick={() => void downloadExport("billing-ledger")} type="button">
              {locale === "ru" ? "Реестр XLSX" : "Ledger XLSX"}
            </button>
          </div>
        </div>

        <div className="mvp-metrics">
          <article className="mvp-metric">
            <span>{locale === "ru" ? "Начислено" : "Billed"}</span>
            <strong>{formatCompactMoney(billingTotals.billed, locale)}</strong>
            <small>{billingInvoices.length} {locale === "ru" ? "счетов" : "invoices"}</small>
          </article>
          <article className="mvp-metric">
            <span>{locale === "ru" ? "Оплачено" : "Paid"}</span>
            <strong>{formatCompactMoney(billingTotals.paid, locale)}</strong>
            <small>{billingTotals.billed > 0 ? Math.round((billingTotals.paid / billingTotals.billed) * 100) : 0}%</small>
          </article>
          <article className="mvp-metric">
            <span>{ui.arrears}</span>
            <strong>{formatCompactMoney(billingTotals.overdue, locale)}</strong>
            <small>{locale === "ru" ? "к взысканию" : "outstanding"}</small>
          </article>
          <article className="mvp-metric">
            <span>{locale === "ru" ? "На проверке" : "In review"}</span>
            <strong>{pendingPaymentProofTickets.length}</strong>
            <small>{locale === "ru" ? "чеков от арендаторов" : "tenant proofs"}</small>
          </article>
        </div>

        {pendingPaymentProofTickets.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{locale === "ru" ? "Оплаты" : "Payments"}</div>
                <h3>{locale === "ru" ? "Оплаты арендаторов на проверке" : "Tenant payment proofs in review"}</h3>
              </div>
              <span className="status-pill status-pill--warning">{pendingPaymentProofTickets.length}</span>
            </div>
            <div className="mvp-stack">
              {pendingPaymentProofTickets.slice(0, 5).map((ticket) => {
                const linkedInvoice = billingInvoices.find(
                  (invoice) =>
                    invoice.tenantId === ticket.tenantId &&
                    invoice.unitId === ticket.unitId &&
                    invoice.status !== "paid"
                );

                return (
                  <div className="mvp-list-row" key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <p>
                        {ticket.tenantName ?? "—"} · {ticket.propertyName ?? "—"} · {ticket.unitNumber ?? "—"}
                      </p>
                      <small>
                        {ticket.number} · {formatDateTime(ticket.createdAt, locale)} · {ticket.attachmentCount} {locale === "ru" ? "файл." : "files"}
                      </small>
                    </div>
                    <div className="mvp-list-aside">
                      <span className={`status-pill status-pill--${ticket.status}`}>{t.ticketStatuses[ticket.status as keyof typeof t.ticketStatuses]}</span>
                      {linkedInvoice ? <small>{linkedInvoice.period} · {formatMoney(linkedInvoice.totalAmount - linkedInvoice.paidAmount, locale)}</small> : null}
                      {linkedInvoice ? (
                        <button
                          className="secondary-button secondary-button--compact"
                          onClick={() => {
                            setSelectedBillingInvoiceId(linkedInvoice.id);
                            setBillingPaymentForm({
                              amount: String(Math.max(0, linkedInvoice.totalAmount - linkedInvoice.paidAmount)),
                              paidAt: new Date().toISOString().slice(0, 10),
                              method: "bank_transfer",
                              reference: ticket.number
                            });
                          }}
                          type="button"
                        >
                          {locale === "ru" ? "Принять оплату" : "Post payment"}
                        </button>
                      ) : null}
                      <button className="secondary-button secondary-button--compact" onClick={() => openTicketDetail(ticket.id)} type="button">
                        {locale === "ru" ? "Проверить" : "Review"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ) : null}

        {billingReconciliation ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.nav.billing}</div>
                <h3>{locale === "ru" ? "Сверка оплат" : "Payment reconciliation"}</h3>
              </div>
              <span className={`status-pill status-pill--${billingReconciliation.summary.issues > 0 ? "warning" : "success"}`}>
                {billingReconciliation.summary.issues > 0
                  ? locale === "ru"
                    ? `${billingReconciliation.summary.issues} расхожд.`
                    : `${billingReconciliation.summary.issues} issues`
                  : locale === "ru"
                    ? "сошлось"
                    : "matched"}
              </span>
            </div>
            <div className="mvp-metrics mvp-metrics--compact">
              <article className="mvp-metric">
                <span>{locale === "ru" ? "Собираемость" : "Collection"}</span>
                <strong>{billingReconciliation.summary.collectionRate}%</strong>
              </article>
              <article className="mvp-metric">
                <span>{locale === "ru" ? "Остаток" : "Outstanding"}</span>
                <strong>{formatCompactMoney(billingReconciliation.summary.outstanding, locale)}</strong>
              </article>
              <article className="mvp-metric">
                <span>{locale === "ru" ? "Переплата" : "Overpaid"}</span>
                <strong>{formatCompactMoney(billingReconciliation.summary.overpaid, locale)}</strong>
              </article>
            </div>
            <div className="mvp-stack">
              {billingReconciliation.rows
                .filter((row) => row.reconciliationStatus !== "matched")
                .slice(0, 4)
                .map((row) => (
                  <div className="mvp-list-row" key={row.invoiceId}>
                    <div>
                      <strong>
                        {row.tenantName} · {row.period}
                      </strong>
                      <p>
                        {row.contractNumber || "—"} · {row.issue || row.reconciliationStatus}
                      </p>
                    </div>
                    <div className="mvp-list-aside">
                      <strong>{formatMoney(row.outstandingAmount || row.overpaidAmount, locale)}</strong>
                      <small>{row.reconciliationStatus}</small>
                    </div>
                  </div>
                ))}
              {billingReconciliation.rows.every((row) => row.reconciliationStatus === "matched") ? (
                <div className="empty-state">{locale === "ru" ? "Все счета сходятся с оплатами." : "All invoices match payments."}</div>
              ) : null}
            </div>
          </article>
        ) : null}

        <div className="mvp-grid">
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.nav.billing}</div>
                <h3>{locale === "ru" ? "Счета арендаторов" : "Tenant invoices"}</h3>
              </div>
            </div>
            <div className="mvp-table-wrap">
              <table className="mvp-table">
                <thead>
                  <tr>
                    <th>{locale === "ru" ? "Период" : "Period"}</th>
                    <th>{locale === "ru" ? "Арендатор" : "Tenant"}</th>
                    <th>{locale === "ru" ? "Договор" : "Contract"}</th>
                    <th>{locale === "ru" ? "Сумма" : "Total"}</th>
                    <th>{locale === "ru" ? "Оплачено" : "Paid"}</th>
                    <th>{locale === "ru" ? "Срок" : "Due"}</th>
                    <th>{locale === "ru" ? "Статус" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {billingInvoices.map((invoice) => (
                    <tr
                      className={invoice.id === selectedBillingInvoiceId ? "mvp-row-active" : undefined}
                      key={invoice.id}
                      onClick={() => setSelectedBillingInvoiceId(invoice.id)}
                    >
                      <td>{invoice.period}</td>
                      <td>{invoice.tenantName ?? "—"}</td>
                      <td>{invoice.contractNumber ?? "—"}</td>
                      <td>{formatMoney(invoice.totalAmount, locale)}</td>
                      <td>{formatMoney(invoice.paidAmount, locale)}</td>
                      <td>{formatDate(invoice.dueDate, locale)}</td>
                      <td>{ui.paymentStatus[invoice.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="mvp-card">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{locale === "ru" ? "Оплата" : "Payment"}</div>
                <h3>{locale === "ru" ? "Принять платеж" : "Post payment"}</h3>
              </div>
            </div>
            {selectedBillingInvoice ? (
              <form className="mvp-form" onSubmit={handleBillingPaymentSubmit}>
                <label>
                  <span>{locale === "ru" ? "Счет" : "Invoice"}</span>
                  <input readOnly value={`${selectedBillingInvoice.period} · ${selectedBillingInvoice.tenantName ?? ""}`} />
                </label>
                <label>
                  <span>{locale === "ru" ? "Остаток" : "Remaining"}</span>
                  <input readOnly value={formatMoney(remaining, locale)} />
                </label>
                <label>
                  <span>{locale === "ru" ? "Сумма оплаты" : "Payment amount"}</span>
                  <input
                    min="1"
                    name="amount"
                    onChange={handleFieldChange(setBillingPaymentForm)}
                    type="number"
                    value={billingPaymentForm.amount}
                  />
                </label>
                <label>
                  <span>{locale === "ru" ? "Дата оплаты" : "Paid at"}</span>
                  <input
                    name="paidAt"
                    onChange={handleFieldChange(setBillingPaymentForm)}
                    type="date"
                    value={billingPaymentForm.paidAt}
                  />
                </label>
                <label>
                  <span>{locale === "ru" ? "Способ" : "Method"}</span>
                  <select name="method" onChange={handleFieldChange(setBillingPaymentForm)} value={billingPaymentForm.method}>
                    <option value="bank_transfer">{locale === "ru" ? "Безналичный перевод" : "Bank transfer"}</option>
                    <option value="cash">{locale === "ru" ? "Наличные" : "Cash"}</option>
                    <option value="offset">{locale === "ru" ? "Взаимозачет" : "Offset"}</option>
                  </select>
                </label>
                <label>
                  <span>{locale === "ru" ? "Назначение / референс" : "Reference"}</span>
                  <input name="reference" onChange={handleFieldChange(setBillingPaymentForm)} value={billingPaymentForm.reference} />
                </label>
                <button className="primary-button" disabled={busyAction === "billing-payment" || remaining <= 0} type="submit">
                  {locale === "ru" ? "Провести оплату" : "Post payment"}
                </button>
                <button className="secondary-button" onClick={() => void downloadBillingInvoice(selectedBillingInvoice)} type="button">
                  {locale === "ru" ? "Скачать счет XLSX" : "Download invoice XLSX"}
                </button>
                <button className="secondary-button" onClick={() => void downloadBillingClosingPack(selectedBillingInvoice)} type="button">
                  {locale === "ru" ? "Закрывающие XLSX" : "Closing pack XLSX"}
                </button>
                {selectedBillingLease ? (
                  <button className="secondary-button" onClick={() => void loadLeaseDocuments(selectedBillingLease)} type="button">
                    {locale === "ru" ? "Документы договора" : "Lease documents"}
                  </button>
                ) : null}
              </form>
            ) : (
              <div className="empty-state">{locale === "ru" ? "Счета пока не найдены." : "No invoices found."}</div>
            )}
          </article>
        </div>
      </section>
    );
  };

  const renderManagerImport = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.import}</h2>
          <p>{managerUi.subtitles.import}</p>
        </div>
      </div>

      <div className="mvp-grid">
        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.templates}</div>
              <h3>{managerUi.templates}</h3>
            </div>
            <label className="import-mode">
              <span>{locale === "ru" ? "Режим" : "Mode"}</span>
              <select
                onChange={(event) => setImportMode(event.currentTarget.value as "create" | "update" | "upsert")}
                value={importMode}
              >
                <option value="create">{locale === "ru" ? "Только новые" : "Create only"}</option>
                <option value="update">{locale === "ru" ? "Только обновить" : "Update only"}</option>
                <option value="upsert">{locale === "ru" ? "Создать / обновить" : "Create / update"}</option>
              </select>
            </label>
          </div>
          <div className="mvp-stack">
            {(["tenants", "units", "leases", "payments"] as const).map((templateId) => {
              const draft = importDrafts.find((item) => item.templateId === templateId);
              return (
                <div className="mvp-list-row import-row" key={templateId}>
                  <div>
                    <strong>{managerUi.nav[templateId]}</strong>
                    <p>
                      XLS · {locale === "ru" ? "шаблон, проверка и применение" : "template, preview, and apply"}
                      {draft ? ` · ${draft.mode} · ${locale === "ru" ? "ожидает применения" : "pending apply"}` : ""}
                    </p>
                  </div>
                  <div className="mvp-list-aside import-actions">
                    <button className="secondary-button" onClick={() => void downloadImportTemplate(templateId)} type="button">
                      {locale === "ru" ? "Шаблон" : "Template"}
                    </button>
                    <label className="secondary-button import-file-button">
                      <span>{locale === "ru" ? "Проверить" : "Preview"}</span>
                      <input
                        accept=".xls,.xlsx,.csv"
                        disabled={busyAction === `import-${templateId}`}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0] ?? null;
                          void handleImportUpload(templateId, file);
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    {draft ? (
                      <button
                        className="primary-button primary-button--compact"
                        disabled={busyAction === `import-commit-${templateId}`}
                        onClick={() => void handleImportCommit(templateId)}
                        type="button"
                      >
                        {locale === "ru" ? "Применить" : "Apply"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {importResults.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.import}</div>
                <h3>{locale === "ru" ? "Отчеты импорта" : "Import reports"}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importResults.map((result) => (
                <div className="mvp-list-row" key={`${result.templateId}-${result.fileName}`}>
                  <div>
                    <strong>{result.fileName}</strong>
                    <p>
                      {managerUi.nav[result.templateId as keyof typeof managerUi.nav]} · {locale === "ru" ? "готово" : "ready"} {result.summary.ready ?? 0} ·{" "}
                      {locale === "ru" ? "создано" : "created"} {result.summary.created} · {locale === "ru" ? "обновлено" : "updated"} {result.summary.updated ?? 0} ·{" "}
                      {locale === "ru" ? "ошибок" : "errors"} {result.summary.errors}
                    </p>
                    <div className="import-diff-list">
                      {result.rows.slice(0, 5).map((row) => (
                        <div className={`import-diff-row import-diff-row--${row.status}`} key={`${result.templateId}-${result.fileName}-${row.row}`}>
                          <span>
                            {locale === "ru" ? "Строка" : "Row"} {row.row} · {row.action || row.status}
                          </span>
                          <strong>{row.changes || row.message}</strong>
                        </div>
                      ))}
                      {result.rows.length > 5 ? (
                        <small>{locale === "ru" ? `Ещё строк: ${result.rows.length - 5}` : `More rows: ${result.rows.length - 5}`}</small>
                      ) : null}
                    </div>
                  </div>
                  <div className="mvp-list-aside">
                    <button className="secondary-button secondary-button--compact" onClick={() => downloadImportReport(result)} type="button">
                      {locale === "ru" ? "Отчет" : "Report"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {importApprovals.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.import}</div>
                <h3>{locale === "ru" ? "Согласование импорта" : "Import approvals"}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importApprovals.slice(0, 6).map((approval) => (
                <div className="mvp-list-row" key={approval.id}>
                  <div>
                    <strong>{approval.fileName}</strong>
                    <p>
                      {approval.templateId} · {approval.mode} · {approval.rowCount} {locale === "ru" ? "строк" : "rows"} ·{" "}
                      {getImportApprovalStatusLabel(approval.status, locale)}
                    </p>
                    <small>
                      {approval.requestedByName ?? "—"} · {formatDateTime(approval.createdAt, locale)}
                    </small>
                  </div>
                  <div className="mvp-list-aside">
                    {session?.user.role === "admin" && approval.status === "pending" ? (
                      <>
                        <button
                          className="secondary-button secondary-button--compact"
                          disabled={busyAction === `import-approval-approve-${approval.id}`}
                          onClick={() => void handleImportApprovalApprove(approval)}
                          type="button"
                        >
                          {locale === "ru" ? "Подтвердить" : "Approve"}
                        </button>
                        <button
                          className="secondary-button secondary-button--compact"
                          disabled={busyAction === `import-approval-reject-${approval.id}`}
                          onClick={() => void handleImportApprovalReject(approval)}
                          type="button"
                        >
                          {locale === "ru" ? "Отклонить" : "Reject"}
                        </button>
                      </>
                    ) : (
                      <span className={`status-pill status-pill--${approval.status === "approved" ? "success" : approval.status === "rejected" ? "critical" : "warning"}`}>
                        {getImportApprovalStatusLabel(approval.status, locale)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {importBatches.length > 0 ? (
          <article className="mvp-card mvp-card--wide">
            <div className="mvp-card-head">
              <div>
                <div className="section-label">{managerUi.import}</div>
                <h3>{locale === "ru" ? "Партии импорта" : "Import batches"}</h3>
              </div>
            </div>
            <div className="mvp-stack">
              {importBatches.slice(0, 6).map((batch) => (
                <div className="mvp-list-row" key={batch.id}>
                  <div>
                    <strong>{batch.fileName}</strong>
                    <p>
                      {batch.templateId} · {batch.mode} · {batch.operationCount} {locale === "ru" ? "операций" : "operations"} ·{" "}
                      {batch.status === "rolled_back" ? (locale === "ru" ? "отменено" : "rolled back") : locale === "ru" ? "применено" : "applied"}
                    </p>
                    <small>{formatDateTime(batch.createdAt, locale)}</small>
                  </div>
                  <div className="mvp-list-aside">
                    <button className="secondary-button secondary-button--compact" onClick={() => void downloadImportBatchAudit(batch)} type="button">
                      {locale === "ru" ? "Аудит XLSX" : "Audit XLSX"}
                    </button>
                    <button
                      className="secondary-button secondary-button--compact"
                      disabled={batch.status === "rolled_back" || busyAction === `import-rollback-${batch.id}`}
                      onClick={() => void handleImportRollback(batch)}
                      type="button"
                    >
                      {locale === "ru" ? "Откатить" : "Rollback"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className="mvp-card mvp-card--wide">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.readyExports}</div>
              <h3>{managerUi.readyExports}</h3>
            </div>
          </div>
          <div className="mvp-table-wrap">
            <table className="mvp-table">
              <thead>
                <tr>
                  <th>{ui.exports}</th>
                  <th>{ui.scope}</th>
                  <th>{ui.cadence}</th>
                  <th>Status</th>
                  <th>{locale === "ru" ? "Обновлено" : "Updated"}</th>
                  <th>{t.fields.document}</th>
                </tr>
              </thead>
              <tbody>
                {overview.exports.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.format}</small>
                    </td>
                    <td>{item.scope}</td>
                    <td>{item.cadence}</td>
                    <td>{ui.exportStatus[item.status]}</td>
                    <td>{formatDateTime(item.updatedAt, locale)}</td>
                    <td>
                      <button className="secondary-button secondary-button--compact" onClick={() => void downloadExport(item.id)} type="button">
                        {managerUi.open}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );

  const renderManagerProfile = () => (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.profile}</h2>
          <p>{managerUi.subtitles.profile}</p>
        </div>
      </div>

      <div className="mvp-grid">
        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.access}</div>
              <h3>{session.user.fullName}</h3>
            </div>
          </div>
          <div className="mvp-info-list">
            <div className="mvp-info-row"><span>{t.fields.email}</span><strong>{session.user.email ?? "—"}</strong></div>
            <div className="mvp-info-row"><span>{managerUi.phoneOptional}</span><strong>{session.user.phone ?? "—"}</strong></div>
            <div className="mvp-info-row"><span>{managerUi.profileScope}</span><strong>{t.scopeByRole[session.user.role]}</strong></div>
            <div className="mvp-info-row"><span>{managerUi.objectScope}</span><strong>{selectedProperty?.name ?? managerUi.allObjects}</strong></div>
          </div>
          <button className="secondary-button profile-logout" onClick={handleLogout} type="button">
            {t.topbar.logout}
          </button>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <div className="section-label">{managerUi.security}</div>
              <h3>{session.user.totpEnabled ? managerUi.totpEnabled : managerUi.totpDisabled}</h3>
            </div>
          </div>

          {!session.user.totpEnabled && !totpSetup ? (
            <button className="primary-button" disabled={busyAction === "totp-setup"} onClick={handleTotpSetup} type="button">
              {managerUi.totpSetup}
            </button>
          ) : null}

          {!session.user.totpEnabled && totpSetup ? (
            <form className="auth-form" onSubmit={handleTotpConfirm}>
              <p className="auth-inline-copy">{managerUi.totpConfirmHint}</p>
              <label>
                <span>{managerUi.totpSecret}</span>
                <input readOnly value={totpSetup.secret} />
              </label>
              <label>
                <span>{t.auth.mfaCode}</span>
                <input
                  inputMode="numeric"
                  name="code"
                  onChange={(event) => setTotpSetup((current) => (current ? { ...current, code: event.target.value } : current))}
                  value={totpSetup.code}
                />
              </label>
              <button className="primary-button" disabled={busyAction === "totp-confirm"} type="submit">
                {managerUi.confirm}
              </button>
            </form>
          ) : null}

          {session.user.totpEnabled ? (
            <form className="auth-form" onSubmit={handleTotpDisable}>
              <p className="auth-inline-copy">{managerUi.totpDisableHint}</p>
              <label>
                <span>{t.auth.password}</span>
                <input
                  name="password"
                  onChange={(event) =>
                    setTotpSetup((current) => ({
                      secret: current?.secret ?? "",
                      otpauthUrl: current?.otpauthUrl ?? "",
                      code: current?.code ?? "",
                      password: event.target.value
                    }))
                  }
                  type="password"
                  value={totpSetup?.password ?? ""}
                />
              </label>
              <label>
                <span>{t.auth.mfaCode}</span>
                <input
                  inputMode="numeric"
                  name="code"
                  onChange={(event) =>
                    setTotpSetup((current) => ({
                      secret: current?.secret ?? "",
                      otpauthUrl: current?.otpauthUrl ?? "",
                      password: current?.password ?? "",
                      code: event.target.value
                    }))
                  }
                  value={totpSetup?.code ?? ""}
                />
              </label>
              <button className="secondary-button" disabled={busyAction === "totp-disable"} type="submit">
                {managerUi.totpDisable}
              </button>
            </form>
          ) : null}
        </article>
      </div>
    </section>
  );

  const renderDocumentPanel = () =>
    documentPanelLease ? (
      <div className="document-overlay" role="dialog" aria-modal="true">
        <section className="document-panel">
          <div className="document-panel-head">
            <div>
              <span className="section-label">{t.fields.document}</span>
              <h3>{documentPanelLease.contractNumber}</h3>
              <p>
                {documentPanelLease.tenantName ?? "—"} · {documentPanelLease.propertyName ?? "—"} · {documentPanelLease.unitNumber ?? "—"}
              </p>
            </div>
            <button
              className="secondary-button secondary-button--compact"
              onClick={() => {
                setDocumentPanelLease(null);
                setLeaseDocuments([]);
              }}
              type="button"
            >
              {locale === "ru" ? "Закрыть" : "Close"}
            </button>
          </div>

          {canManageDocuments ? (
            <label className="document-upload">
              <span>{locale === "ru" ? "Загрузить файл договора или приложение" : "Upload lease file or appendix"}</span>
              <span className="file-picker-control">
                <span className="file-picker-button">{locale === "ru" ? "Выбрать файл" : "Choose file"}</span>
                <span className="file-picker-name">
                  {busyAction === `lease-document-upload-${documentPanelLease.id}`
                    ? (locale === "ru" ? "Загрузка..." : "Uploading...")
                    : (locale === "ru" ? "PDF, DOC, XLS или изображение" : "PDF, DOC, XLS, or image")}
                </span>
              </span>
              <input
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
                disabled={busyAction === `lease-document-upload-${documentPanelLease.id}`}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  void handleLeaseDocumentUpload(documentPanelLease.id, file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          ) : null}

          <div className="document-list">
            {leaseDocuments.length > 0 ? (
              leaseDocuments.map((item) => (
                <div className="document-row" key={item.id}>
                  <div>
                    <div className="document-row-title">
                      <span className="file-kind-pill">{getFileKind(item.fileName)}</span>
                      <span className="document-category-pill">{getDocumentCategoryLabel(item.category)}</span>
                      <strong>{item.fileName}</strong>
                    </div>
                    <small>
                      {formatFileSize(item.sizeBytes, locale)} · {formatDateTime(item.createdAt, locale)} · {item.uploadedByName ?? "—"}
                    </small>
                  </div>
                  <div className="document-actions">
                    <button className="secondary-button secondary-button--compact" onClick={() => void downloadLeaseDocument(documentPanelLease.id, item)} type="button">
                      {managerUi.open}
                    </button>
                    {canManageDocuments ? (
                      <button className="text-button" onClick={() => void deleteLeaseDocument(documentPanelLease.id, item.id)} type="button">
                        {t.actions.delete}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                {locale === "ru" ? "Файлы по договору еще не загружены." : "No files uploaded for this lease yet."}
              </div>
            )}
          </div>

          <button className="text-button text-button--neutral" onClick={() => void openLeaseDocument(documentPanelLease.id)} type="button">
            {locale === "ru" ? "Открыть системную карточку договора" : "Open generated lease card"}
          </button>
        </section>
      </div>
    ) : null;

  const renderManagerScreen = () => {
    if (managerScreen === "dashboard") {
      return renderManagerDashboard();
    }

    if (managerScreen === "tenants") {
      return renderManagerTenants();
    }

    if (managerScreen === "tenant-detail") {
      return renderManagerTenantDetail();
    }

    if (managerScreen === "tenant-add") {
      return renderManagerFormScreen("tenant-add", "tenants");
    }

    if (managerScreen === "objects") {
      return renderManagerObjects();
    }

    if (managerScreen === "property-add") {
      return renderManagerFormScreen("property-add", "objects");
    }

    if (managerScreen === "object-launch") {
      return renderManagerObjectLaunch();
    }

    if (managerScreen === "units") {
      return renderManagerUnits();
    }

    if (managerScreen === "unit-detail") {
      return renderManagerUnitDetail();
    }

    if (managerScreen === "unit-add") {
      return renderManagerFormScreen("unit-add", "units");
    }

    if (managerScreen === "leases") {
      return renderManagerLeases();
    }

    if (managerScreen === "lease-add") {
      return renderManagerFormScreen("lease-add", "leases");
    }

    if (managerScreen === "billing") {
      return renderManagerBilling();
    }

    if (managerScreen === "tickets") {
      return renderManagerTickets();
    }

    if (managerScreen === "ticket-create") {
      return renderManagerTicketCreate();
    }

    if (managerScreen === "ticket-detail") {
      return renderManagerTicketDetail();
    }

    if (managerScreen === "chat") {
      return renderManagerChat();
    }

    if (managerScreen === "notifications") {
      return renderManagerNotifications();
    }

    if (managerScreen === "staff") {
      return renderManagerStaff();
    }

    if (managerScreen === "staff-add") {
      return renderManagerStaffCreate();
    }

    if (managerScreen === "import") {
      return renderManagerImport();
    }

    return renderManagerProfile();
  };

  const renderManagerShell = () => (
    <main className="mvp-shell">
      <aside className="mvp-sidebar">
        <div className="mvp-brand">
          <div>
            <strong>{productBrand.name}</strong>
            <span>{managerUi.shellRole}</span>
          </div>
        </div>

        <div className="sidebar-locale">
          <div className="locale-switcher" role="group" aria-label={t.localeLabel}>
            <button
              className={locale === "ru" ? "locale-button locale-button--active" : "locale-button"}
              onClick={() => setLocale("ru")}
              type="button"
            >
              RU
            </button>
            <button
              className={locale === "en" ? "locale-button locale-button--active" : "locale-button"}
              onClick={() => setLocale("en")}
              type="button"
            >
              EN
            </button>
          </div>
        </div>

        <div className="mvp-nav-group">
          {managerPrimaryNav.map((screen) => (
            <button
              className={activeManagerNav === screen ? "mvp-nav-button mvp-nav-button--active" : "mvp-nav-button"}
              key={screen}
              onClick={() => setManagerScreen(screen)}
              type="button"
            >
              <span>{managerUi.nav[screen]}</span>
              {screen === "tickets" ? <small>{openTicketCount}</small> : null}
              {screen === "chat" ? <small>{chatThreads.length}</small> : null}
              {screen === "notifications" ? <small>{overview.notifications.filter((item) => item.unread).length}</small> : null}
            </button>
          ))}
        </div>

        <div className="mvp-nav-divider" />

        <div className="mvp-nav-group">
          {managerSecondaryNav.map((screen) => (
            <button
              className={activeManagerNav === screen ? "mvp-nav-button mvp-nav-button--active" : "mvp-nav-button"}
              key={screen}
              onClick={() => setManagerScreen(screen)}
              type="button"
            >
              <span>{managerUi.nav[screen]}</span>
            </button>
          ))}
        </div>

        <div className="mvp-user">
          <strong>{session.user.fullName}</strong>
          <small>{t.roles[session.user.role]} · {selectedProperty?.name ?? productBrand.name}</small>
        </div>
      </aside>

      <section className="mvp-main">
        <header className="mvp-topbar">
          <div className="mvp-breadcrumb">
            <span>{activeManagerNav === "profile" ? managerUi.nav.profile : managerUi.nav[activeManagerNav as keyof typeof managerUi.nav]}</span>
          </div>
        </header>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {notice ? <div className="banner banner--notice">{notice}</div> : null}
        {renderDocumentPanel()}

        {renderManagerScreen()}
      </section>
    </main>
  );

  const renderWorkspaceQuickActions = () => {
    const actions = isWorker
      ? [
          {
            id: "jobs",
            label: locale === "ru" ? "Мои заявки" : "My jobs",
            meta: `${openTicketCount} ${t.metrics.openTickets.toLowerCase()}`,
            tone: openTicketCount > 0 ? "warning" : "success",
            onClick: () => setSelectedSection("service")
          }
        ]
      : [
          {
            id: "ticket",
            label: locale === "ru" ? "Сообщить о проблеме" : "Report issue",
            meta: locale === "ru" ? "заявка в службу эксплуатации" : "service desk ticket",
            tone: "primary",
            onClick: () => setSelectedSection("service")
          },
          {
            id: "leases",
            label: locale === "ru" ? "Договоры и документы" : "Leases and documents",
            meta: `${overview.leases.length} ${t.nav.leases.toLowerCase()}`,
            tone: "neutral",
            onClick: () => setSelectedSection("leases")
          },
          {
            id: "payment",
            label: locale === "ru" ? "Отправить оплату" : "Send payment proof",
            meta: locale === "ru" ? "чек менеджеру" : "receipt to manager",
            tone: overview.finance.arrearsAmount > 0 ? "warning" : "neutral",
            onClick: () => setSelectedSection("leases")
          }
        ];

    return (
      <article className="action-strip action-strip--workspace">
        <div className="action-grid">
          {actions.map((action) => (
            <button className={`action-card action-card--${action.tone}`} key={action.id} onClick={action.onClick} type="button">
              <strong>{action.label}</strong>
              <span>{action.meta}</span>
            </button>
          ))}
        </div>
      </article>
    );
  };

  const renderSection = () => {
    if (activeWorkspaceSection === "overview") {
      return renderOverview();
    }

    if (activeWorkspaceSection === "portfolio") {
      return renderPortfolio();
    }

    if (activeWorkspaceSection === "leases") {
      return renderLeases();
    }

    if (activeWorkspaceSection === "service") {
      return renderService();
    }

    if (activeWorkspaceSection === "chat") {
      return isTenant ? renderTenantChat() : renderService();
    }

    if (canManagePortfolio) {
      return renderAdmin();
    }

    return <section className="section-grid"><div className="empty-state">{t.hints.adminEmpty}</div></section>;
  };

  if (isManagerShell) {
    return renderManagerShell();
  }

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <strong>{productBrand.name}</strong>
          <span>{productBrand.subtitle}</span>
        </div>

        <div className="sidebar-locale">
          <div className="locale-switcher" role="group" aria-label={t.localeLabel}>
            <button
              className={locale === "ru" ? "locale-button locale-button--active" : "locale-button"}
              onClick={() => setLocale("ru")}
              type="button"
            >
              RU
            </button>
            <button
              className={locale === "en" ? "locale-button locale-button--active" : "locale-button"}
              onClick={() => setLocale("en")}
              type="button"
            >
              EN
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <button
              className={activeWorkspaceSection === section ? "nav-button nav-button--active" : "nav-button"}
              key={section}
              onClick={() => setSelectedSection(section)}
              type="button"
            >
              <span>{t.nav[section]}</span>
              {section === "service" ? <small>{openTicketCount}</small> : null}
              {section === "leases" ? <small>{isTenant ? overview.leases.length : overview.expiringLeaseCount}</small> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>{session.user.fullName}</span>
          <small>{t.roles[session.user.role]} · {selectedProperty?.name ?? productBrand.name}</small>
          <button className="secondary-button secondary-button--sidebar" onClick={handleLogout} type="button">
            {t.topbar.logout}
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <p className="section-label">{t.roles[session.user.role]}</p>
            <h1>{sectionTitle}</h1>
          </div>

          <div className="workspace-toolbar">
            <div className="workspace-kpis">
              {!isWorker ? (
                <div className="workspace-kpi">
                  <span>{isTenant ? t.nav.leases : ui.collectionRate}</span>
                  <strong>{isTenant ? overview.leases.length : `${overview.finance.collectionRate}%`}</strong>
                </div>
              ) : null}
              <div className="workspace-kpi">
                <span>{isWorker ? (locale === "ru" ? "Назначенные заявки" : "Assigned jobs") : t.metrics.openTickets}</span>
                <strong>{openTicketCount}</strong>
              </div>
            </div>

          </div>
        </header>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {notice ? <div className="banner banner--notice">{notice}</div> : null}
        {renderDocumentPanel()}

        {renderSection()}
      </section>
    </main>
  );
};

export default App;
