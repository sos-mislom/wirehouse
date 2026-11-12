-- Responses of completed commands, keyed by the client's Idempotency-Key.
-- A repeated request with the same key gets the stored response instead of
-- being executed twice (a retry after a lost response on a weak connection).
-- The row is written in the same transaction as the command itself.
CREATE TABLE warehouse.idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status integer NOT NULL CHECK (status BETWEEN 200 AND 299),
  headers jsonb NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
CREATE INDEX idempotency_keys_created_at
  ON warehouse.idempotency_keys (created_at);
