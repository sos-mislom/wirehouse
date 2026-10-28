ALTER TABLE warehouse.accounting_sources
  ADD COLUMN last_error text,
  ADD COLUMN last_run_id text,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN last_successful_at timestamptz;
