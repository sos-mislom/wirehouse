import { lazy } from "react";
import { Agenda } from "../../Agenda";
import { useWorkspace } from "../../app/WorkspaceContext";
import { Operations } from "../../Operations";

import { ManagerFormScreen } from "./ManagerFormScreen";

const ManagerDashboard = lazy(() =>
  import("../dashboard/ManagerDashboard").then((module) => ({
    default: module.ManagerDashboard,
  })),
);
const ManagerTenants = lazy(() =>
  import("../tenants/ManagerTenants").then((module) => ({
    default: module.ManagerTenants,
  })),
);
const ManagerTenantDetail = lazy(() =>
  import("../tenants/ManagerTenantDetail").then((module) => ({
    default: module.ManagerTenantDetail,
  })),
);
const ManagerObjects = lazy(() =>
  import("../portfolio/ManagerObjects").then((module) => ({
    default: module.ManagerObjects,
  })),
);
const ManagerObjectLaunch = lazy(() =>
  import("../portfolio/ManagerObjectLaunch").then((module) => ({
    default: module.ManagerObjectLaunch,
  })),
);
const ManagerUnits = lazy(() =>
  import("../portfolio/ManagerUnits").then((module) => ({
    default: module.ManagerUnits,
  })),
);
const ManagerUnitDetail = lazy(() =>
  import("../portfolio/ManagerUnitDetail").then((module) => ({
    default: module.ManagerUnitDetail,
  })),
);
const ManagerLeases = lazy(() =>
  import("../leases/ManagerLeases").then((module) => ({
    default: module.ManagerLeases,
  })),
);
const ManagerBilling = lazy(() =>
  import("../billing/ManagerBilling").then((module) => ({
    default: module.ManagerBilling,
  })),
);
const ManagerTickets = lazy(() =>
  import("../tickets/ManagerTickets").then((module) => ({
    default: module.ManagerTickets,
  })),
);
const ManagerTicketCreate = lazy(() =>
  import("../tickets/ManagerTicketCreate").then((module) => ({
    default: module.ManagerTicketCreate,
  })),
);
const ManagerTicketDetail = lazy(() =>
  import("../tickets/ManagerTicketDetail").then((module) => ({
    default: module.ManagerTicketDetail,
  })),
);
const ManagerChat = lazy(() =>
  import("../chat/ManagerChat").then((module) => ({
    default: module.ManagerChat,
  })),
);
const ManagerNotifications = lazy(() =>
  import("../dashboard/ManagerNotifications").then((module) => ({
    default: module.ManagerNotifications,
  })),
);
const ManagerStaff = lazy(() =>
  import("../administration/ManagerStaff").then((module) => ({
    default: module.ManagerStaff,
  })),
);
const ManagerStaffCreate = lazy(() =>
  import("../administration/ManagerStaffCreate").then((module) => ({
    default: module.ManagerStaffCreate,
  })),
);
const ManagerImport = lazy(() =>
  import("../imports/ManagerImport").then((module) => ({
    default: module.ManagerImport,
  })),
);
const ManagerProfile = lazy(() =>
  import("../administration/ManagerProfile").then((module) => ({
    default: module.ManagerProfile,
  })),
);
export function ManagerScreen() {
  const {
    managerScreen,
    session,
    overview,
    openTicketDetail,
    openManagerLeaseEdit,
    setManagerScreen,
    tickets,
    refreshWorkspace,
    openUnitDetail,
  } = useWorkspace();

  if (managerScreen === "agenda")
    return (
      <Agenda
        token={session.token}
        properties={overview.properties}
        onTicket={openTicketDetail}
        onLease={(id) => {
          const lease = overview.leases.find((l) => l.id === id);
          if (lease) openManagerLeaseEdit(lease);
        }}
        onOperations={() => setManagerScreen("operations")}
        onBilling={() => setManagerScreen("billing")}
      />
    );
  if (managerScreen === "operations")
    return (
      <Operations
        token={session.token}
        user={session.user}
        overview={overview}
        tickets={tickets}
        onRefresh={refreshWorkspace}
        onUnit={openUnitDetail}
        onTicket={openTicketDetail}
      />
    );
  if (managerScreen === "dashboard") {
    return <ManagerDashboard />;
  }

  if (managerScreen === "tenants") {
    return <ManagerTenants />;
  }

  if (managerScreen === "tenant-detail") {
    return <ManagerTenantDetail />;
  }

  if (managerScreen === "tenant-add") {
    return <ManagerFormScreen screen={"tenant-add"} backScreen={"tenants"} />;
  }

  if (managerScreen === "objects") {
    return <ManagerObjects />;
  }

  if (managerScreen === "property-add") {
    return <ManagerFormScreen screen={"property-add"} backScreen={"objects"} />;
  }

  if (managerScreen === "object-launch") {
    return <ManagerObjectLaunch />;
  }

  if (managerScreen === "units") {
    return <ManagerUnits />;
  }

  if (managerScreen === "unit-detail") {
    return <ManagerUnitDetail />;
  }

  if (managerScreen === "unit-add") {
    return <ManagerFormScreen screen={"unit-add"} backScreen={"units"} />;
  }

  if (managerScreen === "leases") {
    return <ManagerLeases />;
  }

  if (managerScreen === "lease-add") {
    return <ManagerFormScreen screen={"lease-add"} backScreen={"leases"} />;
  }

  if (managerScreen === "billing") {
    return <ManagerBilling />;
  }

  if (managerScreen === "tickets") {
    return <ManagerTickets />;
  }

  if (managerScreen === "ticket-create") {
    return <ManagerTicketCreate />;
  }

  if (managerScreen === "ticket-detail") {
    return <ManagerTicketDetail />;
  }

  if (managerScreen === "chat") {
    return <ManagerChat />;
  }

  if (managerScreen === "notifications") {
    return <ManagerNotifications />;
  }

  if (managerScreen === "staff") {
    return <ManagerStaff />;
  }

  if (managerScreen === "staff-add") {
    return <ManagerStaffCreate />;
  }

  if (managerScreen === "import") {
    return <ManagerImport />;
  }

  return <ManagerProfile />;
}
