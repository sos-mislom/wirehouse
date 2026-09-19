import { Button, Input, Select } from "../../ui";
import { OperationCard } from "./OperationCard";
import { OperationEditor } from "./OperationEditor";
import { Props, tabs } from "./shared";
import { useOperationsModel } from "./useOperationsModel";
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
  return (
    <section className="mvp-page operations-page">
      <div className="mvp-page-header">
        <div>
          <h2>
            {initialTab === "users" ? "Пользователи и доступ" : "Эксплуатация"}
          </h2>
        </div>
      </div>
      <div className="mvp-tabs">
        {Object.entries(tabs)
          .filter(
            ([key]) =>
              (initialTab === "users"
                ? ["users", "audit"].includes(key)
                : !["users", "audit"].includes(key)) &&
              (key !== "audit" || user.role === "admin"),
          )
          .map(([key, label]) => (
            <Button
              variant="plain"
              type="button"
              className={`mvp-tab ${tab === key ? "mvp-tab--active" : ""}`}
              key={key}
              disabled={busy}
              onClick={() => {
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
        {tab !== "audit" && (
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
          Администратор управляет всем портфелем; менеджер — своим объектом и
          исполнителями; исполнитель — назначенными заявками; арендатор — своими
          помещениями и обращениями. Блокировка отзывает доступ немедленно.
        </p>
      )}
      {draft && <OperationEditor model={model} />}
      {readingMeter && (
        <article className="mvp-card">
          <h3>
            Показания · {data.meters.find((m) => m.id === readingMeter)?.name}
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
    </section>
  );
}
