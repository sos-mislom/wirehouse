CREATE INDEX exchange_inbox_created_idx ON warehouse.exchange_inbox (created_at DESC, _sequence DESC);
CREATE INDEX exchange_outbox_created_idx ON warehouse.exchange_outbox (created_at DESC, _sequence DESC);
