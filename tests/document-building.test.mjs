import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  registerDocument,
  listDocuments,
} from "../apps/api/src/domain/documents.js";
test("Building documents inherit the property boundary and do not broaden a tenant's unit rights", () => {
  const f = fixture();
  try {
    const building = f.db.data.buildings.find(
      (b) => b.propertyId === f.property.id,
    );
    const other = f.db.data.buildings.find((b) => b.propertyId === f.other.id);
    const body = (id) => ({
      name: "Инструкция корпуса",
      category: "instruction",
      mimeType: "application/pdf",
      links: [{ entityType: "buildings", entityId: id, phase: "general" }],
    });
    const document = registerDocument(
      f.db,
      f.manager,
      body(building.id),
      "test-only.pdf",
      10,
    );
    assert.ok(listDocuments(f.db, f.manager).some((d) => d.id === document.id));
    assert.throws(() =>
      registerDocument(f.db, f.manager, body(other.id), "test-only.pdf", 10),
    );
    assert.ok(
      !listDocuments(f.db, f.db.getTenantPortalUser(f.tenant.id)).some(
        (d) => d.id === document.id,
      ),
    );
  } finally {
    f.cleanup();
  }
});
