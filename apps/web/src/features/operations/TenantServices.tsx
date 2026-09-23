import { OperationsData, currency, date } from "./shared";
export function TenantServices({ data }: { data: OperationsData | null }) {
  if (!data) return null;
  return (
    <article className="surface">
      <h3>Объявления и услуги</h3>
      {data.news
        .filter((n) => n.published)
        .map((n) => (
          <article
            className={`notification-card notification-card--${n.tone}`}
            key={n.id}
          >
            <div className="notification-card-top">
              <span className="notification-dot" />
              <h4>{n.name}</h4>
            </div>
            <p className="preserve-lines">{n.content}</p>
            <small>{date(n.createdAt)}</small>
          </article>
        ))}
      <div className="operations-list">
        {data.services
          .filter((s) => s.active)
          .map((s) => (
            <article key={s.id}>
              <h4>{s.name}</h4>
              <p>{s.description}</p>
              <small>
                {s.paid
                  ? `От ${currency(s.basePrice)} · ${currency(s.hourlyRate)} / ч`
                  : "Бесплатно"}
              </small>
            </article>
          ))}
      </div>
      {!data.news.length && !data.services.length && (
        <p>
          Объявления и услуги появятся здесь после публикации управляющей
          компанией.
        </p>
      )}
    </article>
  );
}
