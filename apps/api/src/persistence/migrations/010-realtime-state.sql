CREATE TABLE warehouse.realtime_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  epoch uuid NOT NULL DEFAULT gen_random_uuid(),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO warehouse.realtime_state (id) VALUES (true);
