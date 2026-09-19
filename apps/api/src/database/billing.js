import { TicketsDatabase } from "./tickets.js";
import {
  activeLeaseStages,
  assertEnum,
  clone,
  createChangeResult,
  createId,
  formatPeriod,
  meterTariffs,
  meterTypes,
  nowIso,
  startOfMonth,
  toIsoDay,
} from "./constants.js";

export class BillingDatabase extends TicketsDatabase {
  listBillingInvoices(filters = {}) {
    const rows = this.data.billing_invoices
      .filter((invoice) =>
        filters.tenantId ? invoice.tenant_id === filters.tenantId : true,
      )
      .filter((invoice) =>
        filters.leaseId ? invoice.lease_id === filters.leaseId : true,
      )
      .filter((invoice) =>
        filters.ids ? filters.ids.includes(invoice.id) : true,
      )
      .map((invoice) => {
        const lease = this.getLeaseById(invoice.lease_id);
        const unit = this.getUnitById(invoice.unit_id);
        const property = unit ? this.getPropertyById(unit.property_id) : null;
        const tenant = this.getTenantById(invoice.tenant_id);
        const payments = this.data.billing_payments.filter(
          (payment) => payment.invoice_id === invoice.id,
        );
        const paidAmount = payments.reduce(
          (total, payment) => total + Number(payment.amount),
          0,
        );
        return {
          ...invoice,
          contract_number: lease?.contract_number ?? null,
          tenant_name: tenant?.name ?? null,
          unit_number: unit?.number ?? null,
          property_name: property?.name ?? null,
          status: this.calculateBillingStatus(invoice),
          paid_amount: paidAmount,
          paid_at:
            payments.sort((left, right) =>
              String(right.paid_at).localeCompare(String(left.paid_at)),
            )[0]?.paid_at ?? null,
        };
      })
      .sort((left, right) =>
        String(right.period).localeCompare(String(left.period)),
      );

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
      (invoice) =>
        invoice.lease_id === lease.id && invoice.period === payload.period,
      "Invoice for this lease period already exists",
    );

    const rentAmount =
      payload.rentAmount !== undefined
        ? Number(payload.rentAmount)
        : Math.round(Number(unit.area) * Number(lease.rate_per_sqm));
    const variableAmount = Number(payload.variableAmount ?? 0);
    const totalAmount =
      payload.totalAmount !== undefined
        ? Number(payload.totalAmount)
        : rentAmount + variableAmount;
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
      updated_at: nowIso(),
    };

    record.status = payload.status ?? this.calculateBillingStatus(record);
    this.validateBillingInvoicePayload(record);
    this.data.billing_invoices.push(record);
    return this.getBillingInvoice(record.id);
  }

  updateBillingInvoice(id, payload) {
    const current = this.getById("billing_invoices", id);
    if (!current) {
      return null;
    }

    const rentAmount =
      payload.rentAmount !== undefined
        ? Number(payload.rentAmount)
        : current.rent_amount;
    const variableAmount =
      payload.variableAmount !== undefined
        ? Number(payload.variableAmount)
        : current.variable_amount;
    const next = {
      ...current,
      period: payload.period ?? current.period,
      rent_amount: rentAmount,
      variable_amount: variableAmount,
      total_amount:
        payload.totalAmount !== undefined
          ? Number(payload.totalAmount)
          : rentAmount + variableAmount,
      due_date: payload.dueDate ?? current.due_date,
      status: payload.status ?? current.status,
      updated_at: nowIso(),
    };

    this.ensureUnique(
      this.data.billing_invoices,
      (invoice) =>
        invoice.id !== id &&
        invoice.lease_id === current.lease_id &&
        invoice.period === next.period,
      "Invoice for this lease period already exists",
    );

    Object.assign(current, next);
    current.status = payload.status ?? this.calculateBillingStatus(current);
    this.validateBillingInvoicePayload(current);
    return this.getBillingInvoice(current.id);
  }

  listBillingPayments(filters = {}) {
    const rows = this.data.billing_payments
      .filter((payment) =>
        filters.invoiceId ? payment.invoice_id === filters.invoiceId : true,
      )
      .filter((payment) =>
        filters.tenantId ? payment.tenant_id === filters.tenantId : true,
      )
      .map((payment) => {
        const invoice = this.getById("billing_invoices", payment.invoice_id);
        const tenant = this.getTenantById(payment.tenant_id);
        const lease = invoice ? this.getLeaseById(invoice.lease_id) : null;
        return {
          ...payment,
          period: invoice?.period ?? null,
          invoice_status: invoice?.status ?? null,
          contract_number: lease?.contract_number ?? null,
          tenant_name: tenant?.name ?? null,
        };
      })
      .sort((left, right) =>
        String(right.paid_at).localeCompare(String(left.paid_at)),
      );

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
      reference:
        payload.reference ??
        `PAY-${invoice.period}-${String(this.data.billing_payments.length + 1).padStart(4, "0")}`,
      created_at: nowIso(),
    };

    this.data.billing_payments.push(record);
    this.refreshBillingInvoiceStatus(invoice.id);
    return clone({
      ...record,
      invoice: this.getBillingInvoice(invoice.id),
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

    const amount =
      payload.amount !== undefined
        ? Number(payload.amount)
        : Number(current.amount);
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
      reference: payload.reference ?? current.reference,
    });

    this.refreshBillingInvoiceStatus(previousInvoiceId);
    this.refreshBillingInvoiceStatus(invoice.id);
    return clone({
      ...current,
      invoice: this.getBillingInvoice(invoice.id),
    });
  }

  deleteBillingPayment(id) {
    const current = this.getById("billing_payments", id);
    if (!current) {
      return createChangeResult(0);
    }

    const invoiceId = current.invoice_id;
    this.data.billing_payments = this.data.billing_payments.filter(
      (payment) => payment.id !== id,
    );
    this.refreshBillingInvoiceStatus(invoiceId);
    return createChangeResult(1);
  }


  listMeterReadings(filters = {}) {
    const rows = this.data.meter_readings
      .filter((reading) =>
        filters.tenantId ? reading.tenant_id === filters.tenantId : true,
      )
      .filter((reading) =>
        filters.unitId ? reading.unit_id === filters.unitId : true,
      )
      .filter((reading) =>
        filters.period ? reading.period === filters.period : true,
      )
      .map((reading) => {
        const unit = this.getUnitById(reading.unit_id);
        const tenant = this.getTenantById(reading.tenant_id);
        const lease = this.data.leases.find(
          (item) =>
            item.tenant_id === reading.tenant_id &&
            item.unit_id === reading.unit_id &&
            activeLeaseStages.has(item.stage),
        );
        const consumption = Math.max(
          0,
          Number(reading.value) - Number(reading.previous_value ?? 0),
        );
        const tariffRate = Number(
          reading.tariff_rate ?? meterTariffs[reading.meter_type] ?? 0,
        );
        return {
          ...reading,
          unit_number: unit?.number ?? null,
          tenant_name: tenant?.name ?? null,
          lease_id: lease?.id ?? null,
          contract_number: lease?.contract_number ?? null,
          consumption,
          tariff_rate: tariffRate,
          charge_amount: Number(
            reading.charge_amount ?? Math.round(consumption * tariffRate),
          ),
        };
      })
      .sort((left, right) =>
        String(right.recorded_at).localeCompare(String(left.recorded_at)),
      );

    return clone(rows);
  }

  createMeterReading(payload) {
    const unit = this.requireUnit(payload.unitId);
    const activeLease = this.data.leases.find(
      (lease) =>
        lease.unit_id === unit.id &&
        activeLeaseStages.has(lease.stage) &&
        (!payload.tenantId || lease.tenant_id === payload.tenantId),
    );
    if (!activeLease) {
      throw new Error("Active lease not found for unit");
    }

    const tenant = this.requireTenant(activeLease.tenant_id);
    const meterType =
      payload.meterType ??
      (unit.type === "freezer"
        ? "cold_chain"
        : unit.type === "office"
          ? "electricity"
          : "power");
    assertEnum(meterType, meterTypes, "meter type");

    const period = String(payload.period ?? formatPeriod(startOfMonth()));
    const value = Number(payload.value);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Meter value must be positive");
    }

    const previousReading = this.data.meter_readings
      .filter(
        (reading) =>
          reading.unit_id === unit.id &&
          reading.meter_type === meterType &&
          reading.period !== period,
      )
      .sort((left, right) =>
        String(right.recorded_at).localeCompare(String(left.recorded_at)),
      )[0];
    const previousValue =
      payload.previousValue !== undefined
        ? Number(payload.previousValue)
        : Number(previousReading?.value ?? 0);
    if (!Number.isFinite(previousValue) || previousValue < 0) {
      throw new Error("Previous meter value must be positive");
    }
    if (value < previousValue) {
      throw new Error("Meter value cannot be lower than previous value");
    }

    const tariffRate =
      payload.tariffRate !== undefined
        ? Number(payload.tariffRate)
        : Number(meterTariffs[meterType] ?? 0);
    if (!Number.isFinite(tariffRate) || tariffRate < 0) {
      throw new Error("Tariff rate must be positive");
    }

    const consumption = Math.max(0, value - previousValue);
    const chargeAmount =
      payload.chargeAmount !== undefined
        ? Number(payload.chargeAmount)
        : Math.round(consumption * tariffRate);
    if (!Number.isFinite(chargeAmount) || chargeAmount < 0) {
      throw new Error("Charge amount must be positive");
    }

    const existing = this.data.meter_readings.find(
      (reading) =>
        reading.unit_id === unit.id &&
        reading.period === period &&
        reading.meter_type === meterType,
    );
    const status =
      payload.status ??
      (previousValue > 0 && (value - previousValue) / previousValue > 0.15
        ? "attention"
        : "stable");

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
      updated_at: nowIso(),
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

    return {
      ...this.listMeterReadings({ unitId: unit.id, period }).find(
        (reading) => reading.id === record.id,
      ),
      invoice,
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
      period,
    }).reduce(
      (total, reading) => total + Number(reading.charge_amount ?? 0),
      0,
    );
    const invoice = this.data.billing_invoices.find(
      (item) => item.lease_id === lease.id && item.period === period,
    );
    const dueDate = `${period}-10`;

    if (invoice) {
      return this.updateBillingInvoice(invoice.id, {
        variableAmount,
        status: undefined,
      });
    }

    return this.createBillingInvoice({
      leaseId: lease.id,
      period,
      variableAmount,
      dueDate,
    });
  }

}
