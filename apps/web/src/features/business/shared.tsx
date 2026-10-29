import { useRef, useState } from "react";
import { apiRequest, runtimeApiBase } from "../../api/client";
import { useLiveQuery } from "../../realtime/RealtimeContext";
export function useResource<T>(token: string, path: string, initial: T) {
  const mutationPending = useRef(false);
  const query = useLiveQuery(token, path, initial);
  const { data, loading, load } = query;
  const [failure, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const error = failure || query.error;
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
  return { data, load, error, setError, notice, busy, loading, run };
}

export function Feedback({
  error,
  notice,
  loading,
}: {
  error?: string;
  notice?: string;
  loading?: boolean;
}) {
  return (
    <>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
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
export { Disclosure } from "../../ui/Disclosure";
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
