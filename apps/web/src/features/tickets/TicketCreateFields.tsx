import { useWorkspace } from "../../app/WorkspaceContext";
import type { ChangeEvent } from "react";
import {
  ticketCategoryOptions,
  ticketPriorityOptions,
} from "../../projectData";
import { Input, Select, Textarea } from "../../ui";

export function TicketCreateFields({
  showChecklist = false,
}: {
  showChecklist?: boolean;
}) {
  const {
    t,
    locale,
    ticketUnits,
    ticketForm,
    setTicketForm,
    handleFieldChange,
    setError,
    selectedChecklistTemplate,
  } = useWorkspace();
  const change = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setError("");
    handleFieldChange(setTicketForm)(event);
  };
  return (
    <div className="ticket-create-grid">
      <label className="ticket-create-title">
        <span>{t.fields.title}</span>
        <Input
          name="title"
          required
          maxLength={300}
          onChange={change}
          value={ticketForm.title}
        />
      </label>
      <div className="ticket-create-context">
        <label>
          <span>{t.fields.unit}</span>
          <Select
            name="unitId"
            required
            onChange={change}
            value={ticketForm.unitId}
          >
            {ticketUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.number} · {unit.propertyName}
              </option>
            ))}
          </Select>
        </label>
        <div className="split-grid">
          <label>
            <span>{t.fields.category}</span>
            <Select
              name="category"
              required
              onChange={change}
              value={ticketForm.category}
            >
              {ticketCategoryOptions.map((option) => (
                <option key={option} value={option}>
                  {t.ticketCategories[option]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span>{t.fields.priority}</span>
            <Select
              name="priority"
              required
              onChange={change}
              value={ticketForm.priority}
            >
              {ticketPriorityOptions.map((option) => (
                <option key={option} value={option}>
                  {t.ticketPriorities[option]}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {showChecklist && selectedChecklistTemplate ? (
          <div className="checklist-template-preview">
            <strong>
              {locale === "ru" ? "Шаблон чек-листа" : "Checklist template"}
            </strong>
            {selectedChecklistTemplate.items.map((item) => (
              <span key={item.id}>{item.label}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ticket-create-content">
        <label>
          <span>{t.fields.description}</span>
          <Textarea
            name="description"
            required
            maxLength={10000}
            onChange={change}
            rows={5}
            value={ticketForm.description}
          />
        </label>
      </div>
    </div>
  );
}
