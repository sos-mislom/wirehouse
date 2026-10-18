-- Finish deferred checks from earlier data migrations before altering their table.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE warehouse.ticket_workflows ADD COLUMN estimate_id text;
ALTER TABLE warehouse.ticket_workflows ADD CONSTRAINT ticket_workflow_estimate_fk
  FOREIGN KEY (estimate_id) REFERENCES warehouse.estimates(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX service_act_ticket_unique ON warehouse.service_acts(ticket_id);

-- Existing data is bound only when the published estimate is unambiguous.
-- Several historical alternatives require an explicit new submission, never a time-based guess.
WITH candidates AS (
  SELECT ticket_id,min(id) AS estimate_id FROM warehouse.estimates
  WHERE status IN ('submitted','approved','acted') GROUP BY ticket_id HAVING count(*)=1
)
UPDATE warehouse.ticket_workflows w SET estimate_id=c.estimate_id FROM candidates c WHERE c.ticket_id=w.ticket_id;
UPDATE warehouse.ticket_workflows SET amount=0 WHERE NOT paid AND amount<>0;
UPDATE warehouse.ticket_workflows w SET state=CASE
  WHEN w.paid AND w.approved_version IS DISTINCT FROM w.terms_version THEN 'awaiting_approval'
  WHEN t.assigned_to IS NOT NULL THEN 'assigned' ELSE 'registered' END
FROM warehouse.tickets t WHERE t.id=w.ticket_id AND w.state IN ('registered','assigned');
