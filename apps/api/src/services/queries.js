import {
  isCriticalTicket,
  isOpenTicket,
} from "../../../../packages/contracts/src/domain.js";
export function createQueriesService({
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
}) {
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
      const billed = periodInvoices.length
        ? sumBy(periodInvoices, (i) => i.total_amount)
        : sumBy(
            scoped.leases.filter(
              (l) =>
                activeLeaseStages.has(l.stage) &&
                l.startDate <= `${period}-31` &&
                l.endDate >= `${period}-01`,
            ),
            (l) =>
              (scoped.units.find((u) => u.id === l.unitId)?.area ?? 0) *
              l.ratePerSqm,
          );
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

  const buildNotifications = (scoped, scopedTickets) => {
    const ticketItems = scopedTickets
      .filter((ticket) => isOpenTicket(ticket.status))
      .map((ticket) => ({
        id: `ticket-${ticket.id}`,
        tone:
          priorityWeights[ticket.priority] >= 4
            ? "critical"
            : priorityWeights[ticket.priority] >= 3
              ? "warning"
              : "info",
        title: `${ticket.number} · ${ticket.title}`,
        message: `${ticket.propertyName ?? "Объект"} · ${ticket.unitNumber ?? "—"} · ${ticket.tenantName ?? "Без арендатора"}`,
        createdAt: ticket.updatedAt,
        propertyName: ticket.propertyName ?? null,
        entityType: "ticket",
        entityId: ticket.id,
        unread: priorityWeights[ticket.priority] >= 3,
      }));
    const leaseItems = scoped.leases
      .filter((lease) => activeLeaseStages.has(lease.stage))
      .map((lease) => {
        const remainingDays = daysUntilIso(lease.endDate);
        return {
          id: `lease-${lease.id}`,
          tone:
            remainingDays <= 15
              ? "critical"
              : remainingDays <= 45
                ? "warning"
                : "info",
          title: `Договор ${lease.contractNumber}`,
          message: `${lease.tenantName ?? "Арендатор"} · ${lease.propertyName ?? "Объект"} · ${remainingDays < 0 ? `истёк ${Math.abs(remainingDays)} дн. назад` : `${remainingDays} дн. до завершения`}`,
          createdAt: lease.updatedAt,
          propertyName: lease.propertyName ?? null,
          entityType: "lease",
          entityId: lease.id,
          unread: remainingDays <= 45,
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
        unread: unit.status === "maintenance",
      }));

    return [...ticketItems, ...leaseItems, ...unitItems].sort(
      compareNotifications,
    );
  };

  const totalsSafe = (items, selector) => sumBy(items, selector);

  const buildTeamSummary = (user, scopedProperties, scopedTickets) => {
    const propertyIds = new Set(
      scopedProperties.map((property) => property.id),
    );
    const propertyById = new Map(
      scopedProperties.map((property) => [property.id, property]),
    );
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
        const roleDelta =
          (roleWeights[left.role] ?? 99) - (roleWeights[right.role] ?? 99);
        if (roleDelta !== 0) {
          return roleDelta;
        }

        return String(left.full_name).localeCompare(
          String(right.full_name),
          "ru",
        );
      });

    return users.map((member) => {
      const assignedTickets = scopedTickets.filter(
        (ticket) =>
          ticket.assignedTo === member.id && isOpenTicket(ticket.status),
      );
      const urgentTicketCount = assignedTickets.filter(isCriticalTicket).length;
      const propertyName = member.property_id
        ? (propertyById.get(member.property_id)?.name ?? null)
        : null;
      const focusTicket = [...assignedTickets].sort((left, right) => {
        const priorityDelta =
          (priorityWeights[right.priority] ?? 0) -
          (priorityWeights[left.priority] ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return compareByDateDesc(left.updatedAt, right.updatedAt);
      })[0];

      return {
        id: member.id,
        fullName: member.full_name,
        isActive: member.is_active === 1,
        specialty: member.specialty ?? "",
        role: member.role,
        propertyId: member.property_id,
        propertyName,
        email: member.email,
        phone: member.phone,
        assignedTicketCount: assignedTickets.length,
        urgentTicketCount,
        openTicketCount: assignedTickets.filter((ticket) =>
          isOpenTicket(ticket.status),
        ).length,
        shift:
          member.role === "admin"
            ? "HQ / сквозной контроль"
            : member.role === "manager"
              ? "08:00–17:00"
              : "Сменный пост 24/7",
        focus:
          focusTicket?.title ??
          (member.role === "admin"
            ? "Портфель и SLA"
            : "Текущая операционная смена"),
        lastLoginAt: member.last_login_at,
        isCurrentUser: member.id === user.id,
      };
    });
  };

  const buildExportQueue = (scoped, scopedTickets) => {
    const latestLeaseUpdate =
      [...scoped.leases].sort((left, right) =>
        compareByDateDesc(left.updatedAt, right.updatedAt),
      )[0]?.updatedAt ?? new Date().toISOString();
    const latestTicketUpdate =
      [...scopedTickets].sort((left, right) =>
        compareByDateDesc(left.updatedAt, right.updatedAt),
      )[0]?.updatedAt ?? latestLeaseUpdate;
    const scopedLeaseIds = new Set(scoped.leases.map((lease) => lease.id));
    const scopedInvoices = db
      .listBillingInvoices()
      .map(normalizeBillingInvoice)
      .filter((invoice) => scopedLeaseIds.has(invoice.leaseId));
    const latestBillingUpdate =
      [...scopedInvoices].sort((left, right) =>
        compareByDateDesc(left.updatedAt, right.updatedAt),
      )[0]?.updatedAt ?? latestLeaseUpdate;

    return [
      {
        id: "rent-roll",
        name: "Rent roll",
        format: "XLSX",
        cadence: "Еженедельно",
        scope: `${scoped.tenants.length} арендаторов / ${scoped.leases.length} договоров`,
        status: "ready",
        updatedAt: latestLeaseUpdate,
      },
      {
        id: "service-digest",
        name: "Service desk digest",
        format: "XLSX",
        cadence: "Ежедневно",
        scope: `${scopedTickets.length} заявок в контуре`,
        status: "scheduled",
        updatedAt: latestTicketUpdate,
      },
      {
        id: "cashflow",
        name: "Cashflow forecast",
        format: "XLSX",
        cadence: "Ежемесячно",
        scope: `${scoped.properties.length} объекта`,
        status: "draft",
        updatedAt: latestLeaseUpdate,
      },
      {
        id: "billing-ledger",
        name: "Billing ledger",
        format: "XLSX",
        cadence: "On demand",
        scope: `${scopedInvoices.length} invoices`,
        status: "ready",
        updatedAt: latestBillingUpdate,
      },
    ];
  };

  const getScopedLease = (user, leaseId) =>
    buildScopedCollections(user).leases.find((item) => item.id === leaseId) ??
    null;

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
      scopedTenants = user.tenant_id
        ? tenants.filter((tenant) => tenant.id === user.tenant_id)
        : [];
      scopedLeases = user.tenant_id
        ? leases.filter((lease) => lease.tenantId === user.tenant_id)
        : [];

      const unitIds = new Set(scopedLeases.map((lease) => lease.unitId));
      scopedUnits = units.filter((unit) => unitIds.has(unit.id));

      const propertyIds = new Set(scopedUnits.map((unit) => unit.propertyId));
      scopedProperties = properties.filter((property) =>
        propertyIds.has(property.id),
      );
    } else if (["manager", "worker"].includes(user.role)) {
      scopedProperties = properties.filter(
        (property) => property.id === user.property_id,
      );
      scopedUnits = units.filter(
        (unit) => unit.propertyId === user.property_id,
      );

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

      leaseCounts.set(
        lease.tenantId,
        (leaseCounts.get(lease.tenantId) ?? 0) + 1,
      );
    }

    return {
      properties: scopedProperties,
      units: scopedUnits,
      tenants: scopedTenants.map((tenant) => {
        const leaseIds = new Set(
          scopedLeases.filter((l) => l.tenantId === tenant.id).map((l) => l.id),
        );
        const invoices = db
          .listBillingInvoices({ tenantId: tenant.id })
          .filter((i) => leaseIds.has(i.lease_id));
        const billed = sumBy(invoices, (i) => i.total_amount);
        return {
          ...tenant,
          leaseCount: leaseCounts.get(tenant.id) ?? 0,
          paymentDiscipline: billed
            ? roundMetric(
                (sumBy(invoices, (i) => i.paid_amount) / billed) * 100,
              )
            : 0,
        };
      }),
      leases: scopedLeases,
    };
  };

  const buildDashboardResponse = (user) => {
    const scoped = buildScopedCollections(user);
    const scopedTickets = getScopedTickets(user);
    const totals = {
      property_count: scoped.properties.length,
      total_rentable_area: sumBy(
        scoped.properties,
        (property) => property.rentableArea,
      ),
      unit_count: scoped.units.length,
      occupied_area: sumBy(
        scoped.units.filter((unit) => unit.status === "occupied"),
        (unit) => unit.area,
      ),
      vacant_area: sumBy(
        scoped.units.filter((unit) => unit.status === "vacant"),
        (unit) => unit.area,
      ),
      tenant_count: scoped.tenants.length,
      active_lease_count: scoped.leases.filter((lease) =>
        activeLeaseStages.has(lease.stage),
      ).length,
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
        ? Number(
            ((totals.occupied_area / totals.total_rentable_area) * 100).toFixed(
              1,
            ),
          )
        : 0;
    const finance = buildFinanceSummary(scoped, scopedTickets);
    const activeTicketIds = new Set(
      scopedTickets.filter((t) => isOpenTicket(t.status)).map((t) => t.id),
    );
    const persistedNotifications = db
      .listNotificationsForUser(user.id)
      .map(normalizeNotification)
      .filter(
        (n) => n.entityType !== "ticket" || activeTicketIds.has(n.entityId),
      );
    const generatedNotifications = buildNotifications(
      scoped,
      scopedTickets,
    ).map((n) => {
      const receipt = db.data.notification_reads.find(
        (r) => r.userId === user.id && r.notificationId === n.id,
      );
      return {
        ...n,
        unread: n.unread && (!receipt || receipt.version !== n.createdAt),
      };
    });
    const generatedEntities = new Set(
      generatedNotifications.map((n) => `${n.entityType}:${n.entityId}`),
    );
    const notifications = [
      ...generatedNotifications,
      ...persistedNotifications.filter(
        (n) => !generatedEntities.has(`${n.entityType}:${n.entityId}`),
      ),
    ].sort(compareNotifications);
    const team = buildTeamSummary(user, scoped.properties, scopedTickets);
    const exports = buildExportQueue(scoped, scopedTickets);

    if (user.role === "worker") {
      return {
        totals: {
          property_count: scoped.properties.length,
          unit_count: scoped.units.length,
          assigned_ticket_count: scopedTickets.length,
        },
        occupancyRate: 0,
        expiringLeaseCount: 0,
        notifications,
        properties: scoped.properties,
        units: scoped.units,
        tenants: [],
        leases: [],
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
        ...scoped,
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
      ...scoped,
    };
  };

  const getScopedTickets = (user) => {
    const tickets = db.listTickets().map(normalizeTicket);

    if (user.role === "tenant") {
      return user.tenant_id
        ? tickets.filter((ticket) => ticket.tenantId === user.tenant_id)
        : [];
    }

    if (user.role === "manager") {
      return tickets.filter((ticket) => ticket.propertyId === user.property_id);
    }

    if (user.role === "worker") {
      return tickets.filter((ticket) => ticket.assignedTo === user.id);
    }

    return tickets;
  };

  const getTicketForUser = (user, ticketId) =>
    getScopedTickets(user).find((ticket) => ticket.id === ticketId) ?? null;

  const getTenantForUser = (user, tenantId) =>
    buildScopedCollections(user).tenants.find(
      (tenant) => tenant.id === tenantId,
    ) ?? null;

  const canUseUnit = (user, unitId) => {
    const scoped = buildScopedCollections(user);
    return scoped.units.some((unit) => unit.id === unitId);
  };

  const hydrateTicket = (ticketId) =>
    db
      .listTickets()
      .map(normalizeTicket)
      .find((ticket) => ticket.id === ticketId) ?? null;

  const hydrateTicketComment = (ticketId, commentId) =>
    db
      .listTicketComments(ticketId)
      .map(normalizeTicketComment)
      .find((comment) => comment.id === commentId) ?? null;

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
  };
}
