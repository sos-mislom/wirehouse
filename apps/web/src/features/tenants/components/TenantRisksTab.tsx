import { useWorkspace } from "../../../app/WorkspaceContext";
import { formatDate } from "../../../shared/format";

export function TenantRisksTab() {
  const { tenantDetail, ui, locale, t } = useWorkspace();

  if (!tenantDetail) return null;

  return (
    <div className="mvp-stack">
      {tenantDetail.risks.length > 0 ? (
        tenantDetail.risks.map((risk) => (
          <article className="mvp-card" key={risk.id}>
            <strong>{risk.title}</strong>
            <p>{risk.owner}</p>
            <small>
              {ui.riskSeverity[risk.severity]} ·{" "}
              {formatDate(risk.dueDate, locale)}
            </small>
          </article>
        ))
      ) : (
        <div className="mvp-card">
          <div className="empty-state">{t.hints.noData}</div>
        </div>
      )}
    </div>
  );
}
