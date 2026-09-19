import { useState } from "react";
import { isOpenTicket } from "../../../../../packages/contracts/src/domain.js";
import { Button, Input, Select } from "../../ui";
import { TicketProps, currency, request, statusNames } from "./shared";
export function TicketOperations({
  token,
  ticket,
  overview,
  operations,
  onRefresh,
  onUnit,
  onTenant,
  onTicket,
  tickets,
  readOnly,
  canEditLinks = true,
}: TicketProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [work, setWork] = useState({
    description: "",
    hours: "",
    materialCost: "",
  });
  const equipment =
    operations?.equipment.filter((e) => e.unitId === ticket.unitId) || [];
  const unit = overview.units.find((u) => u.id === ticket.unitId);
  const leases =
    overview.leases?.filter((l) => l.unitId === ticket.unitId) || [];
  const currentLease =
    leases.find((l) => l.id === ticket.leaseId) ||
    leases.find((l) => ["signed", "active", "prolongation"].includes(l.stage));
  const services =
    operations?.services.filter(
      (s) =>
        s.propertyId === unit?.propertyId &&
        (s.active || s.id === ticket.serviceId),
    ) || [];
  const service = services.find((s) => s.id === ticket.serviceId);
  const logs = ticket.workLogs || [];
  const cost = logs.reduce((sum, row) => sum + row.cost, 0);
  const changeLink = async (key: string, value: string) => {
    setBusy(true);
    setError("");
    try {
      await request(`/api/tickets/${ticket.id}`, token, "PUT", {
        [key]: value || null,
      });
      await onRefresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ticket-context">
      <h4>Связанные данные</h4>
      <div className="mvp-actions">
        <Button
          variant="text"
          type="button"
          className="text-button"
          onClick={() => onUnit(ticket.unitId)}
        >
          Помещение {unit?.number || "—"}
        </Button>
        {currentLease && (
          <Button
            variant="text"
            type="button"
            className="text-button"
            onClick={() => onTenant(currentLease.tenantId)}
          >
            Арендатор · договор {currentLease.contractNumber}
          </Button>
        )}
      </div>
      {unit?.photoUrl && (
        <img
          src={unit.photoUrl}
          alt={`Помещение ${unit.number}`}
          className="equipment-photo"
        />
      )}
      {!readOnly && canEditLinks && (
        <div className="form-grid">
          <label>
            Оборудование
            <Select
              disabled={busy}
              value={ticket.equipmentId || ""}
              onChange={(e) => void changeLink("equipmentId", e.target.value)}
            >
              <option value="">Не привязано</option>
              {equipment.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Услуга
            <Select
              disabled={busy}
              value={ticket.serviceId || ""}
              onChange={(e) => void changeLink("serviceId", e.target.value)}
            >
              <option value="">Не выбрана</option>
              {services.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.paid ? "платная" : "бесплатная"}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Договор
            <Select
              disabled={busy}
              value={ticket.leaseId || ""}
              onChange={(e) => void changeLink("leaseId", e.target.value)}
            >
              <option value="">Не привязан</option>
              {leases.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.contractNumber}
                </option>
              ))}
            </Select>
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <details>
        <summary>
          Предыдущие обращения по помещению (
          {
            tickets.filter(
              (t) => t.unitId === ticket.unitId && t.id !== ticket.id,
            ).length
          }
          )
        </summary>
        {tickets
          .filter((t) => t.unitId === ticket.unitId && t.id !== ticket.id)
          .map((t) => (
            <Button
              variant="plain"
              type="button"
              className="mvp-list-button"
              key={t.id}
              onClick={() => onTicket(t.id)}
            >
              {t.number} · {t.title} · {statusNames[t.status]}
            </Button>
          ))}
      </details>
      <details>
        <summary>
          Работы и ТМЦ · затраты {currency(cost)}
          {service?.paid
            ? ` · к оплате ${currency(cost + service.basePrice)}`
            : " · без оплаты арендатором"}
        </summary>
        {logs.map((log) => (
          <p key={log.id}>
            {log.description} · {log.hours} ч · ТМЦ {currency(log.materialCost)}{" "}
            · всего {currency(log.cost)} · {log.createdByName}
          </p>
        ))}
        {!readOnly && isOpenTicket(ticket.status) && (
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request(
                  `/api/operations/tickets/${ticket.id}/work`,
                  token,
                  "POST",
                  {
                    description: work.description,
                    hours: Number(work.hours || 0),
                    materialCost: Number(work.materialCost || 0),
                  },
                );
                setWork({ description: "", hours: "", materialCost: "" });
                await onRefresh();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Работа / использованные материалы *
              <Input
                required
                value={work.description}
                onChange={(e) =>
                  setWork({ ...work, description: e.target.value })
                }
              />
            </label>
            <label>
              Трудозатраты, ч
              <Input
                type="number"
                min="0"
                max="744"
                step="0.25"
                value={work.hours}
                onChange={(e) => setWork({ ...work, hours: e.target.value })}
              />
            </label>
            <label>
              Стоимость ТМЦ, ₽
              <Input
                type="number"
                min="0"
                step="0.01"
                value={work.materialCost}
                onChange={(e) =>
                  setWork({ ...work, materialCost: e.target.value })
                }
              />
            </label>
            <Button
              variant="secondary"
              type="submit"
              disabled={busy}
              className="secondary-button"
            >
              Добавить работу
            </Button>
            <small className="field-hint">
              Тариф фиксируется в момент добавления работы. Счёт на оплату
              оформляется после согласования.
            </small>
          </form>
        )}
      </details>
    </div>
  );
}
