import type {
  EntityDocument,
  TicketWorkflow,
} from "../../../../../packages/contracts/src/business-workflows";
import { useRef } from "react";
import { IconButton, Input } from "../../ui";
import { ActionIcon } from "./shared";
import { cameraAccept } from "../../platform/photo";
export function TicketWorkPhotos({
  workflow: w,
  documents,
  canUpload,
  busy,
  onUpload,
  onDownload,
}: {
  workflow: Omit<TicketWorkflow, "amount"> & { amount: number | null };
  documents: EntityDocument[];
  canUpload: boolean;
  busy: boolean;
  onUpload: (file: File, phase: string) => void;
  onDownload: (document: EntityDocument) => void;
}) {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const photos = documents.filter(
      (d) =>
        d.category === "photo" &&
        d.links.some(
          (link) =>
            link.entityType === "tickets" &&
            link.entityId === w.ticketId &&
            ["before", "after"].includes(link.phase ?? ""),
        ),
    ),
    open = [
      "registered",
      "assigned",
      "awaiting_approval",
      "in_progress",
      "paused",
    ].includes(w.state);
  const current = (doc: EntityDocument, phase: string) =>
    doc.links.some(
      (l) =>
        l.entityType === "tickets" &&
        l.entityId === w.ticketId &&
        l.phase === phase &&
        l.revision === (phase === "before" ? w.termsVersion : w.resultVersion),
    );
  const older = photos.filter(
    (d) => !["before", "after"].some((phase) => current(d, phase)),
  );
  const files = (items: EntityDocument[]) => (
    <div className="work-proof-files">
      {items.map((d) => (
        <div className="work-proof-file" key={d.id}>
          <span>{d.name}</span>
          <IconButton
            label={`Скачать ${d.name}`}
            disabled={busy}
            onClick={() => onDownload(d)}
          >
            <ActionIcon name="download" />
          </IconButton>
        </div>
      ))}
    </div>
  );
  return (
    <section className="ticket-work-photos">
      <h3>
        Фотографии работ <small>{photos.length}</small>
      </h3>
      <div className="work-proof-grid">
        {["before", "after"].map((phase) => {
          const items = photos.filter((d) => current(d, phase)),
            upload =
              canUpload &&
              open &&
              (phase === "before" ||
                ["in_progress", "paused"].includes(w.state));
          return (
            <section key={phase}>
              <div className="work-proof-heading">
                <div>
                  <h4>
                    {phase === "before" ? "До начала работ" : "Результат работ"}
                  </h4>
                  <small>
                    {(
                      phase === "before"
                        ? w.requireBeforePhoto
                        : w.requireAfterPhoto
                    )
                      ? "Обязательно"
                      : "По желанию"}
                  </small>
                </div>
                {upload && (
                  <IconButton
                    label={
                      phase === "before"
                        ? "Добавить фото до начала работ"
                        : "Добавить фото результата"
                    }
                    disabled={busy}
                    onClick={() => fileInputs.current[phase]?.click()}
                  >
                    <ActionIcon name="plus" />
                  </IconButton>
                )}
              </div>
              {items.length ? (
                files(items)
              ) : (
                <p className="field-hint">Фотографий пока нет.</p>
              )}
              {upload && (
                <Input
                  type="file"
                  hidden
                  className="ticket-hidden-file"
                  ref={(element) => {
                    fileInputs.current[phase] = element;
                  }}
                  accept={cameraAccept("image/jpeg,image/png,image/webp")}
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) onUpload(file, phase);
                    e.currentTarget.value = "";
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
      {older.length > 0 && (
        <section className="ticket-older-photos">
          <h4>
            Предыдущие фотографии <small>{older.length}</small>
          </h4>
          {files(older)}
        </section>
      )}
    </section>
  );
}
