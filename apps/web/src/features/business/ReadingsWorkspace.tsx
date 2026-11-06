import { ActionIcon } from "./ActionIcon";
import { SidePanel } from "../../ui/SidePanel";
import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { useSurfaceView } from "../operations/useSurfaceView";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./readings-photo.css";
import type {
  ReadingPeriod,
  ReadingSubmission,
} from "../../../../../packages/contracts/src/business-workflows";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { apiRequest, runtimeApiBase } from "../../api/client";
import {
  Button,
  IconButton,
  Checkbox,
  Input,
  Select,
  Textarea,
} from "../../ui";
import {
  Feedback,
  Register,
  date,
  downloadDocument,
  uploadDocument,
  useResource,
} from "./shared";
type Meter = {
  id: string;
  propertyId: string;
  unitId: string | null;
  name: string;
  initialValue: number;
  active: boolean;
  responsibleId: string | null;
  integrationStatus?: "local" | "linked" | "pending" | "failed" | "applied";
  registrationId?: string | null;
  sourceId?: string | null;
};
type Data = {
  meters: Meter[];
  periods: ReadingPeriod[];
  submissions: ReadingSubmission[];
  readings: {
    id: string;
    meterId: string;
    period: string;
    value: number;
    consumption: number;
  }[];
  accounts: {
    id: string;
    number: string;
    unitId: string;
    sourceName: string;
    sourceId?: string;
  }[];
};
const readingMonthLabel = (value: string) => {
  if (!/^\d{4}-\d{2}/.test(value)) return "Месяц не выбран";
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
    .replace(/\s*г\.$/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const monthBounds = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return { startsOn: "", endsOn: "" };
  const [year, number] = month.split("-").map(Number);
  return {
    startsOn: `${month}-01`,
    endsOn: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
  };
};
function ReadingPhotoField({ required }: { required: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const choose = (next: File | null) => {
    const failure = next
      ? !["image/jpeg", "image/png", "image/webp"].includes(next.type)
        ? "Выберите фотографию JPG, PNG или WebP."
        : next.size > 12 * 1024 * 1024
          ? "Фотография больше 12 МБ. Выберите файл поменьше."
          : ""
      : "";
    setError(failure);
    input.current?.setCustomValidity(failure);
    setFile(failure ? null : next);
  };
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      setFile(null);
      setError("");
      input.current?.setCustomValidity("");
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return (
    <div className="reading-photo-picker">
      <span>Фотография прибора {required && <small>Обязательно</small>}</span>
      <div className="reading-photo-picker__control">
        <label
          className={`reading-photo-trigger${dragging ? " reading-photo-trigger--dragging" : ""}${error ? " reading-photo-trigger--error" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            )
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const next = event.dataTransfer.files[0];
            if (!next || !input.current) return;
            const transfer = new DataTransfer();
            transfer.items.add(next);
            input.current.files = transfer.files;
            choose(next);
            input.current.dispatchEvent(new Event("change", { bubbles: true }));
          }}
        >
          {preview ? (
            <img
              className="reading-photo-preview"
              src={preview}
              alt={`Фотография прибора: ${file?.name ?? ""}`}
            />
          ) : (
            <span className="reading-photo-empty">
              <span className="reading-photo-trigger__icon" aria-hidden="true">
                <ActionIcon name="upload" />
              </span>
              <strong>Загрузить фотографию</strong>
              <span>Выберите файл или перетащите его сюда</span>
            </span>
          )}
          <Input
            ref={input}
            className="reading-photo-native"
            aria-label="Фотография прибора"
            aria-describedby={descriptionId}
            aria-invalid={error ? true : undefined}
            name="photo"
            type="file"
            required={required}
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <div className="reading-photo-meta">
            <span>{file.name}</span>
            <div className="reading-photo-actions">
              <IconButton
                label="Скачать выбранную фотографию"
                onClick={() => {
                  if (!preview) return;
                  const link = document.createElement("a");
                  link.href = preview;
                  link.download = file.name;
                  link.click();
                }}
              >
                <ActionIcon name="download" />
              </IconButton>
              <IconButton
                label="Убрать фотографию прибора"
                onClick={() => {
                  if (input.current) {
                    input.current.value = "";
                    input.current.dispatchEvent(
                      new Event("change", { bubbles: true }),
                    );
                  }
                  choose(null);
                }}
              >
                <ActionIcon name="close" />
              </IconButton>
            </div>
          </div>
        )}
      </div>
      <small
        id={descriptionId}
        className={error ? "reading-photo-error" : "field-hint"}
        role={error ? "alert" : undefined}
      >
        {error || "JPG, PNG или WebP · до 12 МБ"}
      </small>
    </div>
  );
}
function StoredReadingPhoto({
  token,
  documentId,
}: {
  token: string;
  documentId: string;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [extension, setExtension] = useState("jpg");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true,
      objectUrl = "";
    setPreview("");
    setError("");
    void fetch(`${runtimeApiBase}/api/documents/${documentId}/file`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error("Не удалось открыть фотографию. Попробуйте ещё раз.");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        setExtension(
          blob.type === "image/png"
            ? "png"
            : blob.type === "image/webp"
              ? "webp"
              : "jpg",
        );
      })
      .catch((failure) => {
        if (active && !controller.signal.aborted)
          setError(
            failure instanceof Error && failure.message.startsWith("Не удалось")
              ? failure.message
              : "Не удалось открыть фотографию. Попробуйте ещё раз.",
          );
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, token, attempt]);
  return (
    <div className="reading-stored-photo">
      {preview ? (
        <>
          <a
            className="reading-stored-photo__open"
            href={preview}
            target="_blank"
            rel="noopener"
            aria-label="Открыть фотографию прибора в новом окне"
          >
            <img
              src={preview}
              alt="Фотография прибора, прикреплённая к показанию"
            />
            <span>
              <ActionIcon name="zoomIn" />
              Открыть
            </span>
          </a>
          <div className="reading-stored-photo__actions">
            <IconButton
              label="Скачать фотографию прибора"
              onClick={() => {
                const link = document.createElement("a");
                link.href = preview;
                link.download = `Показание.${extension}`;
                link.click();
              }}
            >
              <ActionIcon name="download" />
            </IconButton>
          </div>
        </>
      ) : error ? (
        <div className="reading-stored-photo__status">
          <p role="alert">{error}</p>
          <Button onClick={() => retry((value) => value + 1)}>Повторить</Button>
        </div>
      ) : (
        <p className="reading-stored-photo__status field-hint" role="status">
          Открываем фотографию…
        </p>
      )}
    </div>
  );
}
export function ReadingsWorkspace({
  workerId,
  initialMeterId = "",
  onCreateMeter,
}: {
  workerId?: string;
  initialMeterId?: string;
  onCreateMeter?: () => void;
}) {
  const { session, overview, refreshWorkspace } = useWorkspace(),
    { token, user } = session;
  const resource = useResource<Data>(token, "/api/readings", {
    meters: [],
    periods: [],
    submissions: [],
    readings: [],
    accounts: [],
  });
  const [selected, setSelected] = useState(""),
    [meterId, setMeterId] = useState(initialMeterId),
    [periodId, setPeriodId] = useState(""),
    [readingMonth, setReadingMonth] = useState(() =>
      new Date().toISOString().slice(0, 7),
    ),
    [periodMonth, setPeriodMonth] = useState(() =>
      new Date().toISOString().slice(0, 7),
    ),
    [periodDates, setPeriodDates] = useState(() =>
      monthBounds(new Date().toISOString().slice(0, 7)),
    ),
    [reviewAccepted, setReviewAccepted] = useState(true),
    [status, setStatus] = useState("");
  const canSubmit = hasPermission(user, "readings.submit");
  const canManagePeriods =
    hasPermission(user, "meters.write") && user.role !== "worker";
  const showPeriods =
    canManagePeriods || hasPermission(user, "readings.review");
  const [storedView, setView] = useSurfaceView(
    `wirehouse.view.readings:${user.id}:${workerId ?? "workspace"}`,
    "submissions",
    ["submissions", "periods"] as const,
  );
  const view =
    storedView === "periods" && showPeriods ? "periods" : "submissions";
  const [panel, setPanel] = useState<"send" | "period" | null>(
    initialMeterId && canSubmit ? "send" : null,
  );
  const [dirty, setDirty] = useState(false),
    [reviewDirty, setReviewDirty] = useState(false),
    [photoEditing, setPhotoEditing] = useState(false),
    [photoDirty, setPhotoDirty] = useState(false);
  useEffect(() => {
    setReviewAccepted(true);
    setReviewDirty(false);
    setPhotoEditing(false);
    setPhotoDirty(false);
  }, [selected]);
  useEffect(() => {
    if (initialMeterId) {
      setMeterId(initialMeterId);
      setPeriodId("");
      setReadingMonth(new Date().toISOString().slice(0, 7));
      setDirty(false);
      if (canSubmit) setPanel("send");
    }
  }, [initialMeterId]);
  const { data } = resource,
    meter = data.meters.find((m) => m.id === meterId),
    period = data.periods.find(
      (p) =>
        p.id === periodId &&
        p.startsOn.slice(0, 7) === readingMonth &&
        p.propertyId === meter?.propertyId,
    ),
    current = data.submissions.find((s) => s.id === selected),
    today = new Date().toISOString().slice(0, 10);
  const meters = data.meters.filter(
    (m) => m.active && (!workerId || m.responsibleId === workerId),
  );
  const latest = meter
    ? data.readings
        .filter((r) => r.meterId === meter.id)
        .sort((a, b) => b.period.localeCompare(a.period))[0]
    : null;
  const availablePeriods = data.periods.filter(
    (p) =>
      p.propertyId === meter?.propertyId &&
      p.startsOn.slice(0, 7) === readingMonth &&
      p.startsOn <= today &&
      p.endsOn >= today,
  );
  useEffect(() => {
    setPeriodId((currentId) =>
      availablePeriods.some((p) => p.id === currentId)
        ? currentId
        : availablePeriods.length === 1
          ? availablePeriods[0].id
          : "",
    );
  }, [meterId, readingMonth, data.periods, today]);
  const existingSubmission = meter
    ? data.submissions.find(
        (row) =>
          row.meterId === meter.id &&
          row.status !== "rejected" &&
          (row.periodId === periodId ||
            (row.status === "accepted" &&
              data.periods
                .find((p) => p.id === row.periodId)
                ?.startsOn.slice(0, 7) === readingMonth)),
      )
    : undefined;
  const monthAlreadyAccepted = Boolean(
    readingMonth && latest && latest.period >= readingMonth,
  );
  const sendBlocked = Boolean(existingSubmission || monthAlreadyAccepted);
  const accountRequired = user.role === "tenant" || Boolean(meter?.sourceId);
  const availableAccounts = data.accounts.filter(
    (account) =>
      account.unitId === meter?.unitId &&
      (!meter?.sourceId || account.sourceId === meter.sourceId),
  );
  const corrections = [...(current?.photoCorrections ?? [])].sort((a, b) =>
    a.correctedAt.localeCompare(b.correctedAt),
  );
  const lastCorrection = corrections.at(-1);
  const canCorrectPhoto =
    ["admin", "manager"].includes(user.role) &&
    hasPermission(user, "readings.review");
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!meter || !period || sendBlocked) {
      resource.setError(
        sendBlocked
          ? "За этот месяц показание уже передано. Откройте его в списке."
          : "Выберите прибор и открытый месяц ввода.",
      );
      return;
    }
    const form = e.currentTarget,
      v = new FormData(form);
    void resource
      .run(async () => {
        const file = v.get("photo");
        let photoDocumentId = null;
        if (file instanceof File && file.size)
          photoDocumentId = (
            await uploadDocument(
              token,
              file,
              [{ entityType: "meters", entityId: meterId }],
              "photo",
            )
          ).item.id;
        await apiRequest("/api/readings/submissions", {
          token,
          method: "POST",
          body: {
            meterId,
            periodId,
            accountId: v.get("accountId") || null,
            value: Number(v.get("value")),
            photoDocumentId,
          },
        });
        form.reset();
      }, "Показание отправлено инженеру на проверку")
      .then((saved) => {
        if (saved) {
          setDirty(false);
          setPanel(null);
        }
      });
  };
  return (
    <section className="business-stack readings-workspace">
      <Feedback {...resource} />
      {showPeriods && (
        <WorkspaceTabs
          idPrefix="readings-view"
          label="Работа с показаниями"
          value={view}
          onChange={(id) => setView(id as typeof view)}
          items={[
            { id: "submissions", label: "Переданные" },
            { id: "periods", label: "Периоды ввода" },
          ]}
        />
      )}
      <div
        role="tabpanel"
        id={`readings-view-panel-${view}`}
        aria-labelledby={showPeriods ? `readings-view-tab-${view}` : undefined}
        className="workspace-pane"
      >
        {view === "submissions" && (
          <>
            <Register
              title="Показания"
              action={
                canSubmit || (onCreateMeter && canManagePeriods) ? (
                  <div className="readings-actions">
                    {onCreateMeter && canManagePeriods && (
                      <IconButton
                        label="Добавить прибор"
                        onClick={onCreateMeter}
                      >
                        <ActionIcon name="plus" />
                      </IconButton>
                    )}
                    {canSubmit && (
                      <IconButton
                        label="Передать показание"
                        variant="primary"
                        onClick={() => {
                          resource.setError("");
                          setDirty(false);
                          setPanel("send");
                        }}
                      >
                        <ActionIcon name="upload" />
                      </IconButton>
                    )}
                  </div>
                ) : undefined
              }
              rows={data.submissions.filter(
                (s) =>
                  (!status || s.status === status) &&
                  (!workerId || meters.some((m) => m.id === s.meterId)),
              )}
              selectedId={selected}
              onSelect={(s) => setSelected(s.id)}
              searchText={(s) =>
                `${data.meters.find((m) => m.id === s.meterId)?.name} ${data.periods.find((p) => p.id === s.periodId)?.name} ${readingMonthLabel(data.periods.find((p) => p.id === s.periodId)?.startsOn ?? "")}`
              }
              columns={[
                {
                  key: "meter",
                  label: "Прибор / период",
                  render: (s) => (
                    <>
                      {data.meters.find((m) => m.id === s.meterId)?.name}
                      <small>
                        {readingMonthLabel(
                          data.periods.find((p) => p.id === s.periodId)
                            ?.startsOn ?? "",
                        )}
                      </small>
                    </>
                  ),
                },
                {
                  key: "value",
                  label: "Показание",
                  render: (s) => (
                    <>
                      {s.previous} → {s.value}
                      <small>
                        Расход: {Number((s.value - s.previous).toFixed(3))}
                      </small>
                    </>
                  ),
                },
                {
                  key: "status",
                  label: "Проверка",
                  render: (s) => (
                    <>
                      {
                        {
                          pending: "На проверке",
                          accepted: "Принято",
                          rejected: "Отклонено",
                        }[s.status]
                      }
                      {s.anomaly && <small>Отклонение расхода</small>}
                    </>
                  ),
                },
                {
                  key: "date",
                  label: "Отправлено",
                  render: (s) => date(s.createdAt),
                  optional: true,
                },
              ]}
              filters={
                <label>
                  Решение
                  <Select
                    aria-label="Решение"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="pending">На проверке</option>
                    <option value="accepted">Принято</option>
                    <option value="rejected">Отклонено</option>
                  </Select>
                </label>
              }
            />
          </>
        )}
        {view === "periods" && showPeriods && (
          <Register
            title="Периоды ввода"
            rows={data.periods}
            searchText={(p) =>
              `${readingMonthLabel(p.startsOn)} ${p.name} ${overview.properties.find((v) => v.id === p.propertyId)?.name ?? ""}`
            }
            action={
              canManagePeriods ? (
                <IconButton
                  label="Открыть период ввода"
                  variant="primary"
                  onClick={() => {
                    resource.setError("");
                    setDirty(false);
                    setPanel("period");
                  }}
                >
                  <ActionIcon name="plus" />
                </IconButton>
              ) : undefined
            }
            columns={[
              {
                key: "name",
                label: "Месяц",
                render: (p) => <strong>{readingMonthLabel(p.startsOn)}</strong>,
              },
              {
                key: "property",
                label: "Объект",
                render: (p) =>
                  overview.properties.find((v) => v.id === p.propertyId)
                    ?.name ?? "—",
              },
              {
                key: "dates",
                label: "Период",
                render: (p) => `${date(p.startsOn)} — ${date(p.endsOn)}`,
              },
              {
                key: "photo",
                label: "Фотография",
                render: (p) =>
                  p.photoRequired ? "Обязательна" : "Необязательна",
              },
              {
                key: "threshold",
                label: "Порог расхода",
                render: (p) => `${p.thresholdPercent}%`,
              },
            ]}
          />
        )}
      </div>
      {current && !panel && (
        <SidePanel
          title={
            data.meters.find((m) => m.id === current.meterId)?.name ??
            "Показание"
          }
          description={readingMonthLabel(
            data.periods.find((p) => p.id === current.periodId)?.startsOn ?? "",
          )}
          onClose={() => setSelected("")}
          busy={resource.busy}
          dirty={reviewDirty || photoDirty}
        >
          <Feedback error={resource.error} notice={resource.notice} />
          <dl className="business-stats">
            <div>
              <dt>Предыдущее</dt>
              <dd>{current.previous}</dd>
            </div>
            <div>
              <dt>Новое</dt>
              <dd>{current.value}</dd>
            </div>
            <div>
              <dt>Расход</dt>
              <dd>{Number((current.value - current.previous).toFixed(3))}</dd>
            </div>
          </dl>
          {current.anomaly && (
            <p className="notice">
              Расход отличается от предыдущего периода больше допустимого
              порога. Решение требует обоснования инженера.
            </p>
          )}
          <section
            className="reading-photo-record"
            aria-label="Фотография показания"
          >
            <div className="reading-photo-record__head">
              <h3>Фотография прибора</h3>
              {canCorrectPhoto && !photoEditing && (
                <IconButton
                  disabled={resource.busy}
                  label={
                    current.photoDocumentId
                      ? "Уточнить фотографию"
                      : "Добавить фотографию"
                  }
                  onClick={() => {
                    setPhotoEditing(true);
                    setPhotoDirty(false);
                    resource.setError("");
                  }}
                >
                  <ActionIcon name="upload" />
                </IconButton>
              )}
            </div>
            {lastCorrection && (
              <div className="reading-photo-correction-note">
                <strong>Фотография уточнена</strong>
                <p>{lastCorrection.reason}</p>
                <small>
                  {new Date(lastCorrection.correctedAt).toLocaleString(
                    "ru-RU",
                    { dateStyle: "medium", timeStyle: "short" },
                  )}{" "}
                  · {lastCorrection.actorName || "Сотрудник"}
                </small>
              </div>
            )}
            {photoEditing ? (
              <form
                className="form-grid"
                onChange={() => setPhotoDirty(true)}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget,
                    values = new FormData(form),
                    file = values.get("photo");
                  if (!(file instanceof File) || !file.size) return;
                  void resource
                    .run(async () => {
                      const uploaded = await uploadDocument(
                        token,
                        file,
                        [{ entityType: "meters", entityId: current.meterId }],
                        "photo",
                      );
                      await apiRequest(
                        `/api/readings/submissions/${current.id}/photo`,
                        {
                          token,
                          method: "PUT",
                          body: {
                            updatedAt: current.updatedAt,
                            photoDocumentId: uploaded.item.id,
                            reason: values.get("reason"),
                          },
                        },
                      );
                      form.reset();
                    }, "Фотография уточнена")
                    .then((saved) => {
                      if (saved) {
                        setPhotoEditing(false);
                        setPhotoDirty(false);
                      }
                    });
                }}
              >
                <ReadingPhotoField required />
                <label className="reading-photo-reason">
                  Причина замены
                  <Textarea
                    name="reason"
                    required
                    maxLength={10000}
                    placeholder="Чем новая фотография уточняет показание"
                  />
                </label>
                <div className="reading-submit-actions reading-photo-save-actions">
                  <Button variant="primary" type="submit" busy={resource.busy}>
                    Сохранить фотографию
                  </Button>
                  <Button
                    disabled={resource.busy}
                    onClick={() => {
                      setPhotoEditing(false);
                      setPhotoDirty(false);
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              </form>
            ) : current.photoDocumentId ? (
              <StoredReadingPhoto
                token={token}
                documentId={current.photoDocumentId}
              />
            ) : (
              <p className="field-hint">Фотография не прикреплена.</p>
            )}
            {corrections.length > 0 && (
              <div className="reading-photo-history">
                <h4>История фотографий</h4>
                <ul>
                  {corrections.map((correction) => (
                    <li key={correction.id}>
                      <div>
                        <strong>
                          {new Date(correction.correctedAt).toLocaleString(
                            "ru-RU",
                            { dateStyle: "medium", timeStyle: "short" },
                          )}{" "}
                          · {correction.actorName || "Сотрудник"}
                        </strong>
                        {correction.id !== lastCorrection?.id && (
                          <p>{correction.reason}</p>
                        )}
                        <small>
                          {correction.previousPhotoDocumentId
                            ? "Предыдущая фотография сохранена"
                            : "Фотография добавлена"}
                        </small>
                      </div>
                      {correction.previousPhotoDocumentId && (
                        <IconButton
                          label={`Скачать фотографию до уточнения от ${date(correction.correctedAt)}`}
                          onClick={() =>
                            void resource.run(
                              () =>
                                downloadDocument(
                                  token,
                                  correction.previousPhotoDocumentId!,
                                  "Предыдущее показание.jpg",
                                ),
                              "Предыдущая фотография скачана",
                            )
                          }
                        >
                          <ActionIcon name="download" />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          {current.reason && <p>Решение: {current.reason}</p>}
          {current.status === "pending" &&
            !photoEditing &&
            hasPermission(user, "readings.review") && (
              <form
                key={current.id}
                className="form-grid"
                onChange={() => setReviewDirty(true)}
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget);
                  void resource
                    .run(async () => {
                      await apiRequest(
                        `/api/readings/submissions/${current.id}/review`,
                        {
                          token,
                          method: "POST",
                          body: {
                            updatedAt: current.updatedAt,
                            accepted: reviewAccepted,
                            reason: v.get("reason"),
                          },
                        },
                      );
                      await refreshWorkspace();
                    }, "Решение сохранено")
                    .then((saved) => {
                      if (saved) setReviewDirty(false);
                    });
                }}
              >
                <label>
                  Решение инженера
                  <Select
                    name="accepted"
                    aria-label="Решение инженера"
                    value={String(reviewAccepted)}
                    onChange={(e) =>
                      setReviewAccepted(e.target.value === "true")
                    }
                  >
                    <option value="true">Принять</option>
                    <option value="false">
                      Отклонить и запросить повторный ввод
                    </option>
                  </Select>
                </label>
                <label>
                  Обоснование
                  <Textarea
                    name="reason"
                    required={current.anomaly || !reviewAccepted}
                    maxLength={10000}
                  />
                </label>
                <Button variant="primary" type="submit" busy={resource.busy}>
                  Сохранить решение
                </Button>
              </form>
            )}
        </SidePanel>
      )}
      {canManagePeriods && panel === "period" && (
        <SidePanel
          title="Открыть период ввода"
          onClose={() => setPanel(null)}
          busy={resource.busy}
          dirty={dirty}
        >
          <Feedback error={resource.error} loading={resource.loading} />
          <form
            className="form-grid"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                v = new FormData(form);
              void resource
                .run(async () => {
                  await apiRequest("/api/readings/periods", {
                    token,
                    method: "POST",
                    body: {
                      propertyId: v.get("propertyId"),
                      name: v.get("name"),
                      startsOn: v.get("startsOn"),
                      endsOn: v.get("endsOn"),
                      photoRequired: v.get("photoRequired") === "on",
                      thresholdPercent: Number(v.get("thresholdPercent")),
                    },
                  });
                  form.reset();
                }, "Период ввода открыт")
                .then((saved) => {
                  if (saved) {
                    setDirty(false);
                    setPanel(null);
                  }
                });
            }}
          >
            <label>
              Объект
              <Select name="propertyId" aria-label="Объект" required>
                <option value="">Выберите</option>
                {overview.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Месяц
              <Input
                aria-label="Месяц периода"
                type="month"
                required
                value={periodMonth}
                onChange={(event) => {
                  setPeriodMonth(event.target.value);
                  setPeriodDates(monthBounds(event.target.value));
                }}
              />
              <Input
                name="name"
                type="hidden"
                value={readingMonthLabel(periodMonth)}
              />
            </label>
            <label>
              Начало приёма
              <Input
                name="startsOn"
                type="date"
                required
                min={monthBounds(periodMonth).startsOn}
                max={monthBounds(periodMonth).endsOn}
                value={periodDates.startsOn}
                onChange={(event) =>
                  setPeriodDates((dates) => ({
                    ...dates,
                    startsOn: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Окончание приёма
              <Input
                name="endsOn"
                type="date"
                required
                min={periodDates.startsOn || monthBounds(periodMonth).startsOn}
                max={monthBounds(periodMonth).endsOn}
                value={periodDates.endsOn}
                onChange={(event) =>
                  setPeriodDates((dates) => ({
                    ...dates,
                    endsOn: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Порог изменения расхода, %
              <Input
                name="thresholdPercent"
                type="number"
                min="1"
                max="10000"
                defaultValue="50"
                required
              />
            </label>
            <Checkbox name="photoRequired" defaultChecked>
              Обязательная фотография
            </Checkbox>
            <Button variant="primary" type="submit" busy={resource.busy}>
              Открыть период
            </Button>
          </form>
        </SidePanel>
      )}
      {canSubmit && panel === "send" && (
        <SidePanel
          title="Передать показание"
          onClose={() => setPanel(null)}
          busy={resource.busy}
          dirty={dirty}
        >
          <Feedback error={resource.error} loading={resource.loading} />
          <form
            className="form-grid reading-submit-form"
            onSubmit={send}
            onChange={() => setDirty(true)}
          >
            <label>
              Прибор
              <Select
                aria-label="Прибор"
                required
                value={meterId}
                onChange={(e) => {
                  setMeterId(e.target.value);
                  setPeriodId("");
                }}
              >
                <option value="">Выберите прибор</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ·{" "}
                    {overview.units.find((u) => u.id === m.unitId)?.number ??
                      "Общий"}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Месяц показания
              <Input
                aria-label="Месяц показания"
                name="readingMonth"
                type="month"
                required
                value={readingMonth}
                disabled={!meter}
                onChange={(event) => setReadingMonth(event.target.value)}
              />
              {period && (
                <small className="field-hint">
                  Приём до {date(period.endsOn)}
                </small>
              )}
            </label>
            <Input name="periodId" type="hidden" value={periodId} />
            {availablePeriods.length > 1 && (
              <label>
                Даты приёма
                <Select
                  aria-label="Даты приёма"
                  required
                  value={periodId}
                  onChange={(event) => setPeriodId(event.target.value)}
                >
                  <option value="">Выберите даты</option>
                  {availablePeriods.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {date(candidate.startsOn)} — {date(candidate.endsOn)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {meter && availablePeriods.length === 0 && (
              <p className="field-hint">
                {readingMonth
                  ? `На ${readingMonthLabel(readingMonth).toLocaleLowerCase("ru-RU")} нет открытого периода ввода. Его открывает управляющий.`
                  : "Выберите месяц показания."}
              </p>
            )}
            {meter && sendBlocked && (
              <div className="reading-existing" role="status">
                <div>
                  <strong>
                    {existingSubmission?.status === "pending"
                      ? "Показание уже на проверке"
                      : "Показание за этот месяц уже принято"}
                  </strong>
                  <p>
                    {existingSubmission
                      ? `${existingSubmission.previous} → ${existingSubmission.value}. Повторно отправлять его не нужно.`
                      : "Выберите другой прибор или следующий открытый месяц."}
                  </p>
                </div>
                {existingSubmission && (
                  <Button
                    variant="text"
                    onClick={() => {
                      setSelected(existingSubmission.id);
                      setDirty(false);
                      setPanel(null);
                    }}
                  >
                    Открыть показание
                  </Button>
                )}
              </div>
            )}
            {meter && !sendBlocked && (
              <Fragment key={meter.id}>
                {meter.integrationStatus === "pending" && (
                  <p className="field-hint">
                    Прибор регистрируется в 1С. Показание можно отправить
                    сейчас; инженер сможет принять его после подтверждения
                    регистрации.
                  </p>
                )}
                {meter.integrationStatus === "failed" && (
                  <p className="notice notice--error reading-submit-alert">
                    Регистрацию прибора в 1С нужно проверить. Обратитесь к
                    администратору.
                  </p>
                )}
                <p className="field-hint">
                  Предыдущее показание: {latest?.value ?? meter.initialValue}.{" "}
                  {period?.photoRequired ? "Фотография обязательна." : ""}
                </p>
                <label>
                  Лицевой счет
                  <Select
                    name="accountId"
                    aria-label="Лицевой счет"
                    required={accountRequired}
                    defaultValue={
                      accountRequired && availableAccounts.length === 1
                        ? availableAccounts[0].id
                        : ""
                    }
                  >
                    <option value="">
                      {accountRequired
                        ? "Выберите ЛС"
                        : "Без ЛС: внутренний учет"}
                    </option>
                    {availableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.number} · {a.sourceName}
                      </option>
                    ))}
                  </Select>
                  {accountRequired && !availableAccounts.length && (
                    <small className="field-hint">
                      Для этого прибора нет доступного лицевого счёта.
                      Обратитесь к управляющему.
                    </small>
                  )}
                </label>
                <label>
                  Новое показание
                  <Input
                    name="value"
                    type="number"
                    min={latest?.value ?? meter.initialValue}
                    required
                    step="any"
                  />
                </label>
                <ReadingPhotoField required={Boolean(period?.photoRequired)} />
              </Fragment>
            )}
            {!sendBlocked && (
              <div className="reading-submit-actions">
                <Button
                  variant="primary"
                  type="submit"
                  busy={resource.busy}
                  disabled={
                    !meter ||
                    !period ||
                    (accountRequired && !availableAccounts.length)
                  }
                >
                  Отправить на проверку
                </Button>
              </div>
            )}
          </form>
        </SidePanel>
      )}
    </section>
  );
}
