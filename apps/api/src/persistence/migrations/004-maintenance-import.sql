-- Stable source key survives manual plan edits and prevents repeated spreadsheet imports.
ALTER TABLE warehouse.maintenance_plans ADD COLUMN import_key text;
CREATE UNIQUE INDEX maintenance_plan_import_key_unique
  ON warehouse.maintenance_plans(property_id, import_key) WHERE import_key IS NOT NULL;
ALTER TABLE warehouse.maintenance_plans ADD CONSTRAINT maintenance_import_key_nonempty
  CHECK (import_key IS NULL OR length(trim(import_key)) BETWEEN 1 AND 120);
