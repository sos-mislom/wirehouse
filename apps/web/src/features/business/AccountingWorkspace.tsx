import { useState, type FormEvent } from "react";
import { ExchangeJournal } from "./ExchangeJournal";
import type { AccountingWorkspace as Data } from "../../../../../packages/contracts/src/accounting";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest } from "../../api/client";
import { Button, Input, Select } from "../../ui";
import {
  Disclosure,
  Feedback,
  Register,
  date,
  money,
  useResource,
} from "./shared";
const initial: Data = {
  sources: [],
  accounts: [],
  statements: [],
  links: [],
};
export function AccountingWorkspace() {
  const { session, overview } = useWorkspace(),
    { token, user } = session;
  const resource = useResource(token, "/api/accounting", initial),
    { data, busy, run } = resource;
  const [selected, setSelected] = useState(""),
    [sourceFilter, setSourceFilter] = useState(""),
    [status, setStatus] = useState(""),
    [secret, setSecret] = useState("");
  const account = data.accounts.find((a) => a.id === selected),
    sourceName = (id: string) =>
      data.sources.find((s) => s.id === id)?.name ?? "Источник удален";
  const canManage = hasPermission(user, "accounting.manage");
  const createSource = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form);
    void run(async () => {
      await apiRequest("/api/accounting/sources", {
        token,
        method: "POST",
        body: {
          name: v.get("name"),
          environment: v.get("environment"),
          active: true,
        },
      });
      form.reset();
    });
  };
  const createAccount = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form);
    void run(async () => {
      await apiRequest("/api/accounting/accounts", {
        token,
        method: "POST",
        body: {
          sourceId: v.get("sourceId"),
          leaseId: v.get("leaseId"),
          number: v.get("number"),
          externalId: v.get("externalId"),
          validFrom: v.get("validFrom"),
          validTo: null,
          status: "active",
        },
      });
      form.reset();
    });
  };
  const mapExternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    void run(() =>
      apiRequest("/api/accounting/links", {
        token,
        method: "POST",
        body: {
          sourceId: v.get("sourceId"),
          entityType: v.get("entityType"),
          externalId: v.get("externalId"),
          localId: v.get("localId"),
          version: 0,
        },
      }),
    );
  };
  return (
    <div className="business-stack">
      <Feedback {...resource} />
      <Register
        title="Лицевые счета"
        rows={data.accounts.filter(
          (a) =>
            (!sourceFilter || a.sourceId === sourceFilter) &&
            (!status || a.status === status),
        )}
        selectedId={selected}
        onSelect={(a) => setSelected(a.id)}
        searchText={(a) =>
          `${a.number} ${a.externalId} ${sourceName(a.sourceId)}`
        }
        columns={[
          {
            key: "number",
            label: "ЛС",
            render: (a) => <strong>{a.number}</strong>,
          },
          {
            key: "source",
            label: "Источник учета",
            render: (a) => sourceName(a.sourceId),
          },
          {
            key: "lease",
            label: "Договор",
            render: (a) =>
              overview.leases.find((l) => l.id === a.leaseId)?.contractNumber ??
              a.leaseId,
            optional: true,
          },
          {
            key: "status",
            label: "Статус",
            render: (a) => (a.status === "active" ? "Действует" : "Закрыт"),
          },
          {
            key: "period",
            label: "Период ЛС",
            render: (a) =>
              `${date(a.validFrom)} — ${a.validTo ? date(a.validTo) : "бессрочно"}`,
            optional: true,
          },
        ]}
        filters={
          <>
            <label>
              Источник
              <Select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">Все источники</option>
                {data.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Статус
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Все</option>
                <option value="active">Действующие</option>
                <option value="closed">Закрытые</option>
              </Select>
            </label>
          </>
        }
      />
      {account && (
        <section className="business-detail">
          <div className="register-heading">
            <h3>
              ЛС {account.number} · {sourceName(account.sourceId)}
            </h3>
            <Button onClick={() => setSelected("")}>Закрыть детали</Button>
          </div>
          <p className="field-hint">
            Внешний ID: {account.externalId}. Данные этого источника не
            объединяются с другими базами.
          </p>
          <Register
            title="Начисления и оплаты"
            rows={data.statements.filter((s) => s.accountId === account.id)}
            searchText={(s) => s.period}
            columns={[
              { key: "period", label: "Месяц", render: (s) => s.period },
              {
                key: "opening",
                label: "Входящий остаток",
                render: (s) => money(s.opening),
                optional: true,
              },
              {
                key: "charged",
                label: "Начислено",
                render: (s) => money(s.charged),
              },
              { key: "paid", label: "Оплачено", render: (s) => money(s.paid) },
              {
                key: "closing",
                label: "Исходящий остаток",
                render: (s) => money(s.closing),
              },
              {
                key: "date",
                label: "По состоянию на",
                render: (s) => date(s.asOf),
                optional: true,
              },
            ]}
            empty="Источник еще не передал начисления по этому ЛС."
          />
        </section>
      )}
      {hasPermission(user, "leases.write") && (
        <Disclosure title="Добавить лицевой счет">
          <form className="form-grid" onSubmit={createAccount}>
            <label>
              Источник
              <Select required name="sourceId">
                <option value="">Выберите</option>
                {data.sources
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              Договор
              <Select required name="leaseId">
                <option value="">Выберите</option>
                {overview.leases.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.contractNumber} · {l.unitNumber}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Номер ЛС
              <Input required name="number" maxLength={300} />
            </label>
            <label>
              Внешний ID
              <Input
                required
                name="externalId"
                pattern="[a-zA-Z0-9-]+"
                maxLength={100}
              />
            </label>
            <label>
              Действует с
              <Input
                required
                type="date"
                name="validFrom"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <Button variant="primary" type="submit" busy={busy}>
              Добавить ЛС
            </Button>
          </form>
        </Disclosure>
      )}
      {canManage && (
        <Disclosure title="Источники учета и обмен">
          <p className="field-hint">
            Каждая база 1С подключается отдельно. Среда источника должна
            совпадать со средой сервера.
          </p>
          {secret && (
            <div className="business-detail">
              <label>
                Ключ подключения — сохраните сейчас
                <Input
                  readOnly
                  value={secret}
                  aria-label="Новый ключ источника"
                />
              </label>
              <Button onClick={() => setSecret("")}>
                Ключ сохранен, скрыть
              </Button>
            </div>
          )}
          <Register
            title="Источники"
            rows={data.sources}
            searchText={(s) => s.name}
            columns={[
              {
                key: "name",
                label: "Название",
                render: (s) => (
                  <>
                    {s.name}
                    <small>ID: {s.id}</small>
                  </>
                ),
              },
              {
                key: "env",
                label: "Среда",
                render: (s) =>
                  s.environment === "test" ? "Тестовая" : "Рабочая",
              },
              {
                key: "state",
                label: "Состояние",
                render: (s) => (
                  <Button
                    busy={busy}
                    onClick={() =>
                      void run(
                        () =>
                          apiRequest(`/api/accounting/sources/${s.id}`, {
                            token,
                            method: "PUT",
                            body: {
                              name: s.name,
                              environment: s.environment,
                              active: !s.active,
                              updatedAt: s.updatedAt,
                            },
                          }),
                        s.active ? "Источник отключен" : "Источник включен",
                      )
                    }
                  >
                    {s.active ? "Отключить" : "Включить"}
                  </Button>
                ),
              },
              {
                key: "token",
                label: "Подключение",
                render: (s) => (
                  <Button
                    busy={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await apiRequest<{ token: string }>(
                          `/api/accounting/sources/${s.id}/token`,
                          { token, method: "POST", body: {} },
                        );
                        setSecret(result.token);
                      }, "Ключ создан. Предыдущий ключ больше не действует.")
                    }
                  >
                    {s.tokenConfigured ? "Заменить ключ" : "Создать ключ"}
                  </Button>
                ),
              },
            ]}
          />
          <Disclosure title="Добавить источник">
            <form className="form-grid" onSubmit={createSource}>
              <label>
                Название
                <Input name="name" required maxLength={300} />
              </label>
              <label>
                Среда
                <Select name="environment" defaultValue="production">
                  <option value="production">Рабочая</option>
                  <option value="test">Тестовая</option>
                </Select>
              </label>
              <Button variant="primary" type="submit" busy={busy}>
                Добавить источник
              </Button>
            </form>
          </Disclosure>
          <Disclosure title="Сопоставить внешние идентификаторы">
            <form className="form-grid" onSubmit={mapExternal}>
              <label>
                Источник
                <Select name="sourceId" required>
                  <option value="">Выберите</option>
                  {data.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                Тип записи
                <Select name="entityType">
                  <option value="leases">Договор</option>
                  <option value="meters">Прибор учета</option>
                  <option value="units">Помещение</option>
                  <option value="properties">Объект</option>
                  <option value="tenants">Контрагент</option>
                </Select>
              </label>
              <label>
                Внешний ID
                <Input
                  name="externalId"
                  required
                  maxLength={100}
                  pattern="[a-zA-Z0-9-]+"
                />
              </label>
              <label>
                ID записи на сайте
                <Input
                  name="localId"
                  required
                  maxLength={100}
                  pattern="[a-zA-Z0-9-]+"
                />
              </label>
              <Button variant="primary" type="submit" busy={busy}>
                Сохранить связь
              </Button>
            </form>
            <p className="field-hint">
              ID записи можно скопировать из адреса ее карточки или реестра.
              Автоматического сопоставления по имени нет.
            </p>
          </Disclosure>
          {user.role === "admin" && hasPermission(user, "exchange.manage") && (
            <Disclosure title="Журнал обмена">
              <ExchangeJournal token={token} sources={data.sources} />
            </Disclosure>
          )}
        </Disclosure>
      )}
    </div>
  );
}
