SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE TABLE warehouse.service_teams (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  id text PRIMARY KEY, property_id text NOT NULL REFERENCES warehouse.properties(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL, member_ids jsonb NOT NULL CHECK (jsonb_typeof(member_ids)='array'), active boolean NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE warehouse.dispatch_rules (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  id text PRIMARY KEY, property_id text NOT NULL REFERENCES warehouse.properties(id) DEFERRABLE INITIALLY DEFERRED,
  category text NOT NULL, team_id text NOT NULL REFERENCES warehouse.service_teams(id) DEFERRABLE INITIALLY DEFERRED,
  reviewer_id text NOT NULL REFERENCES warehouse.users(id) DEFERRABLE INITIALLY DEFERRED,
  active boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(property_id,category)
);
ALTER TABLE warehouse.ticket_workflows ADD COLUMN team_id text REFERENCES warehouse.service_teams(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE warehouse.ticket_workflows ADD COLUMN reviewer_id text REFERENCES warehouse.users(id) DEFERRABLE INITIALLY DEFERRED;
