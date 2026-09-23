import { isOpenTicket } from "../../../../../packages/contracts/src/domain.js";

export function createFinanceQueries(deps) {
  const {
    activeLeaseStages,
    db,
    sumBy,
    roundMetric,
    addMonths,
    startOfMonth,
    formatMonthLabel,
    money,
    daysUntilIso,
    normalizeBillingInvoice,
    normalizeBillingPayment,
    normalizeMeterReading,
    buildScopedCollections,
  } = deps;

  const buildLeaseRevenueRows = (scoped) => {
    const unitById = new Map(scoped.units.map((unit) => [unit.id, unit]));
    const tenantById = new Map(
      scoped.tenants.map((tenant) => [tenant.id, tenant]),
    );

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
          monthlyAmount,
        };
      });
  };

  const buildFinanceSummary = (scoped, scopedTickets) => {
    const leaseIds = new Set(scoped.leases.map((l) => l.id));
    const propertyIds = new Set(scoped.properties.map((p) => p.id));
    const invoices = db
      .listBillingInvoices()
      .filter((i) => leaseIds.has(i.lease_id));
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const current = invoices.filter((i) => i.period === currentPeriod);
    const collectionBilled = sumBy(current, (i) => i.total_amount);
    const collectionPaid = sumBy(current, (i) => i.paid_amount);
    const collectionRate = collectionBilled
      ? roundMetric((collectionPaid / collectionBilled) * 100)
      : 0;
    const expenses = db.data.operating_expenses.filter((e) =>
      propertyIds.has(e.propertyId),
    );
    const actualExpenses = sumBy(
      expenses.filter((e) => e.date.startsWith(currentPeriod)),
      (e) => e.amount,
    );
    const invoiceIds = new Set(invoices.map((i) => i.id));
    const cashReceipts = sumBy(
      db
        .listBillingPayments()
        .filter(
          (p) =>
            invoiceIds.has(p.invoice_id) && p.paid_at.startsWith(currentPeriod),
        ),
      (p) => p.amount,
    );
    const arrearsAmount = sumBy(
      invoices.filter(
        (i) => i.due_date < new Date().toISOString().slice(0, 10),
      ),
      (i) => Math.max(0, i.total_amount - i.paid_amount),
    );
    const series = [0, 1, 2].map((offset) => {
      const date = addMonths(startOfMonth(), offset);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const periodInvoices = invoices.filter((i) => i.period === period);
      const daysInMonth = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      const lastDay = `${period}-${daysInMonth}`;
      const details = scoped.leases.flatMap((lease) => {
        const actual = periodInvoices.filter((i) => i.lease_id === lease.id);
        if (
          !actual.length &&
          (!activeLeaseStages.has(lease.stage) ||
            lease.startDate > lastDay ||
            lease.endDate < `${period}-01`)
        )
          return [];
        const unit = scoped.units.find((u) => u.id === lease.unitId);
        const first =
          lease.startDate > `${period}-01` ? lease.startDate : `${period}-01`;
        const last = lease.endDate < lastDay ? lease.endDate : lastDay;
        const days = Math.max(
          0,
          1 + (Date.parse(last) - Date.parse(first)) / 86400000,
        );
        return [
          {
            leaseId: lease.id,
            contractNumber: lease.contractNumber,
            unitNumber: unit?.number ?? "",
            basis: actual.length ? "invoice" : "contract",
            amount: money(
              actual.length
                ? sumBy(actual, (i) => i.total_amount)
                : ((unit?.area ?? 0) * lease.ratePerSqm * days) / daysInMonth,
            ),
            days,
          },
        ];
      });
      const billed = sumBy(details, (d) => d.amount);
      const costs = sumBy(
        expenses.filter((e) => e.date.startsWith(period)),
        (e) => e.amount,
      );
      return {
        id: `finance-${offset}`,
        label: formatMonthLabel(date),
        billed: money(billed),
        collected: money(sumBy(periodInvoices, (i) => i.paid_amount)),
        forecast: money(billed - costs),
        expenses: money(costs),
        invoiceAmount: money(
          sumBy(
            details.filter((d) => d.basis === "invoice"),
            (d) => d.amount,
          ),
        ),
        contractAmount: money(
          sumBy(
            details.filter((d) => d.basis === "contract"),
            (d) => d.amount,
          ),
        ),
        details,
      };
    });
    return {
      collectionRate,
      collectionBilled: money(collectionBilled),
      collectionPaid: money(collectionPaid),
      collectionPeriod: currentPeriod,
      collectionPeriodLabel: formatMonthLabel(new Date()),
      collectionBasis: "current_due",
      arrearsAmount: money(arrearsAmount),
      opexRatio: collectionBilled
        ? roundMetric((actualExpenses / collectionBilled) * 100)
        : 0,
      noi: money(cashReceipts - actualExpenses),
      forecastQuarter: money(sumBy(series, (p) => p.forecast)),
      forecastPeriodLabel: `${series[0].label}–${series[2].label}`,
      series,
    };
  };

  const getScopedBillingInvoices = (user) => {
    const leaseIds = new Set(
      buildScopedCollections(user).leases.map((lease) => lease.id),
    );
    return db
      .listBillingInvoices()
      .map(normalizeBillingInvoice)
      .filter((invoice) => leaseIds.has(invoice.leaseId));
  };

  const getScopedBillingInvoice = (user, invoiceId) =>
    getScopedBillingInvoices(user).find(
      (invoice) => invoice.id === invoiceId,
    ) ?? null;

  const buildBillingReconciliation = (user) => {
    const invoices = getScopedBillingInvoices(user);
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
    const payments = db
      .listBillingPayments()
      .filter((payment) => invoiceIds.has(payment.invoice_id))
      .map(normalizeBillingPayment);
    const paymentsByInvoice = new Map();
    for (const payment of payments) {
      paymentsByInvoice.set(payment.invoiceId, [
        ...(paymentsByInvoice.get(payment.invoiceId) ?? []),
        payment,
      ]);
    }

    const rows = invoices.map((invoice) => {
      const invoicePayments = paymentsByInvoice.get(invoice.id) ?? [];
      const paidAmount = sumBy(invoicePayments, (payment) => payment.amount);
      const outstandingAmount = Math.max(
        0,
        Number(invoice.totalAmount) - paidAmount,
      );
      const overpaidAmount = Math.max(
        0,
        paidAmount - Number(invoice.totalAmount),
      );
      const lastPaidAt = invoicePayments[0]?.paidAt ?? invoice.paidAt ?? null;
      const dueTime = new Date(invoice.dueDate).getTime();
      const isOverdue =
        outstandingAmount > 0 &&
        Number.isFinite(dueTime) &&
        dueTime < Date.now();
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
              ? "Оплата превышает сумму счёта"
              : reconciliationStatus === "partial"
                ? "Частичная оплата"
                : isOverdue
                  ? "Просроченный остаток"
                  : "Ожидается оплата",
        paymentCount: invoicePayments.length,
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
        matched: rows.filter((row) => row.reconciliationStatus === "matched")
          .length,
        issues: rows.filter((row) => row.reconciliationStatus !== "matched")
          .length,
        collectionRate: billed > 0 ? roundMetric((paid / billed) * 100) : 0,
      },
      rows,
    };
  };

  const getScopedMeterReadings = (user) => {
    const scoped = buildScopedCollections(user);
    const unitIds = new Set(scoped.units.map((unit) => unit.id));
    const tenantIds = new Set(scoped.tenants.map((tenant) => tenant.id));
    return db
      .listMeterReadings()
      .filter(
        (reading) =>
          unitIds.has(reading.unit_id) && tenantIds.has(reading.tenant_id),
      )
      .map(normalizeMeterReading);
  };

  return {
    buildLeaseRevenueRows,
    buildFinanceSummary,
    getScopedBillingInvoices,
    getScopedBillingInvoice,
    buildBillingReconciliation,
    getScopedMeterReadings,
  };
}
