import { lazy } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";

const Overview = lazy(() =>
  import("../dashboard/Overview").then((module) => ({
    default: module.Overview,
  })),
);
const Portfolio = lazy(() =>
  import("../portfolio/Portfolio").then((module) => ({
    default: module.Portfolio,
  })),
);
const Leases = lazy(() =>
  import("../leases/Leases").then((module) => ({ default: module.Leases })),
);
const Service = lazy(() =>
  import("../tickets/Service").then((module) => ({ default: module.Service })),
);
const TenantChat = lazy(() =>
  import("../tenants/TenantChat").then((module) => ({
    default: module.TenantChat,
  })),
);
const Admin = lazy(() =>
  import("../administration/Admin").then((module) => ({
    default: module.Admin,
  })),
);
export function Section() {
  const { activeWorkspaceSection, isTenant, canManagePortfolio, t } =
    useWorkspace();

  if (activeWorkspaceSection === "overview") {
    return <Overview />;
  }

  if (activeWorkspaceSection === "portfolio") {
    return <Portfolio />;
  }

  if (activeWorkspaceSection === "leases") {
    return <Leases />;
  }

  if (activeWorkspaceSection === "service") {
    return <Service />;
  }

  if (activeWorkspaceSection === "chat") {
    return isTenant ? <TenantChat /> : <Service />;
  }

  if (canManagePortfolio) {
    return <Admin />;
  }

  return (
    <section className="section-grid">
      <div className="empty-state">{t.hints.adminEmpty}</div>
    </section>
  );
}
