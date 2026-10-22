import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import {
  saveSource,
  saveAccount,
  processExchange,
} from "../../apps/api/src/domain/accounting.js";
import { migrate } from "../../apps/api/src/persistence/migrate.js";

test("Catalog migration and source snapshots survive PostgreSQL transactions, reconnect and concurrent replay", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const source = saveSource(f.db, f.admin, null, {
    name: "БП test",
    environment: "test",
    active: true,
  });
  const pg = await postgresFixture(f.db.data);
  const databases = [];
  t.after(async () => {
    for (const db of databases) await db.close();
    await pg.cleanup();
  });
  const a = await openDatabase({ databaseUrl: pg.url });
  databases.push(a);
  const b = await openDatabase({ databaseUrl: pg.url });
  databases.push(b);
  const item = {
    externalId: "building-1",
    version: 1,
    name: "Из 1С",
    address: "Тест",
    totalArea: 1000,
    rentableArea: 900,
    warehouseClass: "B",
  };
  const packet = {
    messageId: crypto.randomUUID(),
    environment: "test",
    schemaVersion: 1,
    kind: "properties",
    items: [item],
  };
  const apply = (db, message = packet) =>
    db.requestScope({}, () => processExchange(db, source.id, message, "test"));
  const results = await Promise.all([apply(a), apply(b)]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  const state = await pg.readState();
  const mapping = state.external_links.find((r) => r.sourceId === source.id);
  assert.match(mapping.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(
    state.properties.filter((r) => r.id === mapping.localId).length,
    1,
  );
  assert.equal(state.exchange_inbox.length, 1);
  assert.equal(
    (await apply(b, { ...packet, messageId: crypto.randomUUID() })).result
      .skipped,
    1,
  );
  const conflict = await apply(a, {
    ...packet,
    messageId: crypto.randomUUID(),
    items: [{ ...item, name: "Conflict" }],
  });
  assert.equal(conflict.status, "failed");
  const failedUnit = await apply(b, {
    ...packet,
    messageId: crypto.randomUUID(),
    kind: "units",
    items: [
      {
        externalId: "unit-1",
        propertyExternalId: "building-1",
        version: 1,
        number: "101",
        floor: 1,
        area: 100,
        type: "office",
        building: "A",
        entrance: "1",
      },
      {
        externalId: "unit-2",
        propertyExternalId: "unknown",
        version: 1,
        number: "102",
        floor: 1,
        area: 100,
        type: "office",
        building: "A",
        entrance: "1",
      },
    ],
  });
  assert.equal(failedUnit.status, "failed");
  const after = await pg.readState();
  for (const name of [
    "units",
    "buildings",
    "entrances",
    "floors",
    "external_links",
  ])
    assert.deepEqual(after[name], state[name]);
  await migrate(pg.pool); // Applying an already-installed migration is safe.
  assert.equal(
    (await pg.readState()).external_links[0].payloadHash,
    mapping.payloadHash,
  );
  // Regression for the existing financial import: failure must neither persist
  // partial rows nor leave a stale model on the facade for the next request.
  await a.requestScope({}, () =>
    saveAccount(a, null, {
      sourceId: source.id,
      externalId: "account-1",
      leaseId: f.lease.id,
      number: "001",
      validFrom: "2026-01-01",
      validTo: null,
      status: "active",
    }),
  );
  const statement = {
    externalId: "statement-1",
    accountExternalId: "account-1",
    period: "2026-10",
    opening: 0,
    charged: 100,
    paid: 0,
    closing: 100,
    lines: [{ service: "Аренда", amount: 100 }],
    asOf: "2026-10-22T12:00:00Z",
    version: 1,
  };
  const finance = {
    ...packet,
    messageId: crypto.randomUUID(),
    kind: "statements",
    items: [
      statement,
      { ...statement, externalId: "statement-2", accountExternalId: "missing" },
    ],
  };
  assert.equal((await apply(a, finance)).status, "failed");
  assert.equal((await pg.readState()).account_statements.length, 0);
  assert.equal(
    (
      await apply(a, {
        ...finance,
        messageId: crypto.randomUUID(),
        items: [statement],
      })
    ).status,
    "applied",
  );
  assert.equal((await pg.readState()).account_statements.length, 1);
});
