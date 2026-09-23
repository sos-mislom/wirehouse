import { useWorkspace } from "../../app/WorkspaceContext";
import { PageBoundary } from "../../app/PageBoundary";
import {
  managerPrimaryNav,
  managerSecondaryNav,
} from "../../shared/navigation";
import { Button } from "../../ui";
import { DocumentPanel } from "../leases/DocumentPanel";
import { ManagerScreen } from "./ManagerScreen";
export function ManagerShell() {
  const {
    productBrand,
    mobileMenuButton,
    mobileNavOpen,
    setMobileNavOpen,
    activeManagerNav,
    setManagerScreen,
    managerUi,
    openTicketCount,
    chatThreads,
    overview,
    session,
    t,
    handleLogout,
    error,
    notice,
  } = useWorkspace();
  return (
    <main className="mvp-shell">
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
        className={`mvp-sidebar ${mobileNavOpen ? "mobile-nav-open" : ""}`}
      >
        <div className="mvp-brand">
          <div>
            <strong>{productBrand.name}</strong>
          </div>
        </div>

        <div className="mvp-nav-group">
          {managerPrimaryNav.map((screen) => (
            <Button
              variant="plain"
              className={
                activeManagerNav === screen
                  ? "mvp-nav-button mvp-nav-button--active"
                  : "mvp-nav-button"
              }
              key={screen}
              onClick={() => {
                setManagerScreen(screen);
                setMobileNavOpen(false);
              }}
              type="button"
            >
              <span>{managerUi.nav[screen]}</span>
              {screen === "tickets" && openTicketCount > 0 ? (
                <small>{openTicketCount}</small>
              ) : null}
              {screen === "chat" && chatThreads.length > 0 ? (
                <small>{chatThreads.length}</small>
              ) : null}
              {screen === "notifications" &&
              overview.notifications.some((item) => item.unread) ? (
                <small>
                  {overview.notifications.filter((item) => item.unread).length}
                </small>
              ) : null}
            </Button>
          ))}
        </div>

        <div className="mvp-nav-divider" />

        <div className="mvp-nav-group">
          {managerSecondaryNav.map((screen) => (
            <Button
              variant="plain"
              className={
                activeManagerNav === screen
                  ? "mvp-nav-button mvp-nav-button--active"
                  : "mvp-nav-button"
              }
              key={screen}
              onClick={() => {
                setManagerScreen(screen);
                setMobileNavOpen(false);
              }}
              type="button"
            >
              <span>{managerUi.nav[screen]}</span>
            </Button>
          ))}
        </div>

        <div className="mvp-user">
          <strong>{session.user.fullName}</strong>
          <small>
            {t.roles[session.user.role]} ·{" "}
            {session.user.role === "admin"
              ? "Все объекты"
              : (overview.properties.find(
                  (p) => p.id === session.user.propertyId,
                )?.name ?? "Объект не назначен")}
          </small>
          <Button
            variant="plain"
            className="sidebar-logout"
            onClick={handleLogout}
            type="button"
          >
            Выйти
          </Button>
        </div>
      </aside>

      <section className="mvp-main">
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

        <PageBoundary>
          <ManagerScreen />
        </PageBoundary>
      </section>
    </main>
  );
}
