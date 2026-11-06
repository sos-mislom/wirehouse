import { fixture } from "./fixtures.mjs";
import {
  saveSource,
  saveAccount,
  saveExternalLink,
} from "../apps/api/src/domain/accounting.js";

export function meterInput(f, patch = {}) {
  return {
    propertyId: f.property.id,
    unitId: f.unit.id,
    accountId: f.account.id,
    name: "Тестовый новый водосчётчик",
    scope: "individual",
    resource: "water",
    serialNumber: "DEMO-NEW-001",
    tariff: 50,
    initialValue: 0,
    responsibleId: f.worker.id,
    active: true,
    ...patch,
  };
}

export function meterRegistrationFixture() {
  const f = fixture();
  f.source = saveSource(f.db, f.admin, null, {
    name: "БП — новый счётчик",
    environment: "test",
    active: true,
  });
  f.account = saveAccount(f.db, null, {
    sourceId: f.source.id,
    leaseId: f.lease.id,
    externalId: "account-new-meter",
    number: "ЛС-001",
    status: "active",
    validFrom: f.lease.start_date,
    validTo: null,
  });
  for (const [entityType, localId, externalId] of [
    ["properties", f.property.id, "property-native"],
    ["units", f.unit.id, "unit-native"],
    ["leases", f.lease.id, "contract-native"],
  ])
    saveExternalLink(f.db, {
      sourceId: f.source.id,
      entityType,
      localId,
      externalId,
      version: 1,
    });
  return f;
}
