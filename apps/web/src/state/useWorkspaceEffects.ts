import { useLiveWorkspace } from "./useLiveWorkspace";
import { useEffect } from "react";
import { apiRequest } from "../api/client";
import { useBrowserNavigation } from "../navigation";
import { brand } from "../projectData";
import { TOKEN_KEY } from "../shared/navigation";
import {
  type AdminPanel,
  type Lease,
  type ManagerScreen,
  type Property,
  type Section,
  type Tenant,
  type TenantDetailTab,
  type TenantOnboarding,
  type Unit,
} from "../shared/types";
import type { WorkspaceModel } from "./useWorkspaceModel";
export function useWorkspaceEffects(model: WorkspaceModel) {
  useLiveWorkspace(model);
  const {
    mobileNavOpen,
    setMobileNavOpen,
    mobileMenuButton,
    managerScreen,
    selectedSection,
    selectedPropertyId,
    selectedTenantId,
    selectedUnitId,
    selectedTicketId,
    tenantDetailTab,
    editingAdmin,
    editReturnScreen,
    setManagerScreen,
    setSelectedSection,
    setSelectedPropertyId,
    setSelectedTenantId,
    setSelectedUnitId,
    setSelectedTicketId,
    setTenantDetailTab,
    setEditingAdmin,
    session,
    overview,
    hydratedEdit,
    startEditProperty,
    startEditTenant,
    startEditUnit,
    startEditLease,
    locale,
    notice,
    setNotice,
    setBootstrapping,
    hydrateSession,
    setTenantOnboarding,
    propertyScopedTenantRows,
    setTenantDetail,
    propertyScopedUnits,
    setUnitSplitForm,
    selectedUnit,
    visibleSections,
    isTenant,
    paymentProofForm,
    setPaymentProofForm,
    unitForm,
    setUnitForm,
    staffCreateForm,
    setStaffCreateForm,
    leaseForm,
    setLeaseForm,
    ticketUnits,
    ticketForm,
    setTicketForm,
    tickets,
    chatThreads,
    setSelectedChatTenantId,
    setChatMessages,
    selectedChatTenantId,
    selectedChatTickets,
    setSelectedChatTicketId,
    selectedChatTicketId,
    selectedChatTargetTicket,
    selectedTicket,
    setTicketStatusDraft,
    setTicketAssigneeDraft,
    isWorker,
    selectedBillingInvoice,
    setBillingPaymentForm,
    setExpandedTenantNoteIds,
    setTenantNoteFile,
    setTenantNoteForm,
  } = model;
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1081px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [setMobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const menu = document.getElementById("workspace-navigation");
    (menu?.querySelector("button") as HTMLButtonElement | null)?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        mobileMenuButton.current?.focus();
      }
      if (event.key === "Tab" && menu) {
        const items = Array.from(
          menu.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled]), a[href], summary",
          ),
        ).filter((item) => item.getClientRects().length > 0);
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [managerScreen, selectedSection]);

  useBrowserNavigation(
    {
      screen: managerScreen,
      section: selectedSection,
      property: selectedPropertyId,
      tenant: selectedTenantId,
      unit: selectedUnitId,
      ticket: selectedTicketId,
      tab: tenantDetailTab,
      editProperty: editingAdmin.property || "",
      editTenant: editingAdmin.tenant || "",
      editUnit: editingAdmin.unit || "",
      editLease: editingAdmin.lease || "",
      returnScreen: editReturnScreen.current,
    },
    (route) => {
      setManagerScreen((route.screen as ManagerScreen) || "dashboard");
      setSelectedSection((route.section as Section) || "overview");
      setSelectedPropertyId(route.property || "");
      setSelectedTenantId(route.tenant || "");
      setSelectedUnitId(route.unit || "");
      setSelectedTicketId(route.ticket || "");
      setTenantDetailTab((route.tab as TenantDetailTab) || "info");
      setEditingAdmin({
        property: route.editProperty || null,
        tenant: route.editTenant || null,
        unit: route.editUnit || null,
        lease: route.editLease || null,
      });
      editReturnScreen.current =
        (route.returnScreen as ManagerScreen) || "dashboard";
    },
    Boolean(session && overview),
  );

  useEffect(() => {
    if (!overview || !managerScreen.endsWith("-add")) {
      hydratedEdit.current = "";
      return;
    }
    const panel = managerScreen.split("-")[0] as AdminPanel;
    const id = editingAdmin[panel];
    if (!id || hydratedEdit.current === `${panel}:${id}`) return;
    const record =
      panel === "property"
        ? overview.properties.find((r) => r.id === id)
        : panel === "tenant"
          ? overview.tenants.find((r) => r.id === id)
          : panel === "unit"
            ? overview.units.find((r) => r.id === id)
            : overview.leases.find((r) => r.id === id);
    if (!record) return;
    hydratedEdit.current = `${panel}:${id}`;
    if (panel === "property") startEditProperty(record as Property);
    else if (panel === "tenant") startEditTenant(record as Tenant);
    else if (panel === "unit") startEditUnit(record as Unit);
    else startEditLease(record as Lease);
  }, [overview, managerScreen, editingAdmin]);

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
    const retry = () => {
      const saved = window.localStorage.getItem(TOKEN_KEY);
      if (!session && saved && document.visibilityState !== "hidden")
        void hydrateSession(saved, { silentAuthFailure: true });
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [session?.token]);

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
          setTenantOnboarding({ channels: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!overview) return;
    if (!overview.properties.length) {
      setSelectedPropertyId("");
      return;
    }

    if (
      !overview.properties.some(
        (property) => property.id === selectedPropertyId,
      )
    ) {
      setSelectedPropertyId(overview.properties[0].id);
    }
  }, [overview, selectedPropertyId]);

  useEffect(() => {
    if (!overview) return;
    if (!propertyScopedTenantRows.length) {
      setSelectedTenantId("");
      setTenantDetail(null);
      return;
    }

    if (
      !propertyScopedTenantRows.some((tenant) => tenant.id === selectedTenantId)
    ) {
      setSelectedTenantId(propertyScopedTenantRows[0].id);
    }
  }, [propertyScopedTenantRows, selectedTenantId]);

  useEffect(() => {
    if (!overview) return;
    if (!propertyScopedUnits.length) {
      setSelectedUnitId("");
      return;
    }

    if (!propertyScopedUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(propertyScopedUnits[0].id);
    }
  }, [propertyScopedUnits, selectedUnitId]);

  useEffect(() => {
    setUnitSplitForm({
      number: selectedUnit ? `${selectedUnit.number}-1` : "",
      area: "",
    });
  }, [selectedUnit?.id, selectedUnit?.number]);

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
      leaseId: overview.leases[0].id,
    }));
  }, [isTenant, overview?.leases, paymentProofForm.leaseId]);

  useEffect(() => {
    if (overview?.properties.length && !unitForm.propertyId) {
      setUnitForm((current) => ({
        ...current,
        propertyId: overview.properties[0].id,
      }));
    }
  }, [overview, unitForm.propertyId]);

  useEffect(() => {
    if (overview?.properties.length && !staffCreateForm.propertyId) {
      setStaffCreateForm((current) => ({
        ...current,
        propertyId: overview.properties[0].id,
      }));
    }
  }, [overview, staffCreateForm.propertyId]);

  useEffect(() => {
    if (overview?.tenants.length && !leaseForm.tenantId) {
      setLeaseForm((current) => ({
        ...current,
        tenantId: overview.tenants[0].id,
      }));
    }
  }, [overview, leaseForm.tenantId]);

  useEffect(() => {
    const editingLease =
      overview?.leases.find((lease) => lease.id === editingAdmin.lease) ?? null;
    const availableLeaseUnits = overview?.units ?? [];

    if (
      availableLeaseUnits.length &&
      !availableLeaseUnits.some((unit) => unit.id === leaseForm.unitId)
    ) {
      setLeaseForm((current) => ({
        ...current,
        unitId: availableLeaseUnits[0].id,
      }));
    }
  }, [editingAdmin.lease, overview, leaseForm.unitId]);

  useEffect(() => {
    if (
      ticketUnits.length &&
      !ticketUnits.some((unit) => unit.id === ticketForm.unitId)
    ) {
      setTicketForm((current) => ({
        ...current,
        unitId: ticketUnits[0].id,
      }));
    }
  }, [ticketForm.unitId, ticketUnits]);

  useEffect(() => {
    if (!overview) return;
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

    if (
      !chatThreads.some((thread) => thread.tenantId === selectedChatTenantId)
    ) {
      setSelectedChatTenantId(chatThreads[0].tenantId);
    }
  }, [chatThreads, selectedChatTenantId]);

  useEffect(() => {
    if (!selectedChatTickets.length) {
      setSelectedChatTicketId("");
      return;
    }

    if (
      !selectedChatTickets.some((ticket) => ticket.id === selectedChatTicketId)
    ) {
      setSelectedChatTicketId(
        selectedChatTargetTicket?.id ?? selectedChatTickets[0].id,
      );
    }
  }, [selectedChatTargetTicket?.id, selectedChatTicketId, selectedChatTickets]);

  useEffect(() => {
    if (!selectedTicket) {
      setTicketStatusDraft("new");
      setTicketAssigneeDraft("");
      return;
    }

    setTicketStatusDraft(
      isWorker && !["in_progress", "completed"].includes(selectedTicket.status)
        ? "in_progress"
        : selectedTicket.status,
    );
    setTicketAssigneeDraft(selectedTicket.assignedTo ?? "");
  }, [
    isWorker,
    selectedTicket?.id,
    selectedTicket?.status,
    selectedTicket?.assignedTo,
  ]);

  useEffect(() => {
    if (!selectedBillingInvoice) {
      return;
    }

    const remainder = Math.max(
      0,
      selectedBillingInvoice.totalAmount - selectedBillingInvoice.paidAmount,
    );
    setBillingPaymentForm((current) => ({
      ...current,
      amount: remainder > 0 ? String(remainder) : current.amount,
    }));
  }, [selectedBillingInvoice?.id]);

  useEffect(() => {
    setExpandedTenantNoteIds({});
    setTenantNoteFile(null);
    setTenantNoteForm({
      title: "",
      content: "",
    });
  }, [selectedTenantId]);
}
