import { Disclosure } from "../../ui/Disclosure";
import { useState } from "react";
import { Button, Input } from "../../ui";
import { ResponsiveTable } from "../../ResponsiveTable";
import { apiRequest, runtimeApiBase } from "../../api/client";
import type {
  MaintenanceImportFile,
  MaintenanceImportPreview,
} from "../../../../../packages/contracts/src/maintenance-import";
const fileBody = (file: File) =>
  new Promise<MaintenanceImportFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        fileName: file.name,
        contentBase64: String(reader.result).split(",")[1],
      });
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
export function MaintenanceImport({
  token,
  onImported,
}: {
  token: string;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<{
    body: MaintenanceImportFile;
    preview: MaintenanceImportPreview;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const preview = () =>
    run(async () => {
      setChecked(null);
      if (!file) throw new Error("Выберите файл графика");
      if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 2 * 1024 * 1024)
        throw new Error("Выберите CSV или XLSX размером до 2 МБ");
      const body = await fileBody(file);
      const result = await apiRequest<MaintenanceImportPreview>(
        "/api/maintenance-import/preview",
        { token, method: "POST", body },
      );
      setChecked({ body, preview: result });
    });
  const commit = () =>
    run(async () => {
      if (!checked) return;
      const result = await apiRequest<{ created: number; existing: number }>(
        "/api/maintenance-import/commit",
        {
          token,
          method: "POST",
          body: { ...checked.body, previewHash: checked.preview.previewHash },
        },
      );
      setChecked(null);
      setNotice(
        `Загружено графиков: ${result.created}. Уже существовали: ${result.existing}.`,
      );
      try {
        await onImported();
      } catch {
        setError(
          "Графики загружены. Обновите страницу, чтобы увидеть актуальный список.",
        );
      }
    });
  const template = () =>
    run(async () => {
      const response = await fetch(
        `${runtimeApiBase}/api/maintenance-import/template`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error("Не удалось скачать шаблон");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "maintenance-plans.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <Disclosure
      title="Импорт графика ППР"
      className="mvp-card maintenance-import"
    >
      <div className="platform-section">
        <p>
          Загрузите таблицу CSV в UTF-8 или XLSX с одним листом: до 2 МБ и 2000
          строк. Проверка покажет ошибки до создания графиков.
        </p>
        <div className="mvp-actions">
          <Button disabled={busy} onClick={template}>
            Скачать шаблон ППР
          </Button>
        </div>
        <Disclosure title="Как заполнить таблицу">
          <p>
            Одна строка — один график. Постоянный код графика уникален внутри
            объекта. Повторная загрузка пропустит этот код; изменения вносите в
            карточке ППР.
          </p>
          <p>
            Объект — ID или точное название; помещение — ID или номер с
            корпусом, подъездом и этажом при совпадениях. Оборудование — ID,
            название или серийный номер. Ответственный — ID, имя или email.
          </p>
          <p>
            Периодичность: дни, недели, месяцы, годы. Интервал — целое число.
            Даты — ГГГГ-ММ-ДД или ДД.ММ.ГГГГ. Пункты чек-листа разделяйте знаком
            | или переносом строки внутри ячейки.
          </p>
          <p>
            Графики с прошедшей датой создадут пропущенные задания. Календарную
            сетку с месяцами по колонкам сначала преобразуйте в строки графиков.
          </p>
        </Disclosure>
        <label>
          Файл графика ППР
          <Input
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setChecked(null);
              setError("");
              setNotice("");
            }}
          />
        </label>
        <div className="mvp-actions">
          <Button disabled={busy || !file} onClick={preview}>
            {busy ? "Обработка…" : "Проверить файл"}
          </Button>
          {checked && (
            <Button
              variant="primary"
              disabled={
                busy ||
                checked.preview.summary.errors > 0 ||
                checked.preview.summary.ready === 0
              }
              onClick={commit}
            >
              Загрузить графики ({checked.preview.summary.ready})
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="notice notice--error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {checked && (
          <>
            <p role="status">
              Строк: {checked.preview.summary.total}. Готово:{" "}
              {checked.preview.summary.ready}. Уже загружено:{" "}
              {checked.preview.summary.existing}. Ошибок:{" "}
              {checked.preview.summary.errors}.
            </p>
            {checked.preview.summary.errors > 0 && (
              <p>
                Исправьте ошибки в файле и повторите проверку. Загрузка
                применяется целиком, без пропуска ошибочных строк.
              </p>
            )}
            <div className="table-scroll">
              <ResponsiveTable className="mvp-table">
                <thead>
                  <tr>
                    <th>Строка</th>
                    <th>График</th>
                    <th>Место и исполнитель</th>
                    <th>Результат проверки</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.preview.rows.map((row) => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      <td>
                        <strong>{row.name || "Без названия"}</strong>
                        <p>
                          {row.key} · {row.nextDate}
                        </p>
                      </td>
                      <td>
                        {row.property}
                        <p>{row.unit}</p>
                        <p>{row.equipment}</p>
                        <p>{row.responsible}</p>
                      </td>
                      <td>
                        <strong>
                          {
                            {
                              ready: "Готово",
                              exists: "Уже загружен",
                              error: "Ошибка",
                            }[row.status]
                          }
                        </strong>
                        {row.messages.map((m, i) => (
                          <p key={i}>{m}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          </>
        )}
      </div>
    </Disclosure>
  );
}
