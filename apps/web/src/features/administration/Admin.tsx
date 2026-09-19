import { useWorkspace } from "../../app/WorkspaceContext";
import { formatDateTime } from "../../shared/format";
import { Button } from "../../ui";
import { AdminForm } from "./AdminForm";
import { AdminRegistry } from "./AdminRegistry";
export function Admin() {
  const {
    t,
    adminPanel,
    setAdminPanel,
    ui,
    overview,
    productBrand,
    locale,
    downloadExport,
    managerUi,
  } = useWorkspace();
  return (
    <section className="section-grid admin-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.admin}</h3>
          </div>
        </div>
        <div className="chip-row">
          {(["property", "tenant", "unit", "lease"] as const).map((panel) => (
            <Button
              variant="plain"
              className={
                adminPanel === panel
                  ? "chip-button chip-button--active"
                  : "chip-button"
              }
              key={panel}
              onClick={() => setAdminPanel(panel)}
              type="button"
            >
              {panel === "property"
                ? t.sections.propertyForm
                : panel === "tenant"
                  ? t.sections.tenantForm
                  : panel === "unit"
                    ? t.sections.unitForm
                    : t.sections.leaseForm}
            </Button>
          ))}
        </div>
        {<AdminForm />}
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{t.sectionHeads.admin}</h3>
          </div>
        </div>
        <div className="stack-list">{<AdminRegistry />}</div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{ui.team}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.team.map((member) => (
            <div className="list-row" key={member.id}>
              <div>
                <strong>{member.fullName}</strong>
                <p>
                  {t.roles[member.role]} ·{" "}
                  {member.propertyName ?? productBrand.name}
                </p>
              </div>
              <div className="list-aside">
                <span title="Количество назначенных открытых заявок">
                  {member.assignedTicketCount} открытых заявок
                </span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <h3>{ui.exports}</h3>
          </div>
        </div>
        <div className="stack-list">
          {overview.exports.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.scope} · {item.format}
                </p>
              </div>
              <div className="list-aside">
                <span className={`status-pill status-pill--${item.status}`}>
                  {ui.exportStatus[item.status]}
                </span>
                <small>{formatDateTime(item.updatedAt, locale)}</small>
                <Button
                  variant="secondary"
                  className="secondary-button secondary-button--compact"
                  onClick={() => void downloadExport(item.id)}
                  type="button"
                >
                  {managerUi.open}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
