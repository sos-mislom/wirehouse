import crypto from "node:crypto";
import { parseDto } from "../http/body.js";
import { meterExchangeInput } from "../../../../packages/contracts/src/accounting.ts";
import { requireContext } from "./context-access.js";
import {
  businessError,
  requiredRecord,
  saveExternalLink,
  enqueueExchange,
} from "./accounting.js";

export function meterRegistration(db, meterId, sourceId = null) {
  const links = db.data.external_links.filter(
    (link) =>
      link.entityType === "meters" &&
      link.localId === meterId &&
      (!sourceId || link.sourceId === sourceId),
  );
  return db.data.exchange_outbox.find(
    (message) =>
      message.kind === "meter_registrations" &&
      links.some(
        (link) =>
          link.sourceId === message.sourceId &&
          link.externalId === message.payload?.catalog?.externalId,
      ),
  );
}

export function meterIntegration(db, meter) {
  const registration = meterRegistration(db, meter.id),
    links = db.data.external_links.filter(
      (link) => link.entityType === "meters" && link.localId === meter.id,
    );
  return {
    ...meter,
    integrationStatus:
      registration?.status ?? (links.length ? "linked" : "local"),
    registrationId: registration?.id ?? null,
    sourceId:
      registration?.sourceId ?? (links.length === 1 ? links[0].sourceId : null),
  };
}

export function registerCreatedMeter(db, actor, meter, accountId) {
  const account = requiredRecord(db, "personal_accounts", accountId),
    source = requiredRecord(db, "accounting_sources", account.sourceId),
    lease = requiredRecord(db, "leases", account.leaseId);
  requireContext(db, actor, "readings.submit", "personal_accounts", account.id);
  if (!source.active || account.status !== "active")
    throw businessError("Лицевой счёт или источник учёта отключён", 409);
  if (!meter.unitId || lease.unit_id !== meter.unitId)
    throw businessError("Лицевой счёт не относится к помещению прибора");
  if (Number(meter.initialValue.toFixed(10)) !== meter.initialValue)
    throw businessError(
      "Начальное показание для 1С должно содержать не более 10 знаков после точки",
    );
  const link = (entityType, localId) => {
    const found = db.data.external_links.find(
      (row) =>
        row.sourceId === source.id &&
        row.entityType === entityType &&
        row.localId === localId,
    );
    if (!found)
      throw businessError(
        "Сначала сопоставьте объект, помещение и договор с источником учёта",
        422,
        "MISSING_MAPPING",
      );
    return found;
  };
  const propertyLink = link("properties", meter.propertyId),
    unitLink = link("units", meter.unitId);
  link("leases", lease.id);
  const externalId = crypto.randomUUID(),
    catalog = parseDto(meterExchangeInput, {
      externalId,
      version: 1,
      propertyExternalId: propertyLink.externalId,
      unitExternalId: unitLink.externalId,
      name: meter.name,
      resource: meter.resource,
      scope: meter.scope,
      serialNumber: meter.serialNumber,
      initialValue: meter.initialValue,
      tariff: meter.tariff,
      active: meter.active,
    });
  saveExternalLink(db, {
    sourceId: source.id,
    entityType: "meters",
    externalId,
    localId: meter.id,
    version: 0,
  });
  const message = enqueueExchange(
    db,
    source.id,
    "meter_registrations",
    "meter-registration-" + meter.id,
    {
      schemaVersion: 1,
      catalog,
      binding: {
        externalId,
        accountExternalId: account.externalId,
        initialValue: meter.initialValue,
        active: meter.active,
      },
    },
  );
  db.audit(actor, "meter_registration_queued", "meters", meter.id, {
    sourceId: source.id,
    accountId: account.id,
    externalId,
    outboxId: message.id,
  });
  return message;
}
