import { table } from "./schema-table.js";
export const businessTables = {
  accounting_sources: table(
    {
      text: "id name environment tokenHash createdBy",
      boolean: "active",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["name", "environment", "active"],
      references: { createdBy: "users" },
      checks: ["environment IN ('test','production')"],
    },
  ),
  external_links: table(
    {
      text: "id sourceId entityType externalId localId payloadHash",
      integer: "version",
      timestamptz: "updatedAt",
    },
    {
      required: ["sourceId", "entityType", "externalId", "localId", "version"],
      references: { sourceId: "accounting_sources" },
      checks: ["version >= 0"],
    },
  ),
  personal_accounts: table(
    {
      text: "id sourceId externalId leaseId number status propertyId",
      date: "validFrom validTo",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: [
        "sourceId",
        "externalId",
        "leaseId",
        "propertyId",
        "number",
        "status",
        "validFrom",
      ],
      references: {
        sourceId: "accounting_sources",
        leaseId: "leases",
        propertyId: "properties",
      },
      checks: [
        "status IN ('active','closed')",
        "valid_to IS NULL OR valid_to >= valid_from",
      ],
    },
  ),
  account_statements: table(
    {
      text: "id sourceId accountId externalId period",
      numeric: "opening charged paid closing",
      integer: "version",
      jsonb: "lines",
      timestamptz: "asOf updatedAt",
    },
    {
      required: [
        "sourceId",
        "accountId",
        "externalId",
        "period",
        "opening",
        "charged",
        "paid",
        "closing",
        "version",
        "lines",
        "asOf",
      ],
      references: {
        sourceId: "accounting_sources",
        accountId: "personal_accounts",
      },
      checks: [
        "version > 0",
        "abs(opening + charged - paid - closing) < 0.011",
      ],
    },
  ),
  user_assignments: table(
    {
      text: "id userId businessRole scopeType scopeId origin reason createdBy revokedBy",
      jsonb: "permissions",
      date: "validFrom validTo",
      boolean: "retainHistory",
      timestamptz: "createdAt updatedAt revokedAt",
    },
    {
      required: [
        "userId",
        "businessRole",
        "scopeType",
        "scopeId",
        "permissions",
        "validFrom",
        "origin",
        "reason",
        "retainHistory",
      ],
      references: { userId: "users", createdBy: "users", revokedBy: "users" },
      checks: [
        "valid_to IS NULL OR valid_to >= valid_from",
        "business_role IN ('owner','tenant','manager','worker')",
        "scope_type IN ('property','unit','lease','account')",
      ],
    },
  ),
  exchange_inbox: table(
    {
      text: "id sourceId messageId kind payloadHash status error correlationId",
      jsonb: "payload result",
      integer: "attempts",
      timestamptz: "createdAt updatedAt nextAttemptAt",
    },
    {
      required: [
        "sourceId",
        "messageId",
        "kind",
        "payloadHash",
        "status",
        "attempts",
        "payload",
      ],
      references: { sourceId: "accounting_sources" },
      checks: ["attempts >= 0", "status IN ('pending','applied','failed')"],
    },
  ),
  exchange_outbox: table(
    {
      text: "id sourceId messageId kind payloadHash status error correlationId",
      jsonb: "payload result",
      integer: "attempts",
      timestamptz: "createdAt updatedAt nextAttemptAt",
    },
    {
      required: [
        "sourceId",
        "messageId",
        "kind",
        "payloadHash",
        "status",
        "attempts",
        "payload",
      ],
      references: { sourceId: "accounting_sources" },
      checks: ["attempts >= 0", "status IN ('pending','applied','failed')"],
    },
  ),
  reading_periods: table(
    {
      text: "id propertyId name createdBy",
      boolean: "photoRequired",
      numeric: "thresholdPercent",
      date: "startsOn endsOn",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "startsOn", "endsOn"],
      references: { propertyId: "properties", createdBy: "users" },
      checks: ["ends_on >= starts_on"],
    },
  ),
  reading_submissions: table(
    {
      text: "id meterId propertyId accountId periodId submittedBy reviewedBy status reason photoDocumentId sourceId outboxId",
      numeric: "value previous",
      boolean: "anomaly",
      timestamptz: "createdAt updatedAt reviewedAt",
    },
    {
      required: [
        "meterId",
        "propertyId",
        "periodId",
        "submittedBy",
        "value",
        "previous",
        "status",
        "anomaly",
      ],
      references: {
        meterId: "meters",
        propertyId: "properties",
        accountId: "personal_accounts",
        periodId: "reading_periods",
        submittedBy: "users",
        reviewedBy: "users",
        photoDocumentId: "entity_documents",
        sourceId: "accounting_sources",
        outboxId: "exchange_outbox",
      },
      checks: [
        "value >= previous",
        "status IN ('pending','accepted','rejected')",
      ],
    },
  ),
  entity_documents: table(
    {
      text: "id propertyId name category storedName storageKind mimeType url uploadedBy",
      integer: "sizeBytes",
      timestamptz: "createdAt updatedAt",
    },
    {
      required: ["propertyId", "name", "category", "uploadedBy"],
      references: { propertyId: "properties", uploadedBy: "users" },
      checks: [
        "size_bytes IS NULL OR size_bytes >= 0",
        "(stored_name IS NULL) <> (url IS NULL)",
      ],
    },
  ),
  document_links: table(
    {
      text: "id documentId entityType entityId phase",
      integer: "revision",
      timestamptz: "createdAt",
    },
    {
      required: ["documentId", "entityType", "entityId"],
      references: { documentId: "entity_documents" },
    },
  ),
  ticket_workflows: table(
    {
      text: "ticketId accountId estimateId acceptanceBy state pauseReason approvalBy",
      boolean: "paid requireBeforePhoto requireAfterPhoto",
      integer: "termsVersion approvedVersion resultVersion",
      numeric: "amount",
      timestamptz: "updatedAt",
    },
    {
      key: ["ticketId"],
      required: [
        "paid",
        "requireBeforePhoto",
        "requireAfterPhoto",
        "termsVersion",
        "resultVersion",
        "amount",
        "state",
      ],
      references: {
        ticketId: "tickets",
        accountId: "personal_accounts",
        estimateId: "estimates",
        acceptanceBy: "users",
        approvalBy: "users",
      },
      checks: [
        "amount >= 0",
        "terms_version > 0",
        "result_version > 0",
        "state IN ('registered','awaiting_approval','assigned','in_progress','paused','awaiting_acceptance','accepted','closed','rejected')",
      ],
    },
  ),
  ticket_decisions: table(
    {
      text: "id ticketId action actorId reason",
      integer: "termsVersion resultVersion",
      jsonb: "snapshot",
      timestamptz: "createdAt",
    },
    {
      required: ["ticketId", "action", "actorId"],
      references: { ticketId: "tickets", actorId: "users" },
    },
  ),
  maintenance_changes: table(
    {
      text: "id ticketId actorId reason remark",
      timestamptz: "fromDate toDate createdAt",
    },
    {
      required: ["ticketId", "actorId", "reason"],
      references: { ticketId: "tickets", actorId: "users" },
    },
  ),
};
