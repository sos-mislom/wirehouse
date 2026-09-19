DROP TABLE IF EXISTS public.app_state;
DROP FUNCTION IF EXISTS warehouse.reject_legacy_write();
ALTER TABLE warehouse.storage_control DROP CONSTRAINT storage_control_mode_check;
ALTER TABLE warehouse.storage_control DROP COLUMN mode;
