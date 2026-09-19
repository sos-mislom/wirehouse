import { apiRequest } from "../../api/client";
import {
  type ManagerScreen,
  type NotificationItem,
  type Section,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
export function useNavigationActions(
  deps: Pick<
    WorkspaceBase,
    | "selectedSection"
    | "setSelectedSection"
    | "selectedPropertyId"
    | "setSelectedPropertyId"
    | "setManagerScreen"
    | "overview"
    | "setSelectedTenantId"
    | "setTenantDetailTab"
    | "setSelectedUnitId"
    | "setSelectedTicketId"
    | "isManagerShell"
    | "session"
    | "setOverview"
    | "setError"
  > &
    Pick<ReturnType<typeof useDataActions>, "refreshWorkspace">,
) {
  const {
    selectedSection,
    setSelectedSection,
    selectedPropertyId,
    setSelectedPropertyId,
    setManagerScreen,
    overview,
    setSelectedTenantId,
    setTenantDetailTab,
    setSelectedUnitId,
    setSelectedTicketId,
    isManagerShell,
    session,
    setOverview,
    setError,
    refreshWorkspace,
  } = deps;
  const handlePropertySelect = (propertyId: string, nextSection?: Section) => {
    if (nextSection && nextSection !== selectedSection) {
      setSelectedSection(nextSection);
    }

    if (propertyId !== selectedPropertyId) {
      setSelectedPropertyId(propertyId);
    }
  };

  const handleManagerPropertySelect = (
    propertyId: string,
    nextScreen?: ManagerScreen,
  ) => {
    if (propertyId !== selectedPropertyId) {
      setSelectedPropertyId(propertyId);
    }

    if (nextScreen) {
      setManagerScreen(nextScreen);
    }
  };

  const openTenantDetail = (tenantId: string) => {
    const lease = overview?.leases.find((l) => l.tenantId === tenantId);
    const unit = overview?.units.find((u) => u.id === lease?.unitId);
    if (unit) setSelectedPropertyId(unit.propertyId);
    setSelectedTenantId(tenantId);
    setTenantDetailTab("info");
    setManagerScreen("tenant-detail");
  };

  const openUnitDetail = (unitId: string) => {
    const unit = overview?.units.find((u) => u.id === unitId);
    if (unit) setSelectedPropertyId(unit.propertyId);
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
                notification.id === item.id
                  ? { ...notification, unread: false }
                  : notification,
              ),
            }
          : current,
      );
      try {
        await apiRequest(`/api/notifications/${item.id}/read`, {
          method: "POST",
          token: session.token,
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
            notifications: current.notifications.map((notification) => ({
              ...notification,
              unread: false,
            })),
          }
        : current,
    );

    const results = await Promise.allSettled(
      unread.map((item) =>
        apiRequest(`/api/notifications/${item.id}/read`, {
          method: "POST",
          token: session.token,
        }),
      ),
    );
    if (results.some((result) => result.status === "rejected")) {
      setError("Часть уведомлений не удалось отметить. Попробуйте ещё раз.");
      await refreshWorkspace();
    }
  };
  return {
    handlePropertySelect,
    handleManagerPropertySelect,
    openTenantDetail,
    openUnitDetail,
    openTicketDetail,
    openNotification,
    markAllNotificationsRead,
  };
}
