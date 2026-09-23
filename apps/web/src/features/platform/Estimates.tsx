import { EstimateLines } from "./EstimateLines";
import { ResponsiveTable } from "../../ResponsiveTable";
import { useState } from "react";
import { Button, Input, Select } from "../../ui";
import { usePlatform } from "./usePlatform";
import type {
  Estimate,
  EstimateInput,
  ServiceAct,
} from "../../../../../packages/contracts/src/operations-platform";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { currency, Props, Row } from "../operations/shared";
const names = {
  draft: "Черновик",
  submitted: "На согласовании",
  approved: "Утверждена",
  rejected: "Отклонена",
  acted: "Акт выпущен",
};
const blankLine = (): EstimateInput["lines"][number] => ({
  kind: "labor",
  catalogId: null,
  description: "",
  unit: "ч",
  quantity: 1,
  unitPrice: 0,
  vatRate: "0",
});
export function Estimates(props: Props & { services: Row[] }) {
  const { data, error, busy, mutate } = usePlatform(props.token);
  const [draft, setDraft] = useState<(EstimateInput & { id?: string }) | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [act, setAct] = useState<ServiceAct | null>(null);
  const [filter, setFilter] = useState("");
  const write = hasPermission(props.user, "estimates.write"),
    approve = hasPermission(props.user, "estimates.approve");
  const current = data.estimates.find((e) => e.id === selected);
  const change = (key: string, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const newEstimate = () => {
    const p = props.overview.properties[0]?.id ?? "";
    setDraft({
      propertyId: p,
      ticketId: "",
      name: "",
      contractorId: null,
      version: 0,
      lines: [blankLine()],
    });
  };
  const edit = (row: Estimate) =>
    setDraft({
      id: row.id,
      propertyId: row.propertyId,
      ticketId: row.ticketId,
      name: row.name,
      contractorId: row.contractorId,
      version: row.version,
      lines: row.lines.map(({ net, vat, total, ...l }) => l),
    });
  const transition = async (action: string) => {
    if (current)
      await mutate(`/api/estimates/${current.id}/${action}`, {
        version: current.version,
        ...(action === "reject" ? { reason } : {}),
      });
  };
  return (
    <div className="platform-section">
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="mvp-actions">
        <Select
          aria-label="Статус сметы"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Все статусы</option>
          {Object.entries(names).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        {write && (
          <Button variant="primary" onClick={newEstimate}>
            Новая смета
          </Button>
        )}
      </div>
      {draft && (
        <form
          className="mvp-card platform-section"
          onSubmit={async (e) => {
            e.preventDefault();
            const { id, ...body } = draft;
            if (
              await mutate(
                `/api/estimates${id ? "/" + id : ""}`,
                body,
                id ? "PUT" : "POST",
              )
            )
              setDraft(null);
          }}
        >
          <h3>{draft.id ? "Редактирование сметы" : "Новая смета"}</h3>
          <div className="form-grid">
            <label>
              Название
              <Input
                required
                value={draft.name}
                onChange={(e) => change("name", e.target.value)}
              />
            </label>
            <label>
              Объект
              <Select
                disabled={!!draft.id}
                value={draft.propertyId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    propertyId: e.target.value,
                    ticketId: "",
                    contractorId: null,
                    lines: [blankLine()],
                  })
                }
              >
                {props.overview.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Заявка
              <Select
                required
                disabled={!!draft.id}
                value={draft.ticketId}
                onChange={(e) => change("ticketId", e.target.value)}
              >
                <option value="">Выберите заявку</option>
                {props.tickets
                  .filter(
                    (t) =>
                      props.overview.units.find((u) => u.id === t.unitId)
                        ?.propertyId === draft.propertyId,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.title}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              Подрядчик
              <Select
                value={draft.contractorId ?? ""}
                onChange={(e) => change("contractorId", e.target.value || null)}
              >
                <option value="">Собственная служба</option>
                {data.contractors
                  .filter((c) => c.propertyId === draft.propertyId && c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </label>
          </div>
          <p className="field-hint">
            Цена указывается без НДС. Ставку задайте для каждой позиции; сумма и
            налог округляются по строкам. После утверждения цены фиксируются.
          </p>
          <EstimateLines
            lines={draft.lines}
            propertyId={draft.propertyId}
            services={props.services}
            materials={data.materials}
            onChange={(lines) => change("lines", lines)}
          />
          <div className="mvp-actions">
            <Button
              onClick={() => change("lines", [...draft.lines, blankLine()])}
            >
              Добавить позицию
            </Button>
            <Button variant="primary" type="submit" busy={busy}>
              Сохранить черновик
            </Button>
            <Button disabled={busy} onClick={() => setDraft(null)}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      <div className="platform-list">
        {data.estimates
          .filter((e) => !filter || e.status === filter)
          .map((row) => (
            <article className="platform-row" key={row.id}>
              <Button
                variant="text"
                onClick={() => {
                  setSelected(row.id);
                  setReason("");
                }}
              >
                {row.name}
              </Button>
              <span>
                {props.tickets.find((t) => t.id === row.ticketId)?.number}
              </span>
              <span>
                {names[row.status]} · v{row.version}
              </span>
              <strong>{currency(row.total)}</strong>
            </article>
          ))}
      </div>
      {!data.estimates.length && (
        <p className="empty-state">
          Создайте смету по заявке, внесите работы и материалы, затем передайте
          её на согласование.
        </p>
      )}
      {current && (
        <article className="mvp-card platform-section">
          <div className="mvp-card-head">
            <h3>{current.name}</h3>
            <Button onClick={() => setSelected("")}>Закрыть</Button>
          </div>
          <p>
            {names[current.status]} · версия {current.version}
          </p>
          <Button
            variant="text"
            onClick={() => props.onTicket(current.ticketId)}
          >
            Открыть заявку
          </Button>
          {current.rejectionReason && (
            <p>Причина отклонения: {current.rejectionReason}</p>
          )}
          <LineTable lines={current.lines} />
          <strong>Итого: {currency(current.total)}</strong>
          <div className="mvp-actions">
            {write && ["draft", "rejected"].includes(current.status) && (
              <Button onClick={() => edit(current)}>Изменить</Button>
            )}
            {write && current.status === "draft" && (
              <Button
                disabled={busy}
                variant="primary"
                onClick={() => transition("submit")}
              >
                На согласование
              </Button>
            )}
            {approve && current.status === "submitted" && (
              <>
                <Button
                  disabled={busy}
                  variant="primary"
                  onClick={() => transition("approve")}
                >
                  Утвердить
                </Button>
                <Input
                  aria-label="Причина отклонения"
                  placeholder="Причина отклонения"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  disabled={busy || !reason.trim()}
                  onClick={() => transition("reject")}
                >
                  Отклонить
                </Button>
              </>
            )}
            {approve && current.status === "approved" && (
              <Button disabled={busy} onClick={() => transition("act")}>
                Выпустить акт
              </Button>
            )}
            {data.acts
              .filter((a) => a.estimateId === current.id)
              .map((a) => (
                <Button key={a.id} onClick={() => setAct(a)}>
                  Открыть {a.number}
                </Button>
              ))}
          </div>
        </article>
      )}
      {act && (
        <article
          className="mvp-card platform-section act-document"
          id="service-act"
        >
          <div className="mvp-actions no-print">
            <Button onClick={() => window.print()}>Печать / PDF</Button>
            <Button onClick={() => setAct(null)}>Закрыть акт</Button>
          </div>
          <h2>Акт выполненных работ № {act.number}</h2>
          <p>
            от {new Date(act.date + "T12:00:00").toLocaleDateString("ru-RU")}
          </p>
          <p>Объект: {act.snapshot.propertyName}</p>
          <p>
            Заказчик: {act.snapshot.tenantName || "Управляющая организация"}
          </p>
          <p>Исполнитель: {act.snapshot.contractorName}</p>
          <p>
            Основание: {act.snapshot.ticketNumber} · {act.snapshot.name}
          </p>
          <LineTable lines={act.snapshot.lines} />
          <strong>Всего: {currency(act.total)}</strong>
          <div className="act-signatures">
            <p>Работы сдал: __________________</p>
            <p>Работы принял: __________________</p>
          </div>
        </article>
      )}
    </div>
  );
}
function LineTable({ lines }: { lines: Estimate["lines"] }) {
  return (
    <div className="table-scroll">
      <ResponsiveTable className="platform-table">
        <thead>
          <tr>
            <th>Наименование</th>
            <th>Количество</th>
            <th>Цена без НДС</th>
            <th>НДС</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>
                {l.quantity} {l.unit}
              </td>
              <td>{currency(l.unitPrice)}</td>
              <td>
                {currency(l.vat)} ({l.vatRate}%)
              </td>
              <td>{currency(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </div>
  );
}
