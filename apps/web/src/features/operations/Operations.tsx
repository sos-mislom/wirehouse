import { Button, Input, Select } from "../../ui";
import { OperationCard } from "./OperationCard";
import { OperationEditor } from "./OperationEditor";
import { Props, tabs, tabPermission } from "./shared";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useOperationsModel } from "./useOperationsModel";
import { Catalog } from "../platform/Catalog";
import { Estimates } from "../platform/Estimates";
import { AuditLog } from "../platform/AuditLog";
export function Operations(props: Props) {
  const model = useOperationsModel(props);
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
    submitReading,
    readingPeriod,
    setReadingPeriod,
    readingValue,
    setReadingValue,
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
                ? ["users", "audit"].includes(key)
                : ![
                    "users",
                    "audit",
                    "templates",
                    "materials",
                    "contractors",
                  ].includes(key)) &&
              (key !== "audit" || hasPermission(user, "audit.read")),
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
                  ? ["users", "audit"].includes(key)
                  : !["users", "audit"].includes(key)) &&
                (key !== "audit" || hasPermission(user, "audit.read")),
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
      {tab === "audit" ? (
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
            <Input
              aria-label="Поиск"
              placeholder="Поиск по названию или номеру"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
              Администратор управляет всем портфелем; менеджер — своим объектом
              и исполнителями; исполнитель — назначенными заявками; арендатор —
              своими помещениями и обращениями. Блокировка отзывает доступ
              немедленно.
            </p>
          )}
          {draft && <OperationEditor model={model} />}
          {readingMeter && (
            <article className="mvp-card">
              <h3>
                Показания ·{" "}
                {data.meters.find((m) => m.id === readingMeter)?.name}
              </h3>
              <form className="form-grid" onSubmit={submitReading}>
                <label>
                  Месяц *
                  <Input
                    type="month"
                    required
                    max={new Date().toISOString().slice(0, 7)}
                    value={readingPeriod}
                    onChange={(e) => setReadingPeriod(e.target.value)}
                  />
                </label>
                <label>
                  Показание *
                  <Input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  type="submit"
                  disabled={busy}
                >
                  Сохранить показание
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  className="secondary-button"
                  onClick={() => setReadingMeter("")}
                >
                  Отмена
                </Button>
              </form>
            </article>
          )}
          <div className="operations-list">
            {rows.map((row) => (
              <OperationCard key={row.id} row={row} model={model} />
            ))}
          </div>
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
