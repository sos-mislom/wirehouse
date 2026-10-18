-- Accounting identities, context grants, operational workflows and exchange journals.

CREATE TABLE warehouse."accounting_sources" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "name" text NOT NULL,
  "environment" text NOT NULL,
  "token_hash" text,
  "created_by" text,
  "active" boolean NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (environment IN ('test','production'))
);

CREATE TABLE warehouse."external_links" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "external_id" text NOT NULL,
  "local_id" text NOT NULL,
  "version" integer NOT NULL,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (version >= 0)
);

CREATE TABLE warehouse."personal_accounts" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "external_id" text NOT NULL,
  "lease_id" text NOT NULL,
  "number" text NOT NULL,
  "status" text NOT NULL,
  "property_id" text NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (status IN ('active','closed')),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE warehouse."account_statements" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "account_id" text NOT NULL,
  "external_id" text NOT NULL,
  "period" text NOT NULL,
  "opening" numeric NOT NULL,
  "charged" numeric NOT NULL,
  "paid" numeric NOT NULL,
  "closing" numeric NOT NULL,
  "version" integer NOT NULL,
  "lines" jsonb NOT NULL,
  "as_of" timestamptz NOT NULL,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (version > 0),
  CHECK (abs(opening + charged - paid - closing) < 0.011)
);

CREATE TABLE warehouse."user_assignments" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "business_role" text NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" text NOT NULL,
  "origin" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" text,
  "revoked_by" text,
  "permissions" jsonb NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date,
  "retain_history" boolean NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "revoked_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (business_role IN ('owner','tenant','manager','worker')),
  CHECK (scope_type IN ('property','unit','lease','account'))
);

CREATE TABLE warehouse."exchange_inbox" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "message_id" text NOT NULL,
  "kind" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "correlation_id" text,
  "payload" jsonb NOT NULL,
  "result" jsonb,
  "attempts" integer NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "next_attempt_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (attempts >= 0),
  CHECK (status IN ('pending','applied','failed'))
);

CREATE TABLE warehouse."exchange_outbox" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "message_id" text NOT NULL,
  "kind" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "correlation_id" text,
  "payload" jsonb NOT NULL,
  "result" jsonb,
  "attempts" integer NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "next_attempt_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (attempts >= 0),
  CHECK (status IN ('pending','applied','failed'))
);

CREATE TABLE warehouse."reading_periods" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text,
  "created_by" text,
  "photo_required" boolean,
  "threshold_percent" numeric,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE warehouse."reading_submissions" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "meter_id" text NOT NULL,
  "property_id" text NOT NULL,
  "account_id" text,
  "period_id" text NOT NULL,
  "submitted_by" text NOT NULL,
  "reviewed_by" text,
  "status" text NOT NULL,
  "reason" text,
  "photo_document_id" text,
  "source_id" text,
  "outbox_id" text,
  "value" numeric NOT NULL,
  "previous" numeric NOT NULL,
  "anomaly" boolean NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "reviewed_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (value >= previous),
  CHECK (status IN ('pending','accepted','rejected'))
);

CREATE TABLE warehouse."entity_documents" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "property_id" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "stored_name" text,
  "storage_kind" text,
  "mime_type" text,
  "url" text,
  "uploaded_by" text NOT NULL,
  "size_bytes" integer,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CHECK ((stored_name IS NULL) <> (url IS NULL))
);

CREATE TABLE warehouse."document_links" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "document_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "phase" text,
  "revision" integer,
  "created_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (true)
);

CREATE TABLE warehouse."ticket_workflows" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "ticket_id" text NOT NULL,
  "account_id" text,
  "acceptance_by" text,
  "state" text NOT NULL,
  "pause_reason" text,
  "approval_by" text,
  "paid" boolean NOT NULL,
  "require_before_photo" boolean NOT NULL,
  "require_after_photo" boolean NOT NULL,
  "terms_version" integer NOT NULL,
  "approved_version" integer,
  "result_version" integer NOT NULL,
  "amount" numeric NOT NULL,
  "updated_at" timestamptz,
  PRIMARY KEY ("ticket_id"),
  CHECK (amount >= 0),
  CHECK (terms_version > 0),
  CHECK (result_version > 0),
  CHECK (state IN ('registered','awaiting_approval','assigned','in_progress','paused','awaiting_acceptance','accepted','closed','rejected'))
);

CREATE TABLE warehouse."ticket_decisions" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "ticket_id" text NOT NULL,
  "action" text NOT NULL,
  "actor_id" text NOT NULL,
  "reason" text,
  "terms_version" integer,
  "result_version" integer,
  "snapshot" jsonb,
  "created_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (true)
);

CREATE TABLE warehouse."maintenance_changes" (
  _sequence bigint GENERATED ALWAYS AS IDENTITY,
  "id" text NOT NULL,
  "ticket_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "reason" text NOT NULL,
  "remark" text,
  "from_date" timestamptz,
  "to_date" timestamptz,
  "created_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (true)
);

ALTER TABLE warehouse."accounting_sources" ADD FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."accounting_sources" ("created_by");

ALTER TABLE warehouse."external_links" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."external_links" ("source_id");

ALTER TABLE warehouse."personal_accounts" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."personal_accounts" ("source_id");

ALTER TABLE warehouse."personal_accounts" ADD FOREIGN KEY ("lease_id") REFERENCES warehouse."leases" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."personal_accounts" ("lease_id");

ALTER TABLE warehouse."personal_accounts" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."personal_accounts" ("property_id");

ALTER TABLE warehouse."account_statements" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."account_statements" ("source_id");

ALTER TABLE warehouse."account_statements" ADD FOREIGN KEY ("account_id") REFERENCES warehouse."personal_accounts" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."account_statements" ("account_id");

ALTER TABLE warehouse."user_assignments" ADD FOREIGN KEY ("user_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."user_assignments" ("user_id");

ALTER TABLE warehouse."user_assignments" ADD FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."user_assignments" ("created_by");

ALTER TABLE warehouse."user_assignments" ADD FOREIGN KEY ("revoked_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."user_assignments" ("revoked_by");

ALTER TABLE warehouse."exchange_inbox" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."exchange_inbox" ("source_id");

ALTER TABLE warehouse."exchange_outbox" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."exchange_outbox" ("source_id");

ALTER TABLE warehouse."reading_periods" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_periods" ("property_id");

ALTER TABLE warehouse."reading_periods" ADD FOREIGN KEY ("created_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_periods" ("created_by");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("meter_id") REFERENCES warehouse."meters" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("meter_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("property_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("account_id") REFERENCES warehouse."personal_accounts" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("account_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("period_id") REFERENCES warehouse."reading_periods" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("period_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("submitted_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("submitted_by");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("reviewed_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("reviewed_by");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("photo_document_id") REFERENCES warehouse."entity_documents" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("photo_document_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("source_id") REFERENCES warehouse."accounting_sources" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("source_id");

ALTER TABLE warehouse."reading_submissions" ADD FOREIGN KEY ("outbox_id") REFERENCES warehouse."exchange_outbox" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."reading_submissions" ("outbox_id");

ALTER TABLE warehouse."entity_documents" ADD FOREIGN KEY ("property_id") REFERENCES warehouse."properties" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."entity_documents" ("property_id");

ALTER TABLE warehouse."entity_documents" ADD FOREIGN KEY ("uploaded_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."entity_documents" ("uploaded_by");

ALTER TABLE warehouse."document_links" ADD FOREIGN KEY ("document_id") REFERENCES warehouse."entity_documents" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."document_links" ("document_id");

ALTER TABLE warehouse."ticket_workflows" ADD FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_workflows" ("ticket_id");

ALTER TABLE warehouse."ticket_workflows" ADD FOREIGN KEY ("account_id") REFERENCES warehouse."personal_accounts" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_workflows" ("account_id");

ALTER TABLE warehouse."ticket_workflows" ADD FOREIGN KEY ("acceptance_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_workflows" ("acceptance_by");

ALTER TABLE warehouse."ticket_workflows" ADD FOREIGN KEY ("approval_by") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_workflows" ("approval_by");

ALTER TABLE warehouse."ticket_decisions" ADD FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_decisions" ("ticket_id");

ALTER TABLE warehouse."ticket_decisions" ADD FOREIGN KEY ("actor_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."ticket_decisions" ("actor_id");

ALTER TABLE warehouse."maintenance_changes" ADD FOREIGN KEY ("ticket_id") REFERENCES warehouse."tickets" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_changes" ("ticket_id");

ALTER TABLE warehouse."maintenance_changes" ADD FOREIGN KEY ("actor_id") REFERENCES warehouse."users" (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON warehouse."maintenance_changes" ("actor_id");

CREATE UNIQUE INDEX accounting_external_identity ON warehouse.external_links(source_id,entity_type,external_id);
CREATE UNIQUE INDEX accounting_local_identity ON warehouse.external_links(source_id,entity_type,local_id);
CREATE UNIQUE INDEX personal_account_external_identity ON warehouse.personal_accounts(source_id,external_id);
CREATE UNIQUE INDEX statement_external_identity ON warehouse.account_statements(source_id,external_id);
CREATE UNIQUE INDEX account_statement_period ON warehouse.account_statements(account_id,period);
CREATE UNIQUE INDEX exchange_inbox_identity ON warehouse.exchange_inbox(source_id,message_id);
CREATE UNIQUE INDEX exchange_outbox_identity ON warehouse.exchange_outbox(source_id,message_id);
CREATE UNIQUE INDEX document_link_identity ON warehouse.document_links(document_id,entity_type,entity_id);
CREATE UNIQUE INDEX reading_submission_identity ON warehouse.reading_submissions(meter_id,period_id) WHERE status <> 'rejected';
