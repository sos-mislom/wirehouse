import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, runtimeApiBase } from "../../api/client";
import { Button } from "../../ui";
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
  reload?: () => void | Promise<void>;
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
export { ActionIcon } from "./ActionIcon";
export { Register } from "./Register";
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
