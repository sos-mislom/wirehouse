import { useState } from "react";
import type {
  TicketWorkflow,
  TicketDecision,
  EntityDocument,
  TicketTermsInput,
} from "../../../../../packages/contracts/src/business-workflows";
import type { AccountingWorkspace } from "../../../../../packages/contracts/src/accounting";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest } from "../../api/client";
import { Button, Input, Textarea } from "../../ui";
import {
  Disclosure,
  Feedback,
  date,
  downloadDocument,
  money,
  uploadDocument,
  useResource,
} from "./shared";
import { TicketWorkTerms } from "./TicketWorkTerms";
import { TicketWorkPhotos } from "./TicketWorkPhotos";
const states: Record<string, string> = {
  registered: "Зарегистрирована",
  awaiting_approval: "Ожидает согласования стоимости",
  assigned: "Назначен исполнитель",
  in_progress: "В работе",
  paused: "Приостановлена",
  awaiting_acceptance: "Результат ожидает приемки",
  accepted: "Результат принят",
  closed: "Закрыта",
  rejected: "Отклонена",
};
const actions: Record<string, string> = {
  terms: "Условия изменены",
  estimate_submitted: "Смета передана на согласование",
  approve: "Стоимость согласована",
  decline: "Стоимость отклонена",
  start: "Работа начата",
  pause: "Работа приостановлена",
  resume: "Работа продолжена",
  submit: "Результат передан на приемку",
  accept: "Результат принят",
  return: "Возвращено в работу",
  close: "Заявка закрыта",
};
export function TicketWorkflowPanel({ ticketId }: { ticketId: string }) {
  const { session, tickets, refreshWorkspace } = useWorkspace(),
    { token, user } = session,
    ticket = tickets.find((t) => t.id === ticketId);
  const resource = useResource<{
    item: (Omit<TicketWorkflow, "amount"> & { amount: number | null }) | null;
    capabilities: {
      approve: boolean;
      accept: boolean;
      execute: boolean;
      terms: boolean;
    };
    decisions: TicketDecision[];
  }>(token, `/api/tickets/${ticketId}/workflow`, {
    item: null,
    decisions: [],
    capabilities: {
      approve: false,
      accept: false,
      execute: false,
      terms: false,
    },
  });
  const accounts = useResource<AccountingWorkspace>(token, "/api/accounting", {
      sources: [],
      accounts: [],
      statements: [],
      links: [],
      inbox: [],
      outbox: [],
    }),
    docs = useResource<{ items: EntityDocument[] }>(
      token,
      `/api/documents?entityType=tickets&entityId=${ticketId}`,
      { items: [] },
    );
  const [reasonAction, setReasonAction] = useState(""),
    w = resource.data.item;
  const execute = (action: string, reason = "") =>
    void resource.run(async () => {
      await apiRequest(`/api/tickets/${ticketId}/workflow/decision`, {
        token,
        method: "POST",
        body: { action, reason, updatedAt: w!.updatedAt },
      });
      setReasonAction("");
      await refreshWorkspace();
    }, actions[action]);
  const terms = (body: TicketTermsInput) =>
    void resource.run(async () => {
      await apiRequest(`/api/tickets/${ticketId}/workflow/terms`, {
        token,
        method: "POST",
        body,
      });
      await refreshWorkspace();
    }, "Условия сохранены. Предыдущее согласование больше не действует.");
  const upload = (file: File, phase: string) =>
    void resource.run(async () => {
      await uploadDocument(
        token,
        file,
        [{ entityType: "tickets", entityId: ticketId, phase }],
        "photo",
      );
      await docs.load();
    }, "Фотография прикреплена");
  const worker = resource.data.capabilities.execute,
    review = resource.data.capabilities.accept;
  return (
    <section className="ticket-workflow">
      <Feedback {...resource} />
      {w && (
        <>
          <div className="register-heading">
            <h3>{states[w.state]}</h3>
            {w.paid && (
              <strong>
                {w.amount === null
                  ? "Стоимость доступна согласующему"
                  : money(w.amount)}
              </strong>
            )}
          </div>
          {w.pauseReason && <p>Причина паузы: {w.pauseReason}</p>}
          <dl className="business-stats">
            <div>
              <dt>Работа</dt>
              <dd>{w.paid ? "Платная" : "Без оплаты"}</dd>
            </div>
            {w.paid && (
              <div>
                <dt>Согласование</dt>
                <dd>
                  {w.approvedVersion === w.termsVersion
                    ? "Получено"
                    : "Требуется"}
                </dd>
              </div>
            )}
            <div>
              <dt>Фото до / после</dt>
              <dd>
                {w.requireBeforePhoto ? "Обязательно" : "По необходимости"} /{" "}
                {w.requireAfterPhoto ? "Обязательно" : "По необходимости"}
              </dd>
            </div>
          </dl>
          <div className="mvp-actions">
            {w.state === "awaiting_approval" &&
              resource.data.capabilities.approve && (
                <>
                  <Button
                    variant="primary"
                    busy={resource.busy}
                    disabled={!w.accountId}
                    onClick={() => execute("approve")}
                  >
                    Согласовать{" "}
                    {w.amount === null
                      ? "Стоимость доступна согласующему"
                      : money(w.amount)}
                  </Button>
                  <Button onClick={() => setReasonAction("decline")}>
                    Отклонить стоимость
                  </Button>
                </>
              )}
            {["registered", "assigned"].includes(w.state) && worker && (
              <Button
                variant="primary"
                busy={resource.busy}
                onClick={() => execute("start")}
              >
                Начать работу
              </Button>
            )}
            {w.state === "in_progress" && worker && (
              <>
                <Button
                  variant="primary"
                  busy={resource.busy}
                  onClick={() => execute("submit")}
                >
                  Передать на приемку
                </Button>
                <Button onClick={() => setReasonAction("pause")}>
                  Приостановить
                </Button>
              </>
            )}
            {w.state === "paused" && worker && (
              <Button
                variant="primary"
                busy={resource.busy}
                onClick={() => execute("resume")}
              >
                Продолжить работу
              </Button>
            )}
            {w.state === "awaiting_acceptance" && review && (
              <>
                <Button
                  variant="primary"
                  busy={resource.busy}
                  onClick={() => execute("accept")}
                >
                  Принять результат
                </Button>
                <Button onClick={() => setReasonAction("return")}>
                  Вернуть с замечанием
                </Button>
              </>
            )}
            {w.state === "accepted" && worker && (
              <Button
                variant="primary"
                busy={resource.busy}
                onClick={() => execute("close")}
              >
                Закрыть заявку
              </Button>
            )}
          </div>
          {w.state === "awaiting_approval" && !w.accountId && (
            <p className="field-hint">
              Управляющему нужно выбрать ЛС в условиях работы.
            </p>
          )}
          {reasonAction && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                execute(
                  reasonAction,
                  String(new FormData(e.currentTarget).get("reason")),
                );
              }}
            >
              <label>
                Причина
                <Textarea name="reason" required maxLength={10000} />
              </label>
              <div className="mvp-actions">
                <Button variant="primary" type="submit" busy={resource.busy}>
                  {reasonAction === "return"
                    ? "Вернуть в работу"
                    : reasonAction === "pause"
                      ? "Приостановить работу"
                      : "Отклонить стоимость"}
                </Button>
                <Button onClick={() => setReasonAction("")}>Отмена</Button>
              </div>
            </form>
          )}
          <Feedback
            error={
              docs.error ||
              (resource.data.capabilities.terms ? accounts.error : "")
            }
          />
          <TicketWorkPhotos
            workflow={w}
            documents={docs.data.items}
            canUpload={worker}
            busy={resource.busy}
            onUpload={upload}
            onDownload={(document) =>
              void resource.run(
                () => downloadDocument(token, document.id, document.name),
                "Фотография скачана",
              )
            }
          />
          {resource.data.capabilities.terms &&
            [
              "registered",
              "assigned",
              "awaiting_approval",
              "rejected",
            ].includes(w.state) && (
              <Disclosure title="Условия работы">
                <TicketWorkTerms
                  key={w.updatedAt}
                  workflow={w}
                  leaseId={ticket?.leaseId}
                  accounts={accounts.data}
                  busy={resource.busy}
                  onSave={terms}
                />
              </Disclosure>
            )}
          {worker && ticket?.maintenancePlanId && (
            <Disclosure title="Техническое замечание ППР">
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    v = new FormData(form);
                  void resource.run(async () => {
                    await apiRequest(
                      `/api/maintenance/tickets/${ticketId}/change`,
                      {
                        token,
                        method: "POST",
                        body: {
                          updatedAt: ticket.updatedAt,
                          toDate: null,
                          reason: v.get("reason"),
                          remark: v.get("remark"),
                        },
                      },
                    );
                    await refreshWorkspace();
                    form.reset();
                  }, "Замечание сохранено");
                }}
              >
                <label>
                  Причина / тема
                  <Input name="reason" required maxLength={10000} />
                </label>
                <label>
                  Техническое замечание
                  <Textarea name="remark" required maxLength={10000} />
                </label>
                <Button type="submit" busy={resource.busy}>
                  Сохранить замечание
                </Button>
              </form>
            </Disclosure>
          )}
          <Disclosure
            title={`История решений · ${resource.data.decisions.length}`}
          >
            <ol className="record-timeline">
              {resource.data.decisions.map((d) => (
                <li key={d.id}>
                  {actions[d.action] ?? d.action}
                  {d.reason ? ` · ${d.reason}` : ""}
                  <small>
                    {date(d.createdAt)} · условия v{d.termsVersion}, результат v
                    {d.resultVersion}
                  </small>
                </li>
              ))}
            </ol>
            {!resource.data.decisions.length && (
              <p className="field-hint">Решений пока нет.</p>
            )}
          </Disclosure>
        </>
      )}
    </section>
  );
}
