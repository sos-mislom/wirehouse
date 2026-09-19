export function createTenantQueries(deps) {
  const {
    db,
    sumBy,
    money,
    formatMonthLabel,
    daysUntilIso,
    translateStatus,
    normalizeTenantNote,
    buildScopedCollections,
    getScopedTickets,
  } = deps;

  const buildTenantMeters = (units) =>
    units.map((unit, index) => ({
      id: `meter-${unit.id}`,
      name:
        unit.type === "office"
          ? "Электроэнергия"
          : unit.type === "freezer"
            ? "Холодильный контур"
            : "Энергопотребление",
      unitNumber: unit.number,
      lastValue: money(
        unit.area *
          (unit.type === "freezer" ? 4.6 : unit.type === "office" ? 2.1 : 3.2),
      ),
      deltaPct: roundMetric(
        (unit.status === "maintenance" ? 6.8 : 2.4) + index * 0.7,
      ),
      updatedAt: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
      status: unit.status === "maintenance" ? "attention" : "stable",
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
        method: invoice.paid_at ? "bank_transfer" : "invoice",
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
      consumption: Number(
        reading.consumption ??
          Math.max(
            0,
            Number(reading.value) - Number(reading.previous_value ?? 0),
          ),
      ),
      tariffRate: Number(reading.tariff_rate ?? 0),
      chargeAmount: Number(reading.charge_amount ?? 0),
      deltaPct:
        reading.previous_value > 0
          ? roundMetric(
              ((reading.value - reading.previous_value) /
                reading.previous_value) *
                100,
            )
          : 0,
      updatedAt: reading.recorded_at,
      status: reading.status,
    }));

  const buildTenantNotes = (tenant, tickets, manualNotes = []) => {
    const derivedNotes = tickets.slice(0, 2).map((ticket, index) => ({
      id: `note-ticket-${ticket.id}`,
      title: index === 0 ? "Операционная коммуникация" : "Сервисное наблюдение",
      authorName: ticket.createdByName ?? tenant.contactName,
      createdAt: ticket.updatedAt,
      content: `${ticket.title}. Статус: ${translateStatus(ticket.status)}. Канал: ${ticket.sourceChannel}.`,
      attachments: [],
    }));

    return [
      ...manualNotes,
      {
        id: `note-renewal-${tenant.id}`,
        title: "Контур пролонгации",
        authorName: "Система",
        createdAt: new Date().toISOString(),
        content: `Для ${tenant.name} удерживаем единый трек по срокам договора, платёжной дисциплине и сервисной истории.`,
        attachments: [],
      },
      ...derivedNotes,
    ].sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
  };

  const buildTenantRisks = (tenant, leases, tickets) => {
    const activeLeases = leases.filter((lease) =>
      activeLeaseStages.has(lease.stage),
    );
    const leaseRisks = activeLeases.map((lease) => {
      const remainingDays = daysUntilIso(lease.endDate);
      return {
        id: `risk-lease-${lease.id}`,
        title: `Пролонгация ${lease.contractNumber}`,
        severity:
          remainingDays <= 15
            ? "critical"
            : remainingDays <= 45
              ? "warning"
              : "info",
        owner: "Менеджер договора",
        dueDate: lease.endDate,
        status: remainingDays <= 45 ? "monitoring" : "stable",
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
            priorityWeights[ticket.priority] >= 3,
        ).length > 0
          ? "warning"
          : "info",
      owner: "Служба эксплуатации",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: tickets.some(
        (ticket) =>
          isOpenTicket(ticket.status) &&
          !["billing", "lease"].includes(ticket.category),
      )
        ? "active"
        : "stable",
    };
    const paymentRisk = {
      id: `risk-payment-${tenant.id}`,
      title: "Платёжная дисциплина",
      severity:
        tenant.riskLevel === "high"
          ? "critical"
          : tenant.riskLevel === "medium"
            ? "warning"
            : "info",
      owner: "Финансовый контролёр",
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      status: tenant.riskLevel === "low" ? "stable" : "monitoring",
    };

    return [...leaseRisks, serviceRisk, paymentRisk].sort((left, right) => {
      const severityDelta =
        (notificationToneWeights[right.severity] ?? 0) -
        (notificationToneWeights[left.severity] ?? 0);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return compareByDateDesc(left.dueDate, right.dueDate);
    });
  };

  const buildTenantDetailResponse = (user, tenantId) => {
    const scoped = buildScopedCollections(user);
    const tenant = scoped.tenants.find((item) => item.id === tenantId) ?? null;
    if (!tenant) {
      return null;
    }

    const leases = scoped.leases.filter(
      (lease) => lease.tenantId === tenant.id,
    );
    const unitIds = new Set(leases.map((lease) => lease.unitId));
    const units = scoped.units.filter((unit) => unitIds.has(unit.id));
    const tickets = getScopedTickets(user).filter(
      (ticket) => ticket.tenantId === tenant.id,
    );
    const manualNotes = db.listTenantNotes(tenant.id).map(normalizeTenantNote);
    const scopedLeaseIds = new Set(leases.map((l) => l.id));
    const tenantInvoices = db
      .listBillingInvoices({ tenantId: tenant.id })
      .filter((i) => scopedLeaseIds.has(i.lease_id));
    const invoiceIds = new Set(tenantInvoices.map((i) => i.id));
    const payments = buildTenantLedgerPayments(tenant).filter((p) =>
      invoiceIds.has(p.id),
    );
    const openTicketCount = tickets.filter((ticket) =>
      isOpenTicket(ticket.status),
    ).length;
    const monthlyRent = sumBy(
      leases.filter((lease) => activeLeaseStages.has(lease.stage)),
      (lease) => {
        const unit = units.find((item) => item.id === lease.unitId);
        return (unit?.area ?? 0) * lease.ratePerSqm;
      },
    );
    const billedAmount = sumBy(tenantInvoices, (i) => i.total_amount);
    const paidAmount = sumBy(tenantInvoices, (i) => i.paid_amount);
    const collectionRate =
      billedAmount > 0 ? roundMetric((paidAmount / billedAmount) * 100) : 0;
    const arrearsAmount = sumBy(
      tenantInvoices.filter(
        (i) => i.due_date < new Date().toISOString().slice(0, 10),
      ),
      (i) => Math.max(0, i.total_amount - i.paid_amount),
    );
    const nextExpiry =
      [...leases]
        .filter((lease) => activeLeaseStages.has(lease.stage))
        .sort(
          (left, right) =>
            new Date(left.endDate).getTime() -
            new Date(right.endDate).getTime(),
        )[0]?.endDate ?? null;

    return {
      tenant,
      summary: {
        totalArea: sumBy(units, (unit) => unit.area),
        unitCount: units.length,
        activeLeaseCount: leases.filter((lease) =>
          activeLeaseStages.has(lease.stage),
        ).length,
        monthlyRent: money(monthlyRent),
        paymentDiscipline: collectionRate,
        openTicketCount,
        arrearsAmount: money(arrearsAmount),
        nextExpiry,
      },
      units,
      leases,
      tickets,
      payments,
      meters: buildTenantLedgerMeters(tenant).filter((m) =>
        units.some((u) => u.id === m.unitId),
      ),
      notes: buildTenantNotes(tenant, tickets, manualNotes),
      risks: buildTenantRisks(tenant, leases, tickets),
    };
  };

  return {
    buildTenantMeters,
    buildTenantLedgerPayments,
    buildTenantLedgerMeters,
    buildTenantNotes,
    buildTenantRisks,
    buildTenantDetailResponse,
  };
}
