import { LoginPage } from "../features/auth/LoginPage";
import { isRoleAllowedInApp } from "../mobile-product";
import { usePushNotifications } from "../platform/push";
import { DocumentPanel } from "../features/leases/DocumentPanel";
import { ManagerShell } from "../features/shell/ManagerShell";
import { OfflineBanner } from "../features/shell/OfflineBanner";
import { OutboxBanner } from "../features/shell/OutboxBanner";
import { QUEUED_MESSAGE } from "../platform/outbox";
import { Section } from "../features/shell/Section";
import { Button, IconButton } from "../ui";
import { NavigationIcon } from "../features/shell/NavigationIcon";
import { useWorkspaceContext } from "./WorkspaceContext";
import "./personal-shell.css";
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
    error,
    notice,
    locale,
    openTicketDetail,
    tickets,
  } = useWorkspaceContext();
  usePushNotifications(
    session && overview && isRoleAllowedInApp(session.user.role)
      ? session.token
      : undefined,
    openTicketDetail,
  );
  if (bootstrapping) {
    return <main className="loading-shell">{t.loading}</main>;
  }
  if (!session || !overview) return <LoginPage />;
  if (!isRoleAllowedInApp(session.user.role))
    return (
      <main className="loading-shell">
        <p>
          Эта учетная запись не используется в мобильном приложении. Войдите
          через веб-версию.
        </p>
        <Button onClick={handleLogout}>Выйти</Button>
      </main>
    );
  if (isManagerShell) {
    return <ManagerShell />;
  }
  const sectionIcons = {
    overview: "dashboard",
    portfolio: "objects",
    leases: "leases",
    service: "tickets",
    chat: "chat",
    admin: "staff",
  } as const;
  const sectionLabel = (section: (typeof visibleSections)[number]) =>
    locale !== "ru"
      ? t.nav[section]
      : section === "service"
        ? isTenant
          ? "Заявки"
          : "Задания"
        : section === "leases"
          ? "Аренда"
          : t.nav[section];
  const initials = session.user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
  const hasPersonalNav = visibleSections.length > 1;
  return (
    <main
      className="workspace-shell personal-shell"
      data-workspace-role={session.user.role}
      data-workspace-section={activeWorkspaceSection}
      data-personal-nav={hasPersonalNav || undefined}
    >
      <header className="mobile-app-bar">
        <h1>{sectionTitle}</h1>
        {/* Sections are in the bottom bar (or there is only one), so the
            header button opens the profile with sign-out. */}
        <IconButton
          label={mobileNavOpen ? "Закрыть профиль" : "Профиль"}
          ref={mobileMenuButton}
          className="mobile-menu-button mobile-account-button"
          aria-controls="workspace-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          {mobileNavOpen ? (
            <NavigationIcon name="close" />
          ) : (
            <span className="personal-account__avatar">{initials}</span>
          )}
        </IconButton>
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

        <nav className="sidebar-nav" aria-label="Разделы приложения">
          {visibleSections.map((section) => (
            <Button
              variant="plain"
              className={
                activeWorkspaceSection === section
                  ? "nav-button nav-button--active"
                  : "nav-button"
              }
              key={section}
              aria-current={
                activeWorkspaceSection === section ? "page" : undefined
              }
              onClick={() => {
                setSelectedSection(section);
                setMobileNavOpen(false);
              }}
              type="button"
            >
              <NavigationIcon name={sectionIcons[section]} />
              <span>{sectionLabel(section)}</span>
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

        <div className="sidebar-footer personal-account">
          <span className="personal-account__avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="personal-account__identity">
            <strong>{session.user.fullName}</strong>
            <small>
              {t.roles[session.user.role]} ·{" "}
              {selectedProperty?.name ?? productBrand.name}
            </small>
          </div>
          <IconButton label={t.topbar.logout} onClick={handleLogout}>
            <NavigationIcon name="logout" />
          </IconButton>
        </div>
        <Button className="personal-signout" onClick={handleLogout}>
          <NavigationIcon name="logout" />
          {locale === "ru" ? "Выйти из аккаунта" : "Sign out"}
        </Button>
      </aside>

      <section className="workspace-main" inert={mobileNavOpen || undefined}>
        {activeWorkspaceSection !== "service" && (
          <header className="ui-page-header">
            <h1>{sectionTitle}</h1>
          </header>
        )}

        <OfflineBanner />
        <OutboxBanner
          token={session.token}
          ticketNumber={(id) =>
            tickets.find((ticket) => ticket.id === id)?.number
          }
        />
        {error && error !== QUEUED_MESSAGE ? (
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
      {hasPersonalNav && (
        <nav
          className="mobile-primary-nav personal-primary-nav"
          aria-label="Быстрые переходы"
          inert={mobileNavOpen || undefined}
        >
          {visibleSections.map((section) => (
            <Button
              key={section}
              variant="plain"
              type="button"
              aria-current={
                activeWorkspaceSection === section ? "page" : undefined
              }
              onClick={() => {
                setSelectedSection(section);
                setMobileNavOpen(false);
              }}
            >
              <span className="personal-primary-nav__icon">
                <NavigationIcon name={sectionIcons[section]} />
                {section === "service" && openTicketCount > 0 && (
                  <small>{openTicketCount}</small>
                )}
              </span>
              <span>{sectionLabel(section)}</span>
            </Button>
          ))}
        </nav>
      )}
    </main>
  );
}
