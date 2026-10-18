import { useEffect, useState } from "react";
import { AuditEventDetails } from "./AuditEventDetails";
import type { AuditEvent } from "../../../../../packages/contracts/src/registry";
import { Button } from "../../ui";
import { Feedback } from "../business/shared";
import { Register } from "../business/Register";
import { usePagedResource } from "../business/usePagedResource";
const entities: Record<string, string> = {
  user: "Пользователь",
  ticket: "Заявка",
  meter: "Прибор учета",
  equipment: "Оборудование",
  users: "Пользователь",
  tickets: "Заявка",
  units: "Помещение",
  properties: "Объект",
  leases: "Договор",
  tenants: "Арендатор",
  estimates: "Смета",
  service_acts: "Акт",
  personal_accounts: "Лицевой счет",
  user_assignments: "Доступ",
  entity_documents: "Документ",
  reading_submissions: "Показание",
  maintenance_plans: "График ППР",
  maintenance_changes: "Исполнение ППР",
  accounting_sources: "Источник учета",
};
const actions: Record<string, string> = {
  user_updated: "Пользователь изменён",
  reading_added: "Добавлено показание",
  work_logged: "Учтены работы",
  created: "Создано",
  updated: "Изменено",
  deleted: "Удалено",
};
export function AuditLog({ token }: { token: string }) {
  const resource = usePagedResource<AuditEvent>(
    token,
    "/api/audit",
    "Аудит изменений",
  );
  const [selected, setSelected] = useState("");
  const closeDetails = () => {
    document.getElementById("audit-trigger-" + selected)?.focus();
    setSelected("");
  };
  useEffect(
    () => setSelected(""),
    [resource.query, resource.offset, resource.limit],
  );
  return (
    <div className="business-stack">
      <Feedback error={resource.error} reload={resource.reload} />
      <Register
        title="Аудит изменений"
        rows={resource.items}
        pagination={resource}
        selectedId={selected}
        onSelect={(r) => setSelected(selected === r.id ? "" : r.id)}
        details={{
          rowId: selected,
          render: (r) => <AuditEventDetails event={r} onClose={closeDetails} />,
        }}
        action={
          <Button disabled={resource.loading} onClick={resource.reload}>
            Обновить журнал
          </Button>
        }
        columns={[
          {
            key: "time",
            label: "Дата и время",
            render: (r) => new Date(r.createdAt).toLocaleString("ru-RU"),
          },
          {
            key: "actor",
            label: "Автор",
            render: (r) => r.actorName || "Система",
          },
          {
            key: "event",
            label: "Изменение",
            render: (r) => (
              <>
                {actions[r.action] ?? r.action}
                <small>{entities[r.entityType] ?? r.entityType}</small>
              </>
            ),
          },
          {
            key: "details",
            label: "Подробности",
            render: (r) => (
              <Button
                id={"audit-trigger-" + r.id}
                variant="text"
                aria-expanded={selected === r.id}
                aria-controls={"audit-detail-" + r.id}
                onClick={() => setSelected(selected === r.id ? "" : r.id)}
              >
                Состав изменений
              </Button>
            ),
          },
        ]}
        empty="Событий по вашему запросу нет. Измените поиск."
      />
    </div>
  );
}
