import { useState } from "react";
import { Register } from "../business/shared";
import { Disclosure } from "../business/shared";
import { AccessWorkspace } from "../business/AccessWorkspace";
import { ReadingsWorkspace } from "../business/ReadingsWorkspace";
import { MaintenanceProgress } from "../business/MaintenanceProgress";
import { MaintenanceImport } from "../platform/MaintenanceImport";
import { Button, Input, Select } from "../../ui";
import { OperationCard } from "./OperationCard";
import { OperationEditor } from "./OperationEditor";
import {
  Props,
  tabs,
  tabPermission,
  roleNames,
  statusNames,
  resourceNames,
} from "./shared";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useOperationsModel } from "./useOperationsModel";
import { Catalog } from "../platform/Catalog";
import { Estimates } from "../platform/Estimates";
import { AuditLog } from "../platform/AuditLog";
export function Operations(props: Props) {
  const model = useOperationsModel(props);
  const [selectedRow, setSelectedRow] = useState("");
  const [meterView, setMeterView] = useState("meters");
  const {
    initialTab,
    user,
    tab,
    setTab,
    setDraft,
    setError,
    setQuery,
    setProperty,
    error,
    notice,
    query,
    property,
    overview,
    rows,
    onCreateUser,
    create,
    draft,
    save,
    input,
    select,
    check,
    units,
    workers,
    area,
    change,
    data,
    busy,
    readingMeter,
    setReadingMeter,
    onUnit,
    unitName,
    tickets,
    onTicket,
    token,
  } = model;
  const group = ["plans", "templates"].includes(tab)
    ? "plans"
    : ["services", "materials", "contractors"].includes(tab)
      ? "services"
      : tab;
  const switchTab = (key: string) => {
    model.setNotice("");
    setTab(key);
    setDraft(null);
    setError("");
    setQuery("");
    setProperty("");
  };
  return (
    <section className="mvp-page operations-page">
      <div className="mvp-page-header">
        <div>
          <h2>
            {initialTab === "users" ? "Пользователи и доступ" : "Эксплуатация"}
          </h2>
        </div>
      </div>
      <div className="mvp-tabs operations-nav">
        {Object.entries(tabs)
          .filter(
            ([key]) =>
              (initialTab === "users"
                ? ["users", "access", "audit"].includes(key)
                : ![
                    "users",
                    "access",
                    "audit",
                    "templates",
                    "materials",
                    "contractors",
                  ].includes(key)) &&
              (key !== "audit" || hasPermission(user, "audit.read")) &&
              (key !== "access" || hasPermission(user, "permissions.manage")),
          )
          .map(([key, label]) => (
            <Button
              variant="plain"
              type="button"
              className={`mvp-tab ${group === key ? "mvp-tab--active" : ""}`}
              key={key}
              disabled={busy}
              onClick={() => {
                model.setNotice("");
                setTab(key);
                setDraft(null);
                setError("");
                setQuery("");
                setProperty("");
              }}
            >
              {label}
            </Button>
          ))}
      </div>
      <label className="operations-mobile-nav">
        Раздел
        <Select value={tab} onChange={(e) => switchTab(e.target.value)}>
          {Object.entries(tabs)
            .filter(
              ([key]) =>
                (initialTab === "users"
                  ? ["users", "access", "audit"].includes(key)
                  : !["users", "access", "audit"].includes(key)) &&
                (key !== "audit" || hasPermission(user, "audit.read")) &&
                (key !== "access" || hasPermission(user, "permissions.manage")),
            )
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </Select>
      </label>
      {["plans", "services"].includes(group) && (
        <div className="mvp-actions operations-subnav">
          {(group === "plans"
            ? ["plans", "templates"]
            : ["services", "materials", "contractors"]
          ).map((key) => (
            <Button
              key={key}
              aria-pressed={tab === key}
              variant={tab === key ? "secondary" : "text"}
              onClick={() => switchTab(key)}
            >
              {tabs[key]}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {tab === "meters" && (
        <div className="business-tabs" aria-label="Учет приборов">
          <Button
            aria-pressed={meterView === "meters" && !readingMeter}
            onClick={() => {
              setMeterView("meters");
              setReadingMeter("");
            }}
          >
            Приборы
          </Button>
          <Button
            aria-pressed={meterView === "readings" || Boolean(readingMeter)}
            onClick={() => setMeterView("readings")}
          >
            Показания
          </Button>
        </div>
      )}
      {tab === "plans" && <MaintenanceProgress />}
      {tab === "plans" &&
        hasPermission(user, "maintenance.write") &&
        hasPermission(user, "imports.write") && (
          <MaintenanceImport
            token={token}
            onImported={async () => {
              await model.load();
              await model.onRefresh();
            }}
          />
        )}
      {tab === "access" ? (
        <AccessWorkspace />
      ) : tab === "meters" &&
        (meterView === "readings" || Boolean(readingMeter)) ? (
        <ReadingsWorkspace initialMeterId={readingMeter} />
      ) : tab === "audit" ? (
        <AuditLog token={token} />
      ) : tab === "estimates" ? (
        <Estimates {...props} services={data.services} />
      ) : ["templates", "materials", "contractors"].includes(tab) ? (
        <Catalog
          key={tab}
          kind={tab as "templates" | "materials" | "contractors"}
          {...props}
        />
      ) : (
        <>
          <div className="mvp-actions">
            {tab !== "audit" && tab !== "users" && (
              <Select
                aria-label="Объект"
                value={property}
                onChange={(e) => setProperty(e.target.value)}
              >
                <option value="">Все объекты</option>
                {overview.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            <span>Найдено: {rows.length}</span>
            {tabPermission[tab] && hasPermission(user, tabPermission[tab]) && (
              <Button
                variant="primary"
                className="primary-button"
                type="button"
                onClick={tab === "users" ? onCreateUser : create}
                disabled={busy || (tab === "users" && !onCreateUser)}
              >
                Добавить
              </Button>
            )}
          </div>
          {tab === "users" && (
            <p className="field-hint">
              Роль задает доступные действия. Контекстные назначения определяют
              объекты, помещения, договоры и ЛС, к которым эти действия
              применимы. Блокировка отзывает доступ немедленно.
            </p>
          )}
          {draft && <OperationEditor model={model} />}
          <Register
            title={tabs[tab] ?? "Записи"}
            rows={rows}
            selectedId={selectedRow}
            onSelect={(r) => setSelectedRow(r.id)}
            searchText={(r) =>
              `${r.name ?? r.fullName} ${r.serialNumber ?? ""}`
            }
            columns={[
              {
                key: "name",
                label: "Название",
                render: (r) => <strong>{r.name ?? r.fullName}</strong>,
              },
              {
                key: "property",
                label: "Объект",
                render: (r) =>
                  overview.properties.find((p) => p.id === r.propertyId)
                    ?.name ?? "—",
                optional: true,
              },
              {
                key: "context",
                label: "Контекст",
                render: (r) =>
                  r.unitId
                    ? `Помещение ${unitName(r.unitId)}`
                    : r.role
                      ? roleNames[String(r.role)]
                      : (r.category ??
                        (r.resource ? resourceNames[String(r.resource)] : "—")),
                optional: true,
              },
              {
                key: "status",
                label: "Состояние",
                render: (r) =>
                  tab === "plans"
                    ? `${r.active ? "По расписанию" : "Приостановлен"} · ${r.nextDate}`
                    : tab === "users"
                      ? r.isActive
                        ? "Активен"
                        : "Заблокирован"
                      : (r.status ??
                        (r.active === false ? "Отключено" : "Действует")),
              },
            ]}
          />
          {rows.some((r) => r.id === selectedRow) && (
            <div className="business-detail operation-detail">
              <div className="register-heading">
                <h3>Детали записи</h3>
                <Button onClick={() => setSelectedRow("")}>
                  Закрыть детали
                </Button>
              </div>
              <OperationCard
                row={rows.find((r) => r.id === selectedRow)!}
                model={model}
              />
            </div>
          )}
          {!rows.length && (
            <div className="mvp-card empty-state">
              {tab === "audit"
                ? "Изменений пока нет."
                : "Записей пока нет. Добавьте первую запись или измените фильтр."}
            </div>
          )}
        </>
      )}
    </section>
  );
}
