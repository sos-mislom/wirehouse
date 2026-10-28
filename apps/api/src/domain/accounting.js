import crypto from "node:crypto";
import { parseDto } from "../http/body.js";
import {
  sourceInput,
  accountInput,
  linkInput,
  statementInput,
  accountExchangeInput,
  exchangeMessage,
  propertyExchangeInput,
  unitExchangeInput,
  tenantExchangeInput,
  leaseExchangeInput,
  meterExchangeInput,
} from "../../../../packages/contracts/src/accounting.ts";
import { saveOperation } from "../operations.js";
export const stableJson = (value) => JSON.stringify(stableValue(value));
function stableValue(value) {
  return Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stableValue(value[key])]),
        )
      : value;
}
const now = () => new Date().toISOString();
export function businessError(message, status = 400, code = "INVALID_REQUEST") {
  return Object.assign(new Error(message), { status, code });
}
export const requiredRecord = (db, table, id) => {
  const row = db.getById(table, id);
  if (!row) throw businessError("Запись не найдена", 404, "NOT_FOUND");
  return row;
};
export function currentRecord(db, table, id, updatedAt) {
  const row = requiredRecord(db, table, id);
  if (!updatedAt || updatedAt !== row.updatedAt)
    throw businessError(
      "Запись изменена. Обновите данные.",
      409,
      "VERSION_CONFLICT",
    );
  return row;
}
export const publicSource = ({ tokenHash, ...source }) => ({
  ...source,
  tokenConfigured: Boolean(tokenHash),
});
export function saveSource(db, actor, id, input) {
  const body = parseDto(sourceInput, input),
    old = id
      ? currentRecord(db, "accounting_sources", id, body.updatedAt)
      : null;
  if (
    old &&
    old.environment !== body.environment &&
    (db.data.external_links.some((r) => r.sourceId === id) ||
      db.data.personal_accounts.some((r) => r.sourceId === id) ||
      db.data.exchange_inbox.some((r) => r.sourceId === id))
  )
    throw businessError("Среду используемого источника менять нельзя", 409);
  const row = {
    id: id ?? crypto.randomUUID(),
    name: body.name,
    environment: body.environment,
    active: body.active,
    tokenHash: old?.tokenHash ?? null,
    createdBy: old?.createdBy ?? actor.id,
    createdAt: old?.createdAt ?? now(),
    updatedAt: now(),
  };
  if (old) Object.assign(old, row);
  else db.data.accounting_sources.push(row);
  return publicSource(row);
}
export function rotateSourceToken(db, id) {
  const row = requiredRecord(db, "accounting_sources", id);
  const token = crypto.randomBytes(32).toString("base64url");
  row.tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  row.updatedAt = now();
  return { token, source: publicSource(row) };
}
export function authenticateSource(db, id, token) {
  const row = db.getById("accounting_sources", id),
    hash = crypto
      .createHash("sha256")
      .update(token ?? "")
      .digest("hex");
  if (
    !row?.active ||
    !row.tokenHash ||
    !crypto.timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash))
  )
    throw businessError("Источник не авторизован", 401, "UNAUTHORIZED_SOURCE");
  return row;
}
export function saveExternalLink(db, input) {
  const body = parseDto(linkInput, input);
  requiredRecord(db, "accounting_sources", body.sourceId);
  requiredRecord(db, body.entityType, body.localId);
  const old = db.data.external_links.find(
    (r) =>
      r.sourceId === body.sourceId &&
      r.entityType === body.entityType &&
      r.externalId === body.externalId,
  );
  if (old && old.localId !== body.localId)
    throw businessError(
      "Внешний идентификатор уже связан с другой записью",
      409,
      "IDENTITY_CONFLICT",
    );
  if (
    db.data.external_links.some(
      (r) =>
        r.sourceId === body.sourceId &&
        r.entityType === body.entityType &&
        r.localId === body.localId &&
        r.externalId !== body.externalId,
    )
  )
    throw businessError(
      "Запись уже сопоставлена в этом источнике",
      409,
      "IDENTITY_CONFLICT",
    );
  if (
    body.entityType === "personal_accounts" &&
    db.getById("personal_accounts", body.localId).sourceId !== body.sourceId
  )
    throw businessError("Лицевой счет другого источника");
  if (old && body.version < old.version)
    throw businessError("Версия сопоставления устарела", 409, "STALE_VERSION");
  const row = {
    ...body,
    id: old?.id ?? crypto.randomUUID(),
    // A manually advanced version has no verified import snapshot.
    payloadHash:
      old?.version === body.version ? (old.payloadHash ?? null) : null,
    updatedAt: now(),
  };
  if (old) Object.assign(old, row);
  else db.data.external_links.push(row);
  return old ?? row;
}
export function saveAccount(db, id, input) {
  const body = parseDto(accountInput, input),
    source = requiredRecord(db, "accounting_sources", body.sourceId),
    lease = requiredRecord(db, "leases", body.leaseId),
    unit = db.requireUnit(lease.unit_id);
  if (!source.active) throw businessError("Источник отключен");
  const old = id
    ? currentRecord(db, "personal_accounts", id, body.updatedAt)
    : null;
  if (
    old &&
    (old.sourceId !== body.sourceId ||
      old.externalId !== body.externalId ||
      old.leaseId !== body.leaseId)
  )
    throw businessError(
      "Источник, внешний ID и договор существующего ЛС неизменяемы",
      409,
    );
  if (
    db.data.personal_accounts.some(
      (r) =>
        r.id !== id &&
        r.sourceId === body.sourceId &&
        r.externalId === body.externalId,
    )
  )
    throw businessError("Лицевой счет с таким внешним ID уже есть", 409);
  const row = {
    ...body,
    id: id ?? crypto.randomUUID(),
    propertyId: unit.property_id,
    createdAt: old?.createdAt ?? now(),
    updatedAt: now(),
  };
  if (old) Object.assign(old, row);
  else db.data.personal_accounts.push(row);
  saveExternalLink(db, {
    sourceId: row.sourceId,
    entityType: "personal_accounts",
    externalId: row.externalId,
    localId: row.id,
    version:
      db.data.external_links.find(
        (r) =>
          r.sourceId === row.sourceId &&
          r.entityType === "personal_accounts" &&
          r.localId === row.id,
      )?.version ?? 0,
  });
  return row;
}
function applyStatements(db, source, items) {
  const result = { created: 0, updated: 0, skipped: 0 };
  for (const input of items) {
    const body = parseDto(statementInput, input);
    const account = db.data.personal_accounts.find(
      (r) =>
        r.sourceId === source.id && r.externalId === body.accountExternalId,
    );
    if (!account)
      throw businessError(
        `Не найден ЛС: ${body.accountExternalId}`,
        422,
        "MISSING_MAPPING",
      );
    const old = db.data.account_statements.find(
      (r) => r.sourceId === source.id && r.externalId === body.externalId,
    );
    if (old && (old.accountId !== account.id || old.period !== body.period))
      throw businessError(
        "Внешняя запись относится к другому ЛС или периоду",
        409,
        "IDENTITY_CONFLICT",
      );
    const { accountExternalId, ...fields } = body;
    const row = {
      ...fields,
      id: old?.id ?? crypto.randomUUID(),
      accountId: account.id,
      sourceId: source.id,
      updatedAt: now(),
    };
    if (old && body.version <= old.version) {
      const canonical = (r) =>
        stableJson(
          Object.fromEntries(
            Object.entries(r)
              .filter(([k]) => !["id", "updatedAt"].includes(k))
              .sort(([a], [b]) => a.localeCompare(b)),
          ),
        );
      if (body.version === old.version && canonical(old) !== canonical(row))
        throw businessError(
          "Та же версия содержит другие суммы",
          409,
          "VERSION_CONFLICT",
        );
      result.skipped++;
      continue;
    }
    if (
      db.data.account_statements.some(
        (r) =>
          r.id !== row.id &&
          r.accountId === account.id &&
          r.period === body.period,
      )
    )
      throw businessError(
        "Период ЛС уже связан с другим внешним ID",
        409,
        "IDENTITY_CONFLICT",
      );
    if (old) {
      Object.assign(old, row);
      result.updated++;
    } else {
      db.data.account_statements.push(row);
      result.created++;
    }
  }
  return result;
}
function applyAccounts(db, source, items) {
  const result = { created: 0, updated: 0, skipped: 0 };
  for (const input of items) {
    // External payload resolves the lease through an explicit source-bound mapping.
    const { leaseExternalId, version, ...fields } = parseDto(
      accountExchangeInput,
      input,
    );
    const link = db.data.external_links.find(
      (r) =>
        r.sourceId === source.id &&
        r.entityType === "leases" &&
        r.externalId === leaseExternalId,
    );
    if (!link)
      throw businessError(
        `Не сопоставлен договор: ${leaseExternalId}`,
        422,
        "MISSING_MAPPING",
      );
    const mapping = db.data.external_links.find(
      (r) =>
        r.sourceId === source.id &&
        r.entityType === "personal_accounts" &&
        r.externalId === fields.externalId,
    );
    const old = db.data.personal_accounts.find(
      (r) => r.sourceId === source.id && r.externalId === fields.externalId,
    );
    if (old && old.leaseId !== link.localId)
      throw businessError(
        "ЛС уже связан с другим договором",
        409,
        "IDENTITY_CONFLICT",
      );
    if (mapping && version <= mapping.version) {
      if (
        version === mapping.version &&
        stableJson(fields) !==
          stableJson(
            Object.fromEntries(Object.keys(fields).map((k) => [k, old[k]])),
          )
      )
        throw businessError(
          "Та же версия ЛС содержит другие условия",
          409,
          "VERSION_CONFLICT",
        );
      result.skipped++;
      continue;
    }
    const row = saveAccount(db, old?.id, {
      ...fields,
      sourceId: source.id,
      leaseId: link.localId,
      ...(old ? { updatedAt: old.updatedAt } : {}),
    });
    saveExternalLink(db, {
      sourceId: source.id,
      entityType: "personal_accounts",
      externalId: row.externalId,
      localId: row.id,
      version,
    });
    result[old ? "updated" : "created"]++;
  }
  return result;
}
function applyCatalog(db, source, kind, items) {
  const result = { created: 0, updated: 0, skipped: 0 };
  const seen = new Set();
  for (const input of items) {
    const body = parseDto(
      {
        properties: propertyExchangeInput,
        units: unitExchangeInput,
        tenants: tenantExchangeInput,
        leases: leaseExchangeInput,
        meters: meterExchangeInput,
      }[kind],
      input,
    );
    if (seen.has(body.externalId))
      throw businessError(
        "В пакете повторен внешний ID",
        409,
        "IDENTITY_CONFLICT",
      );
    seen.add(body.externalId);
    const mapping = db.data.external_links.find(
      (r) =>
        r.sourceId === source.id &&
        r.entityType === kind &&
        r.externalId === body.externalId,
    );
    const hash = crypto
      .createHash("sha256")
      .update(stableJson(body))
      .digest("hex");
    if (mapping) {
      requiredRecord(db, kind, mapping.localId);
      if (
        db.data.external_links.some(
          (r) =>
            r.sourceId !== source.id &&
            r.entityType === kind &&
            r.localId === mapping.localId,
        )
      )
        throw businessError(
          "Запись связана с несколькими источниками; определите источник изменений",
          409,
          "IDENTITY_CONFLICT",
        );
      if (body.version <= mapping.version) {
        if (body.version === mapping.version && mapping.payloadHash !== hash)
          throw businessError(
            "Та же версия справочника содержит другие данные или не имеет подтвержденного снимка",
            409,
            "VERSION_CONFLICT",
          );
        result.skipped++;
        continue;
      }
    }
    const { externalId, version, propertyExternalId, ...fields } = body;
    let record;
    const resolve = (type, id) => {
      const ref = db.data.external_links.find(
        (r) =>
          r.sourceId === source.id &&
          r.entityType === type &&
          r.externalId === id,
      );
      if (!ref)
        throw businessError(
          `Не сопоставлена запись ${type}: ${id}`,
          422,
          "MISSING_MAPPING",
        );
      return requiredRecord(db, type, ref.localId);
    };
    if (kind === "tenants") {
      // Imported accounting contacts never enroll, reactivate or rebind a user.
      // Empty contacts are genuinely absent; no fake phones/emails are generated.
      const { name, inn, contactName, phone, email } = fields;
      if (
        inn &&
        db.data.tenants.some((r) => r.id !== mapping?.localId && r.inn === inn)
      )
        throw businessError(
          "Контрагент с этим ИНН уже существует: требуется явное сопоставление",
          409,
          "MISSING_MAPPING",
        );
      const values = {
        name,
        inn,
        contact_name: contactName,
        phone,
        email,
        updated_at: now(),
      };
      if (mapping) {
        record = requiredRecord(db, "tenants", mapping.localId);
        Object.assign(record, values);
      } else {
        record = {
          id: crypto.randomUUID(),
          ...values,
          risk_level: "low",
          status: "active",
          created_at: now(),
        };
        db.data.tenants.push(record);
      }
    } else if (kind === "leases") {
      const { tenantExternalId, unitExternalId, ...conditions } = fields;
      const data = {
        ...conditions,
        tenantId: resolve("tenants", tenantExternalId).id,
        unitId: resolve("units", unitExternalId).id,
      };
      record = mapping
        ? db.updateLease(mapping.localId, data)
        : db.createLease(data);
    } else if (kind === "meters") {
      const { unitExternalId, ...values } = fields;
      const data = {
        ...values,
        propertyId: resolve("properties", propertyExternalId).id,
        unitId:
          unitExternalId === null ? null : resolve("units", unitExternalId).id,
        responsibleId: null,
      };
      // A machine source does not acquire user privileges. Domain validation is
      // reused with an internal actor only after source-bound parents resolve.
      record = saveOperation(
        db,
        { id: source.createdBy, role: "admin" },
        "meters",
        mapping?.localId ?? null,
        data,
      );
    } else if (kind === "properties") {
      record = mapping
        ? db.updateProperty(mapping.localId, fields)
        : db.createProperty(fields);
    } else {
      const parent = db.data.external_links.find(
        (r) =>
          r.sourceId === source.id &&
          r.entityType === "properties" &&
          r.externalId === propertyExternalId,
      );
      if (!parent)
        throw businessError(
          `Не сопоставлен объект: ${propertyExternalId}`,
          422,
          "MISSING_MAPPING",
        );
      requiredRecord(db, "properties", parent.localId);
      // Importing geometry must not reset occupancy or client layout.
      const data = { ...fields, propertyId: parent.localId };
      record = mapping
        ? db.updateUnit(mapping.localId, data)
        : db.createUnit({ ...data, status: "vacant" });
    }
    const link = saveExternalLink(db, {
      sourceId: source.id,
      entityType: kind,
      externalId,
      localId: record.id,
      version,
    });
    link.payloadHash = hash;
    result[mapping ? "updated" : "created"]++;
  }
  return result;
}
export function processExchange(db, sourceId, input, serverEnvironment) {
  const body = parseDto(exchangeMessage, input),
    source = requiredRecord(db, "accounting_sources", sourceId);
  if (!source.active) throw businessError("Источник отключен", 403);
  if (
    body.environment !== source.environment ||
    body.environment !== serverEnvironment
  )
    throw businessError(
      "Пакет из другой среды отклонен",
      409,
      "ENVIRONMENT_MISMATCH",
    );
  const hash = crypto
    .createHash("sha256")
    .update(stableJson(body))
    .digest("hex");
  let row = db.data.exchange_inbox.find(
    (r) => r.sourceId === sourceId && r.messageId === body.messageId,
  );
  if (row && row.payloadHash !== hash)
    throw businessError(
      "ID сообщения повторен с другим содержимым",
      409,
      "MESSAGE_CONFLICT",
    );
  if (row?.status === "applied")
    return {
      ...row,
      payload: undefined,
      payloadHash: undefined,
      duplicate: true,
    };
  if (!row) {
    row = {
      id: crypto.randomUUID(),
      sourceId,
      messageId: body.messageId,
      kind: body.kind,
      payloadHash: hash,
      payload: body,
      status: "pending",
      attempts: 0,
      error: null,
      correlationId: body.messageId,
      result: null,
      nextAttemptAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.data.exchange_inbox.push(row);
  }
  const rowId = row.id;
  row.attempts++;
  row.updatedAt = now();
  const before = structuredClone(db.data);
  try {
    const result = [
      "properties",
      "units",
      "tenants",
      "leases",
      "meters",
    ].includes(body.kind)
      ? applyCatalog(db, source, body.kind, body.items)
      : body.kind === "statements"
        ? applyStatements(db, source, body.items)
        : applyAccounts(db, source, body.items);
    row.status = "applied";
    row.result = result;
    row.error = null;
    row.nextAttemptAt = null;
  } catch (error) {
    // Keep the durable failure while rolling back every business row from this package.
    // Restore the collections on the current domain object. Assigning db.data
    // would shadow the PostgreSQL facade's proxy, leaving partial writes behind.
    // This also works inside an outer domain transaction (nested savepoint).
    Object.assign(db.data, before);
    row = requiredRecord(db, "exchange_inbox", rowId);
    row.status = "failed";
    row.error = error.message;
    row.nextAttemptAt = new Date(
      Date.now() + Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7)) * 1000,
    ).toISOString();
  }
  return {
    ...row,
    payload: undefined,
    payloadHash: undefined,
    duplicate: false,
  };
}
export function enqueueExchange(db, sourceId, kind, messageId, payload) {
  requiredRecord(db, "accounting_sources", sourceId);
  const payloadHash = crypto
    .createHash("sha256")
    .update(stableJson(payload))
    .digest("hex");
  const old = db.data.exchange_outbox.find(
    (r) => r.sourceId === sourceId && r.messageId === messageId,
  );
  if (old) {
    if (old.payloadHash !== payloadHash)
      throw businessError("Исходящий ID уже использован", 409);
    return old;
  }
  const row = {
    id: crypto.randomUUID(),
    sourceId,
    messageId,
    kind,
    payloadHash,
    payload,
    status: "pending",
    attempts: 0,
    error: null,
    correlationId: messageId,
    result: null,
    nextAttemptAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  db.data.exchange_outbox.push(row);
  return row;
}
