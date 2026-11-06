import { useId, useState, type FormEvent } from "react";
import { ExchangeJournal } from "./ExchangeJournal";
import type {
  AccountingWorkspace as Data,
  AccountingSource,
} from "../../../../../packages/contracts/src/accounting";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest } from "../../api/client";
import { Badge, Button, IconButton, Input, Select } from "../../ui";
import { SidePanel } from "../../ui/SidePanel";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { DocumentRegistry } from "./DocumentRegistry";
import { formatBillingMoney } from "../billing/format";
import { ActionIcon, Feedback, Register, date, useResource } from "./shared";

export type AccountingView = "accounts" | "sources" | "links" | "exchange";
const initial: Data = { sources: [], accounts: [], statements: [], links: [] };
const entityNames: Record<string, string> = {
  properties: "Объект",
  units: "Помещение",
  tenants: "Контрагент",
  leases: "Договор",
  meters: "Прибор учёта",
  personal_accounts: "Лицевой счёт",
};
type Panel =
  | "account"
  | "account-create"
  | "source-create"
  | "source-key"
  | "link-create"
  | null;

export function AccountingWorkspace({
  view = "accounts",
}: {
  view?: AccountingView;
}) {
  const { session, overview, operations, locale } = useWorkspace();
  const { token, user } = session;
  const resource = useResource(token, "/api/accounting", initial);
  const { data, busy, run } = resource;
  const [selected, setSelected] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [status, setStatus] = useState("");
  const [secret, setSecret] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [accountView, setAccountView] = useState("details");
  const [dirty, setDirty] = useState(false);
  const [keySource, setKeySource] = useState("");
  const formId = useId();
  const canManage = hasPermission(user, "accounting.manage");
  const canJournal =
    canManage &&
    user.role === "admin" &&
    hasPermission(user, "exchange.manage");
  const account = data.accounts.find((a) => a.id === selected);
  const sourceName = (id: string) =>
    data.sources.find((s) => s.id === id)?.name ?? "Источник удалён";
  const selectedSource = data.sources.find((s) => s.id === keySource);
  const openPanel = (next: Panel) => {
    setDirty(false);
    resource.setError("");
    setPanel(next);
  };
  const closePanel = () => {
    setPanel(null);
    setDirty(false);
    setSecret("");
    resource.setError("");
  };
  function localLabel(type: string, id: string) {
    if (type === "properties")
      return overview.properties.find((r) => r.id === id)?.name ?? id;
    if (type === "units") {
      const unit = overview.units.find((r) => r.id === id);
      return unit ? `${unit.number} · ${unit.propertyName ?? ""}` : id;
    }
    if (type === "tenants")
      return overview.tenants.find((r) => r.id === id)?.name ?? id;
    if (type === "leases")
      return overview.leases.find((r) => r.id === id)?.contractNumber ?? id;
    if (type === "meters")
      return operations?.meters.find((r) => r.id === id)?.name ?? id;
    if (type === "personal_accounts")
      return data.accounts.find((r) => r.id === id)?.number ?? id;
    return id;
  }
  async function createSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form);
    const saved = await run(async () => {
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
    if (saved) closePanel();
  }
  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      v = new FormData(form);
    const saved = await run(async () => {
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
    if (saved) closePanel();
  }
  async function mapExternal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    const saved = await run(() =>
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
    if (saved) closePanel();
  }
  function toggleSource(source: AccountingSource) {
    void run(
      () =>
        apiRequest(`/api/accounting/sources/${source.id}`, {
          token,
          method: "PUT",
          body: {
            name: source.name,
            environment: source.environment,
            active: !source.active,
            updatedAt: source.updatedAt,
          },
        }),
      source.active ? "Источник отключён" : "Источник включён",
    );
  }
  function sourceFilters() {
    return (
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
    );
  }
  if (
    ((view === "sources" || view === "links") && !canManage) ||
    (view === "exchange" && !canJournal)
  )
    return <p className="ui-empty">Доступ к разделу ограничен.</p>;
  return (
    <div className="business-stack accounting-view">
      <Feedback {...resource} error={panel ? "" : resource.error} />
      {view === "accounts" && (
        <Register
          title="Лицевые счета"
          rows={data.accounts.filter(
            (a) =>
              (!sourceFilter || a.sourceId === sourceFilter) &&
              (!status || a.status === status),
          )}
          loading={resource.loading}
          selectedId={selected}
          onSelect={(a) => {
            setSelected(a.id);
            openPanel("account");
          }}
          searchText={(a) =>
            `${a.number} ${a.externalId} ${sourceName(a.sourceId)}`
          }
          action={
            hasPermission(user, "leases.write") ? (
              <IconButton
                label="Добавить лицевой счёт"
                onClick={() => openPanel("account-create")}
              >
                <ActionIcon name="plus" />
              </IconButton>
            ) : undefined
          }
          columns={[
            {
              key: "number",
              label: "ЛС",
              render: (a) => <strong>{a.number}</strong>,
            },
            {
              key: "source",
              label: "Источник учёта",
              render: (a) => sourceName(a.sourceId),
            },
            {
              key: "lease",
              label: "Договор",
              render: (a) =>
                overview.leases.find((l) => l.id === a.leaseId)
                  ?.contractNumber ?? a.leaseId,
              optional: true,
            },
            {
              key: "status",
              label: "Статус",
              render: (a) => (
                <Badge tone={a.status === "active" ? "success" : "neutral"}>
                  {a.status === "active" ? "Действует" : "Закрыт"}
                </Badge>
              ),
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
              {sourceFilters()}
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
      )}
      {view === "sources" && (
        <Register
          title="Источники учёта"
          rows={data.sources}
          loading={resource.loading}
          searchText={(source) => source.name}
          action={
            <IconButton
              label="Добавить источник"
              onClick={() => openPanel("source-create")}
            >
              <ActionIcon name="plus" />
            </IconButton>
          }
          columns={[
            {
              key: "name",
              label: "Название",
              render: (source) => <strong>{source.name}</strong>,
            },
            {
              key: "environment",
              label: "Среда",
              render: (source) =>
                source.environment === "test" ? "Тестовая" : "Рабочая",
            },
            {
              key: "active",
              label: "Состояние",
              render: (source) => (
                <Badge tone={source.active ? "success" : "neutral"}>
                  {source.active ? "Включён" : "Отключён"}
                </Badge>
              ),
            },
            {
              key: "connection",
              label: "Обмен с 1С",
              render: (source) => (
                <>
                  <Badge
                    tone={
                      source.lastError
                        ? "danger"
                        : source.lastSuccessfulAt
                          ? "success"
                          : "neutral"
                    }
                  >
                    {source.lastError
                      ? "Ошибка обмена"
                      : source.lastSuccessfulAt
                        ? "Обмен выполнен"
                        : "Нет подтверждения"}
                  </Badge>
                  {source.lastSeenAt && (
                    <small>
                      {new Date(source.lastSeenAt).toLocaleString("ru-RU")}
                    </small>
                  )}
                </>
              ),
            },
            {
              key: "actions",
              label: "Действия",
              render: (source) => (
                <div className="mvp-actions">
                  <IconButton
                    label={
                      source.active ? "Отключить источник" : "Включить источник"
                    }
                    busy={busy}
                    onClick={() => toggleSource(source)}
                  >
                    <ActionIcon name="power" />
                  </IconButton>
                  <IconButton
                    label={
                      source.tokenConfigured ? "Заменить ключ" : "Создать ключ"
                    }
                    disabled={busy}
                    onClick={() => {
                      setKeySource(source.id);
                      setSecret("");
                      openPanel("source-key");
                    }}
                  >
                    <ActionIcon name="key" />
                  </IconButton>
                </div>
              ),
            },
          ]}
        />
      )}
      {view === "links" && (
        <Register
          title="Сопоставления"
          rows={data.links.filter(
            (link) => !sourceFilter || link.sourceId === sourceFilter,
          )}
          loading={resource.loading}
          searchText={(link) =>
            `${sourceName(link.sourceId)} ${link.externalId} ${localLabel(link.entityType, link.localId)}`
          }
          action={
            <IconButton
              label="Сопоставить записи"
              onClick={() => openPanel("link-create")}
            >
              <ActionIcon name="plus" />
            </IconButton>
          }
          filters={sourceFilters()}
          columns={[
            {
              key: "source",
              label: "Источник",
              render: (link) => sourceName(link.sourceId),
            },
            {
              key: "type",
              label: "Тип записи",
              render: (link) => entityNames[link.entityType] ?? "Запись",
            },
            {
              key: "local",
              label: "Запись на сайте",
              render: (link) => (
                <strong>{localLabel(link.entityType, link.localId)}</strong>
              ),
            },
            {
              key: "external",
              label: "Внешний ID",
              render: (link) => link.externalId,
            },
          ]}
          empty="Сопоставлений пока нет."
        />
      )}
      {view === "exchange" && (
        <ExchangeJournal token={token} sources={data.sources} />
      )}
      {panel === "account" && account && (
        <SidePanel title={`ЛС ${account.number}`} onClose={closePanel}>
          <WorkspaceTabs
            label="Карточка лицевого счёта"
            items={[
              { id: "details", label: "Сведения" },
              { id: "documents", label: "Документы" },
            ]}
            value={accountView}
            onChange={setAccountView}
          />
          {accountView === "documents" ? (
            <DocumentRegistry
              entityType="personal_accounts"
              entityId={account.id}
            />
          ) : (
            <>
              <dl className="billing-invoice-summary">
                <div>
                  <dt>Источник</dt>
                  <dd>{sourceName(account.sourceId)}</dd>
                </div>
                <div>
                  <dt>Договор</dt>
                  <dd>
                    {overview.leases.find((l) => l.id === account.leaseId)
                      ?.contractNumber ?? account.leaseId}
                  </dd>
                </div>
                <div>
                  <dt>Внешний ID</dt>
                  <dd>{account.externalId}</dd>
                </div>
                <div>
                  <dt>Период</dt>
                  <dd>
                    {date(account.validFrom)} —{" "}
                    {account.validTo ? date(account.validTo) : "бессрочно"}
                  </dd>
                </div>
              </dl>
              <Register
                title="Начисления и оплаты"
                rows={data.statements.filter((s) => s.accountId === account.id)}
                searchText={(statement) => statement.period}
                columns={[
                  { key: "period", label: "Месяц", render: (s) => s.period },
                  {
                    key: "opening",
                    label: "Входящий остаток",
                    align: "end",
                    render: (s) => formatBillingMoney(s.opening, locale),
                    optional: true,
                  },
                  {
                    key: "charged",
                    label: "Начислено",
                    align: "end",
                    render: (s) => formatBillingMoney(s.charged, locale),
                  },
                  {
                    key: "paid",
                    label: "Оплачено",
                    align: "end",
                    render: (s) => formatBillingMoney(s.paid, locale),
                  },
                  {
                    key: "closing",
                    label: "Исходящий остаток",
                    align: "end",
                    render: (s) => formatBillingMoney(s.closing, locale),
                  },
                  {
                    key: "date",
                    label: "По состоянию на",
                    render: (s) => date(s.asOf),
                    optional: true,
                  },
                ]}
                empty="Источник ещё не передал начисления по этому ЛС."
              />
            </>
          )}
        </SidePanel>
      )}
      {panel === "account-create" && hasPermission(user, "leases.write") && (
        <SidePanel
          title="Добавить лицевой счёт"
          onClose={closePanel}
          busy={busy}
          dirty={dirty}
          footer={
            <Button
              variant="primary"
              type="submit"
              form={`${formId}-account`}
              busy={busy}
            >
              Добавить ЛС
            </Button>
          }
        >
          <Feedback error={resource.error} />
          <form
            className="form-grid"
            id={`${formId}-account`}
            onSubmit={createAccount}
            onChange={() => setDirty(true)}
          >
            <label>
              Источник
              <Select required name="sourceId">
                <option value="">Выберите источник</option>
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
                <option value="">Выберите договор</option>
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
          </form>
        </SidePanel>
      )}
      {panel === "source-create" && canManage && (
        <SidePanel
          title="Добавить источник"
          onClose={closePanel}
          busy={busy}
          dirty={dirty}
          footer={
            <Button
              variant="primary"
              type="submit"
              form={`${formId}-source`}
              busy={busy}
            >
              Добавить источник
            </Button>
          }
        >
          <Feedback error={resource.error} />
          <form
            className="form-grid"
            id={`${formId}-source`}
            onSubmit={createSource}
            onChange={() => setDirty(true)}
          >
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
          </form>
        </SidePanel>
      )}
      {panel === "link-create" && canManage && (
        <SidePanel
          title="Сопоставить записи"
          onClose={closePanel}
          busy={busy}
          dirty={dirty}
          footer={
            <Button
              variant="primary"
              type="submit"
              form={`${formId}-link`}
              busy={busy}
            >
              Сохранить связь
            </Button>
          }
        >
          <Feedback error={resource.error} />
          <form
            className="form-grid"
            id={`${formId}-link`}
            onSubmit={mapExternal}
            onChange={() => setDirty(true)}
          >
            <label>
              Источник
              <Select name="sourceId" required>
                <option value="">Выберите источник</option>
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
                {Object.entries(entityNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
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
          </form>
        </SidePanel>
      )}
      {panel === "source-key" && selectedSource && canManage && (
        <SidePanel
          title={`Подключение: ${selectedSource.name}`}
          onClose={closePanel}
          busy={busy}
        >
          <Feedback error={resource.error} />
          <dl className="billing-invoice-summary">
            <div>
              <dt>Идентификатор источника</dt>
              <dd>{selectedSource.id}</dd>
            </div>
            <div>
              <dt>Среда</dt>
              <dd>
                {selectedSource.environment === "test" ? "Тестовая" : "Рабочая"}
              </dd>
            </div>
            {selectedSource.lastError && (
              <div>
                <dt>Последняя ошибка обмена</dt>
                <dd>{selectedSource.lastError}</dd>
              </div>
            )}
          </dl>
          {secret ? (
            <div className="billing-key-panel">
              <label>
                Новый ключ — сохраните его сейчас
                <Input
                  readOnly
                  value={secret}
                  aria-label="Новый ключ источника"
                />
              </label>
              <Button variant="primary" onClick={closePanel}>
                Ключ сохранён
              </Button>
            </div>
          ) : (
            <div className="billing-key-panel">
              {selectedSource.tokenConfigured && (
                <p>
                  Новый ключ заменит действующий. Обновите подключение в 1С
                  после замены.
                </p>
              )}
              <Button
                variant="primary"
                busy={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await apiRequest<{ token: string }>(
                      `/api/accounting/sources/${selectedSource.id}/token`,
                      { token, method: "POST", body: {} },
                    );
                    setSecret(result.token);
                  }, "Ключ создан.")
                }
              >
                {selectedSource.tokenConfigured
                  ? "Заменить ключ"
                  : "Создать ключ"}
              </Button>
            </div>
          )}
        </SidePanel>
      )}
    </div>
  );
}
