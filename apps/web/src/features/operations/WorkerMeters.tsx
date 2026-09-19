import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "../../ui";
import { OperationsData, emptyData, request, resourceNames } from "./shared";
export function WorkerMeters({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const [data, setData] = useState<OperationsData>(emptyData);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () =>
    setData(await request<OperationsData>("/api/operations", token));
  useEffect(() => {
    let active = true;
    request<OperationsData>("/api/operations", token)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const meters = data.meters.filter(
    (m) => m.active && m.responsibleId === userId,
  );
  const submit = async (event: FormEvent<HTMLFormElement>, meterId: string) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/operations/meters/${meterId}/readings`,
        token,
        "POST",
        { period: body.get("period"), value: Number(body.get("value")) },
      );
      await load();
      form.reset();
      setNotice("Показание сохранено");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!meters.length && !error) return null;
  return (
    <article className="surface worker-meters">
      <h3>Мои счётчики</h3>
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
      {meters.map((m) => {
        const readings = data.readings
          .filter((r) => r.meterId === m.id)
          .sort((a, b) => b.period.localeCompare(a.period));
        return (
          <details key={m.id}>
            <summary>
              {m.name} · {resourceNames[m.resource]}
            </summary>
            <p>Предыдущее показание: {readings[0]?.value ?? m.initialValue}</p>
            <form
              className="form-grid"
              onSubmit={(event) => submit(event, m.id)}
            >
              <label>
                Месяц *
                <Input
                  name="period"
                  type="month"
                  required
                  defaultValue={new Date().toISOString().slice(0, 7)}
                  max={new Date().toISOString().slice(0, 7)}
                />
              </label>
              <label>
                Показание *
                <Input
                  name="value"
                  type="number"
                  step="any"
                  min={readings[0]?.value ?? m.initialValue}
                  required
                />
              </label>
              <Button
                variant="primary"
                type="submit"
                className="primary-button"
                disabled={busy}
              >
                Сохранить показание
              </Button>
            </form>
            <details>
              <summary>История показаний</summary>
              {readings.map((r) => (
                <p key={r.id}>
                  {r.period}: {r.previous} → {r.value} · расход {r.consumption}
                </p>
              ))}
            </details>
          </details>
        );
      })}
    </article>
  );
}
