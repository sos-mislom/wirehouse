import { useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { getTicketStatusLabel } from "../../shared/format";
import { apiRequest } from "../../api/client";
import { Button, Input, Textarea } from "../../ui";
import { Disclosure, Feedback, Register, date, useResource } from "./shared";
type Item = {
  ticketId: string;
  number: string;
  title: string;
  planId: string;
  plannedOn: string;
  dueAt: string;
  completedAt: string | null;
  status: string;
  updatedAt: string;
  overdue: boolean;
  capabilities: { reschedule: boolean; remark: boolean };
  changes: {
    id: string;
    reason: string;
    remark: string;
    fromDate: string | null;
    toDate: string | null;
    createdAt: string;
  }[];
};
type Data = {
  items: Item[];
  summary: {
    planned: number;
    completed: number;
    overdue: number;
    rescheduled: number;
  };
};
export function MaintenanceProgress() {
  const { session, openTicketDetail, refreshWorkspace, locale } =
      useWorkspace(),
    { token } = session;
  const resource = useResource<Data>(token, "/api/maintenance/progress", {
      items: [],
      summary: { planned: 0, completed: 0, overdue: 0, rescheduled: 0 },
    }),
    [selected, setSelected] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const item = resource.data.items.find((i) => i.ticketId === selected);
  return (
    <Disclosure title="Исполнение ППР: план, факт и переносы">
      <Feedback {...resource} />
      <dl className="business-stats">
        {Object.entries({
          planned: "План",
          completed: "Выполнено",
          overdue: "Просрочено",
          rescheduled: "Перенесено",
        }).map(([k, v]) => (
          <div key={k}>
            <dt>{v}</dt>
            <dd>{resource.data.summary[k as keyof Data["summary"]]}</dd>
          </div>
        ))}
      </dl>
      <Register
        title="Задания ППР"
        rows={resource.data.items.map((i) => ({ ...i, id: i.ticketId }))}
        selectedId={selected}
        onSelect={(i) => setSelected(i.ticketId)}
        searchText={(i) => `${i.number} ${i.title}`}
        columns={[
          {
            key: "task",
            label: "Задание",
            render: (i) => (
              <>
                {i.number}
                <small>{i.title}</small>
              </>
            ),
          },
          {
            key: "status",
            label: "Статус",
            render: (i) => getTicketStatusLabel(i.status, locale),
          },
          {
            key: "plan",
            label: "Плановая дата",
            render: (i) => date(i.plannedOn),
          },
          {
            key: "due",
            label: "Текущий срок",
            render: (i) => (
              <>
                {date(i.dueAt)}
                {i.overdue && <small>Просрочено</small>}
              </>
            ),
          },
          { key: "fact", label: "Факт", render: (i) => date(i.completedAt) },
          {
            key: "changes",
            label: "Переносы",
            render: (i) => i.changes.filter((c) => c.toDate).length,
            optional: true,
          },
        ]}
      />
      {item && (
        <section className="business-detail">
          <div className="register-heading">
            <h3>{item.number}</h3>
            <div className="mvp-actions">
              <Button onClick={() => openTicketDetail(item.ticketId)}>
                Открыть заявку
              </Button>
              <Button onClick={() => setSelected("")}>Закрыть детали</Button>
            </div>
          </div>
          {(item.capabilities.reschedule || item.capabilities.remark) && (
            <MaintenanceChangeForm
              key={`${item.ticketId}:${formRevision}`}
              item={item}
              busy={resource.busy}
              loading={resource.loading}
              onSave={async (body) => {
                const saved = await resource.run(async () => {
                  await apiRequest(
                    `/api/maintenance/tickets/${item.ticketId}/change`,
                    { token, method: "POST", body },
                  );
                  await refreshWorkspace();
                }, "Изменение задания сохранено");
                if (saved) setFormRevision((v) => v + 1);
              }}
            />
          )}
          <ol className="record-timeline">
            {item.changes.map((c) => (
              <li key={c.id}>
                {c.toDate ? `${date(c.fromDate)} → ${date(c.toDate)} · ` : ""}
                {c.reason}
                {c.remark && <p>{c.remark}</p>}
                <small>{date(c.createdAt)}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Disclosure>
  );
}

function MaintenanceChangeForm({
  item,
  busy,
  loading,
  onSave,
}: {
  item: Item;
  busy: boolean;
  loading: boolean;
  onSave: (body: {
    updatedAt: string;
    toDate: string | null;
    reason: FormDataEntryValue | null;
    remark: FormDataEntryValue | null;
  }) => Promise<void>;
}) {
  // Cached data may refresh after opening the detail. Pin the version when
  // editing starts, then retain it so concurrent changes still return 409.
  const [baseline, setBaseline] = useState<string | null>(null);
  return (
    <form
      className="form-grid"
      onChange={() => setBaseline((value) => value ?? item.updatedAt)}
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        void onSave({
          updatedAt: baseline ?? item.updatedAt,
          toDate: v.get("toDate")
            ? new Date(String(v.get("toDate"))).toISOString()
            : null,
          reason: v.get("reason"),
          remark: v.get("remark"),
        });
      }}
    >
      {item.capabilities.reschedule && (
        <label>
          Новый срок, если нужен перенос
          <Input
            name="toDate"
            type="datetime-local"
            disabled={loading || busy}
          />
        </label>
      )}
      <label>
        Причина
        <Input
          name="reason"
          required
          maxLength={10000}
          disabled={loading || busy}
        />
      </label>
      <label>
        Техническое замечание
        <Textarea name="remark" maxLength={10000} disabled={loading || busy} />
      </label>
      <Button variant="primary" type="submit" busy={busy} disabled={loading}>
        Сохранить изменение
      </Button>
    </form>
  );
}
