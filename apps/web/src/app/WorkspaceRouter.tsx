import { LoginPage } from "../features/auth/LoginPage";
import { DocumentPanel } from "../features/leases/DocumentPanel";
import { ManagerShell } from "../features/shell/ManagerShell";
import { Section } from "../features/shell/Section";
import { getCollectionBasisLabel } from "../shared/format";
import { Button } from "../ui";
import { useWorkspaceContext } from "./WorkspaceContext";
export function WorkspaceRouter() {
  const {
    bootstrapping,
    t,
    isManagerShell,
    productBrand,
    mobileMenuButton,
    mobileNavOpen,
    setMobileNavOpen,
    visibleSections,
    activeWorkspaceSection,
    setSelectedSection,
    openTicketCount,
    isTenant,
    overview,
    session,
    selectedProperty,
    handleLogout,
    sectionTitle,
    isWorker,
    ui,
    locale,
    error,
    notice,
  } = useWorkspaceContext();
  if (bootstrapping) {
    return <main className="loading-shell">{t.loading}</main>;
  }
  if (!session || !overview) return <LoginPage />;
  if (isManagerShell) {
    return <ManagerShell />;
  }
  return (
    <main className="workspace-shell">
      <header className="mobile-app-bar">
        <strong>{productBrand.name}</strong>
        <Button
          variant="secondary"
          type="button"
          ref={mobileMenuButton}
          className="secondary-button"
          aria-controls="workspace-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          <span
            className={`burger-icon ${mobileNavOpen ? "burger-icon--open" : ""}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
          <span>{mobileNavOpen ? "Закрыть" : "Меню"}</span>
        </Button>
      </header>
      {mobileNavOpen && (
        <Button
          variant="plain"
          type="button"
          className="mobile-nav-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobileNavOpen ? "mobile-nav-open" : ""}`}
      >
        <div className="sidebar-brand">
          <strong>{productBrand.name}</strong>
          <span>{productBrand.subtitle}</span>
        </div>

        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <Button
              variant="plain"
              className={
                activeWorkspaceSection === section
                  ? "nav-button nav-button--active"
                  : "nav-button"
              }
              key={section}
              onClick={() => {
                setSelectedSection(section);
                setMobileNavOpen(false);
              }}
              type="button"
            >
              <span>{t.nav[section]}</span>
              {section === "service" ? <small>{openTicketCount}</small> : null}
              {section === "leases" ? (
                <small>
                  {isTenant
                    ? overview.leases.length
                    : overview.expiringLeaseCount}
                </small>
              ) : null}
            </Button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>{session.user.fullName}</span>
          <small>
            {t.roles[session.user.role]} ·{" "}
            {selectedProperty?.name ?? productBrand.name}
          </small>
          <Button
            variant="secondary"
            className="secondary-button secondary-button--sidebar"
            onClick={handleLogout}
            type="button"
          >
            {t.topbar.logout}
          </Button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <h1>{sectionTitle}</h1>
          </div>

          <div className="workspace-toolbar">
            <div className="workspace-kpis">
              {!isWorker ? (
                <div className="workspace-kpi">
                  <span>{isTenant ? t.nav.leases : ui.collectionRate}</span>
                  <strong>
                    {isTenant
                      ? overview.leases.length
                      : `${overview.finance.collectionRate}%`}
                  </strong>
                  {!isTenant ? (
                    <small title="Фактически оплачено / начислено за указанный месяц">
                      {getCollectionBasisLabel(overview.finance, locale)}
                    </small>
                  ) : null}
                </div>
              ) : null}
              <div className="workspace-kpi">
                <span>
                  {isWorker
                    ? locale === "ru"
                      ? "Назначенные заявки"
                      : "Assigned jobs"
                    : t.metrics.openTickets}
                </span>
                <strong>{openTicketCount}</strong>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="banner banner--notice" role="status">
            {notice}
          </div>
        ) : null}
        {<DocumentPanel />}

        {<Section />}
      </section>
    </main>
  );
}
