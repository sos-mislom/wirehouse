import { useEffect, useId, useState, type ReactNode } from "react";
import { Checkbox, IconButton, Select } from "../../ui";
import { ResponsiveTable } from "../../ResponsiveTable";
import { ActionIcon } from "./ActionIcon";
import { initialPageSize } from "./register-preferences";
import { FilterBar, FilterSearch } from "./FilterBar";
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
  empty = "Записей пока нет.",
  filtersActive,
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
    align?: "start" | "end";
  }[];
  loading?: boolean;
  details?: { rowId: string; render: (row: T) => ReactNode };
  selectedId?: string;
  onSelect?: (row: T) => void;
  filters?: ReactNode;
  /** Whether the `filters` narrow the rows; unknown keeps the filter bar. */
  filtersActive?: boolean;
  action?: ReactNode;
  empty?: string;
} & (
  | { pagination: ServerPagination; searchText?: never }
  | { pagination?: undefined; searchText: (row: T) => string }
)) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(() => initialPageSize(title)),
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
    pageRows = pagination ? visible : visible.slice(offset, offset + size),
    searching = Boolean(pagination ? pagination.query : query),
    narrowed = searching || filtersActive === true,
    // Nothing exists yet: a search field and filters over an empty set only
    // add noise (a tenant without accounts saw four controls and "0").
    nothingToFilter =
      !pending &&
      total === 0 &&
      !searching &&
      (filters ? filtersActive === false : true);
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
          {title} <small>{total}</small>
          <span
            className="register-progress"
            data-pending={pending || undefined}
            aria-hidden="true"
          />
        </h3>
        {action}
      </div>
      {!nothingToFilter && (
        <FilterBar
          actions={
            <IconButton
              label={`Вид таблицы: ${title}`}
              aria-expanded={settingsOpen}
              aria-controls={id + "-settings"}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <ActionIcon name="settings" />
            </IconButton>
          }
        >
          <FilterSearch
            label={`Поиск: ${title}`}
            value={pagination?.query ?? query}
            onChange={(value) => {
              if (pagination) pagination.setQuery(value);
              else setQuery(value);
              setPage(1);
            }}
          />
          {filters}
        </FilterBar>
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
      {pending && !pageRows.length ? (
        <div className="register-loading" role="status">
          Загрузка записей…
        </div>
      ) : pageRows.length ? (
        <div className="mvp-table-wrap">
          <ResponsiveTable className="mvp-table register-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={
                      c.align === "end" ? "register-cell--end" : undefined
                    }
                  >
                    {c.label}
                  </th>
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
                  {cols.map((c, index) => (
                    <td
                      key={c.key}
                      className={
                        [
                          index === 0 ? "register-cell--primary" : "",
                          c.align === "end" ? "register-cell--end" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                    >
                      {c.render(row)}
                    </td>
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
        <p className="empty-state">
          {narrowed ? "Ничего не найдено. Измените поиск или фильтры." : empty}
        </p>
      )}
      {pageCount > 1 && (
        <nav className="register-pagination" aria-label={`Страницы: ${title}`}>
          <span role="status">
            {offset + 1}–{Math.min(offset + size, total)} из {total}
          </span>
          <IconButton
            label="Назад"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            <ActionIcon name="prev" />
          </IconButton>
          <IconButton
            label="Далее"
            disabled={currentPage === pageCount}
            onClick={() => changePage(currentPage + 1)}
          >
            <ActionIcon name="next" />
          </IconButton>
        </nav>
      )}
    </section>
  );
}
