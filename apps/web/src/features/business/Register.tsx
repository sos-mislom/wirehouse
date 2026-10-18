import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, Checkbox, Input, Select } from "../../ui";
import { ResponsiveTable } from "../../ResponsiveTable";
import { ActionIcon } from "./ActionIcon";
import { initialPageSize } from "./register-preferences";
export type ServerPagination = {
  query: string;
  offset: number;
  limit: number;
  total: number;
  loading: boolean;
  setQuery: (value: string) => void;
  setOffset: (value: number) => void;
  setLimit: (value: number) => void;
};
export function Register<T extends { id: string }>({
  title,
  rows,
  columns,
  searchText,
  selectedId,
  onSelect,
  filters,
  action,
  empty = "Записей пока нет. Измените фильтр или добавьте запись.",
  pagination,
  loading = false,
  details,
}: {
  title: string;
  rows: T[];
  columns: {
    key: string;
    label: string;
    render: (row: T) => ReactNode;
    optional?: boolean;
  }[];
  loading?: boolean;
  details?: { rowId: string; render: (row: T) => ReactNode };
  selectedId?: string;
  onSelect?: (row: T) => void;
  filters?: ReactNode;
  action?: ReactNode;
  empty?: string;
} & (
  | { pagination: ServerPagination; searchText?: never }
  | { pagination?: undefined; searchText: (row: T) => string }
)) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(() => initialPageSize(title)),
    [filterOpen, setFilterOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [density, setDensity] = useState(() => {
      try {
        return localStorage.getItem(`register-density:${title}`) ===
          "comfortable"
          ? "comfortable"
          : "compact";
      } catch {
        return "compact";
      }
    }),
    [hidden, setHidden] = useState<string[]>(() => {
      try {
        const values = JSON.parse(
          localStorage.getItem(`register-columns:${title}`) ?? "[]",
        );
        return Array.isArray(values)
          ? values.filter((v) => columns.some((c) => c.optional && c.key === v))
          : [];
      } catch {
        return [];
      }
    }),
    id = useId();
  useEffect(() => {
    try {
      localStorage.setItem(`register-density:${title}`, density);
      localStorage.setItem(`register-columns:${title}`, JSON.stringify(hidden));
      localStorage.setItem(
        `register-page-size:${title}`,
        String(pagination?.limit ?? pageSize),
      );
    } catch {
      /* View preferences never block business operations. */
    }
  }, [title, density, hidden, pageSize, pagination?.limit]);
  const visible = pagination
      ? rows
      : rows.filter((r) =>
          searchText!(r)
            .toLocaleLowerCase("ru")
            .includes(query.toLocaleLowerCase("ru")),
        ),
    total = pagination ? pagination.total : visible.length,
    size = pagination?.limit ?? pageSize,
    cols = columns.filter((c) => !hidden.includes(c.key)),
    pageCount = Math.max(1, Math.ceil(total / size)),
    currentPage = pagination
      ? Math.floor(pagination.offset / size) + 1
      : Math.min(page, pageCount),
    offset = pagination?.offset ?? (currentPage - 1) * size,
    pending = pagination?.loading ?? loading,
    pageRows = pagination ? visible : visible.slice(offset, offset + size);
  const changePage = (next: number) => {
    if (pagination) pagination.setOffset((next - 1) * size);
    else setPage(next);
    document.getElementById(id + "-heading")?.focus();
  };
  return (
    <section
      className={`data-register data-register--${density}`}
      aria-label={title}
      aria-busy={pending}
    >
      <div className="register-heading">
        <h3 id={id + "-heading"} tabIndex={-1}>
          {title} <small>{pending ? "…" : total}</small>
        </h3>
        {action}
      </div>
      <div className="register-toolbar">
        <div className="register-search">
          {" "}
          <Input
            aria-label={`Поиск: ${title}`}
            placeholder="Поиск"
            value={pagination?.query ?? query}
            maxLength={200}
            onChange={(e) => {
              if (pagination) pagination.setQuery(e.target.value);
              else setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filters && (
          <Button
            aria-expanded={filterOpen}
            aria-controls={id + "-filters"}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            <ActionIcon name="filter" />
            Фильтры
          </Button>
        )}
        <Button
          aria-label={`Вид таблицы: ${title}`}
          aria-expanded={settingsOpen}
          aria-controls={id + "-settings"}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <ActionIcon name="settings" />
          <span>Вид</span>
        </Button>
      </div>
      {filterOpen && (
        <div className="register-options" id={id + "-filters"}>
          {filters}
        </div>
      )}
      {settingsOpen && (
        <div className="register-options" id={id + "-settings"}>
          <label>
            Плотность
            <Select
              value={density}
              onChange={(e) => setDensity(e.target.value)}
            >
              <option value="compact">Компактная</option>
              <option value="comfortable">Свободная</option>
            </Select>
          </label>
          <label>
            Записей на странице
            <Select
              value={size}
              onChange={(e) => {
                if (pagination) pagination.setLimit(Number(e.target.value));
                else setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
          {columns.some((c) => c.optional) && (
            <fieldset className="register-columns">
              <legend>Показывать столбцы</legend>
              {columns
                .filter((c) => c.optional)
                .map((c) => (
                  <Checkbox
                    key={c.key}
                    checked={!hidden.includes(c.key)}
                    onChange={(e) =>
                      setHidden(
                        e.target.checked
                          ? hidden.filter((k) => k !== c.key)
                          : [...hidden, c.key],
                      )
                    }
                  >
                    {c.label}
                  </Checkbox>
                ))}
            </fieldset>
          )}
        </div>
      )}
      {pending ? (
        <div className="register-loading" role="status">
          Загрузка записей…
        </div>
      ) : pageRows.length ? (
        <div className="mvp-table-wrap">
          <ResponsiveTable className="mvp-table register-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.flatMap((row) => [
                <tr
                  key={row.id}
                  className={
                    row.id === selectedId ? "mvp-row-active" : undefined
                  }
                  aria-selected={onSelect ? row.id === selectedId : undefined}
                  onClick={
                    onSelect
                      ? (event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              "button,a,input,select,textarea,label",
                            )
                          )
                            onSelect(row);
                        }
                      : undefined
                  }
                >
                  {cols.map((c) => (
                    <td key={c.key}>{c.render(row)}</td>
                  ))}
                </tr>,
                ...(details?.rowId === row.id
                  ? [
                      <tr
                        key={`details:${row.id}`}
                        className="register-details-row"
                      >
                        <td colSpan={cols.length} data-label="">
                          {details.render(row)}
                        </td>
                      </tr>,
                    ]
                  : []),
              ])}
            </tbody>
          </ResponsiveTable>
        </div>
      ) : (
        <p className="empty-state">{empty}</p>
      )}
      {pageCount > 1 && !pending && (
        <nav className="register-pagination" aria-label={`Страницы: ${title}`}>
          <span role="status">
            {offset + 1}–{Math.min(offset + size, total)} из {total}
          </span>
          <Button
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            Назад
          </Button>
          <Button
            disabled={currentPage === pageCount}
            onClick={() => changePage(currentPage + 1)}
          >
            Далее
          </Button>
        </nav>
      )}
    </section>
  );
}
