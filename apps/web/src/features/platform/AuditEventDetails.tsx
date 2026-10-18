import type { AuditEvent } from "../../../../../packages/contracts/src/registry";
import { permissionLabels } from "../../../../../packages/contracts/src/permissions";
import { Button } from "../../ui";
const labels: Record<string, string> = {
  full_name: "Имя",
  fullName: "Имя",
  name: "Название",
  title: "Название",
  email: "Email",
  phone: "Телефон",
  role: "Роль",
  is_active: "Активен",
  isActive: "Активен",
  status: "Статус",
  state: "Этап",
  stage: "Стадия договора",
  permissions: "Разрешения",
  specialty: "Специализация",
  number: "Номер",
  description: "Описание",
  address: "Адрес",
  area: "Площадь",
  amount: "Сумма",
  total: "Итоговая сумма",
  paid: "Платная работа",
  reason: "Основание",
  validFrom: "Доступ с",
  validTo: "Доступ до",
  retainHistory: "Просмотр истории",
  start_date: "Начало договора",
  end_date: "Окончание договора",
  rate_per_sqm: "Ставка аренды",
  contract_number: "Номер договора",
  requireBeforePhoto: "Фото до работ обязательно",
  requireAfterPhoto: "Фото результата обязательно",
  approvalBy: "Согласовал",
  acceptanceBy: "Принял",
  value: "Показание",
  decision: "Решение",
  comment: "Комментарий",
  error: "Ошибка",
  date: "Дата",
  nextRun: "Следующий срок",
  nextDate: "Следующий срок",
  dueDate: "Срок",
  scheduledFor: "Плановая дата",
};
const terms: Record<string, string> = {
  admin: "Администратор",
  manager: "Управляющий",
  worker: "Исполнитель",
  tenant: "Арендатор",
  owner: "Собственник",
  active: "Действует",
  closed: "Закрыт",
  pending: "В очереди",
  applied: "Обработано",
  failed: "Ошибка",
  registered: "Зарегистрирована",
  assigned: "Исполнитель назначен",
  awaiting_approval: "Ожидает согласования",
  in_progress: "В работе",
  paused: "Приостановлена",
  awaiting_acceptance: "Ожидает приемки",
  accepted: "Принята",
  rejected: "Отклонена",
  draft: "Черновик",
  submitted: "На согласовании",
  approved: "Утверждена",
  acted: "Акт выпущен",
};
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function value(v: unknown, key: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean" || ["is_active", "isActive"].includes(key))
    return v ? "Да" : "Нет";
  if (Array.isArray(v))
    return v.every((x) => typeof x === "string")
      ? v
          .map((x) =>
            key === "permissions"
              ? ((permissionLabels as Record<string, string>)[x] ?? x)
              : x,
          )
          .join(", ")
      : `Записей: ${v.length}`;
  if (typeof v === "object") return "Состав изменён";
  const text = String(v);
  return terms[text] ?? text;
}
export function AuditEventDetails({
  event,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  const changes = object(event.changes),
    before = object(changes.before),
    after = object(changes.after);
  const fields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(
    (key) =>
      labels[key] && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  return (
    <section id={"audit-detail-" + event.id} aria-label="Подробности изменения">
      <div className="audit-detail-heading">
        <strong>Изменённые поля</strong>
        <Button onClick={onClose}>Закрыть подробности</Button>
      </div>
      {fields.length ? (
        <dl className="audit-changes">
          {fields.map((key) => (
            <div className="audit-change" key={key}>
              <dt>{labels[key]}</dt>
              <dd>
                <small>Было</small>
                {value(before[key], key)}
              </dd>
              <dd>
                <small>Стало</small>
                {value(after[key], key)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Полный состав события доступен ниже.</p>
      )}
      <details className="audit-event">
        <summary>Все данные события</summary>
        <p>ID записи: {event.entityId}</p>
        <pre>{JSON.stringify(event.changes, null, 2)}</pre>
      </details>
    </section>
  );
}
