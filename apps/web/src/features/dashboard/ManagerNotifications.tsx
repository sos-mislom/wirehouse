import { useWorkspace } from "../../app/WorkspaceContext";
import { formatDateTime } from "../../shared/format";
import { Button } from "../../ui";
export function ManagerNotifications() {
  const {
    managerUi,
    overview,
    markAllNotificationsRead,
    locale,
    openNotification,
    ui,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-page-header">
        <div>
          <h2>{managerUi.titles.notifications}</h2>
          <p>
            Красный — критично; жёлтый — требует внимания; синий — информация;
            зелёный — успешно.
          </p>
        </div>
        {overview.notifications.some((item) => item.unread) ? (
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => void markAllNotificationsRead()}
            type="button"
          >
            {locale === "ru" ? "Отметить прочитанными" : "Mark as read"}
          </Button>
        ) : null}
      </div>

      <div className="mvp-stack">
        {overview.notifications.length > 0 ? (
          overview.notifications.map((item) => (
            <Button
              variant="plain"
              className={`notification-card notification-card--${item.tone}`}
              key={item.id}
              onClick={() => void openNotification(item)}
              type="button"
            >
              <div className="notification-card-top">
                <span className="notification-dot" />
                <strong>{item.title}</strong>
              </div>
              <p>{item.message}</p>
              <small>
                {formatDateTime(item.createdAt, locale)} ·{" "}
                {item.unread ? "Не прочитано" : "Прочитано"}
              </small>
            </Button>
          ))
        ) : (
          <div className="mvp-card">
            <div className="empty-state">{ui.noNotifications}</div>
          </div>
        )}
      </div>
    </section>
  );
}
