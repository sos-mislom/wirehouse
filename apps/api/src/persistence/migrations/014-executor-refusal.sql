SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE warehouse.ticket_workflows DROP CONSTRAINT ticket_workflows_state_check;
ALTER TABLE warehouse.ticket_workflows ADD CONSTRAINT ticket_workflows_state_check
  CHECK (state IN ('registered','awaiting_approval','assigned','in_progress','paused','awaiting_acceptance','accepted','closed','rejected','refused'));
