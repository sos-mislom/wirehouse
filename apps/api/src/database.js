import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";

import { hashPassword } from "./auth.js";

const nowIso = () => new Date().toISOString();
const createId = () => crypto.randomUUID();
const clone = (value) => JSON.parse(JSON.stringify(value));
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
const activeLeaseStages = new Set(["signed", "active", "prolongation"]);
const warehouseClasses = new Set(["A+", "A", "B+", "B", "C", "D"]);
const unitTypes = new Set(["warm", "cold", "freezer", "open", "office"]);
const unitStatuses = new Set(["vacant", "occupied", "maintenance"]);
const riskLevels = new Set(["low", "medium", "high"]);
const leaseStages = new Set(["draft", "formed", "sent", "signed", "active", "prolongation", "terminated"]);
const ticketCategories = new Set([
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
  "other"
]);
const ticketPriorities = new Set(["low", "medium", "high", "urgent"]);
const ticketStatuses = new Set(["new", "accepted", "in_progress", "completed", "closed", "rejected", "waiting_tenant", "resolved"]);
const userRoles = new Set(["admin", "manager", "worker", "tenant"]);
const billingStatuses = new Set(["paid", "partial", "late", "overdue", "upcoming"]);
const meterTypes = new Set(["power", "electricity", "cold_chain", "heating", "water"]);
const meterTariffs = {
  power: 7.2,
  electricity: 7.2,
  cold_chain: 14.5,
  heating: 2100,
  water: 95
};

const createChangeResult = (changes) => ({
  lastInsertRowid: 0,
  changes
});

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const createEmptyData = () => ({
  properties: [],
  units: [],
  tenants: [],
  leases: [],
  users: [],
  tickets: [],
  ticket_history: [],
  ticket_comments: [],
  ticket_attachments: [],
  lease_documents: [],
  billing_invoices: [],
  billing_payments: [],
  meter_readings: [],
  notification_events: [],
  notification_deliveries: [],
  otp_bindings: [],
  password_resets: [],
  import_batches: [],
  import_approvals: []
});

const assertEnum = (value, allowedValues, field) => {
  if (!allowedValues.has(value)) {
    throw new Error(`Invalid ${field}`);
  }
};

const compareCreatedAtDesc = (left, right) => String(right.created_at).localeCompare(String(left.created_at));

const compareUnits = (left, right) => {
  const propertyNameOrder = String(left.property_name ?? "").localeCompare(String(right.property_name ?? ""));
  if (propertyNameOrder !== 0) {
    return propertyNameOrder;
  }

  return String(left.number).localeCompare(String(right.number));
};

const compareLeases = (left, right) => String(right.created_at).localeCompare(String(left.created_at));
const compareTickets = (left, right) => String(right.created_at).localeCompare(String(left.created_at));
const compareComments = (left, right) => String(left.created_at).localeCompare(String(right.created_at));

const ticketSlaHoursByPriority = {
  urgent: 4,
  high: 12,
  medium: 48,
  low: 96
};

const checklistTemplatesByCategory = {
  gates_ramps: ["Проверить механизм подъема", "Смазать направляющие", "Проверить датчики безопасности", "Тестовый подъем/опускание", "Фото результата"],
  electrical: ["Обесточить участок", "Проверить щит/автомат", "Устранить неисправность", "Проверить нагрузку", "Фото результата"],
  plumbing: ["Локализовать течь/засор", "Перекрыть участок при необходимости", "Выполнить ремонт", "Проверить давление/слив", "Фото результата"],
  heating: ["Снять показания температуры", "Проверить узел отопления/холода", "Настроить режим", "Повторный замер", "Фото/акт результата"],
  security: ["Проверить устройство доступа", "Проверить журнал событий", "Восстановить доступ/камеру", "Тест с арендатором"],
  territory: ["Осмотреть участок", "Оградить опасную зону", "Назначить подрядчика/работу", "Проверить результат"],
  loading_equipment: ["Остановить оборудование", "Диагностика узла", "Ремонт/замена", "Тест под нагрузкой", "Фото результата"],
  ventilation: ["Проверить вентиляционный узел", "Замерить воздухообмен/шум", "Очистить/настроить", "Повторная проверка"],
  maintenance: ["Осмотр места", "Фото до работ", "Назначить исполнителя", "Выполнить работы", "Фото после работ"],
  billing: ["Проверить начисление", "Сверить договор", "Согласовать с арендатором", "Закрыть обращение"],
  access: ["Проверить права доступа", "Выдать пропуск/ключ", "Подтвердить доступ с арендатором"],
  damage: ["Зафиксировать повреждение", "Фото до работ", "Оценить риск", "Назначить ремонт", "Фото после работ"],
  cleaning: ["Осмотр зоны", "Назначить подрядчика", "Проверить качество уборки"],
  other: ["Уточнить детали", "Назначить ответственного", "Подтвердить результат"]
};

const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
const toIsoDay = (date) => date.toISOString().slice(0, 10);
const startOfMonth = () => {
  const current = new Date();
  return new Date(current.getFullYear(), current.getMonth(), 1);
};
const addMonths = (date, offset) => new Date(date.getFullYear(), date.getMonth() + offset, 1);
const formatPeriod = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const buildChecklistItems = (category) =>
  (checklistTemplatesByCategory[category] ?? checklistTemplatesByCategory.other).map((label) => ({
    id: createId(),
    label,
    required: true,
    completed: false,
    completed_at: null,
    completed_by: null,
    completed_by_name: null
  }));

export class WarehouseDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
    this.backend = this.databaseUrl ? "postgres" : "json";
    this.psqlBin = process.env.PSQL_BIN ?? "psql";
    this.persistLoadedData = false;
    this.demoSeedEnabled = process.env.ENABLE_DEMO_SEED === "true";
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.data = this.load();
    if (this.demoSeedEnabled) {
      this.ensureSeedData();
      this.ensureRichDemoData();
      this.ensureDemoBackfill();
      this.ensureTicketOperationsBackfill();
      this.ensureBillingBackfill();
    }
    if (this.persistLoadedData) {
      this.save();
      this.persistLoadedData = false;
    }
  }

  runPsql(args, input = null) {
    return execFileSync(this.psqlBin, [this.databaseUrl, "-X", ...args], {
      encoding: "utf8",
      input,
      stdio: input === null ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
    });
  }

  ensurePostgresStateTable() {
    this.runPsql([
      "-q",
      "-c",
      "create table if not exists app_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())"
    ]);
  }

  readPostgresState() {
    this.ensurePostgresStateTable();
    const output = this.runPsql([
      "-q",
      "-t",
      "-A",
      "-c",
      "select data::text from app_state where id = 'warehouse'"
    ]).trim();
    return output ? JSON.parse(output) : null;
  }

  writePostgresState(data) {
    this.ensurePostgresStateTable();
    const json = JSON.stringify(data);
    let tag = "warehouse_json";
    while (json.includes(`$${tag}$`)) {
      tag = `warehouse_json_${crypto.randomUUID().replace(/-/g, "")}`;
    }
    const sql = `insert into app_state (id, data, updated_at)
values ('warehouse', $${tag}$${json}$${tag}$::jsonb, now())
on conflict (id) do update set data = excluded.data, updated_at = now();`;
    const filePath = path.join(os.tmpdir(), `warehouse-state-${crypto.randomUUID()}.sql`);
    try {
      fs.writeFileSync(filePath, sql);
      this.runPsql(["-q", "-f", filePath]);
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  load() {
    if (this.backend === "postgres") {
      const state = this.readPostgresState();
      if (state) {
        return {
          properties: ensureArray(state.properties),
          units: ensureArray(state.units),
          tenants: ensureArray(state.tenants),
          leases: ensureArray(state.leases),
          users: ensureArray(state.users),
          tickets: ensureArray(state.tickets),
          ticket_history: ensureArray(state.ticket_history),
          ticket_comments: ensureArray(state.ticket_comments),
          ticket_attachments: ensureArray(state.ticket_attachments),
          lease_documents: ensureArray(state.lease_documents),
          billing_invoices: ensureArray(state.billing_invoices),
          billing_payments: ensureArray(state.billing_payments),
          meter_readings: ensureArray(state.meter_readings),
          notification_events: ensureArray(state.notification_events),
          notification_deliveries: ensureArray(state.notification_deliveries),
          otp_bindings: ensureArray(state.otp_bindings),
          password_resets: ensureArray(state.password_resets),
          import_batches: ensureArray(state.import_batches),
          import_approvals: ensureArray(state.import_approvals)
        };
      }

      if (fs.existsSync(this.dbPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
          this.persistLoadedData = true;
          return {
            properties: ensureArray(raw.properties),
            units: ensureArray(raw.units),
            tenants: ensureArray(raw.tenants),
            leases: ensureArray(raw.leases),
            users: ensureArray(raw.users),
            tickets: ensureArray(raw.tickets),
            ticket_history: ensureArray(raw.ticket_history),
            ticket_comments: ensureArray(raw.ticket_comments),
            ticket_attachments: ensureArray(raw.ticket_attachments),
            lease_documents: ensureArray(raw.lease_documents),
            billing_invoices: ensureArray(raw.billing_invoices),
            billing_payments: ensureArray(raw.billing_payments),
            meter_readings: ensureArray(raw.meter_readings),
            notification_events: ensureArray(raw.notification_events),
            notification_deliveries: ensureArray(raw.notification_deliveries),
            otp_bindings: ensureArray(raw.otp_bindings),
            password_resets: ensureArray(raw.password_resets),
            import_batches: ensureArray(raw.import_batches),
            import_approvals: ensureArray(raw.import_approvals)
          };
        } catch {
          this.persistLoadedData = true;
          return createEmptyData();
        }
      }

      this.persistLoadedData = true;
      return createEmptyData();
    }

    if (!fs.existsSync(this.dbPath)) {
      return createEmptyData();
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
      return {
        properties: ensureArray(raw.properties),
        units: ensureArray(raw.units),
        tenants: ensureArray(raw.tenants),
        leases: ensureArray(raw.leases),
        users: ensureArray(raw.users),
        tickets: ensureArray(raw.tickets),
        ticket_history: ensureArray(raw.ticket_history),
        ticket_comments: ensureArray(raw.ticket_comments),
        ticket_attachments: ensureArray(raw.ticket_attachments),
        lease_documents: ensureArray(raw.lease_documents),
        billing_invoices: ensureArray(raw.billing_invoices),
        billing_payments: ensureArray(raw.billing_payments),
        meter_readings: ensureArray(raw.meter_readings),
        notification_events: ensureArray(raw.notification_events),
        notification_deliveries: ensureArray(raw.notification_deliveries),
        otp_bindings: ensureArray(raw.otp_bindings),
        password_resets: ensureArray(raw.password_resets),
        import_batches: ensureArray(raw.import_batches),
        import_approvals: ensureArray(raw.import_approvals)
      };
    } catch {
      return createEmptyData();
    }
  }

  save() {
    if (this.backend === "postgres") {
      this.writePostgresState(this.data);
      return;
    }

    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  ensureUnique(collection, predicate, message) {
    if (collection.some(predicate)) {
      throw new Error(message);
    }
  }

  getById(collectionName, id) {
    return this.data[collectionName].find((item) => item.id === id) ?? null;
  }

  requireProperty(id) {
    const property = this.getById("properties", id);
    if (!property) {
      throw new Error("Property not found");
    }
    return property;
  }

  requireUnit(id) {
    const unit = this.getById("units", id);
    if (!unit) {
      throw new Error("Unit not found");
    }
    return unit;
  }

  requireTenant(id) {
    const tenant = this.getById("tenants", id);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    return tenant;
  }

  getPropertyById(id) {
    return this.getById("properties", id);
  }

  getUnitById(id) {
    return this.getById("units", id);
  }

  getTenantById(id) {
    return this.getById("tenants", id);
  }

  getLeaseById(id) {
    return this.getById("leases", id);
  }

  getUserByPredicate(predicate) {
    return this.data.users.find(predicate) ?? null;
  }

  setUnitStatus(unitId, status) {
    const unit = this.getUnitById(unitId);
    if (!unit) {
      return;
    }

    unit.status = status;
    unit.updated_at = nowIso();
  }

  countActiveLeasesForUnit(unitId, excludeLeaseId = null) {
    return this.data.leases.filter(
      (lease) =>
        lease.unit_id === unitId &&
        lease.id !== excludeLeaseId &&
        activeLeaseStages.has(lease.stage)
    ).length;
  }

  validatePropertyPayload(record) {
    assertEnum(record.warehouse_class, warehouseClasses, "warehouse class");
  }

  validateUnitPayload(record) {
    assertEnum(record.type, unitTypes, "unit type");
    assertEnum(record.status, unitStatuses, "unit status");
  }

  validateTenantPayload(record) {
    assertEnum(record.risk_level, riskLevels, "risk level");
  }

  validateLeasePayload(record) {
    assertEnum(record.stage, leaseStages, "lease stage");
  }

  validateTicketPayload(record) {
    assertEnum(record.category, ticketCategories, "ticket category");
    assertEnum(record.priority, ticketPriorities, "ticket priority");
    assertEnum(record.status, ticketStatuses, "ticket status");
  }

  validateUserPayload(record) {
    assertEnum(record.role, userRoles, "user role");
  }

  validateBillingInvoicePayload(record) {
    assertEnum(record.status, billingStatuses, "billing status");
    if (!record.period) {
      throw new Error("Billing period is required");
    }
    if (!Number.isFinite(Number(record.total_amount)) || Number(record.total_amount) <= 0) {
      throw new Error("Invoice amount must be positive");
    }
  }

  calculateBillingStatus(invoice) {
    const paidAmount = this.data.billing_payments
      .filter((payment) => payment.invoice_id === invoice.id)
      .reduce((total, payment) => total + Number(payment.amount), 0);
    const totalAmount = Number(invoice.total_amount);
    const dueTime = new Date(invoice.due_date).getTime();

    if (paidAmount >= totalAmount && totalAmount > 0) {
      return "paid";
    }

    if (paidAmount > 0) {
      return "partial";
    }

    if (Number.isFinite(dueTime) && dueTime < Date.now()) {
      return "overdue";
    }

    return "upcoming";
  }

  refreshBillingInvoiceStatus(invoiceId) {
    const invoice = this.getById("billing_invoices", invoiceId);
    if (!invoice) {
      return null;
    }

    invoice.status = this.calculateBillingStatus(invoice);
    invoice.updated_at = nowIso();
    return invoice;
  }

  buildTicketNumber() {
    const year = new Date().getFullYear();
    const next = this.data.tickets.length + 1;
    return `SD-${year}-${String(next).padStart(4, "0")}`;
  }

  ensureSeedData() {
    if (this.data.users.length > 0) {
      return;
    }

    const timestamp = nowIso();

    const propertyA = {
      id: createId(),
      name: "Складской комплекс Север",
      address: "Екатеринбург, ул. Промышленная, 12",
      total_area: 25000,
      rentable_area: 21000,
      warehouse_class: "A",
      description: "Основной распределительный узел.",
      created_at: timestamp,
      updated_at: timestamp
    };

    const propertyB = {
      id: createId(),
      name: "Логистический парк Восток",
      address: "Екатеринбург, Логистический проезд, 7",
      total_area: 18000,
      rentable_area: 15000,
      warehouse_class: "B+",
      description: "Объект под mixed-use хранение.",
      created_at: timestamp,
      updated_at: timestamp
    };

    const tenantA = {
      id: createId(),
      name: "ООО ФростЛайн",
      inn: "6678451234",
      contact_name: "Ирина Ковалева",
      phone: "+79990000001",
      email: "tenant@skladkontur.local",
      risk_level: "medium",
      status: "active",
      created_at: timestamp,
      updated_at: timestamp
    };

    const tenantB = {
      id: createId(),
      name: "ООО ДокСервис",
      inn: "6678451235",
      contact_name: "Алексей Громов",
      phone: "+79990000002",
      email: "docks@skladkontur.local",
      risk_level: "low",
      status: "active",
      created_at: timestamp,
      updated_at: timestamp
    };

    const units = [
      {
        id: createId(),
        property_id: propertyA.id,
        number: "A-101",
        floor: 1,
        area: 1200,
        type: "warm",
        status: "occupied",
        ceiling_height: 12,
        temperature_regime: "+16",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propertyA.id,
        number: "A-102",
        floor: 1,
        area: 900,
        type: "freezer",
        status: "occupied",
        ceiling_height: 10,
        temperature_regime: "-18",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propertyA.id,
        number: "A-103",
        floor: 1,
        area: 1100,
        type: "warm",
        status: "vacant",
        ceiling_height: 11,
        temperature_regime: "+18",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propertyB.id,
        number: "B-201",
        floor: 2,
        area: 700,
        type: "office",
        status: "occupied",
        ceiling_height: 4,
        temperature_regime: "+22",
        has_ramp: 0,
        has_gate: 0,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propertyB.id,
        number: "B-202",
        floor: 2,
        area: 950,
        type: "cold",
        status: "maintenance",
        ceiling_height: 8,
        temperature_regime: "+5",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      }
    ];

    const leases = [
      {
        id: createId(),
        tenant_id: tenantA.id,
        unit_id: units[0].id,
        contract_number: "SK-2026-001",
        stage: "active",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        rate_per_sqm: 1450,
        deposit: 450000,
        indexation_pct: 5,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        tenant_id: tenantB.id,
        unit_id: units[3].id,
        contract_number: "SK-2026-002",
        stage: "active",
        start_date: "2026-02-01",
        end_date: "2026-05-10",
        rate_per_sqm: 980,
        deposit: 150000,
        indexation_pct: 3,
        created_at: timestamp,
        updated_at: timestamp
      }
    ];

    const users = [
      {
        id: createId(),
        email: "admin@skladkontur.local",
        phone: null,
        password_hash: hashPassword("admin123"),
        full_name: "Администратор склад контур",
        role: "admin",
        property_id: null,
        tenant_id: null,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: "manager@skladkontur.local",
        phone: null,
        password_hash: hashPassword("manager123"),
        full_name: "Менеджер Объекта",
        role: "manager",
        property_id: propertyA.id,
        tenant_id: null,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: "worker@skladkontur.local",
        phone: null,
        password_hash: hashPassword("worker123"),
        full_name: "Рабочий Смены",
        role: "worker",
        property_id: propertyA.id,
        tenant_id: null,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: null,
        phone: tenantA.phone,
        password_hash: null,
        full_name: tenantA.contact_name,
        role: "tenant",
        property_id: propertyA.id,
        tenant_id: tenantA.id,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      }
    ];

    const tickets = [
      {
        id: createId(),
        number: "SD-2026-0001",
        unit_id: units[0].id,
        property_id: propertyA.id,
        tenant_id: tenantA.id,
        created_by: users[3].id,
        assigned_to: users[2].id,
        category: "maintenance",
        priority: "high",
        status: "in_progress",
        source_channel: "web",
        title: "Нужна диагностика погрузочных ворот",
        description: "Ворота на секции A-101 открываются с задержкой и не фиксируются в верхнем положении.",
        created_at: timestamp,
        updated_at: timestamp,
        resolved_at: null,
        closed_at: null
      },
      {
        id: createId(),
        number: "SD-2026-0002",
        unit_id: units[3].id,
        property_id: propertyB.id,
        tenant_id: tenantB.id,
        created_by: users[1].id,
        assigned_to: null,
        category: "billing",
        priority: "medium",
        status: "waiting_tenant",
        source_channel: "web",
        title: "Уточнить начисление по марту",
        description: "Требуется сверка фиксированной ставки и депозита по договору SK-2026-002.",
        created_at: timestamp,
        updated_at: timestamp,
        resolved_at: null,
        closed_at: null
      }
    ];

    const ticketComments = [
      {
        id: createId(),
        ticket_id: tickets[0].id,
        author_id: users[3].id,
        content: "Проблема проявляется утром и после интенсивной отгрузки.",
        created_at: timestamp
      },
      {
        id: createId(),
        ticket_id: tickets[0].id,
        author_id: users[2].id,
        content: "Принял в работу, нужен осмотр привода и фиксатора.",
        created_at: timestamp
      }
    ];

    this.data.properties.push(propertyA, propertyB);
    this.data.tenants.push(tenantA, tenantB);
    this.data.units.push(...units);
    this.data.leases.push(...leases);
    this.data.users.push(...users);
    this.data.tickets.push(...tickets);
    this.data.ticket_comments.push(...ticketComments);
    this.save();
  }

  ensureRichDemoData() {
    if (this.data.tenants.length > 4) {
      return;
    }

    const timestamp = nowIso();
    const propA = this.data.properties[0];
    if (!propA) {
      return;
    }

    let propB =
      this.data.properties.find((property) => property.name === "Логистический парк Восток") ??
      this.data.properties[1] ??
      null;
    if (!propB) {
      propB = {
        id: createId(),
        name: "Логистический парк Восток",
        address: "Екатеринбург, Логистический проезд, 7",
        total_area: 18000,
        rentable_area: 15000,
        warehouse_class: "B+",
        description: "Объект под mixed-use хранение.",
        created_at: timestamp,
        updated_at: timestamp
      };
      this.data.properties.push(propB);
    }

    const manager = this.data.users.find((user) => user.role === "manager");
    const worker = this.data.users.find((user) => user.role === "worker");
    if (!manager || !worker) {
      return;
    }

    const extraTenants = [
      {
        id: createId(),
        name: "ООО СеверФарм",
        inn: "6678903456",
        contact_name: "Марина Соколова",
        phone: "+79990000003",
        email: "severfarm@demo.local",
        risk_level: "low",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        name: "ООО МетизКомплект",
        inn: "6678904567",
        contact_name: "Дмитрий Кузнецов",
        phone: "+79990000004",
        email: "metiz@demo.local",
        risk_level: "high",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        name: "ООО Урал Ритейл Резерв",
        inn: "6678905678",
        contact_name: "Елена Новикова",
        phone: "+79990000005",
        email: "uralretail@demo.local",
        risk_level: "medium",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        name: "ИП Волков А.С.",
        inn: "667890678901",
        contact_name: "Андрей Волков",
        phone: "+79990000006",
        email: "volkov@demo.local",
        risk_level: "low",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp
      }
    ];
    this.data.tenants.push(...extraTenants);

    const extraUnits = [
      {
        id: createId(),
        property_id: propA.id,
        number: "A-104",
        floor: 1,
        area: 2200,
        type: "warm",
        status: "occupied",
        ceiling_height: 12,
        temperature_regime: "+18",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propB.id,
        number: "ЮТ-1.1",
        floor: 1,
        area: 1600,
        type: "warm",
        status: "occupied",
        ceiling_height: 10,
        temperature_regime: "+16",
        has_ramp: 1,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propB.id,
        number: "ЮТ-1.2",
        floor: 1,
        area: 1100,
        type: "cold",
        status: "occupied",
        ceiling_height: 8,
        temperature_regime: "+5",
        has_ramp: 1,
        has_gate: 0,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propB.id,
        number: "ЮТ-1.3",
        floor: 1,
        area: 800,
        type: "warm",
        status: "vacant",
        ceiling_height: 9,
        temperature_regime: "+18",
        has_ramp: 0,
        has_gate: 1,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propB.id,
        number: "ЮТ-ОФ-1",
        floor: 2,
        area: 300,
        type: "office",
        status: "vacant",
        ceiling_height: 3,
        temperature_regime: "+22",
        has_ramp: 0,
        has_gate: 0,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        property_id: propB.id,
        number: "ЮТ-ОФ-2",
        floor: 2,
        area: 450,
        type: "office",
        status: "occupied",
        ceiling_height: 3,
        temperature_regime: "+22",
        has_ramp: 0,
        has_gate: 0,
        created_at: timestamp,
        updated_at: timestamp
      }
    ];
    this.data.units.push(...extraUnits);

    const extraLeases = [
      {
        id: createId(),
        tenant_id: extraTenants[0].id,
        unit_id: extraUnits[1].id,
        contract_number: "SK-2026-003",
        stage: "active",
        start_date: "2025-06-01",
        end_date: "2027-05-31",
        rate_per_sqm: 1100,
        deposit: 350000,
        indexation_pct: 5,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        tenant_id: extraTenants[1].id,
        unit_id: extraUnits[5].id,
        contract_number: "SK-2026-004",
        stage: "sent",
        start_date: "2026-06-01",
        end_date: "2028-05-31",
        rate_per_sqm: 850,
        deposit: 200000,
        indexation_pct: 4,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        tenant_id: extraTenants[2].id,
        unit_id: extraUnits[2].id,
        contract_number: "SK-2026-005",
        stage: "active",
        start_date: "2025-03-01",
        end_date: "2026-08-31",
        rate_per_sqm: 950,
        deposit: 180000,
        indexation_pct: 3,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: createId(),
        tenant_id: extraTenants[3].id,
        unit_id: extraUnits[0].id,
        contract_number: "SK-2026-006",
        stage: "draft",
        start_date: "2026-07-01",
        end_date: "2028-06-30",
        rate_per_sqm: 1300,
        deposit: 400000,
        indexation_pct: 5,
        created_at: timestamp,
        updated_at: timestamp
      }
    ];
    this.data.leases.push(...extraLeases);

    for (const unit of extraUnits) {
      if (this.data.leases.some((lease) => lease.unit_id === unit.id && activeLeaseStages.has(lease.stage))) {
        unit.status = "occupied";
      }
    }

    const extraUsers = [
      {
        id: createId(),
        email: null,
        phone: extraTenants[0].phone,
        password_hash: null,
        full_name: extraTenants[0].contact_name,
        role: "tenant",
        property_id: propB.id,
        tenant_id: extraTenants[0].id,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: null,
        phone: extraTenants[2].phone,
        password_hash: null,
        full_name: extraTenants[2].contact_name,
        role: "tenant",
        property_id: propB.id,
        tenant_id: extraTenants[2].id,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: "worker2@skladkontur.local",
        phone: null,
        password_hash: hashPassword("worker123"),
        full_name: "Сергей Климов",
        role: "worker",
        property_id: propB.id,
        tenant_id: null,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      },
      {
        id: createId(),
        email: "manager2@skladkontur.local",
        phone: null,
        password_hash: hashPassword("manager123"),
        full_name: "Максим Лебедев",
        role: "manager",
        property_id: propB.id,
        tenant_id: null,
        is_active: 1,
        created_at: timestamp,
        last_login_at: null
      }
    ];
    this.data.users.push(...extraUsers);

    const worker2 = extraUsers[2];
    const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const ticketNumber = (offset) => `SD-${new Date().getFullYear()}-${String(this.data.tickets.length + offset).padStart(4, "0")}`;
    const extraTickets = [
      {
        id: createId(),
        number: this.buildTicketNumber(),
        unit_id: extraUnits[1].id,
        property_id: propB.id,
        tenant_id: extraTenants[0].id,
        created_by: extraUsers[0].id,
        assigned_to: worker2.id,
        category: "gates_ramps",
        priority: "high",
        status: "new",
        source_channel: "web",
        title: "Проверить автоматику доковых ворот",
        description: "На воротах 4 и 5 периодически не срабатывает концевик закрытия после вечерней отгрузки.",
        created_at: ago(0),
        updated_at: ago(0),
        resolved_at: null,
        closed_at: null
      },
      {
        id: createId(),
        number: ticketNumber(4),
        unit_id: extraUnits[2].id,
        property_id: propB.id,
        tenant_id: extraTenants[2].id,
        created_by: extraUsers[1].id,
        assigned_to: null,
        category: "heating",
        priority: "urgent",
        status: "new",
        source_channel: "web",
        title: "Нарушение температурного режима в холодильной камере",
        description: "Температура в секции ЮТ-1.2 поднялась до +12°C при норме +5°C. Риск порчи продукции.",
        created_at: ago(0),
        updated_at: ago(0),
        resolved_at: null,
        closed_at: null
      },
      {
        id: createId(),
        number: ticketNumber(5),
        unit_id: extraUnits[5].id,
        property_id: propB.id,
        tenant_id: extraTenants[1].id,
        created_by: extraUsers[3].id,
        assigned_to: worker2.id,
        category: "electrical",
        priority: "urgent",
        status: "accepted",
        source_channel: "web",
        title: "Выпустить временные пропуска для подрядчика",
        description: "Подрядчик ООО ЭлектроМонтаж приезжает завтра для замены щита. Нужны пропуска на 3 человека.",
        created_at: ago(0),
        updated_at: ago(0),
        resolved_at: null,
        closed_at: null
      },
      {
        id: createId(),
        number: ticketNumber(6),
        unit_id: extraUnits[0].id,
        property_id: propA.id,
        tenant_id: extraTenants[3].id,
        created_by: manager.id,
        assigned_to: worker.id,
        category: "territory",
        priority: "medium",
        status: "in_progress",
        source_channel: "web",
        title: "Подготовить склад 6500 м² к показу",
        description: "Потенциальный арендатор ИП Волков А.С. приедет на осмотр. Нужно навести порядок, проверить освещение и ворота.",
        created_at: ago(1),
        updated_at: ago(0),
        resolved_at: null,
        closed_at: null
      },
      {
        id: createId(),
        number: ticketNumber(7),
        unit_id: this.data.units[0].id,
        property_id: propA.id,
        tenant_id: this.data.tenants[0].id,
        created_by: this.data.users[3]?.id ?? manager.id,
        assigned_to: worker.id,
        category: "plumbing",
        priority: "high",
        status: "completed",
        source_channel: "web",
        title: "Протечка в зоне разгрузки A-101",
        description: "Обнаружена течь в районе разгрузочного дока. Вода скапливается у стеллажей.",
        created_at: ago(3),
        updated_at: ago(1),
        resolved_at: ago(1),
        closed_at: null
      },
      {
        id: createId(),
        number: ticketNumber(8),
        unit_id: this.data.units[1].id,
        property_id: propA.id,
        tenant_id: this.data.tenants[0].id,
        created_by: this.data.users[3]?.id ?? manager.id,
        assigned_to: worker.id,
        category: "security",
        priority: "medium",
        status: "closed",
        source_channel: "web",
        title: "Камера наблюдения у входа в A-102 не работает",
        description: "Камера №7 у входа в морозильную секцию не передаёт изображение уже 2 дня.",
        created_at: ago(7),
        updated_at: ago(5),
        resolved_at: ago(5),
        closed_at: ago(4)
      },
      {
        id: createId(),
        number: ticketNumber(9),
        unit_id: extraUnits[1].id,
        property_id: propB.id,
        tenant_id: extraTenants[0].id,
        created_by: extraUsers[0].id,
        assigned_to: worker2.id,
        category: "ventilation",
        priority: "low",
        status: "closed",
        source_channel: "web",
        title: "Шум вентиляции в секции ЮТ-1.1",
        description: "Гудит вентиляционная установка, мешает работать. Просим осмотреть.",
        created_at: ago(14),
        updated_at: ago(10),
        resolved_at: ago(10),
        closed_at: ago(9)
      },
      {
        id: createId(),
        number: ticketNumber(10),
        unit_id: extraUnits[0].id,
        property_id: propA.id,
        tenant_id: extraTenants[3].id,
        created_by: manager.id,
        assigned_to: worker.id,
        category: "loading_equipment",
        priority: "medium",
        status: "rejected",
        source_channel: "web",
        title: "Запрос на установку дополнительной рампы",
        description: "Арендатор просит установить вторую рампу. Передано в отдел развития.",
        created_at: ago(20),
        updated_at: ago(18),
        resolved_at: null,
        closed_at: null
      }
    ];
    this.data.tickets.push(...extraTickets);

    this.data.ticket_comments.push(
      {
        id: createId(),
        ticket_id: extraTickets[0].id,
        author_id: extraUsers[0].id,
        content: "Проблема повторяется на пиковых отгрузках после 18:00, просим проверить до конца смены.",
        created_at: ago(0)
      },
      {
        id: createId(),
        ticket_id: extraTickets[0].id,
        author_id: worker2.id,
        content: "Взял в работу. Сначала проверю датчик положения и журнал ошибок контроллера.",
        created_at: ago(0)
      },
      {
        id: createId(),
        ticket_id: extraTickets[3].id,
        author_id: worker.id,
        content: "Территория убрана, освещение проверено. Осталось проверить ворота — закончу до 16:00.",
        created_at: ago(0)
      },
      {
        id: createId(),
        ticket_id: extraTickets[4].id,
        author_id: worker.id,
        content: "Течь устранена: заменена прокладка на соединении трубы. Просушка территории до утра.",
        created_at: ago(1)
      }
    );

    this.save();
  }

  ensureDemoBackfill() {
    let changed = false;

    if (this.data.tickets.length === 0 && this.data.properties.length > 0 && this.data.units.length > 0) {
      const timestamp = nowIso();
      const manager = this.data.users.find((user) => user.role === "manager") ?? this.data.users[0];
      const worker = this.data.users.find((user) => user.role === "worker") ?? null;
      const tenantUser = this.data.users.find((user) => user.role === "tenant") ?? null;
      const tenant = tenantUser?.tenant_id ? this.getTenantById(tenantUser.tenant_id) : this.data.tenants[0] ?? null;
      const primaryUnit =
        this.data.units.find((unit) => unit.status === "occupied") ??
        this.data.units.find((unit) => unit.status === "maintenance") ??
        this.data.units[0];
      const secondaryUnit =
        this.data.units.find((unit) => unit.id !== primaryUnit.id && unit.status !== "vacant") ??
        this.data.units.find((unit) => unit.id !== primaryUnit.id) ??
        primaryUnit;
      const primaryProperty = this.getPropertyById(primaryUnit.property_id);
      const secondaryProperty = this.getPropertyById(secondaryUnit.property_id);

      const seededTickets = [
        {
          id: createId(),
          number: this.buildTicketNumber(),
          unit_id: primaryUnit.id,
          property_id: primaryProperty?.id ?? primaryUnit.property_id,
          tenant_id: tenant?.id ?? null,
          created_by: tenantUser?.id ?? manager?.id ?? this.data.users[0]?.id,
          assigned_to: worker?.id ?? null,
          category: "maintenance",
          priority: "high",
          status: "in_progress",
          source_channel: "web",
          title: "Нужна диагностика погрузочных ворот",
          description: "Ворота открываются с задержкой и не фиксируются в верхнем положении.",
          created_at: timestamp,
          updated_at: timestamp,
          resolved_at: null,
          closed_at: null
        },
        {
          id: createId(),
          number: `SD-${new Date().getFullYear()}-${String(this.data.tickets.length + 2).padStart(4, "0")}`,
          unit_id: secondaryUnit.id,
          property_id: secondaryProperty?.id ?? secondaryUnit.property_id,
          tenant_id: this.data.tenants[1]?.id ?? tenant?.id ?? null,
          created_by: manager?.id ?? this.data.users[0]?.id,
          assigned_to: null,
          category: "billing",
          priority: "medium",
          status: "waiting_tenant",
          source_channel: "web",
          title: "Уточнить начисление по марту",
          description: "Требуется сверка фиксированной ставки и депозита по активному договору.",
          created_at: timestamp,
          updated_at: timestamp,
          resolved_at: null,
          closed_at: null
        }
      ];

      this.data.tickets.push(...seededTickets);
      changed = true;

      if (this.data.ticket_comments.length === 0) {
        this.data.ticket_comments.push(
          {
            id: createId(),
            ticket_id: seededTickets[0].id,
            author_id: tenantUser?.id ?? manager?.id ?? this.data.users[0]?.id,
            content: "Проблема проявляется утром и после интенсивной отгрузки.",
            created_at: timestamp
          },
          {
            id: createId(),
            ticket_id: seededTickets[0].id,
            author_id: worker?.id ?? manager?.id ?? this.data.users[0]?.id,
            content: "Принял в работу, нужен осмотр привода и фиксатора.",
            created_at: timestamp
          }
        );
      }
    } else if (this.data.ticket_comments.length === 0 && this.data.tickets.length > 0) {
      const timestamp = nowIso();
      const firstTicket = this.data.tickets[0];
      const commentAuthor = this.data.users.find((user) => user.role === "worker") ?? this.data.users[0];

      if (firstTicket && commentAuthor) {
        this.data.ticket_comments.push({
          id: createId(),
          ticket_id: firstTicket.id,
          author_id: commentAuthor.id,
          content: "Первичный осмотр внесён автоматически для заполнения демо-контура.",
          created_at: timestamp
        });
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  ensureTicketOperationsBackfill() {
    let changed = false;
    for (const ticket of this.data.tickets) {
      const createdAt = ticket.created_at ? new Date(ticket.created_at) : new Date();
      const priority = ticket.priority && ticketSlaHoursByPriority[ticket.priority] ? ticket.priority : "medium";
      if (!ticket.sla_hours) {
        ticket.sla_hours = ticketSlaHoursByPriority[priority];
        changed = true;
      }
      if (!ticket.sla_due_at) {
        ticket.sla_due_at = addHours(createdAt, Number(ticket.sla_hours));
        changed = true;
      }
      if (!Array.isArray(ticket.checklist_items) || ticket.checklist_items.length === 0) {
        ticket.checklist_items = buildChecklistItems(ticket.category);
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  ensureBillingBackfill() {
    let changed = false;
    const currentMonth = startOfMonth();
    const existingInvoiceKeys = new Set(
      this.data.billing_invoices.map((invoice) => `${invoice.lease_id}:${invoice.period}`)
    );

    for (const lease of this.data.leases.filter((item) => activeLeaseStages.has(item.stage))) {
      const unit = this.getUnitById(lease.unit_id);
      const tenant = this.getTenantById(lease.tenant_id);
      if (!unit || !tenant) {
        continue;
      }

      const monthlyRent = Math.round(Number(unit.area) * Number(lease.rate_per_sqm));
      const variableCharge = Math.round(Number(unit.area) * (unit.type === "freezer" ? 140 : unit.type === "office" ? 55 : 82));

      for (const offset of [-2, -1, 0, 1]) {
        const periodDate = addMonths(currentMonth, offset);
        const period = formatPeriod(periodDate);
        const invoiceKey = `${lease.id}:${period}`;
        if (existingInvoiceKeys.has(invoiceKey)) {
          continue;
        }

        const dueDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), 10);
        const status =
          offset > 0
            ? "upcoming"
            : tenant.risk_level === "high" && offset === 0
              ? "overdue"
              : tenant.risk_level !== "low" && offset === -1
                ? "late"
                : "paid";
        const invoiceId = createId();
        const amount = monthlyRent + variableCharge;
        this.data.billing_invoices.push({
          id: invoiceId,
          lease_id: lease.id,
          tenant_id: tenant.id,
          unit_id: unit.id,
          period,
          rent_amount: monthlyRent,
          variable_amount: variableCharge,
          total_amount: amount,
          due_date: toIsoDay(dueDate),
          status,
          created_at: nowIso(),
          updated_at: nowIso()
        });

        if (["paid", "late"].includes(status)) {
          const paidDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + (status === "late" ? 6 : 1));
          this.data.billing_payments.push({
            id: createId(),
            invoice_id: invoiceId,
            tenant_id: tenant.id,
            amount,
            paid_at: toIsoDay(paidDate),
            method: "bank_transfer",
            reference: `PAY-${period}-${String(this.data.billing_payments.length + 1).padStart(4, "0")}`,
            created_at: nowIso()
          });
        }

        changed = true;
      }

      const meterKey = `${unit.id}:${formatPeriod(currentMonth)}`;
      if (!this.data.meter_readings.some((reading) => `${reading.unit_id}:${reading.period}` === meterKey)) {
        this.data.meter_readings.push({
          id: createId(),
          unit_id: unit.id,
          tenant_id: tenant.id,
          period: formatPeriod(currentMonth),
          meter_type: unit.type === "freezer" ? "cold_chain" : unit.type === "office" ? "electricity" : "power",
          value: Math.round(Number(unit.area) * (unit.type === "freezer" ? 4.6 : unit.type === "office" ? 2.1 : 3.2)),
          previous_value: Math.round(Number(unit.area) * (unit.type === "freezer" ? 4.2 : unit.type === "office" ? 2.0 : 3.0)),
          recorded_at: nowIso(),
          status: unit.status === "maintenance" ? "attention" : "stable"
        });
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  getUserByEmail(email) {
    const user = this.getUserByPredicate((item) => item.email === email && item.is_active === 1);
    return user ? clone(user) : null;
  }

  getTenantUserByPhone(phone) {
    const normalized = normalizePhoneKey(phone);
    const user = this.getUserByPredicate(
      (item) => normalizePhoneKey(item.phone) === normalized && item.role === "tenant" && item.is_active === 1
    );
    return user ? clone(user) : null;
  }

  getTenantUserByNormalizedPhone(phone) {
    const normalized = normalizePhoneKey(phone);
    const user = this.getUserByPredicate(
      (item) =>
        normalizePhoneKey(item.phone) === normalized &&
        item.role === "tenant" &&
        item.is_active === 1
    );
    return user ? clone(user) : null;
  }

  getOtpBinding(channel, phone) {
    const normalized = normalizePhoneKey(phone);
    const binding = this.data.otp_bindings.find(
      (item) => item.channel === channel && normalizePhoneKey(item.phone) === normalized
    );
    return binding ? clone(binding) : null;
  }

  getOtpBindingByRecipient(channel, recipientId) {
    const binding = this.data.otp_bindings.find(
      (item) => item.channel === channel && String(item.recipient_id) === String(recipientId)
    );
    return binding ? clone(binding) : null;
  }

  upsertOtpBinding(payload) {
    const normalized = normalizePhoneKey(payload.phone);
    const existing = this.data.otp_bindings.find(
      (item) => item.channel === payload.channel && normalizePhoneKey(item.phone) === normalized
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
      updated_at: nowIso()
    };

    if (existing) {
      Object.assign(existing, next);
    } else {
      this.data.otp_bindings.push(next);
    }

    this.save();
    return clone(next);
  }

  getActiveOtpBindingsForUser(user) {
    const phone = String(user?.phone ?? "").replace(/[^\d+]/g, "");
    if (!phone) {
      return [];
    }

    return clone(
      this.data.otp_bindings.filter(
        (item) => String(item.phone ?? "").replace(/[^\d+]/g, "") === phone && item.recipient_id
      )
    );
  }

  createPasswordReset(payload) {
    this.data.password_resets = this.data.password_resets.filter(
      (item) => item.user_id !== payload.userId && new Date(item.expires_at).getTime() > Date.now()
    );

    const record = {
      id: createId(),
      user_id: payload.userId,
      code_hash: payload.codeHash,
      expires_at: payload.expiresAt,
      attempts: 0,
      consumed_at: null,
      created_at: nowIso()
    };
    this.data.password_resets.push(record);
    this.save();
    return clone(record);
  }

  getActivePasswordReset(userId) {
    const reset = [...this.data.password_resets]
      .filter(
        (item) =>
          item.user_id === userId &&
          !item.consumed_at &&
          new Date(item.expires_at).getTime() > Date.now()
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
    this.save();
    return clone(reset);
  }

  consumePasswordReset(id) {
    const reset = this.getById("password_resets", id);
    if (!reset) {
      return;
    }
    reset.consumed_at = nowIso();
    this.save();
  }

  updateUserPassword(id, password) {
    const user = this.getById("users", id);
    if (!user) {
      return null;
    }
    user.password_hash = hashPassword(password);
    this.save();
    return clone(user);
  }

  setUserTotpPending(id, secret) {
    const user = this.getById("users", id);
    if (!user) {
      return null;
    }
    user.totp_pending_secret = secret;
    this.save();
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
    this.save();
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
    this.save();
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
          required: true
        }))
      }))
    );
  }

  createUser(payload) {
    if (payload.role === "tenant") {
      throw new Error("Tenant users are managed from tenant records");
    }

    if (payload.propertyId) {
      this.requireProperty(payload.propertyId);
    }

    this.ensureUnique(this.data.users, (user) => user.email === payload.email, "User email must be unique");

    if (payload.phone) {
      this.ensureUnique(
        this.data.users,
        (user) => user.phone === payload.phone,
        "User phone must be unique"
      );
    }

    const record = {
      id: createId(),
      email: payload.email,
      phone: payload.phone || null,
      password_hash: hashPassword(payload.password),
      full_name: payload.fullName,
      role: payload.role,
      property_id: payload.role === "admin" ? null : (payload.propertyId ?? null),
      tenant_id: null,
      is_active: 1,
      created_at: nowIso(),
      last_login_at: null
    };

    this.validateUserPayload(record);
    this.data.users.push(record);
    this.save();
    return clone(record);
  }

  markUserLoggedIn(id) {
    const user = this.getById("users", id);
    if (!user) {
      return;
    }

    user.last_login_at = nowIso();
    this.save();
  }

  listProperties() {
    return clone([...this.data.properties].sort(compareCreatedAtDesc));
  }

  getProperty(id) {
    const property = this.getById("properties", id);
    return property ? clone(property) : null;
  }

  createProperty(payload) {
    const record = {
      id: createId(),
      name: payload.name,
      address: payload.address,
      total_area: Number(payload.totalArea),
      rentable_area: Number(payload.rentableArea),
      warehouse_class: payload.warehouseClass,
      description: payload.description ?? "",
      created_at: nowIso(),
      updated_at: nowIso()
    };

    this.validatePropertyPayload(record);
    this.data.properties.push(record);
    this.save();
    return clone(record);
  }

  updateProperty(id, payload) {
    const current = this.getById("properties", id);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      name: payload.name ?? current.name,
      address: payload.address ?? current.address,
      total_area: payload.totalArea !== undefined ? Number(payload.totalArea) : current.total_area,
      rentable_area: payload.rentableArea !== undefined ? Number(payload.rentableArea) : current.rentable_area,
      warehouse_class: payload.warehouseClass ?? current.warehouse_class,
      description: payload.description ?? current.description,
      updated_at: nowIso()
    };

    this.validatePropertyPayload(next);
    Object.assign(current, next);
    this.save();
    return clone(current);
  }

  deleteProperty(id) {
    const current = this.getById("properties", id);
    if (!current) {
      return createChangeResult(0);
    }

    const unitIds = new Set(this.data.units.filter((unit) => unit.property_id === id).map((unit) => unit.id));
    const ticketIds = new Set(
      this.data.tickets
        .filter((ticket) => ticket.property_id === id || unitIds.has(ticket.unit_id))
        .map((ticket) => ticket.id)
    );
    this.data.leases = this.data.leases.filter((lease) => !unitIds.has(lease.unit_id));
    this.data.ticket_comments = this.data.ticket_comments.filter((comment) => !ticketIds.has(comment.ticket_id));
    this.data.ticket_attachments = this.data.ticket_attachments.filter((attachment) => !ticketIds.has(attachment.ticket_id));
    this.data.ticket_history = this.data.ticket_history.filter((event) => !ticketIds.has(event.ticket_id));
    this.data.tickets = this.data.tickets.filter((ticket) => !ticketIds.has(ticket.id));
    this.data.units = this.data.units.filter((unit) => unit.property_id !== id);
    this.data.users = this.data.users.map((user) =>
      user.property_id === id
        ? {
            ...user,
            property_id: null
          }
        : user
    );
    this.data.properties = this.data.properties.filter((property) => property.id !== id);
    this.save();
    return createChangeResult(1);
  }

  listUnits(filters = {}) {
    const activeLeaseByUnit = new Map(
      this.data.leases
        .filter((lease) => activeLeaseStages.has(lease.stage))
        .map((lease) => [lease.unit_id, lease])
    );

    const rows = this.data.units
      .filter((unit) => (filters.propertyId ? unit.property_id === filters.propertyId : true))
      .filter((unit) => (filters.status ? unit.status === filters.status : true))
      .map((unit) => {
        const property = this.getPropertyById(unit.property_id);
        const lease = activeLeaseByUnit.get(unit.id) ?? null;
        const tenant = lease ? this.getTenantById(lease.tenant_id) : null;

        return {
          ...unit,
          property_name: property?.name ?? null,
          tenant_name: tenant?.name ?? null,
          lease_stage: lease?.stage ?? null,
          lease_end_date: lease?.end_date ?? null
        };
      })
      .sort(compareUnits);

    return clone(rows);
  }

  getUnit(id) {
    const unit = this.getById("units", id);
    return unit ? clone(unit) : null;
  }

  createUnit(payload) {
    this.requireProperty(payload.propertyId);
    this.ensureUnique(
      this.data.units,
      (unit) => unit.property_id === payload.propertyId && unit.number === payload.number,
      "Unit number must be unique within the property"
    );

    const record = {
      id: createId(),
      property_id: payload.propertyId,
      number: payload.number,
      floor: Number(payload.floor),
      area: Number(payload.area),
      type: payload.type,
      status: payload.status,
      ceiling_height: Number(payload.ceilingHeight ?? 0),
      temperature_regime: payload.temperatureRegime ?? "",
      has_ramp: payload.hasRamp ? 1 : 0,
      has_gate: payload.hasGate ? 1 : 0,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    this.validateUnitPayload(record);
    this.data.units.push(record);
    this.save();
    return clone(record);
  }

  updateUnit(id, payload) {
    const current = this.getById("units", id);
    if (!current) {
      return null;
    }

    const nextPropertyId = payload.propertyId ?? current.property_id;
    this.requireProperty(nextPropertyId);

    this.ensureUnique(
      this.data.units,
      (unit) =>
        unit.id !== id &&
        unit.property_id === nextPropertyId &&
        unit.number === (payload.number ?? current.number),
      "Unit number must be unique within the property"
    );

    const next = {
      ...current,
      property_id: nextPropertyId,
      number: payload.number ?? current.number,
      floor: payload.floor !== undefined ? Number(payload.floor) : current.floor,
      area: payload.area !== undefined ? Number(payload.area) : current.area,
      type: payload.type ?? current.type,
      status: payload.status ?? current.status,
      ceiling_height:
        payload.ceilingHeight !== undefined ? Number(payload.ceilingHeight) : current.ceiling_height,
      temperature_regime: payload.temperatureRegime ?? current.temperature_regime,
      has_ramp: payload.hasRamp !== undefined ? (payload.hasRamp ? 1 : 0) : current.has_ramp,
      has_gate: payload.hasGate !== undefined ? (payload.hasGate ? 1 : 0) : current.has_gate,
      updated_at: nowIso()
    };

    this.validateUnitPayload(next);
    Object.assign(current, next);
    this.save();
    return clone(current);
  }

  deleteUnit(id) {
    const current = this.getById("units", id);
    if (!current) {
      return createChangeResult(0);
    }

    const ticketIds = new Set(this.data.tickets.filter((ticket) => ticket.unit_id === id).map((ticket) => ticket.id));
    this.data.ticket_comments = this.data.ticket_comments.filter((comment) => !ticketIds.has(comment.ticket_id));
    this.data.ticket_attachments = this.data.ticket_attachments.filter((attachment) => !ticketIds.has(attachment.ticket_id));
    this.data.ticket_history = this.data.ticket_history.filter((event) => !ticketIds.has(event.ticket_id));
    this.data.tickets = this.data.tickets.filter((ticket) => ticket.unit_id !== id);
    this.data.leases = this.data.leases.filter((lease) => lease.unit_id !== id);
    this.data.units = this.data.units.filter((unit) => unit.id !== id);
    this.save();
    return createChangeResult(1);
  }

  listTenants() {
    const rows = this.data.tenants
      .map((tenant) => ({
        ...tenant,
        lease_count: this.data.leases.filter(
          (lease) => lease.tenant_id === tenant.id && lease.stage !== "terminated"
        ).length
      }))
      .sort(compareCreatedAtDesc);

    return clone(rows);
  }

  getTenant(id) {
    const tenant = this.getById("tenants", id);
    return tenant ? clone(tenant) : null;
  }

  getTenantPortalUser(tenantId) {
    const user = this.getUserByPredicate((item) => item.tenant_id === tenantId && item.role === "tenant");
    return user ? clone(user) : null;
  }

  syncTenantPortalUser(tenantRecord) {
    const existingUser = this.getUserByPredicate(
      (item) => item.tenant_id === tenantRecord.id && item.role === "tenant"
    );

    this.ensureUnique(
      this.data.users,
      (user) => user.phone === tenantRecord.phone && user.id !== existingUser?.id,
      "User phone must be unique"
    );

    if (existingUser) {
      existingUser.phone = tenantRecord.phone;
      existingUser.full_name = tenantRecord.contact_name;
      existingUser.tenant_id = tenantRecord.id;
      existingUser.is_active = 1;
      return existingUser.id;
    }

    const userId = createId();
    this.data.users.push({
      id: userId,
      email: null,
      phone: tenantRecord.phone,
      password_hash: null,
      full_name: tenantRecord.contact_name,
      role: "tenant",
      property_id: null,
      tenant_id: tenantRecord.id,
      is_active: 1,
      created_at: tenantRecord.created_at ?? nowIso(),
      last_login_at: null
    });

    return userId;
  }

  createTenant(payload) {
    this.ensureUnique(this.data.tenants, (tenant) => tenant.inn === payload.inn, "Tenant INN must be unique");
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.phone === payload.phone,
      "Tenant phone must be unique"
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.email === payload.email,
      "Tenant email must be unique"
    );

    const record = {
      id: createId(),
      name: payload.name,
      inn: payload.inn,
      contact_name: payload.contactName,
      phone: payload.phone,
      email: payload.email,
      risk_level: payload.riskLevel,
      status: payload.status ?? "active",
      created_at: nowIso(),
      updated_at: nowIso()
    };

    this.validateTenantPayload(record);
    this.data.tenants.push(record);
    this.syncTenantPortalUser(record);
    this.save();
    return clone(record);
  }

  updateTenant(id, payload) {
    const current = this.getById("tenants", id);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      name: payload.name ?? current.name,
      inn: payload.inn ?? current.inn,
      contact_name: payload.contactName ?? current.contact_name,
      phone: payload.phone ?? current.phone,
      email: payload.email ?? current.email,
      risk_level: payload.riskLevel ?? current.risk_level,
      status: payload.status ?? current.status,
      updated_at: nowIso()
    };

    this.ensureUnique(this.data.tenants, (tenant) => tenant.id !== id && tenant.inn === next.inn, "Tenant INN must be unique");
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.id !== id && tenant.phone === next.phone,
      "Tenant phone must be unique"
    );
    this.ensureUnique(
      this.data.tenants,
      (tenant) => tenant.id !== id && tenant.email === next.email,
      "Tenant email must be unique"
    );

    this.validateTenantPayload(next);
    Object.assign(current, next);
    this.syncTenantPortalUser(current);
    this.save();
    return clone(current);
  }

  deleteTenant(id) {
    const current = this.getById("tenants", id);
    if (!current) {
      return createChangeResult(0);
    }

    const relatedLeases = this.data.leases.filter((lease) => lease.tenant_id === id);
    for (const lease of relatedLeases) {
      this.setUnitStatus(lease.unit_id, "vacant");
    }

    this.data.users = this.data.users
      .filter((user) => !(user.tenant_id === id && user.role === "tenant"))
      .map((user) =>
        user.tenant_id === id
          ? {
              ...user,
              tenant_id: null
            }
          : user
      );
    this.data.tickets = this.data.tickets.map((ticket) =>
      ticket.tenant_id === id
        ? {
            ...ticket,
            tenant_id: null,
            updated_at: nowIso()
          }
        : ticket
    );
    this.data.leases = this.data.leases.filter((lease) => lease.tenant_id !== id);
    this.data.tenants = this.data.tenants.filter((tenant) => tenant.id !== id);
    this.save();
    return createChangeResult(1);
  }

  listLeases() {
    const rows = this.data.leases
      .map((lease) => {
        const tenant = this.getTenantById(lease.tenant_id);
        const unit = this.getUnitById(lease.unit_id);
        const property = unit ? this.getPropertyById(unit.property_id) : null;

        return {
          ...lease,
          tenant_name: tenant?.name ?? null,
          unit_number: unit?.number ?? null,
          property_name: property?.name ?? null
        };
      })
      .sort(compareLeases);

    return clone(rows);
  }

  getLease(id) {
    const lease = this.getById("leases", id);
    return lease ? clone(lease) : null;
  }

  createLease(payload) {
    this.requireTenant(payload.tenantId);
    this.requireUnit(payload.unitId);
    this.ensureUnique(
      this.data.leases,
      (lease) => lease.unit_id === payload.unitId,
      "Unit already has a lease"
    );
    this.ensureUnique(
      this.data.leases,
      (lease) => lease.contract_number === payload.contractNumber,
      "Contract number must be unique"
    );

    const record = {
      id: createId(),
      tenant_id: payload.tenantId,
      unit_id: payload.unitId,
      contract_number: payload.contractNumber,
      stage: payload.stage,
      start_date: payload.startDate,
      end_date: payload.endDate,
      rate_per_sqm: Number(payload.ratePerSqm),
      deposit: Number(payload.deposit ?? 0),
      indexation_pct: Number(payload.indexationPct ?? 0),
      created_at: nowIso(),
      updated_at: nowIso()
    };

    this.validateLeasePayload(record);
    this.data.leases.push(record);

    if (activeLeaseStages.has(record.stage)) {
      this.setUnitStatus(record.unit_id, "occupied");
    }

    this.save();
    return clone(record);
  }

  updateLease(id, payload) {
    const current = this.getById("leases", id);
    if (!current) {
      return null;
    }

    const nextTenantId = payload.tenantId ?? current.tenant_id;
    const nextUnitId = payload.unitId ?? current.unit_id;
    this.requireTenant(nextTenantId);
    this.requireUnit(nextUnitId);
    this.ensureUnique(
      this.data.leases,
      (lease) => lease.id !== id && lease.unit_id === nextUnitId,
      "Unit already has a lease"
    );
    this.ensureUnique(
      this.data.leases,
      (lease) => lease.id !== id && lease.contract_number === (payload.contractNumber ?? current.contract_number),
      "Contract number must be unique"
    );

    const previousUnitId = current.unit_id;
    const next = {
      ...current,
      tenant_id: nextTenantId,
      unit_id: nextUnitId,
      contract_number: payload.contractNumber ?? current.contract_number,
      stage: payload.stage ?? current.stage,
      start_date: payload.startDate ?? current.start_date,
      end_date: payload.endDate ?? current.end_date,
      rate_per_sqm:
        payload.ratePerSqm !== undefined ? Number(payload.ratePerSqm) : current.rate_per_sqm,
      deposit: payload.deposit !== undefined ? Number(payload.deposit) : current.deposit,
      indexation_pct:
        payload.indexationPct !== undefined ? Number(payload.indexationPct) : current.indexation_pct,
      updated_at: nowIso()
    };

    this.validateLeasePayload(next);
    Object.assign(current, next);

    if (previousUnitId !== current.unit_id && this.countActiveLeasesForUnit(previousUnitId, id) === 0) {
      this.setUnitStatus(previousUnitId, "vacant");
    }

    if (activeLeaseStages.has(current.stage)) {
      this.setUnitStatus(current.unit_id, "occupied");
    } else if (this.countActiveLeasesForUnit(current.unit_id, id) === 0) {
      this.setUnitStatus(current.unit_id, "vacant");
    }

    this.save();
    return clone(current);
  }

  deleteLease(id) {
    const current = this.getById("leases", id);
    if (!current) {
      return createChangeResult(0);
    }

    this.data.leases = this.data.leases.filter((lease) => lease.id !== id);
    this.data.lease_documents = this.data.lease_documents.filter((document) => document.lease_id !== id);
    if (this.countActiveLeasesForUnit(current.unit_id) === 0) {
      this.setUnitStatus(current.unit_id, "vacant");
    }
    this.save();
    return createChangeResult(1);
  }

  listLeaseDocuments(leaseId) {
    return clone(
      this.data.lease_documents
        .filter((document) => document.lease_id === leaseId)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    );
  }

  getLeaseDocument(id) {
    const document = this.getById("lease_documents", id);
    return document ? clone(document) : null;
  }

  createLeaseDocument(payload) {
    const lease = this.getLeaseById(payload.leaseId);
    if (!lease) {
      throw new Error("Lease not found");
    }

    const uploader = this.getById("users", payload.uploadedBy);
    if (!uploader) {
      throw new Error("Uploader not found");
    }

    const record = {
      id: createId(),
      lease_id: payload.leaseId,
      file_name: payload.fileName,
      stored_name: payload.storedName,
      document_category: payload.category ?? "other",
      mime_type: payload.mimeType,
      size_bytes: Number(payload.sizeBytes),
      uploaded_by: payload.uploadedBy,
      uploaded_by_name: uploader.full_name,
      created_at: nowIso()
    };

    this.data.lease_documents.push(record);
    lease.updated_at = nowIso();
    this.save();
    return clone(record);
  }

  deleteLeaseDocument(id) {
    const current = this.getById("lease_documents", id);
    if (!current) {
      return { result: createChangeResult(0), document: null };
    }

    this.data.lease_documents = this.data.lease_documents.filter((document) => document.id !== id);
    const lease = this.getLeaseById(current.lease_id);
    if (lease) {
      lease.updated_at = nowIso();
    }
    this.save();
    return { result: createChangeResult(1), document: clone(current) };
  }

  listTickets(filters = {}) {
    const rows = this.data.tickets
      .filter((ticket) => (filters.propertyId ? ticket.property_id === filters.propertyId : true))
      .filter((ticket) => (filters.status ? ticket.status === filters.status : true))
      .filter((ticket) => (filters.tenantId ? ticket.tenant_id === filters.tenantId : true))
      .map((ticket) => {
        const property = this.getPropertyById(ticket.property_id);
        const unit = this.getUnitById(ticket.unit_id);
        const tenant = ticket.tenant_id ? this.getTenantById(ticket.tenant_id) : null;
        const createdBy = this.getById("users", ticket.created_by);
        const assignedTo = ticket.assigned_to ? this.getById("users", ticket.assigned_to) : null;
        const commentCount = this.data.ticket_comments.filter((comment) => comment.ticket_id === ticket.id).length;
        const attachmentCount = this.data.ticket_attachments.filter(
          (attachment) => attachment.ticket_id === ticket.id
        ).length;

        return {
          ...ticket,
          property_name: property?.name ?? null,
          unit_number: unit?.number ?? null,
          tenant_name: tenant?.name ?? null,
          created_by_name: createdBy?.full_name ?? null,
          assigned_to_name: assignedTo?.full_name ?? null,
          comment_count: commentCount,
          attachment_count: attachmentCount
        };
      })
      .sort(compareTickets);

    return clone(rows);
  }

  getTicket(id) {
    const ticket = this.getById("tickets", id);
    return ticket ? clone(ticket) : null;
  }

  createTicket(payload) {
    const unit = this.requireUnit(payload.unitId);
    const property = this.requireProperty(unit.property_id);
    const createdAt = nowIso();
    const slaHours = ticketSlaHoursByPriority[payload.priority] ?? ticketSlaHoursByPriority.medium;

    if (payload.tenantId) {
      this.requireTenant(payload.tenantId);
    }

    if (payload.assignedTo) {
      const assignee = this.getById("users", payload.assignedTo);
      if (!assignee) {
        throw new Error("Assigned user not found");
      }
    }

    const record = {
      id: createId(),
      number: this.buildTicketNumber(),
      unit_id: unit.id,
      property_id: property.id,
      tenant_id: payload.tenantId ?? null,
      created_by: payload.createdBy,
      assigned_to: payload.assignedTo ?? null,
      category: payload.category,
      priority: payload.priority,
      status: payload.status ?? "new",
      source_channel: payload.sourceChannel ?? "web",
      title: payload.title,
      description: payload.description,
      sla_hours: slaHours,
      sla_due_at: payload.slaDueAt ?? addHours(new Date(createdAt), slaHours),
      checklist_items: buildChecklistItems(payload.category),
      created_at: createdAt,
      updated_at: createdAt,
      resolved_at: null,
      closed_at: null
    };

    this.validateTicketPayload(record);
    this.data.tickets.push(record);
    this.data.ticket_history.push({
      id: createId(),
      ticket_id: record.id,
      type: "created",
      from_status: null,
      to_status: record.status,
      reason: payload.reason ?? null,
      created_by: payload.createdBy,
      created_at: createdAt
    });
    this.save();
    return clone(record);
  }

  updateTicket(id, payload) {
    const current = this.getById("tickets", id);
    if (!current) {
      return null;
    }

    const nextUnitId = payload.unitId ?? current.unit_id;
    const unit = this.requireUnit(nextUnitId);
    const property = this.requireProperty(unit.property_id);
    const nextTenantId = payload.tenantId !== undefined ? payload.tenantId : current.tenant_id;

    if (nextTenantId) {
      this.requireTenant(nextTenantId);
    }

    if (payload.assignedTo !== undefined && payload.assignedTo !== null) {
      const assignee = this.getById("users", payload.assignedTo);
      if (!assignee) {
        throw new Error("Assigned user not found");
      }
    }

    const previousStatus = current.status;
    const nextStatus = payload.status ?? current.status;
    const nextCategory = payload.category ?? current.category;
    const next = {
      ...current,
      unit_id: unit.id,
      property_id: property.id,
      tenant_id: nextTenantId,
      assigned_to: payload.assignedTo !== undefined ? payload.assignedTo : current.assigned_to,
      category: nextCategory,
      priority: payload.priority ?? current.priority,
      status: nextStatus,
      source_channel: payload.sourceChannel ?? current.source_channel,
      title: payload.title ?? current.title,
      description: payload.description ?? current.description,
      sla_hours: payload.slaHours !== undefined ? Number(payload.slaHours) : (current.sla_hours ?? ticketSlaHoursByPriority[payload.priority ?? current.priority] ?? ticketSlaHoursByPriority.medium),
      sla_due_at: payload.slaDueAt ?? current.sla_due_at ?? addHours(new Date(current.created_at), ticketSlaHoursByPriority[payload.priority ?? current.priority] ?? ticketSlaHoursByPriority.medium),
      checklist_items:
        payload.resetChecklist === true || !Array.isArray(current.checklist_items)
          ? buildChecklistItems(nextCategory)
          : current.checklist_items,
      updated_at: nowIso(),
      resolved_at:
        nextStatus === "resolved"
          ? current.resolved_at ?? nowIso()
          : nextStatus === "closed"
            ? current.resolved_at ?? nowIso()
            : null,
      closed_at: nextStatus === "closed" ? current.closed_at ?? nowIso() : null
    };

    this.validateTicketPayload(next);
    Object.assign(current, next);
    if (current.status !== previousStatus) {
      this.data.ticket_history.push({
        id: createId(),
        ticket_id: current.id,
        type: payload.reopenReason ? "reopened" : "status_changed",
        from_status: previousStatus,
        to_status: current.status,
        reason: payload.reopenReason ?? payload.reason ?? null,
        created_by: payload.updatedBy ?? null,
        created_at: nowIso()
      });
    }
    this.save();
    return clone(current);
  }

  listTicketHistory(ticketId) {
    const rows = this.data.ticket_history
      .filter((event) => event.ticket_id === ticketId)
      .map((event) => {
        const author = event.created_by ? this.getById("users", event.created_by) : null;
        return {
          ...event,
          created_by_name: author?.full_name ?? null
        };
      })
      .sort(compareComments);

    return clone(rows);
  }

  updateTicketChecklistItem(ticketId, itemId, payload) {
    const ticket = this.getById("tickets", ticketId);
    if (!ticket) {
      return null;
    }

    if (!Array.isArray(ticket.checklist_items)) {
      ticket.checklist_items = buildChecklistItems(ticket.category);
    }

    const item = ticket.checklist_items.find((entry) => entry.id === itemId);
    if (!item) {
      return null;
    }

    const completed = Boolean(payload.completed);
    item.completed = completed;
    item.completed_at = completed ? nowIso() : null;
    item.completed_by = completed ? payload.completedBy : null;
    item.completed_by_name = completed ? (this.getById("users", payload.completedBy)?.full_name ?? null) : null;
    ticket.updated_at = nowIso();

    this.save();
    return clone(item);
  }

  listTicketComments(ticketId) {
    const rows = this.data.ticket_comments
      .filter((comment) => comment.ticket_id === ticketId)
      .map((comment) => {
        const author = this.getById("users", comment.author_id);
        return {
          ...comment,
          author_name: author?.full_name ?? null,
          author_role: author?.role ?? null
        };
      })
      .sort(compareComments);

    return clone(rows);
  }

  createTicketComment(payload) {
    const ticket = this.getTicket(payload.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const author = this.getById("users", payload.authorId);
    if (!author) {
      throw new Error("Author not found");
    }

    const record = {
      id: createId(),
      ticket_id: payload.ticketId,
      author_id: payload.authorId,
      source_channel: payload.sourceChannel ?? "web",
      content: payload.content,
      created_at: nowIso()
    };

    this.data.ticket_comments.push(record);

    const storedTicket = this.getById("tickets", payload.ticketId);
    if (storedTicket) {
      storedTicket.updated_at = nowIso();
    }

    this.save();
    return clone(record);
  }

  listTicketAttachments(ticketId) {
    return clone(
      this.data.ticket_attachments
        .filter((attachment) => attachment.ticket_id === ticketId)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    );
  }

  getTicketAttachment(id) {
    const attachment = this.getById("ticket_attachments", id);
    return attachment ? clone(attachment) : null;
  }

  createTicketAttachment(payload) {
    const ticket = this.getTicket(payload.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const uploader = this.getById("users", payload.uploadedBy);
    if (!uploader) {
      throw new Error("Uploader not found");
    }

    const record = {
      id: createId(),
      ticket_id: payload.ticketId,
      file_name: payload.fileName,
      stored_name: payload.storedName,
      mime_type: payload.mimeType,
      size_bytes: Number(payload.sizeBytes),
      media_type: payload.mediaType,
      note: payload.note ?? "",
      uploaded_by: payload.uploadedBy,
      uploaded_by_name: uploader.full_name,
      created_at: nowIso()
    };

    this.data.ticket_attachments.push(record);

    const storedTicket = this.getById("tickets", payload.ticketId);
    if (storedTicket) {
      storedTicket.updated_at = nowIso();
    }

    this.save();
    return clone(record);
  }

  deleteTicketAttachment(id) {
    const current = this.getById("ticket_attachments", id);
    if (!current) {
      return { result: createChangeResult(0), attachment: null };
    }

    this.data.ticket_attachments = this.data.ticket_attachments.filter((attachment) => attachment.id !== id);
    const ticket = this.getById("tickets", current.ticket_id);
    if (ticket) {
      ticket.updated_at = nowIso();
    }
    this.save();
    return { result: createChangeResult(1), attachment: clone(current) };
  }

  listBillingInvoices(filters = {}) {
    const rows = this.data.billing_invoices
      .filter((invoice) => (filters.tenantId ? invoice.tenant_id === filters.tenantId : true))
      .filter((invoice) => (filters.leaseId ? invoice.lease_id === filters.leaseId : true))
      .filter((invoice) => (filters.ids ? filters.ids.includes(invoice.id) : true))
      .map((invoice) => {
        const lease = this.getLeaseById(invoice.lease_id);
        const unit = this.getUnitById(invoice.unit_id);
        const property = unit ? this.getPropertyById(unit.property_id) : null;
        const tenant = this.getTenantById(invoice.tenant_id);
        const payments = this.data.billing_payments.filter((payment) => payment.invoice_id === invoice.id);
        const paidAmount = payments.reduce((total, payment) => total + Number(payment.amount), 0);
        return {
          ...invoice,
          contract_number: lease?.contract_number ?? null,
          tenant_name: tenant?.name ?? null,
          unit_number: unit?.number ?? null,
          property_name: property?.name ?? null,
          paid_amount: paidAmount,
          paid_at: payments.sort((left, right) => String(right.paid_at).localeCompare(String(left.paid_at)))[0]?.paid_at ?? null
        };
      })
      .sort((left, right) => String(right.period).localeCompare(String(left.period)));

    return clone(rows);
  }

  getBillingInvoice(id) {
    return this.listBillingInvoices({ ids: [id] })[0] ?? null;
  }

  createBillingInvoice(payload) {
    const lease = this.getLeaseById(payload.leaseId);
    if (!lease) {
      throw new Error("Lease not found");
    }
    const tenant = this.requireTenant(lease.tenant_id);
    const unit = this.requireUnit(lease.unit_id);

    this.ensureUnique(
      this.data.billing_invoices,
      (invoice) => invoice.lease_id === lease.id && invoice.period === payload.period,
      "Invoice for this lease period already exists"
    );

    const rentAmount =
      payload.rentAmount !== undefined
        ? Number(payload.rentAmount)
        : Math.round(Number(unit.area) * Number(lease.rate_per_sqm));
    const variableAmount = Number(payload.variableAmount ?? 0);
    const totalAmount = payload.totalAmount !== undefined ? Number(payload.totalAmount) : rentAmount + variableAmount;
    const record = {
      id: createId(),
      lease_id: lease.id,
      tenant_id: tenant.id,
      unit_id: unit.id,
      period: payload.period,
      rent_amount: rentAmount,
      variable_amount: variableAmount,
      total_amount: totalAmount,
      due_date: payload.dueDate,
      status: payload.status ?? "upcoming",
      created_at: nowIso(),
      updated_at: nowIso()
    };

    record.status = payload.status ?? this.calculateBillingStatus(record);
    this.validateBillingInvoicePayload(record);
    this.data.billing_invoices.push(record);
    this.save();
    return this.getBillingInvoice(record.id);
  }

  updateBillingInvoice(id, payload) {
    const current = this.getById("billing_invoices", id);
    if (!current) {
      return null;
    }

    const rentAmount = payload.rentAmount !== undefined ? Number(payload.rentAmount) : current.rent_amount;
    const variableAmount = payload.variableAmount !== undefined ? Number(payload.variableAmount) : current.variable_amount;
    const next = {
      ...current,
      period: payload.period ?? current.period,
      rent_amount: rentAmount,
      variable_amount: variableAmount,
      total_amount: payload.totalAmount !== undefined ? Number(payload.totalAmount) : rentAmount + variableAmount,
      due_date: payload.dueDate ?? current.due_date,
      status: payload.status ?? current.status,
      updated_at: nowIso()
    };

    this.ensureUnique(
      this.data.billing_invoices,
      (invoice) =>
        invoice.id !== id &&
        invoice.lease_id === current.lease_id &&
        invoice.period === next.period,
      "Invoice for this lease period already exists"
    );

    Object.assign(current, next);
    current.status = payload.status ?? this.calculateBillingStatus(current);
    this.validateBillingInvoicePayload(current);
    this.save();
    return this.getBillingInvoice(current.id);
  }

  listBillingPayments(filters = {}) {
    const rows = this.data.billing_payments
      .filter((payment) => (filters.invoiceId ? payment.invoice_id === filters.invoiceId : true))
      .filter((payment) => (filters.tenantId ? payment.tenant_id === filters.tenantId : true))
      .map((payment) => {
        const invoice = this.getById("billing_invoices", payment.invoice_id);
        const tenant = this.getTenantById(payment.tenant_id);
        const lease = invoice ? this.getLeaseById(invoice.lease_id) : null;
        return {
          ...payment,
          period: invoice?.period ?? null,
          invoice_status: invoice?.status ?? null,
          contract_number: lease?.contract_number ?? null,
          tenant_name: tenant?.name ?? null
        };
      })
      .sort((left, right) => String(right.paid_at).localeCompare(String(left.paid_at)));

    return clone(rows);
  }

  createBillingPayment(payload) {
    const invoice = this.getById("billing_invoices", payload.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payment amount must be positive");
    }

    const record = {
      id: createId(),
      invoice_id: invoice.id,
      tenant_id: invoice.tenant_id,
      amount,
      paid_at: payload.paidAt ?? toIsoDay(new Date()),
      method: payload.method ?? "bank_transfer",
      reference: payload.reference ?? `PAY-${invoice.period}-${String(this.data.billing_payments.length + 1).padStart(4, "0")}`,
      created_at: nowIso()
    };

    this.data.billing_payments.push(record);
    this.refreshBillingInvoiceStatus(invoice.id);
    this.save();
    return clone({
      ...record,
      invoice: this.getBillingInvoice(invoice.id)
    });
  }

  updateBillingPayment(id, payload) {
    const current = this.getById("billing_payments", id);
    if (!current) {
      return null;
    }

    const nextInvoiceId = payload.invoiceId ?? current.invoice_id;
    const invoice = this.getById("billing_invoices", nextInvoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const amount = payload.amount !== undefined ? Number(payload.amount) : Number(current.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payment amount must be positive");
    }

    const previousInvoiceId = current.invoice_id;
    Object.assign(current, {
      invoice_id: invoice.id,
      tenant_id: invoice.tenant_id,
      amount,
      paid_at: payload.paidAt ?? current.paid_at,
      method: payload.method ?? current.method,
      reference: payload.reference ?? current.reference
    });

    this.refreshBillingInvoiceStatus(previousInvoiceId);
    this.refreshBillingInvoiceStatus(invoice.id);
    this.save();
    return clone({
      ...current,
      invoice: this.getBillingInvoice(invoice.id)
    });
  }

  deleteBillingPayment(id) {
    const current = this.getById("billing_payments", id);
    if (!current) {
      return createChangeResult(0);
    }

    const invoiceId = current.invoice_id;
    this.data.billing_payments = this.data.billing_payments.filter((payment) => payment.id !== id);
    this.refreshBillingInvoiceStatus(invoiceId);
    this.save();
    return createChangeResult(1);
  }

  listImportApprovals() {
    return clone(
      this.data.import_approvals
        .map((approval) => ({
          ...approval,
          row_count: Array.isArray(approval.rows) ? approval.rows.length : 0
        }))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    );
  }

  getImportApproval(id) {
    const approval = this.getById("import_approvals", id);
    return approval ? clone(approval) : null;
  }

  createImportApproval(payload) {
    const record = {
      id: createId(),
      template_id: payload.templateId,
      file_name: payload.fileName,
      mode: payload.mode,
      content_base64: payload.contentBase64,
      summary: clone(payload.summary ?? {}),
      rows: clone(payload.rows ?? []),
      report: clone(payload.report ?? null),
      requested_by: payload.requestedBy ?? null,
      requested_by_name: payload.requestedByName ?? null,
      status: "pending",
      created_at: nowIso(),
      decided_at: null,
      decided_by: null,
      batch_id: null
    };

    this.data.import_approvals.push(record);
    this.save();
    return clone(record);
  }

  markImportApprovalApproved(id, userId, batchId) {
    const approval = this.getById("import_approvals", id);
    if (!approval) {
      return null;
    }

    approval.status = "approved";
    approval.decided_at = nowIso();
    approval.decided_by = userId;
    approval.batch_id = batchId ?? null;
    this.save();
    return clone(approval);
  }

  rejectImportApproval(id, userId) {
    const approval = this.getById("import_approvals", id);
    if (!approval) {
      return null;
    }
    if (approval.status !== "pending") {
      throw new Error("Import approval is already closed");
    }

    approval.status = "rejected";
    approval.decided_at = nowIso();
    approval.decided_by = userId;
    this.save();
    return clone(approval);
  }

  listImportBatches() {
    return clone(
      this.data.import_batches
        .map((batch) => ({
          ...batch,
          operation_count: Array.isArray(batch.operations) ? batch.operations.length : 0
        }))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    );
  }

  getImportBatch(id) {
    const batch = this.getById("import_batches", id);
    return batch ? clone(batch) : null;
  }

  createImportBatch(payload) {
    const record = {
      id: createId(),
      template_id: payload.templateId,
      file_name: payload.fileName,
      mode: payload.mode,
      summary: clone(payload.summary ?? {}),
      rows: clone(payload.rows ?? []),
      operations: clone(payload.operations ?? []),
      created_by: payload.createdBy ?? null,
      created_by_name: payload.createdByName ?? null,
      status: "applied",
      rollback_error: null,
      created_at: nowIso(),
      rolled_back_at: null
    };

    this.data.import_batches.push(record);
    this.save();
    return clone(record);
  }

  rollbackImportBatch(id, userId = null) {
    const batch = this.getById("import_batches", id);
    if (!batch) {
      return null;
    }
    if (batch.status === "rolled_back") {
      throw new Error("Import batch already rolled back");
    }

    const operations = Array.isArray(batch.operations) ? [...batch.operations].reverse() : [];
    for (const operation of operations) {
      if (operation.action === "create") {
        if (operation.entity_type === "tenant") {
          this.deleteTenant(operation.entity_id);
        } else if (operation.entity_type === "unit") {
          this.deleteUnit(operation.entity_id);
        } else if (operation.entity_type === "lease") {
          this.deleteLease(operation.entity_id);
        } else if (operation.entity_type === "payment") {
          this.deleteBillingPayment(operation.entity_id);
        }
      } else if (operation.action === "update" && operation.before) {
        if (operation.entity_type === "tenant") {
          this.updateTenant(operation.entity_id, operation.before);
        } else if (operation.entity_type === "unit") {
          this.updateUnit(operation.entity_id, operation.before);
        } else if (operation.entity_type === "lease") {
          this.updateLease(operation.entity_id, operation.before);
        } else if (operation.entity_type === "payment") {
          this.updateBillingPayment(operation.entity_id, operation.before);
        }
      }
    }

    batch.status = "rolled_back";
    batch.rolled_back_at = nowIso();
    batch.rolled_back_by = userId;
    batch.rollback_error = null;
    this.save();
    return clone(batch);
  }

  listMeterReadings(filters = {}) {
    const rows = this.data.meter_readings
      .filter((reading) => (filters.tenantId ? reading.tenant_id === filters.tenantId : true))
      .filter((reading) => (filters.unitId ? reading.unit_id === filters.unitId : true))
      .filter((reading) => (filters.period ? reading.period === filters.period : true))
      .map((reading) => {
        const unit = this.getUnitById(reading.unit_id);
        const tenant = this.getTenantById(reading.tenant_id);
        const lease = this.data.leases.find(
          (item) =>
            item.tenant_id === reading.tenant_id &&
            item.unit_id === reading.unit_id &&
            activeLeaseStages.has(item.stage)
        );
        const consumption = Math.max(0, Number(reading.value) - Number(reading.previous_value ?? 0));
        const tariffRate = Number(reading.tariff_rate ?? meterTariffs[reading.meter_type] ?? 0);
        return {
          ...reading,
          unit_number: unit?.number ?? null,
          tenant_name: tenant?.name ?? null,
          lease_id: lease?.id ?? null,
          contract_number: lease?.contract_number ?? null,
          consumption,
          tariff_rate: tariffRate,
          charge_amount: Number(reading.charge_amount ?? Math.round(consumption * tariffRate))
        };
      })
      .sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)));

    return clone(rows);
  }

  createMeterReading(payload) {
    const unit = this.requireUnit(payload.unitId);
    const activeLease = this.data.leases.find(
      (lease) =>
        lease.unit_id === unit.id &&
        activeLeaseStages.has(lease.stage) &&
        (!payload.tenantId || lease.tenant_id === payload.tenantId)
    );
    if (!activeLease) {
      throw new Error("Active lease not found for unit");
    }

    const tenant = this.requireTenant(activeLease.tenant_id);
    const meterType = payload.meterType ?? (unit.type === "freezer" ? "cold_chain" : unit.type === "office" ? "electricity" : "power");
    assertEnum(meterType, meterTypes, "meter type");

    const period = String(payload.period ?? formatPeriod(startOfMonth()));
    const value = Number(payload.value);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Meter value must be positive");
    }

    const previousReading = this.data.meter_readings
      .filter((reading) => reading.unit_id === unit.id && reading.meter_type === meterType && reading.period !== period)
      .sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)))[0];
    const previousValue = payload.previousValue !== undefined ? Number(payload.previousValue) : Number(previousReading?.value ?? 0);
    if (!Number.isFinite(previousValue) || previousValue < 0) {
      throw new Error("Previous meter value must be positive");
    }
    if (value < previousValue) {
      throw new Error("Meter value cannot be lower than previous value");
    }

    const tariffRate = payload.tariffRate !== undefined ? Number(payload.tariffRate) : Number(meterTariffs[meterType] ?? 0);
    if (!Number.isFinite(tariffRate) || tariffRate < 0) {
      throw new Error("Tariff rate must be positive");
    }

    const consumption = Math.max(0, value - previousValue);
    const chargeAmount = payload.chargeAmount !== undefined ? Number(payload.chargeAmount) : Math.round(consumption * tariffRate);
    if (!Number.isFinite(chargeAmount) || chargeAmount < 0) {
      throw new Error("Charge amount must be positive");
    }

    const existing = this.data.meter_readings.find(
      (reading) => reading.unit_id === unit.id && reading.period === period && reading.meter_type === meterType
    );
    const status =
      payload.status ??
      (previousValue > 0 && (value - previousValue) / previousValue > 0.15 ? "attention" : "stable");

    const record = {
      ...(existing ?? { id: createId(), created_at: nowIso() }),
      unit_id: unit.id,
      tenant_id: tenant.id,
      period,
      meter_type: meterType,
      value,
      previous_value: previousValue,
      tariff_rate: tariffRate,
      consumption,
      charge_amount: chargeAmount,
      recorded_at: payload.recordedAt ?? nowIso(),
      status,
      updated_at: nowIso()
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      this.data.meter_readings.push(record);
    }

    let invoice = null;
    if (payload.syncInvoice !== false) {
      invoice = this.syncInvoiceVariableAmount(activeLease.id, period);
    }

    this.save();
    return {
      ...this.listMeterReadings({ unitId: unit.id, period }).find((reading) => reading.id === record.id),
      invoice
    };
  }

  syncInvoiceVariableAmount(leaseId, period) {
    const lease = this.getLeaseById(leaseId);
    if (!lease) {
      return null;
    }

    const unit = this.requireUnit(lease.unit_id);
    const variableAmount = this.listMeterReadings({
      unitId: unit.id,
      tenantId: lease.tenant_id,
      period
    }).reduce((total, reading) => total + Number(reading.charge_amount ?? 0), 0);
    const invoice = this.data.billing_invoices.find((item) => item.lease_id === lease.id && item.period === period);
    const dueDate = `${period}-10`;

    if (invoice) {
      return this.updateBillingInvoice(invoice.id, {
        variableAmount,
        status: undefined
      });
    }

    return this.createBillingInvoice({
      leaseId: lease.id,
      period,
      variableAmount,
      dueDate
    });
  }

  createNotification(payload) {
    const event = {
      id: createId(),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      tone: payload.tone ?? "info",
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      property_id: payload.propertyId ?? null,
      tenant_id: payload.tenantId ?? null,
      created_by: payload.createdBy ?? null,
      created_at: nowIso()
    };

    const deliveries = ensureArray(payload.deliveries).map((delivery) => ({
      id: createId(),
      notification_id: event.id,
      channel: delivery.channel,
      recipient_user_id: delivery.userId ?? null,
      recipient_email: delivery.email ?? null,
      status: delivery.status ?? (delivery.channel === "in_app" ? "delivered" : "pending"),
      attempts: Number(delivery.attempts ?? 0),
      external_message_id: delivery.externalMessageId ?? null,
      error: delivery.error ?? null,
      read_at: null,
      delivered_at: delivery.status === "delivered" || delivery.channel === "in_app" ? nowIso() : null,
      created_at: nowIso(),
      updated_at: nowIso()
    }));

    this.data.notification_events.push(event);
    this.data.notification_deliveries.push(...deliveries);
    this.save();
    return {
      event: clone(event),
      deliveries: clone(deliveries)
    };
  }

  updateNotificationDelivery(id, payload) {
    const delivery = this.getById("notification_deliveries", id);
    if (!delivery) {
      return null;
    }

    Object.assign(delivery, {
      status: payload.status ?? delivery.status,
      attempts: payload.attempts !== undefined ? Number(payload.attempts) : delivery.attempts,
      external_message_id: payload.externalMessageId ?? delivery.external_message_id,
      error: payload.error ?? null,
      delivered_at: payload.status === "delivered" ? nowIso() : delivery.delivered_at,
      updated_at: nowIso()
    });
    this.save();
    return clone(delivery);
  }

  listNotificationsForUser(userId) {
    const deliveries = this.data.notification_deliveries.filter(
      (delivery) => delivery.channel === "in_app" && delivery.recipient_user_id === userId
    );
    const eventById = new Map(this.data.notification_events.map((event) => [event.id, event]));
    return clone(
      deliveries
        .map((delivery) => {
          const event = eventById.get(delivery.notification_id);
          if (!event) {
            return null;
          }
          return {
            ...event,
            delivery_id: delivery.id,
            delivery_status: delivery.status,
            read_at: delivery.read_at,
            unread: !delivery.read_at
          };
        })
        .filter(Boolean)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    );
  }

  markNotificationRead({ userId, deliveryId }) {
    const delivery = this.getById("notification_deliveries", deliveryId);
    if (!delivery || delivery.channel !== "in_app" || delivery.recipient_user_id !== userId) {
      return null;
    }
    delivery.read_at = delivery.read_at ?? nowIso();
    delivery.updated_at = nowIso();
    this.save();
    return clone(delivery);
  }

  getDashboardOverview() {
    const propertyCount = this.data.properties.length;
    const totalRentableArea = this.data.properties.reduce(
      (total, property) => total + Number(property.rentable_area),
      0
    );
    const unitCount = this.data.units.length;
    const occupiedArea = this.data.units.reduce(
      (total, unit) => total + (unit.status === "occupied" ? Number(unit.area) : 0),
      0
    );
    const vacantArea = this.data.units.reduce(
      (total, unit) => total + (unit.status === "vacant" ? Number(unit.area) : 0),
      0
    );
    const activeLeaseCount = this.data.leases.filter((lease) => activeLeaseStages.has(lease.stage)).length;
    const tenantCount = this.data.tenants.length;
    const expiringLeaseCount = this.data.leases.filter((lease) => {
      if (!activeLeaseStages.has(lease.stage)) {
        return false;
      }

      const ms = new Date(lease.end_date).getTime() - Date.now();
      return Math.ceil(ms / (1000 * 60 * 60 * 24)) <= 45;
    }).length;

    return {
      totals: {
        property_count: propertyCount,
        total_rentable_area: totalRentableArea,
        unit_count: unitCount,
        occupied_area: occupiedArea,
        vacant_area: vacantArea,
        tenant_count: tenantCount,
        active_lease_count: activeLeaseCount
      },
      occupancyRate:
        totalRentableArea > 0 ? Number(((occupiedArea / totalRentableArea) * 100).toFixed(1)) : 0,
      expiringLeaseCount
    };
  }
}
