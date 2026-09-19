import crypto from "node:crypto";
import {
  isOpenTicket,
  leaseOverlaps,
  requireDate,
  requireNumber,
} from "../../../../packages/contracts/src/domain.js";
import {
  activeLeaseStages,
  assertEnum,
  billingStatuses,
  clone,
  createEmptyData,
  createId,
  leaseStages,
  nowIso,
  riskLevels,
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
  unitStatuses,
  unitTypes,
  userRoles,
  warehouseClasses,
} from "./constants.js";

export class WarehouseDatabaseBase {
  constructor(data = createEmptyData()) {
    this.data = structuredClone(data);
    // Every public mutation is atomic inside the current request transaction.
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (/^(create|update|delete|mark|set|sync|split)[A-Z]/.test(name)) {
          if (!Object.prototype.hasOwnProperty.call(this, name)) {
            const mutate = this[name].bind(this);
            this[name] = (...args) => this.transaction(() => mutate(...args));
          }
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  transaction(fn) {
    if (this.inTransaction) return fn();
    this.inTransaction = true;
    const before = clone(this.data);
    try {
      return fn();
    } catch (error) {
      this.data = before;
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  audit(actor, action, entityType, entityId, changes = {}) {
    this.data.audit_log.push({
      id: createId(),
      actorId: actor.id,
      actorName: actor.full_name,
      action,
      entityType,
      entityId,
      changes,
      createdAt: nowIso(),
    });
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
        activeLeaseStages.has(lease.stage),
    ).length;
  }

  validatePropertyPayload(record) {
    requireNumber(record.total_area, "Общая площадь", 0.01);
    requireNumber(
      record.rentable_area,
      "Арендопригодная площадь",
      0,
      record.total_area,
    );
    assertEnum(record.warehouse_class, warehouseClasses, "warehouse class");
  }

  validateUnitPayload(record) {
    requireNumber(record.area, "Площадь", 0.01);
    requireNumber(record.floor, "Этаж", -10, 300);
    if (record.photo_url && !/^https:\/\//.test(record.photo_url))
      throw new Error("Фото помещения должно использовать HTTPS");
    if (!Number.isInteger(record.floor))
      throw new Error("Этаж должен быть целым числом");
    assertEnum(record.type, unitTypes, "unit type");
    assertEnum(record.status, unitStatuses, "unit status");
  }

  validateTenantPayload(record) {
    assertEnum(record.risk_level, riskLevels, "risk level");
  }

  validateLeasePayload(record) {
    requireDate(record.start_date, "Начало договора");
    requireDate(record.end_date, "Окончание договора");
    if (record.start_date > record.end_date)
      throw new Error("Окончание договора раньше начала");
    requireNumber(record.rate_per_sqm, "Ставка");
    requireNumber(record.deposit, "Депозит");
    requireNumber(record.indexation_pct, "Индексация", 0, 100);
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
    if (
      !Number.isFinite(Number(record.total_amount)) ||
      Number(record.total_amount) <= 0
    ) {
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

}
