import { useState } from "react";
import { runtimeApiBase } from "../../api/client";
import { hasPermission } from "../../../../../packages/contracts/src/permissions";
import { useWorkspace } from "../../app/WorkspaceContext";
import { IconButton } from "../../ui";
import {
  ActionIcon,
  Feedback,
  Register,
  uploadDocument,
  useResource,
} from "./shared";
import "./document-templates.css";

type Template = {
  id: string;
  title: string;
  name?: string;
  description: string;
  category: string;
  entityTypes: string[];
  legalBasis?: { title: string; url: string }[];
};

async function getTemplate(
  token: string,
  item: Template,
  format: "pdf" | "docx",
  preview = false,
) {
  const opened = preview ? window.open("about:blank", "_blank") : null;
  if (opened) opened.opener = null;
  try {
    const response = await fetch(
      `${runtimeApiBase}/api/documents/templates/${encodeURIComponent(item.id)}/${format}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok)
      throw new Error("Не удалось открыть шаблон. Повторите загрузку.");
    const blob = await response.blob();
    if (!blob.size) throw new Error("Файл шаблона пуст.");
    const url = URL.createObjectURL(blob);
    if (opened) opened.location.href = url;
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${item.title || item.name}.${format}`;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (error) {
    opened?.close();
    throw error;
  }
}

export function DocumentTemplateLibrary({
  entityType,
  entityId,
  onAttached,
}: {
  entityType?: string;
  entityId?: string;
  onAttached: () => void;
}) {
  const { session } = useWorkspace();
  const query = entityType
    ? `?entityType=${encodeURIComponent(entityType)}${entityId ? `&entityId=${encodeURIComponent(entityId)}` : ""}`
    : "";
  const resource = useResource<{ items: Template[] }>(
    session.token,
    `/api/documents/templates${query}`,
    { items: [] },
  );
  const [selected, setSelected] = useState("");
  const run = (item: Template, format: "pdf" | "docx", preview = false) =>
    void resource.run(
      () => getTemplate(session.token, item, format, preview),
      "",
    );
  return (
    <div className="document-template-library">
      <Feedback {...resource} />
      <Register
        title="Шаблоны документов"
        rows={resource.data.items}
        searchText={(item) => `${item.title || item.name} ${item.description}`}
        selectedId={selected}
        onSelect={(item) => {
          setSelected(item.id);
          run(item, "pdf", true);
        }}
        columns={[
          {
            key: "title",
            label: "Документ",
            render: (item) => (
              <div className="document-template-name">
                <strong>{item.title || item.name}</strong>
                <small>{item.description}</small>
              </div>
            ),
          },
          {
            key: "files",
            label: "Файлы",
            render: (item) => (
              <div
                className="document-template-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <IconButton
                  label={`Открыть PDF: ${item.title || item.name}`}
                  busy={resource.busy}
                  onClick={() => run(item, "pdf", true)}
                >
                  <ActionIcon name="document" />
                </IconButton>
                <IconButton
                  label={`Скачать PDF: ${item.title || item.name}`}
                  busy={resource.busy}
                  onClick={() => run(item, "pdf")}
                >
                  <ActionIcon name="download" />
                </IconButton>
                <IconButton
                  label={`Скачать DOCX: ${item.title || item.name}`}
                  busy={resource.busy}
                  onClick={() => run(item, "docx")}
                >
                  <span className="document-template-format">DOCX</span>
                </IconButton>
                {entityType &&
                  entityId &&
                  hasPermission(session.user, "documents.write") && (
                    <IconButton
                      label={`Прикрепить шаблон: ${item.title || item.name}`}
                      busy={resource.busy}
                      onClick={() =>
                        void resource
                          .run(async () => {
                            const response = await fetch(
                              `${runtimeApiBase}/api/documents/templates/${item.id}/docx`,
                              {
                                headers: {
                                  Authorization: `Bearer ${session.token}`,
                                },
                              },
                            );
                            if (!response.ok)
                              throw new Error("Не удалось получить шаблон");
                            const file = new File(
                              [await response.blob()],
                              `${item.title || item.name}.docx`,
                              {
                                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                              },
                            );
                            await uploadDocument(
                              session.token,
                              file,
                              [{ entityType, entityId }],
                              ["contract", "act", "instruction"].includes(
                                item.category,
                              )
                                ? item.category
                                : "other",
                            );
                          }, "Шаблон прикреплён к документам")
                          .then((saved) => {
                            if (saved) onAttached();
                          })
                      }
                    >
                      <ActionIcon name="plus" />
                    </IconButton>
                  )}
              </div>
            ),
          },
        ]}
      />
      <p className="field-hint">
        PDF можно открыть и распечатать, DOCX — заполнить в Word. Это
        незаполненные формы без подписей.
      </p>
    </div>
  );
}
