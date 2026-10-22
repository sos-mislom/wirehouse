-- The verified source snapshot is separate from local, editable properties.
-- Existing manual mappings intentionally have no verified snapshot.
ALTER TABLE warehouse.external_links ADD COLUMN payload_hash text;
ALTER TABLE warehouse.external_links ADD CONSTRAINT external_link_payload_hash
  CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$');
