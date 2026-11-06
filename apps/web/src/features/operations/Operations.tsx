import { useEffect, useState } from "react";
import { ActionIcon, Register } from "../business/shared";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { SidePanel } from "../../ui/SidePanel";
import "./workspace.css";
import { useSurfaceView } from "./useSurfaceView";
import { AccessWorkspace } from "../business/AccessWorkspace";
import { ReadingsWorkspace } from "../business/ReadingsWorkspace";
import { MaintenanceProgress } from "../business/MaintenanceProgress";
import { MaintenanceImport } from "../platform/MaintenanceImport";
import { Button, IconButton, Select } from "../../ui";
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
import {
  isOperationsTab,
  operationsRouteError,
  supportsOperationsRecord,
} from "../../shared/operations-route";
export function Operations(props: Props) {
  const model = useOperationsModel(props);
  const [localSelectedRow, setLocalSelectedRow] = useState("");
  const routeError = props.route ? operationsRouteError(props.route) : "";
  const useRecordRoute =
    props.route && supportsOperationsRecord(props.route.tab);
  const selectedRow = useRecordRoute ? props.route!.recordId : localSelectedRow;
  const setSelectedRow = (recordId: string) => {
    if (useRecordRoute && props.onRouteChange)
      props.onRouteChange((current) => ({ ...current, recordId }));
    else setLocalSelectedRow(recordId);
  };
  const [meterView, setMeterView] = useState("meters");
  const [planView, setPlanView] = useSurfaceView(
    `wirehouse.view.operations-plan:${props.user.id}`,
    "schedule",
    ["schedule", "progress", "import"] as const,
  );
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
    data,
    busy,
    readingMeter,
    setReadingMeter,
    unitName,
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
    if (!props.route) setProperty("");
  };
  useEffect(() => {
    setLocalSelectedRow("");
    setDraft(null);
    setReadingMeter("");
    setMeterView("meters");
  }, [tab, setDraft, setReadingMeter]);
  const selectedRecord = (data[tab as keyof typeof data] ?? []).find(
    (r) => r.id === selectedRow && (!property || r.propertyId === property),
  );
  useEffect(() => {
    if (readingMeter) setSelectedRow("");
  }, [readingMeter]);
  const mainTabs = Object.entries(tabs)
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
    .map(([id, label]) => ({ id, label, disabled: busy }));
  const activePlanView = selectedRow && tab === "plans" ? "schedule" : planView;
  const showRegister =
    ![
      "access",
      "audit",
      "estimates",
      "templates",
      "materials",
      "contractors",
    ].includes(tab) &&
    !(
      tab === "meters" &&
      (meterView === "readings" || Boolean(readingMeter))
    ) &&
    !(tab === "plans" && activePlanView !== "schedule");
  if (routeError)
    return (
      <section className="mvp-page operations-page">
        <div className="mvp-page-header">
          <h2>Эксплуатация</h2>
        </div>
        <p className="notice notice--error" role="alert">
          {routeError}
        </p>
        <Button
          onClick={() =>
            props.onRouteChange?.((current) => ({
              tab: isOperationsTab(current.tab) ? current.tab : "equipment",
              recordId: "",
              propertyId: "",
            }))
          }
        >
          Открыть список раздела
        </Button>
      </section>
    );
  return (
    <section className="mvp-page operations-page">
      <div className="mvp-page-header">
        <div>
          <h2>
            {initialTab === "users" ? "Пользователи и доступ" : "Эксплуатация"}
          </h2>
        </div>
      </div>
      <WorkspaceTabs
        idPrefix="operations-main"
        label={
          initialTab === "users"
            ? "Пользователи и доступ"
            : "Разделы эксплуатации"
        }
        items={mainTabs}
        value={group}
        onChange={(id) => {
          setPlanView("schedule");
          switchTab(id);
        }}
      />
      <div
        className="workspace-pane"
        role="tabpanel"
        id={`operations-main-panel-${group}`}
        aria-labelledby={`operations-main-tab-${group}`}
      >
        {group === "plans" && (
          <WorkspaceTabs
            label="ППР: представление"
            items={[
              { id: "schedule", label: "Графики" },
              { id: "progress", label: "План и факт" },
              { id: "templates", label: "Регламенты" },
              ...(hasPermission(user, "maintenance.write") &&
              hasPermission(user, "imports.write")
                ? [{ id: "import", label: "Импорт" }]
                : []),
            ]}
            value={tab === "templates" ? "templates" : activePlanView}
            onChange={(id) => {
              if (id === "templates") switchTab("templates");
              else {
                setSelectedRow("");
                setPlanView(id as "schedule" | "progress" | "import");
                if (tab !== "plans") switchTab("plans");
              }
            }}
          />
        )}
        {group === "services" && (
          <WorkspaceTabs
            label="Услуги: представление"
            items={[
              { id: "services", label: "Каталог" },
              { id: "materials", label: "Материалы" },
              { id: "contractors", label: "Подрядчики" },
            ]}
            value={tab}
            onChange={switchTab}
          />
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
          <WorkspaceTabs
            label="Учёт приборов"
            items={[
              { id: "meters", label: "Приборы" },
              { id: "readings", label: "Показания" },
            ]}
            value={readingMeter ? "readings" : meterView}
            onChange={(id) => {
              if (id === "meters") {
                setMeterView("meters");
                setReadingMeter("");
              } else setMeterView("readings");
            }}
          />
        )}
        {tab === "plans" && activePlanView === "progress" && (
          <MaintenanceProgress />
        )}
        {tab === "plans" &&
          activePlanView === "import" &&
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
          <ReadingsWorkspace
            initialMeterId={readingMeter}
            onCreateMeter={() => {
              setReadingMeter("");
              setMeterView("meters");
              create();
            }}
          />
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
        ) : showRegister ? (
          <>
            <div className="workspace-toolbar-row">
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
              {tabPermission[tab] &&
                hasPermission(user, tabPermission[tab]) && (
                  <IconButton
                    label={`Добавить: ${tabs[tab] ?? "запись"}`}
                    variant="primary"
                    type="button"
                    onClick={tab === "users" ? onCreateUser : create}
                    disabled={busy || (tab === "users" && !onCreateUser)}
                  >
                    <ActionIcon name="plus" />
                  </IconButton>
                )}
            </div>
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
                          (r.resource
                            ? resourceNames[String(r.resource)]
                            : "—")),
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
                        : r.status
                          ? (statusNames[String(r.status)] ?? "Другой статус")
                          : r.active === false
                            ? "Отключено"
                            : "Действует",
                },
              ]}
            />
            {selectedRecord && !draft && (
              <SidePanel
                title={
                  selectedRecord.name ||
                  selectedRecord.fullName ||
                  "Детали записи"
                }
                onClose={() => {
                  if (tab === "plans") setPlanView("schedule");
                  setSelectedRow("");
                }}
              >
                <OperationCard row={selectedRecord} model={model} />
              </SidePanel>
            )}
            {selectedRow && model.loaded && !error && !selectedRecord && (
              <p className="notice" role="status">
                Запись не найдена или недоступна в выбранном контексте.
              </p>
            )}
            {!rows.length && (
              <div className="mvp-card empty-state">
                {tab === "audit"
                  ? "Изменений пока нет."
                  : "Записей пока нет. Добавьте первую запись или измените фильтр."}
              </div>
            )}
          </>
        ) : null}
        {draft && <OperationEditor model={model} />}
      </div>
    </section>
  );
}
