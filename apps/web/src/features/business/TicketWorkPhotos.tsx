import type {
  EntityDocument,
  TicketWorkflow,
} from "../../../../../packages/contracts/src/business-workflows";
import { Button, Input } from "../../ui";
import { ActionIcon, Disclosure } from "./shared";
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
  const photos = documents.filter((d) => d.category === "photo"),
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
        <Button
          key={d.id}
          variant="text"
          disabled={busy}
          onClick={() => onDownload(d)}
        >
          <ActionIcon name="download" />
          {d.name}
        </Button>
      ))}
    </div>
  );
  if (!photos.length && !(canUpload && open)) return null;
  return (
    <Disclosure
      title={`Фотографии работ · ${photos.length}`}
      open={w.state === "awaiting_acceptance"}
    >
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
              <h4>
                {phase === "before" ? "До начала работ" : "Результат работ"}
              </h4>
              {items.length ? (
                files(items)
              ) : (
                <p className="field-hint">Фотографий пока нет.</p>
              )}
              {upload && (
                <label className="business-file">
                  Добавить фото
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) onUpload(file, phase);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </section>
          );
        })}
      </div>
      {older.length > 0 && (
        <Disclosure title={`Другие фотографии · ${older.length}`}>
          {files(older)}
        </Disclosure>
      )}
    </Disclosure>
  );
}
