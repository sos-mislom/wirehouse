import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, runtimeApiBase } from "../../api/client";
import { ResponsiveTable } from "../../ResponsiveTable";
import { Button, Input, Select } from "../../ui";
export function useResource<T>(token: string, path: string, initial: T) {
  const mutationPending = useRef(false);
  const [data, setData] = useState<T>(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const value = await apiRequest<T>(path, { token });
    setData(value);
    return value;
  }, [token, path]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    apiRequest<T>(path, { token, signal: abort.signal })
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [token, path]);
  const run = async (fn: () => Promise<unknown>, message = "Сохранено") => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  };
  const reload = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return { data, load, reload, error, setError, notice, busy, loading, run };
}
export function Feedback({
  error,
  notice,
  loading,
  reload,
}: {
  error?: string;
  notice?: string;
  loading?: boolean;
  reload?: () => Promise<void>;
}) {
  return (
    <>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
          {reload && (
            <Button
              variant="text"
              disabled={loading}
              onClick={() => void reload()}
            >
              Обновить данные
            </Button>
          )}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading && (
        <p className="field-hint" role="status">
          Загружаем данные…
        </p>
      )}
    </>
  );
}
export function ActionIcon({
  name,
}: {
  name: "filter" | "settings" | "back" | "download";
}) {
  const paths = {
    filter: (
      <>
        <path d="M3 4h18l-7 8v7l-4 2v-9Z" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
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
}: {
  title: string;
  rows: T[];
  columns: {
    key: string;
    label: string;
    render: (row: T) => ReactNode;
    optional?: boolean;
  }[];
  searchText: (row: T) => string;
  selectedId?: string;
  onSelect?: (row: T) => void;
  filters?: ReactNode;
  action?: ReactNode;
  empty?: string;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(() => {
      try {
        const saved = Number(
          localStorage.getItem(`register-page-size:${title}`),
        );
        if ([10, 25, 50, 100].includes(saved)) return saved;
      } catch {
        /* Preferences are optional. */
      }
      return window.matchMedia("(max-width: 760px)").matches ? 10 : 25;
    }),
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
      localStorage.setItem(`register-page-size:${title}`, String(pageSize));
    } catch {
      /* View preferences never block business operations. */
    }
  }, [title, density, hidden, pageSize]);
  const rowIds = rows.map((row) => row.id).join(",");
  useEffect(() => setPage(1), [rowIds]);
  const visible = rows.filter((r) =>
      searchText(r)
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")),
    ),
    cols = columns.filter((c) => !hidden.includes(c.key)),
    pageCount = Math.max(1, Math.ceil(visible.length / pageSize)),
    currentPage = Math.min(page, pageCount),
    offset = (currentPage - 1) * pageSize;
  const changePage = (next: number) => {
    setPage(next);
    document.getElementById(id + "-heading")?.focus();
  };
  return (
    <section
      className={`data-register data-register--${density}`}
      aria-label={title}
    >
      <div className="register-heading">
        <h3 id={id + "-heading"} tabIndex={-1}>
          {title} <small>{visible.length}</small>
        </h3>
        {action}
      </div>
      <div className="register-toolbar">
        <div className="register-search">
          {" "}
          <Input
            aria-label={`Поиск: ${title}`}
            placeholder="Поиск"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
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
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
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
          {columns
            .filter((c) => c.optional)
            .map((c) => (
              <label className="check-field" key={c.key}>
                <Input
                  type="checkbox"
                  checked={!hidden.includes(c.key)}
                  onChange={(e) =>
                    setHidden(
                      e.target.checked
                        ? hidden.filter((k) => k !== c.key)
                        : [...hidden, c.key],
                    )
                  }
                />
                {c.label}
              </label>
            ))}
        </div>
      )}
      {visible.length ? (
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
              {visible.slice(offset, offset + pageSize).map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.id === selectedId ? "mvp-row-active" : undefined
                  }
                  aria-selected={onSelect ? row.id === selectedId : undefined}
                  onClick={onSelect ? () => onSelect(row) : undefined}
                >
                  {cols.map((c) => (
                    <td key={c.key}>{c.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      ) : (
        <p className="empty-state">{empty}</p>
      )}
      {pageCount > 1 && (
        <nav className="register-pagination" aria-label={`Страницы: ${title}`}>
          <span role="status">
            {offset + 1}–{Math.min(offset + pageSize, visible.length)} из{" "}
            {visible.length}
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
export function Disclosure({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  return (
    <details
      className="work-disclosure"
      open={open || undefined}
      onToggle={(e) => {
        if (e.currentTarget.open) setMounted(true);
      }}
    >
      <summary>{title}</summary>
      {mounted && <div className="work-disclosure-body">{children}</div>}
    </details>
  );
}
export async function uploadDocument(
  token: string,
  file: File,
  links: { entityType: string; entityId: string; phase?: string }[],
  category = "other",
) {
  if (file.size > 12 * 1024 * 1024) throw new Error("Файл больше 12 МБ");
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
  return apiRequest<{ item: { id: string } }>("/api/documents", {
    token,
    method: "POST",
    body: {
      name: file.name,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64,
      links: links.map((l) => ({ ...l, phase: l.phase ?? "general" })),
      category,
    },
  });
}
export async function downloadDocument(
  token: string,
  id: string,
  name: string,
) {
  const res = await fetch(`${runtimeApiBase}/api/documents/${id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error("Не удалось получить файл. Обновите список документов.");
  const blob = await res.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const date = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("ru-RU") : "—";
export const money = (v: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(v);
