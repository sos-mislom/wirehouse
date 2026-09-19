import { useMemo } from "react";
import {
  isCriticalTicket,
  isOpenTicket,
} from "../../../../packages/contracts/src/domain";
import { brand, copy, unitTypeOptions, type Locale } from "../projectData";
import { industrialCopy, managerCopy } from "../shared/copy";
import { daysUntil, priorityWeight } from "../shared/format";
import { navSections } from "../shared/navigation";
import { type ChatThread, type Section, type Unit } from "../shared/types";
import type { WorkspaceState } from "./useWorkspaceState";
export function useWorkspaceView(state: WorkspaceState) {
  const {
    session,
    selectedSection,
    tickets,
    selectedTicketId,
    billingInvoices,
    selectedBillingInvoiceId,
    overview,
    checklistTemplates,
    ticketForm,
    ticketFilter,
    selectedPropertyId,
    selectedTenantId,
    selectedUnitId,
    tenantSearch,
    tenantRiskFilter,
    unitTypeFilter,
    unitStatusFilter,
    unitRampFilter,
    leaseStageFilter,
    leaseTermFilter,
    selectedChatTenantId,
    selectedChatTicketId,
    managerScreen,
  } = state;
  const locale: Locale = "ru";
  const t = copy[locale];
  const ui = industrialCopy[locale];
  const managerUi = managerCopy[locale];
  const productBrand = brand[locale];
  const adminEditLabel =
    locale === "ru"
      ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c"
      : "Edit";
  const adminCancelLabel =
    locale === "ru" ? "\u041e\u0442\u043c\u0435\u043d\u0430" : "Cancel";
  const adminSaveChangesLabel =
    locale === "ru"
      ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f"
      : "Save changes";
  const unitExportLabel =
    locale === "ru"
      ? "\u0412\u044b\u0433\u0440\u0443\u0437\u043a\u0430"
      : "Export";
  const isWorker = session?.user.role === "worker";
  const isTenant = session?.user.role === "tenant";
  const canManagePortfolio = session
    ? ["admin", "manager"].includes(session.user.role)
    : false;
  const canManageDocuments = session
    ? ["admin", "manager"].includes(session.user.role)
    : false;
  const isManagerShell = session
    ? ["admin", "manager"].includes(session.user.role)
    : false;
  const canUpdateTickets = session
    ? ["admin", "manager", "worker"].includes(session.user.role)
    : false;
  const canAssignTickets = session
    ? ["admin", "manager"].includes(session.user.role)
    : false;
  const canDeletePortfolioItems = session?.user.role === "admin";
  const visibleSections: Section[] = isWorker
    ? ["service"]
    : isTenant
      ? ["leases", "service", "chat"]
      : canManagePortfolio
        ? [...navSections]
        : navSections.filter((item) => item !== "admin");
  const activeWorkspaceSection = visibleSections.includes(selectedSection)
    ? selectedSection
    : (visibleSections[0] ?? "service");
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets],
  );
  const selectedBillingInvoice = useMemo(
    () =>
      billingInvoices.find(
        (invoice) => invoice.id === selectedBillingInvoiceId,
      ) ?? null,
    [billingInvoices, selectedBillingInvoiceId],
  );
  const selectedBillingLease = useMemo(
    () =>
      selectedBillingInvoice
        ? (overview?.leases.find(
            (lease) => lease.id === selectedBillingInvoice.leaseId,
          ) ?? null)
        : null,
    [overview, selectedBillingInvoice],
  );
  const selectedChecklistTemplate = useMemo(
    () =>
      checklistTemplates.find(
        (template) => template.category === ticketForm.category,
      ) ?? null,
    [checklistTemplates, ticketForm.category],
  );
  const billingTotals = useMemo(
    () => ({
      billed: billingInvoices.reduce(
        (total, invoice) => total + invoice.totalAmount,
        0,
      ),
      paid: billingInvoices.reduce(
        (total, invoice) => total + invoice.paidAmount,
        0,
      ),
      overdue: billingInvoices
        .filter((invoice) => ["overdue", "partial"].includes(invoice.status))
        .reduce(
          (total, invoice) =>
            total + Math.max(0, invoice.totalAmount - invoice.paidAmount),
          0,
        ),
    }),
    [billingInvoices],
  );
  const pendingPaymentProofTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => {
          const searchable = `${ticket.title} ${ticket.description}`;
          return (
            ticket.category === "billing" &&
            isOpenTicket(ticket.status) &&
            /\u043e\u043f\u043b\u0430\u0442|payment/i.test(searchable)
          );
        })
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        ),
    [tickets],
  );
  const serviceTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => !["billing", "lease"].includes(ticket.category),
      ),
    [tickets],
  );
  const filteredTickets = useMemo(
    () =>
      ticketFilter === "all"
        ? serviceTickets
        : serviceTickets.filter((ticket) => ticket.status === ticketFilter),
    [serviceTickets, ticketFilter],
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
      const propertyUnits = overview.units.filter(
        (unit) => unit.propertyId === property.id,
      );
      const occupiedArea = propertyUnits
        .filter((unit) => unit.status === "occupied")
        .reduce((total, unit) => total + unit.area, 0);
      const maintenanceArea = propertyUnits
        .filter((unit) => unit.status === "maintenance")
        .reduce((total, unit) => total + unit.area, 0);
      const vacantArea = propertyUnits
        .filter((unit) => unit.status === "vacant")
        .reduce((total, unit) => total + unit.area, 0);
      const unallocatedArea = Math.max(
        0,
        property.rentableArea - occupiedArea - maintenanceArea - vacantArea,
      );
      const typeBreakdown = unitTypeOptions
        .map((type) => ({
          id: type,
          label: t.unitTypes[type],
          area: propertyUnits
            .filter((unit) => unit.type === type)
            .reduce((total, unit) => total + unit.area, 0),
        }))
        .filter((item) => item.area > 0);
      const statusBreakdown = [
        { id: "occupied", label: t.unitStatuses.occupied, area: occupiedArea },
        { id: "vacant", label: t.unitStatuses.vacant, area: vacantArea },
        {
          id: "maintenance",
          label: t.unitStatuses.maintenance,
          area: maintenanceArea,
        },
        {
          id: "reserve",
          label: locale === "ru" ? "Резерв фонда" : "Fund reserve",
          area: unallocatedArea,
        },
      ].filter((item) => item.area > 0);

      return {
        ...property,
        unitCount: propertyUnits.length,
        occupiedArea,
        maintenanceArea,
        vacantArea,
        unallocatedArea,
        typeBreakdown,
        statusBreakdown,
        occupancy:
          property.rentableArea > 0
            ? Number(((occupiedArea / property.rentableArea) * 100).toFixed(1))
            : 0,
      };
    });
  }, [locale, overview, t.unitStatuses, t.unitTypes]);
  const leaseWatch = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [...overview.leases]
      .filter((lease) =>
        ["signed", "active", "prolongation"].includes(lease.stage),
      )
      .sort(
        (left, right) =>
          new Date(left.endDate).getTime() - new Date(right.endDate).getTime(),
      )
      .slice(0, 8);
  }, [overview]);
  const propertyOperations = useMemo(() => {
    return propertySnapshots
      .map((property) => {
        const propertyTickets = tickets.filter(
          (ticket) =>
            ticket.propertyId === property.id && isOpenTicket(ticket.status),
        );

        return {
          ...property,
          openTicketCount: propertyTickets.length,
          urgentTicketCount: propertyTickets.filter(isCriticalTicket).length,
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
        units: [...units].sort((left, right) =>
          left.number.localeCompare(right.number, "ru"),
        ),
      }));
  }, [twinUnits]);
  const focusTickets = useMemo(() => {
    return [...serviceTickets]
      .filter((ticket) => isOpenTicket(ticket.status))
      .sort((left, right) => {
        const priorityDelta =
          (priorityWeight[right.priority] ?? 0) -
          (priorityWeight[left.priority] ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      })
      .slice(0, 4);
  }, [serviceTickets]);
  const openTicketCount = useMemo(
    () => serviceTickets.filter((ticket) => isOpenTicket(ticket.status)).length,
    [serviceTickets],
  );
  const selectedProperty = useMemo(
    () =>
      overview?.properties.find((item) => item.id === selectedPropertyId) ??
      null,
    [overview, selectedPropertyId],
  );
  const selectedPropertySnapshot = useMemo(
    () =>
      propertySnapshots.find((item) => item.id === selectedPropertyId) ?? null,
    [propertySnapshots, selectedPropertyId],
  );
  const selectedTenant = useMemo(
    () =>
      overview?.tenants.find((item) => item.id === selectedTenantId) ?? null,
    [overview, selectedTenantId],
  );
  const selectedUnit = useMemo(
    () => overview?.units.find((item) => item.id === selectedUnitId) ?? null,
    [overview, selectedUnitId],
  );
  const criticalNotifications = useMemo(
    () =>
      (overview?.notifications ?? [])
        .filter((item) => ["critical", "warning"].includes(item.tone))
        .slice(0, 4),
    [overview],
  );
  const tenantTableRows = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.tenants.map((tenant) => {
      const tenantLeases = overview.leases.filter(
        (lease) => lease.tenantId === tenant.id && lease.stage !== "terminated",
      );
      const tenantUnits = overview.units.filter((unit) =>
        tenantLeases.some((lease) => lease.unitId === unit.id),
      );
      const monthlyRent = tenantLeases.reduce((total, lease) => {
        const unit = overview.units.find((item) => item.id === lease.unitId);
        return total + (unit?.area ?? 0) * lease.ratePerSqm;
      }, 0);
      const nextExpiry =
        [...tenantLeases].sort(
          (left, right) =>
            new Date(left.endDate).getTime() -
            new Date(right.endDate).getTime(),
        )[0]?.endDate ?? null;
      const tenantTickets = tickets.filter(
        (ticket) => ticket.tenantId === tenant.id,
      );
      const paymentDiscipline = tenant.paymentDiscipline ?? 0;

      return {
        ...tenant,
        propertyIds: [...new Set(tenantUnits.map((unit) => unit.propertyId))],
        unitLabel: tenantUnits.map((unit) => unit.number).join(", ") || "—",
        totalArea: tenantUnits.reduce((total, unit) => total + unit.area, 0),
        monthlyRent,
        nextExpiry,
        paymentDiscipline,
        openTicketCount: tenantTickets.filter((ticket) =>
          isOpenTicket(ticket.status),
        ).length,
      };
    });
  }, [overview, tickets]);
  const propertyScopedTenantRows = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();

    return tenantTableRows.filter((tenant) => {
      const matchesProperty =
        !selectedPropertyId || tenant.propertyIds.includes(selectedPropertyId);
      const matchesRisk =
        tenantRiskFilter === "all" || tenant.riskLevel === tenantRiskFilter;
      const matchesSearch =
        !query ||
        [
          tenant.name,
          tenant.inn,
          tenant.contactName,
          tenant.phone,
          tenant.email,
          tenant.unitLabel,
        ]
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

    return overview.units.filter(
      (unit) => unit.propertyId === selectedPropertyId,
    );
  }, [overview, selectedPropertyId]);
  const filteredPropertyScopedUnits = useMemo(
    () =>
      propertyScopedUnits.filter((unit) => {
        const matchesType =
          unitTypeFilter === "all" || unit.type === unitTypeFilter;
        const matchesStatus =
          unitStatusFilter === "all" || unit.status === unitStatusFilter;
        const matchesRamp =
          unitRampFilter === "all" ||
          (unitRampFilter === "ramp" && unit.hasRamp) ||
          (unitRampFilter === "no-ramp" && !unit.hasRamp);

        return matchesType && matchesStatus && matchesRamp;
      }),
    [propertyScopedUnits, unitRampFilter, unitStatusFilter, unitTypeFilter],
  );
  const managerLeaseRows = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.leases.filter((lease) => {
      const matchesStage =
        leaseStageFilter === "all" || lease.stage === leaseStageFilter;
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
    [overview],
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

    const tenantById = new Map(
      overview.tenants.map((tenant) => [tenant.id, tenant]),
    );
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
          ticket.status === "new" ||
          ticket.status === "waiting_tenant" ||
          priorityWeight[ticket.priority] >= 3
            ? 1
            : 0;

        if (!current) {
          grouped.set(tenantId, {
            tenantId,
            tenantName: tenant.name,
            propertyName: ticket.propertyName ?? null,
            preview: ticket.title,
            lastActivity: ticket.updatedAt,
            unreadCount: unreadIncrement,
            ticketCount: 1,
          });
          return;
        }

        const isNewer =
          new Date(ticket.updatedAt).getTime() >
          new Date(current.lastActivity).getTime();

        grouped.set(tenantId, {
          ...current,
          propertyName: current.propertyName ?? ticket.propertyName ?? null,
          preview: isNewer ? ticket.title : current.preview,
          lastActivity: isNewer ? ticket.updatedAt : current.lastActivity,
          unreadCount: current.unreadCount + unreadIncrement,
          ticketCount: current.ticketCount + 1,
        });
      });

    return [...grouped.values()].sort(
      (left, right) =>
        new Date(right.lastActivity).getTime() -
        new Date(left.lastActivity).getTime(),
    );
  }, [overview, tickets]);
  const selectedChatThread = useMemo(
    () =>
      chatThreads.find((thread) => thread.tenantId === selectedChatTenantId) ??
      null,
    [chatThreads, selectedChatTenantId],
  );
  const selectedChatTickets = useMemo(() => {
    if (!selectedChatTenantId) {
      return [];
    }

    return [...tickets]
      .filter((ticket) => ticket.tenantId === selectedChatTenantId)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
  }, [selectedChatTenantId, tickets]);
  const selectedChatTicketIdsKey = useMemo(
    () => selectedChatTickets.map((ticket) => ticket.id).join(","),
    [selectedChatTickets],
  );
  const selectedChatTargetTicket = useMemo(() => {
    if (!selectedChatTickets.length) {
      return null;
    }

    const explicitTicket = selectedChatTickets.find(
      (ticket) => ticket.id === selectedChatTicketId,
    );
    if (explicitTicket) {
      return explicitTicket;
    }

    return (
      [...selectedChatTickets].sort((left, right) => {
        const openDelta =
          Number(isOpenTicket(right.status)) -
          Number(isOpenTicket(left.status));
        if (openDelta !== 0) {
          return openDelta;
        }

        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      })[0] ?? null
    );
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

    if (
      managerScreen === "ticket-detail" ||
      managerScreen === "ticket-create"
    ) {
      return "tickets";
    }

    if (managerScreen === "staff-add") {
      return "staff";
    }

    return managerScreen;
  })();
  return {
    locale,
    t,
    ui,
    managerUi,
    productBrand,
    adminEditLabel,
    adminCancelLabel,
    adminSaveChangesLabel,
    unitExportLabel,
    isWorker,
    isTenant,
    canManagePortfolio,
    canManageDocuments,
    isManagerShell,
    canUpdateTickets,
    canAssignTickets,
    canDeletePortfolioItems,
    visibleSections,
    activeWorkspaceSection,
    selectedTicket,
    selectedBillingInvoice,
    selectedBillingLease,
    selectedChecklistTemplate,
    billingTotals,
    pendingPaymentProofTickets,
    serviceTickets,
    filteredTickets,
    ticketUnits,
    twinUnits,
    propertySnapshots,
    leaseWatch,
    propertyOperations,
    boardFloors,
    focusTickets,
    openTicketCount,
    selectedProperty,
    selectedPropertySnapshot,
    selectedTenant,
    selectedUnit,
    criticalNotifications,
    tenantTableRows,
    propertyScopedTenantRows,
    propertyScopedUnits,
    filteredPropertyScopedUnits,
    managerLeaseRows,
    ticketAssigneeOptions,
    selectedUnitLeases,
    selectedUnitTickets,
    chatThreads,
    selectedChatThread,
    selectedChatTickets,
    selectedChatTicketIdsKey,
    selectedChatTargetTicket,
    sectionTitle,
    activeManagerNav,
  };
}
export type WorkspaceView = ReturnType<typeof useWorkspaceView>;
