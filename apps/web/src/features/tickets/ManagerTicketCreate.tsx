import { useWorkspace } from "../../app/WorkspaceContext";
import {
  ticketCategoryOptions,
  ticketPriorityOptions,
} from "../../projectData";
import { Button, Input, Select, Textarea } from "../../ui";
export function ManagerTicketCreate() {
  const {
    setManagerScreen,
    managerUi,
    handleCreateTicket,
    t,
    handleFieldChange,
    setTicketForm,
    ticketForm,
    ticketUnits,
    busyAction,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => setManagerScreen("tickets")}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>{managerUi.titles.ticketCreate}</h2>
        </div>
      </div>

      <article className="mvp-card">
        <form
          className="form-grid form-grid--single"
          onSubmit={handleCreateTicket}
        >
          <label>
            <span>{t.fields.unit}</span>
            <Select
              name="unitId"
              onChange={handleFieldChange(setTicketForm)}
              value={ticketForm.unitId}
            >
              {ticketUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.propertyName} · {unit.number}
                </option>
              ))}
            </Select>
          </label>
          <div className="split-grid">
            <label>
              <span>{t.fields.category}</span>
              <Select
                name="category"
                onChange={handleFieldChange(setTicketForm)}
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
                onChange={handleFieldChange(setTicketForm)}
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
          <label>
            <span>{t.fields.title}</span>
            <Input
              name="title"
              onChange={handleFieldChange(setTicketForm)}
              value={ticketForm.title}
            />
          </label>
          <label>
            <span>{t.fields.description}</span>
            <Textarea
              name="description"
              onChange={handleFieldChange(setTicketForm)}
              rows={5}
              value={ticketForm.description}
            />
          </label>
          <Button
            variant="primary"
            className="primary-button"
            disabled={busyAction === "ticket-create"}
            type="submit"
          >
            {t.actions.create}
          </Button>
        </form>
      </article>
    </section>
  );
}
