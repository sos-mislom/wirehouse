import { useWorkspace } from "../../app/WorkspaceContext";
import { PageBoundary } from "../../app/PageBoundary";
import { useEffect, useState } from "react";
import {
  managerMainNav,
  managerExtraNavGroups,
  managerMobileNav,
} from "../../shared/navigation";
import { NavigationIcon } from "./NavigationIcon";
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
  const extraActive = managerExtraNavGroups.some((group) =>
    group.screens.some((screen) => screen === activeManagerNav),
  );
  const [extraOpen, setExtraOpen] = useState(extraActive);
  useEffect(() => {
    setExtraOpen(extraActive);
  }, [activeManagerNav, extraActive]);
  const navItem = (
    screen:
      | (typeof managerMainNav)[number]
      | (typeof managerExtraNavGroups)[number]["screens"][number],
  ) => {
    const count =
      screen === "tickets"
        ? openTicketCount
        : screen === "notifications"
          ? overview.notifications.filter((item) => item.unread).length
          : screen === "chat"
            ? chatThreads.reduce(
                (total, thread) => total + thread.unreadCount,
                0,
              )
            : 0;
    return (
      <Button
        variant="plain"
        type="button"
        key={screen}
        className={`mvp-nav-button ${activeManagerNav === screen ? "mvp-nav-button--active" : ""}`}
        aria-current={activeManagerNav === screen ? "page" : undefined}
        onClick={() => {
          setExtraOpen(
            managerExtraNavGroups.some((group) =>
              group.screens.some((item) => item === screen),
            ),
          );
          setManagerScreen(screen);
          setMobileNavOpen(false);
        }}
      >
        <span>{managerUi.nav[screen]}</span>
        {count > 0 && <small>{count}</small>}
      </Button>
    );
  };
  return (
    <main className="mvp-shell">
      <header className="mobile-app-bar">
        <strong>{managerUi.nav[activeManagerNav]}</strong>
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

        <nav
          aria-label="Разделы приложения"
          className="workspace-navigation-groups"
        >
          <div className="mvp-nav-group" aria-label="Основные разделы">
            {managerMainNav.map(navItem)}
          </div>
          <div className="workspace-extra-nav">
            <Button
              variant="text"
              type="button"
              className="workspace-extra-toggle"
              aria-expanded={extraOpen}
              aria-controls="workspace-extra-groups"
              onClick={() => setExtraOpen((value) => !value)}
            >
              {extraOpen ? "Скрыть разделы" : "Другие разделы"}
            </Button>
            <div
              id="workspace-extra-groups"
              className="workspace-extra-groups"
              hidden={!extraOpen}
            >
              {managerExtraNavGroups.map((group) => (
                <div className="mvp-nav-group" key={group.label}>
                  <h2 className="navigation-group-label">{group.label}</h2>
                  {group.screens.map(navItem)}
                </div>
              ))}
            </div>
          </div>
        </nav>

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

      <section className="mvp-main" inert={mobileNavOpen || undefined}>
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
      <nav
        className="mobile-primary-nav"
        aria-label="Быстрые переходы"
        inert={mobileNavOpen || undefined}
      >
        {managerMobileNav.map((screen) => (
          <Button
            variant="plain"
            type="button"
            key={screen}
            aria-current={activeManagerNav === screen ? "page" : undefined}
            onClick={() => {
              setExtraOpen(false);
              setManagerScreen(screen);
              setMobileNavOpen(false);
            }}
          >
            <NavigationIcon name={screen} />
            <span>{managerUi.nav[screen]}</span>
          </Button>
        ))}
      </nav>
    </main>
  );
}
