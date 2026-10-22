import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fixture } from "./fixtures.mjs";
import {
  saveSource,
  saveExternalLink,
  processExchange,
} from "../apps/api/src/domain/accounting.js";

export const propertyItem = (version = 1) => ({
  externalId: "building-1",
  version,
  name: "Импортированный объект",
  address: "Тестовый адрес",
  totalArea: 1000,
  rentableArea: 900,
  warehouseClass: "B",
});
export const unitItem = (version = 1) => ({
  externalId: "unit-1",
  propertyExternalId: "building-1",
  version,
  number: "101",
  floor: 1,
  area: 100,
  type: "office",
  building: "A",
  entrance: "1",
});
export const catalogMessage = (kind, items) => ({
  messageId: crypto.randomUUID(),
  environment: "test",
  schemaVersion: 1,
  kind,
  items,
});
const source = (f) =>
  saveSource(f.db, f.admin, null, {
    name: "Тестовая БП",
    environment: "test",
    active: true,
  });
const link = (f, s, type) =>
  f.db.data.external_links.find(
    (r) => r.sourceId === s.id && r.entityType === type,
  );

test("Catalog import creates source-bound objects and units without resetting operational state", () => {
  const f = fixture();
  try {
    const s = source(f);
    const packet = catalogMessage("properties", [propertyItem()]);
    assert.deepEqual(processExchange(f.db, s.id, packet, "test").result, {
      created: 1,
      updated: 0,
      skipped: 0,
    });
    assert.equal(processExchange(f.db, s.id, packet, "test").duplicate, true);
    assert.equal(
      processExchange(f.db, s.id, catalogMessage("units", [unitItem()]), "test")
        .status,
      "applied",
    );
    const p = f.db.getById("properties", link(f, s, "properties").localId);
    const u = f.db.getById("units", link(f, s, "units").localId);
    assert.equal(u.property_id, p.id);
    p.description = "CRM description";
    u.status = "maintenance";
    u.plan_x = 42;
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("properties", [
          { ...propertyItem(2), name: "Новое имя" },
        ]),
        "test",
      ).result.updated,
      1,
    );
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("units", [{ ...unitItem(2), area: 120 }]),
        "test",
      ).result.updated,
      1,
    );
    assert.equal(p.description, "CRM description");
    assert.equal(u.status, "maintenance");
    assert.equal(u.plan_x, 42);
    assert.equal(u.area, 120);
    assert.match(link(f, s, "units").payloadHash, /^[a-f0-9]{64}$/);
    // Comparison uses the source snapshot, not mutable operational data.
    f.db.getById("properties", p.id).name = "Местное уточнение";
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("properties", [
          { ...propertyItem(2), name: "Новое имя" },
        ]),
        "test",
      ).result.skipped,
      1,
    );
    assert.equal(p.name, "Местное уточнение");
  } finally {
    f.cleanup();
  }
});

test("Catalog source snapshots reject changed same-version payloads and ignore stale versions", () => {
  const f = fixture();
  try {
    const s = source(f);
    processExchange(
      f.db,
      s.id,
      catalogMessage("properties", [propertyItem(2)]),
      "test",
    );
    const conflict = processExchange(
      f.db,
      s.id,
      catalogMessage("properties", [
        { ...propertyItem(2), name: "Conflicting" },
      ]),
      "test",
    );
    assert.equal(conflict.status, "failed");
    assert.match(conflict.error, /версия/);
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("properties", [propertyItem(1)]),
        "test",
      ).result.skipped,
      1,
    );
    const id = link(f, s, "properties").localId;
    assert.equal(f.db.getById("properties", id).name, propertyItem().name);
  } finally {
    f.cleanup();
  }
});

test("A partial catalog failure rolls back entities, normalized locations and snapshots; the identical package retries", () => {
  const f = fixture();
  try {
    const s = source(f);
    const packet = catalogMessage("units", [
      unitItem(),
      { ...unitItem(), externalId: "unit-2", propertyExternalId: "missing" },
    ]);
    const before = structuredClone(f.db.data);
    assert.equal(processExchange(f.db, s.id, packet, "test").status, "failed");
    assert.deepEqual(f.db.data.units, before.units);
    processExchange(
      f.db,
      s.id,
      catalogMessage("properties", [propertyItem()]),
      "test",
    );
    const afterProperty = structuredClone(f.db.data);
    assert.equal(
      f.db.transaction(() => processExchange(f.db, s.id, packet, "test"))
        .status,
      "failed",
    );
    for (const name of [
      "units",
      "buildings",
      "entrances",
      "floors",
      "external_links",
    ])
      assert.deepEqual(f.db.data[name], afterProperty[name]);
    processExchange(
      f.db,
      s.id,
      catalogMessage("properties", [
        { ...propertyItem(), externalId: "missing" },
      ]),
      "test",
    );
    assert.equal(processExchange(f.db, s.id, packet, "test").status, "applied");
    assert.equal(processExchange(f.db, s.id, packet, "test").duplicate, true);
  } finally {
    f.cleanup();
  }
});

test("Identical external IDs in two bases stay independent and foreign parents are never guessed", () => {
  const f = fixture();
  try {
    const a = source(f),
      b = source(f);
    const users = structuredClone(f.db.data.users);
    const assignments = structuredClone(f.db.data.user_assignments);
    processExchange(
      f.db,
      a.id,
      catalogMessage("properties", [propertyItem()]),
      "test",
    );
    assert.equal(
      processExchange(f.db, b.id, catalogMessage("units", [unitItem()]), "test")
        .status,
      "failed",
    );
    processExchange(
      f.db,
      b.id,
      catalogMessage("properties", [propertyItem()]),
      "test",
    );
    assert.notEqual(
      link(f, a, "properties").localId,
      link(f, b, "properties").localId,
    );
    assert.equal(
      processExchange(f.db, b.id, catalogMessage("units", [unitItem()]), "test")
        .status,
      "applied",
    );
    assert.deepEqual(f.db.data.users, users);
    assert.deepEqual(f.db.data.user_assignments, assignments);
  } finally {
    f.cleanup();
  }
});

test("Explicit mappings bootstrap existing records but ambiguous ownership and parent changes fail atomically", () => {
  const f = fixture();
  try {
    const s = source(f);
    saveExternalLink(f.db, {
      sourceId: s.id,
      entityType: "properties",
      externalId: "building-1",
      localId: f.property.id,
      version: 0,
    });
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("properties", [propertyItem()]),
        "test",
      ).result.updated,
      1,
    );
    processExchange(f.db, s.id, catalogMessage("units", [unitItem()]), "test");
    processExchange(
      f.db,
      s.id,
      catalogMessage("properties", [
        { ...propertyItem(), externalId: "building-2" },
      ]),
      "test",
    );
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("units", [
          { ...unitItem(2), propertyExternalId: "building-2" },
        ]),
        "test",
      ).status,
      "failed",
    );
    const other = source(f);
    saveExternalLink(f.db, {
      sourceId: other.id,
      entityType: "properties",
      externalId: "shared",
      localId: f.property.id,
      version: 0,
    });
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("properties", [propertyItem(2)]),
        "test",
      ).status,
      "failed",
    );
  } finally {
    f.cleanup();
  }
});

test("Catalog validation rejects duplicate IDs, unknown operational fields and invalid areas without partial writes", () => {
  const f = fixture();
  try {
    const s = source(f),
      before = structuredClone(f.db.data.properties);
    for (const items of [
      [propertyItem(), propertyItem()],
      [
        propertyItem(),
        { ...propertyItem(), externalId: "bad", totalArea: "1000" },
      ],
      [{ ...propertyItem(), rentableArea: 2000 }],
      [{ ...propertyItem(), localId: f.property.id }],
    ]) {
      assert.equal(
        processExchange(f.db, s.id, catalogMessage("properties", items), "test")
          .status,
        "failed",
      );
      assert.deepEqual(f.db.data.properties, before);
      assert.equal(f.db.data.external_links.length, 0);
    }
    assert.throws(
      () =>
        processExchange(
          f.db,
          s.id,
          {
            ...catalogMessage("properties", [propertyItem()]),
            environment: "production",
          },
          "test",
        ),
      /среды/,
    );
    assert.equal(
      processExchange(
        f.db,
        s.id,
        catalogMessage("units", [{ ...unitItem(), status: "occupied" }]),
        "test",
      ).status,
      "failed",
    );
  } finally {
    f.cleanup();
  }
});
