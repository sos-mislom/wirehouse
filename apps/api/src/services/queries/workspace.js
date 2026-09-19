import {
  isCriticalTicket,
  isOpenTicket,
} from "../../../../../packages/contracts/src/domain.js";

export function createWorkspaceQueries(deps) {
  const {
    activeLeaseStages,
    db,
    sumBy,
    priorityWeights,
    daysUntilIso,
    compareNotifications,
    roleWeights,
    compareByDateDesc,
    normalizeProperty,
    normalizeUnit,
    normalizeLease,
    normalizeTenant,
    normalizeNotification,
    normalizeTicket,
    normalizeTicketComment,
    translateStatus,
    notificationToneWeights,
    buildFinanceSummary,
  } = deps;

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

  return {
    buildNotifications,
    totalsSafe,
    buildTeamSummary,
    buildExportQueue,
    getScopedLease,
    buildScopedCollections,
    buildDashboardResponse,
    getScopedTickets,
    getTicketForUser,
    getTenantForUser,
    canUseUnit,
    hydrateTicket,
    hydrateTicketComment,
  };
}
