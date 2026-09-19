-- Version 1: typed entity tables. Applied once by the migration runner.
CREATE TABLE warehouse."properties" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "warehouse_class" text,
  "description" text,
  "total_area" numeric NOT NULL,
  "rentable_area" numeric NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (total_area > 0),
  CHECK (rentable_area >= 0 AND rentable_area <= total_area)
);

CREATE TABLE warehouse."tenants" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "inn" text NOT NULL,
  "contact_name" text,
  "phone" text NOT NULL,
  "email" text,
  "risk_level" text,
  "status" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."units" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "number" text NOT NULL,
  "building" text,
  "entrance" text,
  "photo_url" text,
  "type" text,
  "status" text,
  "temperature_regime" text,
  "area" numeric NOT NULL,
  "ceiling_height" numeric,
  "plan_x" numeric,
  "plan_y" numeric,
  "floor" integer,
  "has_ramp" integer,
  "has_gate" integer,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (area > 0),
  CHECK (has_ramp IN (0,1)),
  CHECK (has_gate IN (0,1))
);

CREATE TABLE warehouse."users" (
  "id" text NOT NULL,
  "email" text,
  "phone" text,
  "password_hash" text,
  "full_name" text NOT NULL,
  "role" text NOT NULL,
  "property_id" text,
  "tenant_id" text,
  "totp_secret" text,
  "totp_pending_secret" text,
  "specialty" text,
  "is_active" integer NOT NULL,
  "totp_enabled" integer,
  "created_at" timestamptz,
  "last_login_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (role IN ('admin','manager','worker','tenant')),
  CHECK (is_active IN (0,1)),
  CHECK (totp_enabled IN (0,1))
);

CREATE TABLE warehouse."leases" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "unit_id" text NOT NULL,
  "contract_number" text NOT NULL,
  "stage" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "rate_per_sqm" numeric,
  "deposit" numeric,
  "indexation_pct" numeric,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (end_date >= start_date),
  CHECK (rate_per_sqm >= 0),
  CHECK (deposit >= 0),
  CHECK (stage IN ('draft','formed','sent','signed','active','prolongation','terminated'))
);

CREATE TABLE warehouse."tickets" (
  "id" text NOT NULL,
  "number" text NOT NULL,
  "unit_id" text NOT NULL,
  "property_id" text NOT NULL,
  "tenant_id" text,
  "created_by" text,
  "assigned_to" text,
  "category" text,
  "priority" text,
  "status" text NOT NULL,
  "source_channel" text,
  "title" text NOT NULL,
  "description" text,
  "equipment_id" text,
  "service_id" text,
  "lease_id" text,
  "maintenance_plan_id" text,
  "sla_hours" numeric,
  "sla_due_at" timestamptz,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "resolved_at" timestamptz,
  "closed_at" timestamptz,
  "maintenance_date" date,
  "work_logs" jsonb,
  "checklist_items" jsonb,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."ticket_history" (
  "id" text NOT NULL,
  "ticket_id" text NOT NULL,
  "type" text,
  "from_status" text,
  "to_status" text,
  "reason" text,
  "created_by" text,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."ticket_comments" (
  "id" text NOT NULL,
  "ticket_id" text NOT NULL,
  "author_id" text NOT NULL,
  "source_channel" text,
  "content" text NOT NULL,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."ticket_attachments" (
  "id" text NOT NULL,
  "ticket_id" text NOT NULL,
  "file_name" text,
  "stored_name" text NOT NULL,
  "mime_type" text,
  "media_type" text,
  "note" text,
  "uploaded_by" text,
  "uploaded_by_name" text,
  "size_bytes" integer,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (size_bytes >= 0)
);

CREATE TABLE warehouse."tenant_notes" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "title" text,
  "content" text,
  "author_id" text,
  "author_name" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."tenant_note_attachments" (
  "id" text NOT NULL,
  "note_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "file_name" text,
  "stored_name" text NOT NULL,
  "mime_type" text,
  "uploaded_by" text,
  "uploaded_by_name" text,
  "size_bytes" integer,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (size_bytes >= 0)
);

CREATE TABLE warehouse."lease_documents" (
  "id" text NOT NULL,
  "lease_id" text NOT NULL,
  "file_name" text,
  "stored_name" text NOT NULL,
  "document_category" text,
  "mime_type" text,
  "uploaded_by" text,
  "uploaded_by_name" text,
  "size_bytes" integer,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (size_bytes >= 0)
);

CREATE TABLE warehouse."lease_followups" (
  "lease_id" text NOT NULL,
  "status" text,
  "note" text,
  "updated_by" text,
  "version" integer,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("lease_id"),
  CHECK (version > 0),
  CHECK (status IN ('pending','contacted','renewing','leaving'))
);

CREATE TABLE warehouse."billing_invoices" (
  "id" text NOT NULL,
  "lease_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "unit_id" text NOT NULL,
  "period" text NOT NULL,
  "status" text,
  "rent_amount" numeric,
  "variable_amount" numeric,
  "total_amount" numeric NOT NULL,
  "due_date" date,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (rent_amount >= 0),
  CHECK (variable_amount >= 0),
  CHECK (total_amount >= 0),
  CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

CREATE TABLE warehouse."billing_payments" (
  "id" text NOT NULL,
  "invoice_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "method" text,
  "reference" text,
  "amount" numeric NOT NULL,
  "paid_at" date,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (amount > 0)
);

CREATE TABLE warehouse."meter_readings" (
  "id" text NOT NULL,
  "unit_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "period" text NOT NULL,
  "meter_type" text,
  "status" text,
  "value" numeric,
  "previous_value" numeric,
  "tariff_rate" numeric,
  "consumption" numeric,
  "charge_amount" numeric,
  "recorded_at" timestamptz,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (value >= previous_value),
  CHECK (previous_value >= 0),
  CHECK (tariff_rate >= 0),
  CHECK (charge_amount >= 0)
);

CREATE TABLE warehouse."notification_events" (
  "id" text NOT NULL,
  "type" text,
  "title" text,
  "message" text,
  "tone" text,
  "entity_type" text,
  "entity_id" text,
  "property_id" text,
  "tenant_id" text,
  "created_by" text,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."notification_deliveries" (
  "id" text NOT NULL,
  "notification_id" text NOT NULL,
  "channel" text,
  "recipient_user_id" text,
  "recipient_email" text,
  "status" text,
  "external_message_id" text,
  "error" text,
  "attempts" integer,
  "read_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (attempts >= 0)
);

CREATE TABLE warehouse."otp_bindings" (
  "id" text NOT NULL,
  "channel" text NOT NULL,
  "phone" text NOT NULL,
  "tenant_id" text,
  "user_id" text NOT NULL,
  "recipient_id" text NOT NULL,
  "display_name" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."bot_link_codes" (
  "hash" text NOT NULL,
  "user_id" text,
  "phone" text,
  "channel" text,
  "expires_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("hash")
);

CREATE TABLE warehouse."password_resets" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (attempts >= 0)
);

CREATE TABLE warehouse."import_batches" (
  "id" text NOT NULL,
  "template_id" text,
  "file_name" text,
  "mode" text,
  "created_by" text,
  "created_by_name" text,
  "status" text,
  "rollback_error" text,
  "rolled_back_by" text,
  "summary" jsonb,
  "rows" jsonb,
  "operations" jsonb,
  "created_at" timestamptz,
  "rolled_back_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."import_approvals" (
  "id" text NOT NULL,
  "template_id" text,
  "file_name" text,
  "mode" text,
  "content_base64" text,
  "requested_by" text,
  "requested_by_name" text,
  "status" text,
  "decided_by" text,
  "batch_id" text,
  "summary" jsonb,
  "rows" jsonb,
  "report" jsonb,
  "created_at" timestamptz,
  "decided_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."notification_reads" (
  "user_id" text NOT NULL,
  "notification_id" text NOT NULL,
  "version" text,
  "read_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("user_id", "notification_id")
);

CREATE TABLE warehouse."audit_log" (
  "id" text NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "action" text,
  "entity_type" text,
  "entity_id" text,
  "changes" jsonb,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."floor_plans" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "image" text,
  "markers" jsonb,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."equipment" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "unit_id" text NOT NULL,
  "responsible_id" text,
  "type" text,
  "serial_number" text,
  "specifications" text,
  "photo_url" text,
  "status" text,
  "cost" numeric,
  "warranty_until" date,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (cost >= 0)
);

CREATE TABLE warehouse."service_catalog" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "description" text,
  "specialty" text,
  "paid" boolean,
  "active" boolean,
  "hourly_rate" numeric,
  "base_price" numeric,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (hourly_rate >= 0),
  CHECK (base_price >= 0)
);

CREATE TABLE warehouse."maintenance_plans" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "unit_id" text NOT NULL,
  "responsible_id" text,
  "equipment_id" text,
  "instructions" text,
  "interval_days" integer NOT NULL,
  "next_date" date NOT NULL,
  "active" boolean,
  "checklist" jsonb,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (interval_days BETWEEN 1 AND 3660)
);

CREATE TABLE warehouse."meters" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "unit_id" text,
  "responsible_id" text,
  "scope" text,
  "resource" text,
  "serial_number" text,
  "tariff" numeric,
  "initial_value" numeric,
  "active" boolean,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (tariff >= 0),
  CHECK (initial_value >= 0)
);

CREATE TABLE warehouse."resource_readings" (
  "id" text NOT NULL,
  "meter_id" text NOT NULL,
  "property_id" text NOT NULL,
  "period" text NOT NULL,
  "created_by" text,
  "previous" numeric,
  "value" numeric,
  "consumption" numeric,
  "tariff" numeric,
  "amount" numeric,
  "unallocated" numeric,
  "allocations" jsonb,
  "created_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (value >= previous),
  CHECK (previous >= 0),
  CHECK (amount >= 0)
);

CREATE TABLE warehouse."announcements" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "content" text,
  "tone" text,
  "audience" text,
  "published" boolean,
  "expires_at" date,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id")
);

CREATE TABLE warehouse."operating_expenses" (
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "category" text,
  "note" text,
  "amount" numeric,
  "date" date,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("id"),
  CHECK (amount >= 0)
);

CREATE TABLE warehouse."auth_challenges" (
  "key" text NOT NULL,
  "namespace" text NOT NULL,
  "value" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY ("namespace", "key")
);

ALTER TABLE warehouse."units" ADD CONSTRAINT "units_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."units" ("property_id");
ALTER TABLE warehouse."users" ADD CONSTRAINT "users_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."users" ("property_id");
ALTER TABLE warehouse."users" ADD CONSTRAINT "users_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."users" ("tenant_id");
ALTER TABLE warehouse."leases" ADD CONSTRAINT "leases_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."leases" ("tenant_id");
ALTER TABLE warehouse."leases" ADD CONSTRAINT "leases_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."leases" ("unit_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("unit_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("property_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("tenant_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("created_by");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_assigned_to_fk" FOREIGN KEY ("assigned_to") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("assigned_to");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES warehouse."equipment" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("equipment_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_service_id_fk" FOREIGN KEY ("service_id") REFERENCES warehouse."service_catalog" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("service_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES warehouse."leases" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("lease_id");
ALTER TABLE warehouse."tickets" ADD CONSTRAINT "tickets_maintenance_plan_id_fk" FOREIGN KEY ("maintenance_plan_id") REFERENCES warehouse."maintenance_plans" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tickets" ("maintenance_plan_id");
ALTER TABLE warehouse."ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_history" ("ticket_id");
ALTER TABLE warehouse."ticket_history" ADD CONSTRAINT "ticket_history_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_history" ("created_by");
ALTER TABLE warehouse."ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_comments" ("ticket_id");
ALTER TABLE warehouse."ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_fk" FOREIGN KEY ("author_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_comments" ("author_id");
ALTER TABLE warehouse."ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_attachments" ("ticket_id");
ALTER TABLE warehouse."ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_attachments" ("uploaded_by");
ALTER TABLE warehouse."tenant_notes" ADD CONSTRAINT "tenant_notes_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tenant_notes" ("tenant_id");
ALTER TABLE warehouse."tenant_notes" ADD CONSTRAINT "tenant_notes_author_id_fk" FOREIGN KEY ("author_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tenant_notes" ("author_id");
ALTER TABLE warehouse."tenant_note_attachments" ADD CONSTRAINT "tenant_note_attachments_note_id_fk" FOREIGN KEY ("note_id") REFERENCES warehouse."tenant_notes" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tenant_note_attachments" ("note_id");
ALTER TABLE warehouse."tenant_note_attachments" ADD CONSTRAINT "tenant_note_attachments_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tenant_note_attachments" ("tenant_id");
ALTER TABLE warehouse."tenant_note_attachments" ADD CONSTRAINT "tenant_note_attachments_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."tenant_note_attachments" ("uploaded_by");
ALTER TABLE warehouse."lease_documents" ADD CONSTRAINT "lease_documents_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES warehouse."leases" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."lease_documents" ("lease_id");
ALTER TABLE warehouse."lease_documents" ADD CONSTRAINT "lease_documents_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."lease_documents" ("uploaded_by");
ALTER TABLE warehouse."lease_followups" ADD CONSTRAINT "lease_followups_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES warehouse."leases" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."lease_followups" ("lease_id");
ALTER TABLE warehouse."lease_followups" ADD CONSTRAINT "lease_followups_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."lease_followups" ("updated_by");
ALTER TABLE warehouse."billing_invoices" ADD CONSTRAINT "billing_invoices_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES warehouse."leases" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."billing_invoices" ("lease_id");
ALTER TABLE warehouse."billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."billing_invoices" ("tenant_id");
ALTER TABLE warehouse."billing_invoices" ADD CONSTRAINT "billing_invoices_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."billing_invoices" ("unit_id");
ALTER TABLE warehouse."billing_payments" ADD CONSTRAINT "billing_payments_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES warehouse."billing_invoices" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."billing_payments" ("invoice_id");
ALTER TABLE warehouse."billing_payments" ADD CONSTRAINT "billing_payments_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."billing_payments" ("tenant_id");
ALTER TABLE warehouse."meter_readings" ADD CONSTRAINT "meter_readings_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meter_readings" ("unit_id");
ALTER TABLE warehouse."meter_readings" ADD CONSTRAINT "meter_readings_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meter_readings" ("tenant_id");
ALTER TABLE warehouse."notification_events" ADD CONSTRAINT "notification_events_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_events" ("property_id");
ALTER TABLE warehouse."notification_events" ADD CONSTRAINT "notification_events_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_events" ("tenant_id");
ALTER TABLE warehouse."notification_events" ADD CONSTRAINT "notification_events_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_events" ("created_by");
ALTER TABLE warehouse."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES warehouse."notification_events" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_deliveries" ("notification_id");
ALTER TABLE warehouse."notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_deliveries" ("recipient_user_id");
ALTER TABLE warehouse."otp_bindings" ADD CONSTRAINT "otp_bindings_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES warehouse."tenants" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."otp_bindings" ("tenant_id");
ALTER TABLE warehouse."otp_bindings" ADD CONSTRAINT "otp_bindings_user_id_fk" FOREIGN KEY ("user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."otp_bindings" ("user_id");
ALTER TABLE warehouse."bot_link_codes" ADD CONSTRAINT "bot_link_codes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."bot_link_codes" ("user_id");
ALTER TABLE warehouse."password_resets" ADD CONSTRAINT "password_resets_user_id_fk" FOREIGN KEY ("user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."password_resets" ("user_id");
ALTER TABLE warehouse."import_batches" ADD CONSTRAINT "import_batches_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."import_batches" ("created_by");
ALTER TABLE warehouse."import_batches" ADD CONSTRAINT "import_batches_rolled_back_by_fk" FOREIGN KEY ("rolled_back_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."import_batches" ("rolled_back_by");
ALTER TABLE warehouse."import_approvals" ADD CONSTRAINT "import_approvals_requested_by_fk" FOREIGN KEY ("requested_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."import_approvals" ("requested_by");
ALTER TABLE warehouse."import_approvals" ADD CONSTRAINT "import_approvals_decided_by_fk" FOREIGN KEY ("decided_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."import_approvals" ("decided_by");
ALTER TABLE warehouse."import_approvals" ADD CONSTRAINT "import_approvals_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES warehouse."import_batches" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."import_approvals" ("batch_id");
ALTER TABLE warehouse."notification_reads" ADD CONSTRAINT "notification_reads_user_id_fk" FOREIGN KEY ("user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."notification_reads" ("user_id");
ALTER TABLE warehouse."floor_plans" ADD CONSTRAINT "floor_plans_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."floor_plans" ("property_id");
ALTER TABLE warehouse."floor_plans" ADD CONSTRAINT "floor_plans_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."floor_plans" ("created_by");
ALTER TABLE warehouse."equipment" ADD CONSTRAINT "equipment_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."equipment" ("property_id");
ALTER TABLE warehouse."equipment" ADD CONSTRAINT "equipment_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."equipment" ("created_by");
ALTER TABLE warehouse."equipment" ADD CONSTRAINT "equipment_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."equipment" ("unit_id");
ALTER TABLE warehouse."equipment" ADD CONSTRAINT "equipment_responsible_id_fk" FOREIGN KEY ("responsible_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."equipment" ("responsible_id");
ALTER TABLE warehouse."service_catalog" ADD CONSTRAINT "service_catalog_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."service_catalog" ("property_id");
ALTER TABLE warehouse."service_catalog" ADD CONSTRAINT "service_catalog_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."service_catalog" ("created_by");
ALTER TABLE warehouse."maintenance_plans" ADD CONSTRAINT "maintenance_plans_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_plans" ("property_id");
ALTER TABLE warehouse."maintenance_plans" ADD CONSTRAINT "maintenance_plans_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_plans" ("created_by");
ALTER TABLE warehouse."maintenance_plans" ADD CONSTRAINT "maintenance_plans_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_plans" ("unit_id");
ALTER TABLE warehouse."maintenance_plans" ADD CONSTRAINT "maintenance_plans_responsible_id_fk" FOREIGN KEY ("responsible_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_plans" ("responsible_id");
ALTER TABLE warehouse."maintenance_plans" ADD CONSTRAINT "maintenance_plans_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES warehouse."equipment" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_plans" ("equipment_id");
ALTER TABLE warehouse."meters" ADD CONSTRAINT "meters_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meters" ("property_id");
ALTER TABLE warehouse."meters" ADD CONSTRAINT "meters_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meters" ("created_by");
ALTER TABLE warehouse."meters" ADD CONSTRAINT "meters_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES warehouse."units" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meters" ("unit_id");
ALTER TABLE warehouse."meters" ADD CONSTRAINT "meters_responsible_id_fk" FOREIGN KEY ("responsible_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."meters" ("responsible_id");
ALTER TABLE warehouse."resource_readings" ADD CONSTRAINT "resource_readings_meter_id_fk" FOREIGN KEY ("meter_id") REFERENCES warehouse."meters" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."resource_readings" ("meter_id");
ALTER TABLE warehouse."resource_readings" ADD CONSTRAINT "resource_readings_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."resource_readings" ("property_id");
ALTER TABLE warehouse."resource_readings" ADD CONSTRAINT "resource_readings_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."resource_readings" ("created_by");
ALTER TABLE warehouse."announcements" ADD CONSTRAINT "announcements_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."announcements" ("property_id");
ALTER TABLE warehouse."announcements" ADD CONSTRAINT "announcements_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."announcements" ("created_by");
ALTER TABLE warehouse."operating_expenses" ADD CONSTRAINT "operating_expenses_property_id_fk" FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."operating_expenses" ("property_id");
ALTER TABLE warehouse."operating_expenses" ADD CONSTRAINT "operating_expenses_created_by_fk" FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."operating_expenses" ("created_by");

CREATE UNIQUE INDEX users_email_unique ON warehouse.users (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX users_phone_unique ON warehouse.users (phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX tenants_inn_unique ON warehouse.tenants (inn);
CREATE UNIQUE INDEX units_location_unique ON warehouse.units (property_id, coalesce(building,''), coalesce(entrance,''), floor, number);
CREATE UNIQUE INDEX leases_contract_unique ON warehouse.leases (contract_number);
CREATE UNIQUE INDEX invoice_period_unique ON warehouse.billing_invoices (lease_id, period);
CREATE UNIQUE INDEX reading_period_unique ON warehouse.meter_readings (unit_id, meter_type, period);
CREATE UNIQUE INDEX resource_period_unique ON warehouse.resource_readings (meter_id, period);
CREATE UNIQUE INDEX maintenance_occurrence_unique ON warehouse.tickets (maintenance_plan_id, maintenance_date) WHERE maintenance_plan_id IS NOT NULL;
CREATE UNIQUE INDEX bot_phone_unique ON warehouse.otp_bindings (channel, phone);
CREATE UNIQUE INDEX bot_recipient_unique ON warehouse.otp_bindings (channel, recipient_id);
CREATE INDEX ON warehouse.leases (end_date) WHERE stage IN ('signed','active','prolongation');
CREATE INDEX ON warehouse.tickets (property_id, status, sla_due_at);
CREATE INDEX ON warehouse.billing_invoices (due_date, status);
CREATE INDEX ON warehouse.maintenance_plans (next_date) WHERE active;
CREATE INDEX ON warehouse.auth_challenges (expires_at);
CREATE INDEX ON warehouse.audit_log (created_at DESC);

CREATE TABLE warehouse.storage_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL CHECK (mode IN ('relational','legacy')),
  migrated_at timestamptz NOT NULL DEFAULT now(),
  migration_counts jsonb NOT NULL DEFAULT '{}'
);

-- The same room cannot be promised twice, including draft contracts.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE warehouse.leases ADD CONSTRAINT lease_dates_no_overlap
  EXCLUDE USING gist (unit_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
  WHERE (stage <> 'terminated') DEFERRABLE INITIALLY DEFERRED;
