-- Normalized locations and operational workflows; forward-only data migration.

CREATE TABLE warehouse."buildings" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"name" text NOT NULL,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

CREATE TABLE warehouse."entrances" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"building_id" text NOT NULL,
"name" text NOT NULL,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

CREATE TABLE warehouse."floors" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"entrance_id" text NOT NULL,
"name" text NOT NULL,
"number" integer NOT NULL,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

CREATE TABLE warehouse."maintenance_templates" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"name" text NOT NULL,
"instructions" text,
"version" integer NOT NULL,
"checklist" jsonb,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

CREATE TABLE warehouse."contractors" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"name" text NOT NULL,
"inn" text,
"contact" text,
"active" boolean,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

CREATE TABLE warehouse."materials" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"name" text NOT NULL,
"unit" text NOT NULL,
"price" numeric NOT NULL,
"active" boolean,
"created_at" timestamptz,
"updated_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id"),
CHECK (price >= 0)
);

CREATE TABLE warehouse."estimates" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"ticket_id" text NOT NULL,
"contractor_id" text,
"status" text NOT NULL,
"name" text,
"created_by" text,
"submitted_by" text,
"approved_by" text,
"rejection_reason" text,
"version" integer NOT NULL,
"lines" jsonb NOT NULL,
"total" numeric NOT NULL,
"created_at" timestamptz,
"updated_at" timestamptz,
"approved_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id"),
CHECK (total >= 0),
CHECK (status IN ('draft','submitted','approved','rejected','acted'))
);

CREATE TABLE warehouse."service_acts" (
"id" text NOT NULL,
"property_id" text NOT NULL,
"estimate_id" text NOT NULL,
"ticket_id" text NOT NULL,
"number" text NOT NULL,
"issued_by" text,
"estimate_version" integer,
"snapshot" jsonb NOT NULL,
"total" numeric NOT NULL,
"date" date,
"created_at" timestamptz,
_sequence bigint GENERATED ALWAYS AS IDENTITY,
PRIMARY KEY ("id")
);

ALTER TABLE warehouse."users" ADD COLUMN "permissions" jsonb;

ALTER TABLE warehouse."units" ADD COLUMN "floor_id" text;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "floor_id" text;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "kind" text;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "source_name" text;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "geometry" jsonb;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "layers" jsonb;

ALTER TABLE warehouse."floor_plans" ADD COLUMN "version" integer;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "template_id" text;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "recurrence" text;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "interval_count" integer;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "anchor_day" integer;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "template_version" integer;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "lead_days" integer;

ALTER TABLE warehouse."maintenance_plans" ADD COLUMN "end_date" date;

ALTER TABLE warehouse."buildings" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."entrances" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."entrances" ADD FOREIGN KEY ("building_id") REFERENCES warehouse."buildings"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."floors" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."floors" ADD FOREIGN KEY ("entrance_id") REFERENCES warehouse."entrances"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."maintenance_templates" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."contractors" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."materials" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("contractor_id") REFERENCES warehouse."contractors"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("created_by") REFERENCES warehouse."users"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("submitted_by") REFERENCES warehouse."users"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."estimates" ADD FOREIGN KEY ("approved_by") REFERENCES warehouse."users"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."service_acts" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."service_acts" ADD FOREIGN KEY ("estimate_id") REFERENCES warehouse."estimates"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."service_acts" ADD FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."service_acts" ADD FOREIGN KEY ("issued_by") REFERENCES warehouse."users"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."units" ADD FOREIGN KEY ("floor_id") REFERENCES warehouse."floors"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."floor_plans" ADD FOREIGN KEY ("floor_id") REFERENCES warehouse."floors"(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE warehouse."maintenance_plans" ADD FOREIGN KEY ("template_id") REFERENCES warehouse."maintenance_templates"(id) DEFERRABLE INITIALLY DEFERRED;


-- Preserve distinct legacy labels, including explicit names matching default labels.
CREATE TEMP TABLE location_map ON COMMIT DROP AS SELECT id,property_id,
  coalesce(building,'') AS building,coalesce(entrance,'') AS entrance,floor,
  md5(jsonb_build_array(property_id,coalesce(building,''))::text) AS building_id,
  md5(jsonb_build_array(property_id,coalesce(building,''),coalesce(entrance,''))::text) AS entrance_id,
  md5(jsonb_build_array(property_id,coalesce(building,''),coalesce(entrance,''),floor)::text) AS floor_id FROM warehouse.units;
INSERT INTO warehouse.buildings(id,property_id,name,created_at,updated_at)
SELECT DISTINCT building_id,property_id,building,now(),now() FROM location_map;
INSERT INTO warehouse.entrances(id,property_id,building_id,name,created_at,updated_at)
SELECT DISTINCT entrance_id,property_id,building_id,entrance,now(),now() FROM location_map;
INSERT INTO warehouse.floors(id,property_id,entrance_id,number,name,created_at,updated_at)
SELECT DISTINCT floor_id,property_id,entrance_id,floor,'Этаж ' || floor,now(),now() FROM location_map;
UPDATE warehouse.units u SET floor_id=m.floor_id FROM location_map m WHERE u.id=m.id;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE warehouse.units ALTER COLUMN floor_id SET NOT NULL;
DROP INDEX warehouse.units_location_unique;
CREATE UNIQUE INDEX units_floor_number_unique ON warehouse.units(floor_id,number);
CREATE UNIQUE INDEX buildings_parent_unique ON warehouse.buildings(property_id,name);
CREATE UNIQUE INDEX entrances_parent_unique ON warehouse.entrances(building_id,name);
CREATE UNIQUE INDEX floors_parent_unique ON warehouse.floors(entrance_id,number);
ALTER TABLE warehouse.buildings ADD UNIQUE(id,property_id);
ALTER TABLE warehouse.entrances ADD UNIQUE(id,property_id);
ALTER TABLE warehouse.floors ADD UNIQUE(id,property_id);
ALTER TABLE warehouse.entrances ADD FOREIGN KEY(building_id,property_id) REFERENCES warehouse.buildings(id,property_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE warehouse.floors ADD FOREIGN KEY(entrance_id,property_id) REFERENCES warehouse.entrances(id,property_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE warehouse.units ADD FOREIGN KEY(floor_id,property_id) REFERENCES warehouse.floors(id,property_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE warehouse.floor_plans ADD FOREIGN KEY(floor_id,property_id) REFERENCES warehouse.floors(id,property_id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX service_act_estimate_unique ON warehouse.service_acts(estimate_id);
CREATE UNIQUE INDEX service_act_number_unique ON warehouse.service_acts(number);
CREATE INDEX audit_entity_idx ON warehouse.audit_log(entity_type,entity_id,created_at DESC);
CREATE INDEX audit_time_idx ON warehouse.audit_log(created_at DESC);
UPDATE warehouse.floor_plans SET kind='site',geometry='[]',layers='[]',version=1;
UPDATE warehouse.maintenance_plans SET recurrence='days',interval_count=interval_days,anchor_day=extract(day FROM next_date),lead_days=0;
ALTER TABLE warehouse.maintenance_plans DROP COLUMN interval_days;
ALTER TABLE warehouse.maintenance_plans ALTER COLUMN interval_count SET NOT NULL;
ALTER TABLE warehouse.maintenance_plans ADD CHECK(interval_count BETWEEN 1 AND 3660);
ALTER TABLE warehouse.maintenance_plans ADD CHECK(recurrence IN ('days','weeks','months','years'));
-- Historical records cannot be edited or removed, including through SQL repositories.
CREATE FUNCTION warehouse.protect_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical records are append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON warehouse.audit_log FOR EACH ROW EXECUTE FUNCTION warehouse.protect_history();
CREATE TRIGGER acts_append_only BEFORE UPDATE OR DELETE ON warehouse.service_acts FOR EACH ROW EXECUTE FUNCTION warehouse.protect_history();
