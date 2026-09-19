import { useWorkspace } from "../../app/WorkspaceContext";
import { Button } from "../../ui";
export function WorkspaceQuickActions() {
  const { isWorker, locale, openTicketCount, t, setSelectedSection, overview } =
    useWorkspace();

  const actions = isWorker
    ? [
        {
          id: "jobs",
          label: locale === "ru" ? "Мои заявки" : "My jobs",
          meta: `${openTicketCount} ${t.metrics.openTickets.toLowerCase()}`,
          tone: openTicketCount > 0 ? "warning" : "success",
          onClick: () => setSelectedSection("service"),
        },
      ]
    : [
        {
          id: "ticket",
          label: locale === "ru" ? "Сообщить о проблеме" : "Report issue",
          meta:
            locale === "ru"
              ? "заявка в службу эксплуатации"
              : "service desk ticket",
          tone: "primary",
          onClick: () => setSelectedSection("service"),
        },
        {
          id: "leases",
          label:
            locale === "ru" ? "Договоры и документы" : "Leases and documents",
          meta: `${overview.leases.length} ${t.nav.leases.toLowerCase()}`,
          tone: "neutral",
          onClick: () => setSelectedSection("leases"),
        },
        {
          id: "payment",
          label: locale === "ru" ? "Отправить оплату" : "Send payment proof",
          meta: locale === "ru" ? "чек менеджеру" : "receipt to manager",
          tone:
            (overview.finance?.arrearsAmount ?? 0) > 0 ? "warning" : "neutral",
          onClick: () => setSelectedSection("leases"),
        },
      ];

  return (
    <article className="action-strip action-strip--workspace">
      <div className="action-grid">
        {actions.map((action) => (
          <Button
            variant="plain"
            className={`action-card action-card--${action.tone}`}
            key={action.id}
            onClick={action.onClick}
            type="button"
          >
            <strong>{action.label}</strong>
            <span>{action.meta}</span>
          </Button>
        ))}
      </div>
    </article>
  );
}
