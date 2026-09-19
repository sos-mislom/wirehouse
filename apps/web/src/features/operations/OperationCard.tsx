import { BotLinkPanel } from "../../MessengerButtons";
import { Button } from "../../ui";
import {
  Row,
  auditLabel,
  currency,
  date,
  resourceNames,
  roleNames,
  specialtyNames,
  statusNames,
} from "./shared";
import type { OperationsModel } from "./useOperationsModel";
export function OperationCard({
  row,
  model,
}: {
  row: Row;
  model: OperationsModel;
}) {
  const {
    overview,
    tab,
    setDraft,
    setError,
    onUnit,
    unitName,
    data,
    tickets,
    onTicket,
    setReadingMeter,
    setReadingValue,
    token,
  } = model;
  return (
    <article className="mvp-card operation-card" key={row.id}>
      <div className="mvp-card-head">
        <div>
          {row.propertyId && (
            <small>
              {overview.properties.find((p) => p.id === row.propertyId)?.name}
            </small>
          )}
          <h3>{row.name || row.fullName || auditLabel(row.action)}</h3>
        </div>
        {tab !== "audit" && (
          <Button
            variant="secondary"
            type="button"
            className="secondary-button"
            onClick={() => {
              setDraft({ ...row, password: "" });
              setError("");
            }}
          >
            Изменить
          </Button>
        )}
      </div>
      {tab === "equipment" && (
        <>
          <div className="operation-meta">
            {row.photoUrl && (
              <img
                src={row.photoUrl}
                alt={row.name}
                className="equipment-photo"
                loading="lazy"
              />
            )}
            <div>
              <p>
                {row.type} · {row.serialNumber || "Без номера"} ·{" "}
                {statusNames[row.status]}
              </p>
              <Button
                variant="text"
                type="button"
                className="text-button"
                onClick={() => onUnit(row.unitId)}
              >
                Помещение {unitName(row.unitId)}
              </Button>
              <p>
                Гарантия до {date(row.warrantyUntil)} · {currency(row.cost)}
              </p>
              <p>
                Ответственный:{" "}
                {data.users.find((u) => u.id === row.responsibleId)?.fullName ||
                  "Не назначен"}
              </p>
              <p className="preserve-lines">{row.specifications}</p>
            </div>
          </div>
          <details>
            <summary>
              История ремонтов и ППР (
              {tickets.filter((t) => t.equipmentId === row.id).length})
            </summary>
            {tickets
              .filter((t) => t.equipmentId === row.id)
              .map((t) => (
                <Button
                  variant="plain"
                  type="button"
                  key={t.id}
                  className="mvp-list-button"
                  onClick={() => onTicket(t.id)}
                >
                  {t.number} · {t.title} · {statusNames[t.status]}
                </Button>
              ))}
            {data.plans
              .filter((p) => p.equipmentId === row.id)
              .map((p) => (
                <p key={p.id}>
                  ППР: {p.name} · {date(p.nextDate)}
                </p>
              ))}
          </details>
        </>
      )}
      {tab === "plans" && (
        <>
          <p>
            <span
              className={`status-pill status-pill--${row.active ? "info" : "warning"}`}
            >
              {row.active ? "По расписанию" : "Приостановлено"}
            </span>{" "}
            · Следующая дата: {date(row.nextDate)} · каждые {row.intervalDays}{" "}
            дн.
          </p>
          <Button
            variant="text"
            type="button"
            className="text-button"
            onClick={() => onUnit(row.unitId)}
          >
            Помещение {unitName(row.unitId)}
          </Button>
          <p>
            Ответственный:{" "}
            {data.users.find((u) => u.id === row.responsibleId)?.fullName ||
              "Не назначен"}
          </p>
          <ol>
            {row.checklist?.map((line: string, i: number) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <details>
            <summary>
              Задания и история выполнения (
              {tickets.filter((t) => t.maintenancePlanId === row.id).length})
            </summary>
            {tickets
              .filter((t) => t.maintenancePlanId === row.id)
              .map((t) => (
                <Button
                  variant="plain"
                  type="button"
                  className="mvp-list-button"
                  key={t.id}
                  onClick={() => onTicket(t.id)}
                >
                  {t.title} · {statusNames[t.status]}
                </Button>
              ))}
          </details>
        </>
      )}
      {tab === "services" && (
        <>
          <span className="status-pill">
            {row.paid ? "Платная" : "Бесплатная"} ·{" "}
            {row.active ? "Доступна" : "Архив"}
          </span>
          <p>
            {row.paid ? `Базовая цена ${currency(row.basePrice)} · ` : ""}
            Тариф работ: {currency(row.hourlyRate)} / ч
          </p>
          <p>{specialtyNames[row.specialty]}</p>
          <p className="preserve-lines">{row.description}</p>
        </>
      )}
      {tab === "meters" && (
        <>
          <p>
            {resourceNames[row.resource]} ·{" "}
            {row.scope === "common"
              ? "Общедомовой / МОП"
              : `Помещение ${unitName(row.unitId)}`}{" "}
            · № {row.serialNumber || "—"}
          </p>
          <p>
            Тариф {currency(row.tariff)} · Ответственный:{" "}
            {data.users.find((u) => u.id === row.responsibleId)?.fullName ||
              "Не назначен"}
          </p>
          <Button
            variant="secondary"
            type="button"
            className="secondary-button"
            disabled={!row.active}
            onClick={() => {
              setReadingMeter(row.id);
              setReadingValue("");
            }}
          >
            Внести показания
          </Button>
          <details>
            <summary>История и распределение</summary>
            {data.readings
              .filter((r) => r.meterId === row.id)
              .sort((a, b) => b.period.localeCompare(a.period))
              .map((r) => (
                <div className="reading-row" key={r.id}>
                  <strong>
                    {r.period}: {r.previous} → {r.value} · расход{" "}
                    {r.consumption} · {currency(r.amount)}
                  </strong>
                  <p>Тариф на момент ввода: {currency(r.tariff)}</p>
                  {r.allocations.map((a: Row, i: number) => (
                    <p key={i}>
                      {overview.tenants?.find((t) => t.id === a.tenantId)
                        ?.name || "Арендатор"}{" "}
                      · {unitName(a.unitId)} · {currency(a.amount)} (
                      {(a.share * 100).toFixed(1)}%)
                    </p>
                  ))}
                  {r.unallocated > 0 && (
                    <p>
                      Не распределено: {currency(r.unallocated)} — нет
                      действующих договоров.
                    </p>
                  )}
                </div>
              ))}
          </details>
          <small className="field-hint">
            Распределение для проверки. Начисления в счета переносятся
            менеджером после сверки.
          </small>
        </>
      )}
      {tab === "news" && (
        <>
          <span className={`status-pill status-pill--${row.tone}`}>
            {row.published ? "Опубликовано" : "Черновик"} ·{" "}
            {row.audience === "all"
              ? "Всем"
              : row.audience === "staff"
                ? "Сотрудникам"
                : "Арендаторам"}
          </span>
          <p className="preserve-lines">{row.content}</p>
          <small>
            {date(row.createdAt)}
            {row.expiresAt ? ` · до ${date(row.expiresAt)}` : ""}
          </small>
        </>
      )}
      {tab === "expenses" && (
        <p>
          {date(row.date)} · {row.category} ·{" "}
          <strong>{currency(row.amount)}</strong>
        </p>
      )}
      {tab === "users" && (
        <>
          <p>
            {row.email || "Без email"} · {row.phone || "Без телефона"}
          </p>
          <p>
            {roleNames[row.role]}
            {row.specialty ? ` · ${specialtyNames[row.specialty]}` : ""} ·{" "}
            {row.isActive ? "Активен" : "Заблокирован"}
          </p>
          <small>Последний вход: {date(row.lastLoginAt)}</small>
          {row.phone && row.isActive && (
            <BotLinkPanel token={token} userId={row.id} />
          )}
        </>
      )}
      {tab === "audit" && (
        <>
          <p>
            {row.actorName} · {new Date(row.createdAt).toLocaleString("ru-RU")}
          </p>
          <small>
            {row.entityType} · {row.entityId}
          </small>
          <details>
            <summary>Изменения</summary>
            <pre className="audit-values">
              {JSON.stringify(row.changes, null, 2)}
            </pre>
          </details>
        </>
      )}
    </article>
  );
}
