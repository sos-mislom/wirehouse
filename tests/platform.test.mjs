import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  saveStructure,
  deleteStructure,
} from "../apps/api/src/domain/structure.js";
import { nextOccurrence } from "../apps/api/src/domain/maintenance.js";
import {
  saveEstimate,
  transitionEstimate,
} from "../apps/api/src/domain/estimates.js";
import { importDxf } from "../apps/api/src/domain/cad.js";
import {
  saveOperation,
  runMaintenance,
  updateUser,
} from "../apps/api/src/operations.js";
import { appendAudit } from "../apps/api/src/persistence/audit.js";
import { hasPermission } from "../packages/contracts/src/permissions.ts";
import { routePermission } from "../apps/api/src/services/permissions.js";

test("Explicit permissions revoke writes and cannot exceed a role ceiling", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  updateUser(f.db, f.admin, f.manager.id, { permissions: ["workspace.read"] });
  const manager = f.db.getUserById(f.manager.id);
  assert.equal(hasPermission(manager, "billing.write"), false);
  assert.equal(
    hasPermission({ ...f.worker, permissions: ["audit.read"] }, "audit.read"),
    false,
  );
  assert.throws(
    () =>
      updateUser(f.db, f.manager, f.worker.id, { permissions: ["audit.read"] }),
    /Нет права/,
  );
  assert.equal(
    routePermission("POST", "/api/estimates/abc/approve"),
    "estimates.approve",
  );
  assert.equal(
    routePermission("POST", "/api/maintenance/materials"),
    "services.write",
  );
});
test("Normalized locations preserve IDs on rename and reject foreign parents and occupied deletion", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const floor = f.db.getById("floors", f.unit.floor_id),
    entrance = f.db.getById("entrances", floor.entranceId),
    building = f.db.getById("buildings", entrance.buildingId);
  saveStructure(f.db, "buildings", building.id, {
    propertyId: f.property.id,
    name: "Новый корпус",
    updatedAt: building.updatedAt,
  });
  assert.equal(f.db.getById("units", f.unit.id).building, "Новый корпус");
  assert.equal(f.db.getById("units", f.unit.id).floor_id, floor.id);
  assert.throws(() => deleteStructure(f.db, "floors", floor.id), /дочерние/);
  assert.throws(
    () =>
      saveStructure(f.db, "entrances", null, {
        propertyId: f.other.id,
        buildingId: building.id,
        name: "2",
      }),
    /другого объекта/,
  );
  assert.throws(
    () => f.db.updateUnit(f.unit.id, { floorId: f.otherUnit.floor_id }),
    /не принадлежит/,
  );
});
test("Monthly and yearly PPR preserve calendar anchors, lead time and end date", (t) => {
  assert.equal(
    nextOccurrence(
      { recurrence: "months", intervalCount: 1, anchorDay: 31 },
      "2028-01-31",
    ),
    "2028-02-29",
  );
  assert.equal(
    nextOccurrence(
      { recurrence: "months", intervalCount: 1, anchorDay: 31 },
      "2028-02-29",
    ),
    "2028-03-31",
  );
  assert.equal(
    nextOccurrence(
      { recurrence: "years", intervalCount: 1, anchorDay: 29 },
      "2028-02-29",
    ),
    "2029-02-28",
  );
  const f = fixture();
  t.after(f.cleanup);
  const plan = saveOperation(f.db, f.admin, "plans", null, {
    name: "План",
    propertyId: f.property.id,
    unitId: f.unit.id,
    nextDate: "2028-01-31",
    endDate: "2028-03-31",
    recurrence: "months",
    intervalCount: 1,
    leadDays: 10,
    checklist: ["Проверить"],
  });
  assert.equal(runMaintenance(f.db, "2028-01-21").length, 1);
  assert.equal(runMaintenance(f.db, "2028-01-21").length, 0);
  assert.equal(runMaintenance(f.db, "2028-05-01").length, 2);
  assert.equal(f.db.getById("maintenance_plans", plan.id).active, false);
});
test("Estimate agreement freezes prices; acts require complete work and remain independent of catalog changes", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    unitId: f.unit.id,
    createdBy: f.admin.id,
    title: "Работы",
    description: "Описание",
    category: "maintenance",
    priority: "medium",
  });
  const input = {
    propertyId: f.property.id,
    ticketId: ticket.id,
    name: "Ремонт",
    contractorId: null,
    version: 0,
    lines: [
      {
        kind: "labor",
        catalogId: null,
        description: "Монтаж",
        unit: "ч",
        quantity: 1.5,
        unitPrice: 100.03,
        vatRate: "20",
      },
    ],
  };
  const row = saveEstimate(f.db, f.admin, null, input);
  assert.equal(row.total, 180.06);
  transitionEstimate(f.db, f.admin, row.id, "submit", { version: 1 });
  assert.throws(
    () => saveEstimate(f.db, f.admin, row.id, { ...input, version: 2 }),
    /согласование/,
  );
  assert.throws(
    () => transitionEstimate(f.db, f.admin, row.id, "approve", { version: 1 }),
    /устарела/,
  );
  transitionEstimate(f.db, f.admin, row.id, "approve", { version: 2 });
  assert.throws(
    () => transitionEstimate(f.db, f.admin, row.id, "act", { version: 3 }),
    /выполнения/,
  );
  const stored = f.db.getById("tickets", ticket.id);
  stored.status = "completed";
  stored.checklist_items.forEach((c) => (c.completed = true));
  const { act } = transitionEstimate(f.db, f.admin, row.id, "act", {
    version: 3,
  });
  row.lines[0].unitPrice = 999;
  assert.equal(act.snapshot.lines[0].unitPrice, 100.03);
  assert.throws(
    () => transitionEstimate(f.db, f.admin, row.id, "act", { version: 4 }),
    /недоступно/,
  );
  const revised = saveEstimate(f.db, f.admin, null, input);
  transitionEstimate(f.db, f.admin, revised.id, "submit", { version: 1 });
  const reviewer = {
    ...f.manager,
    permissions: ["workspace.read", "estimates.approve"],
  };
  transitionEstimate(f.db, reviewer, revised.id, "reject", {
    version: 2,
    reason: "Уточнить объём",
  });
  assert.equal(revised.status, "rejected");
  assert.throws(
    () => saveEstimate(f.db, reviewer, revised.id, { ...input, version: 3 }),
    /Нет права/,
  );
});
test("Audit records every business diff while excluding authentication and upload secrets", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const before = structuredClone(f.db.data);
  f.db.updateProperty(f.property.id, { name: "Изменено" });
  f.db.getById("users", f.admin.id).password_hash = "sensitive-password";
  appendAudit(before, f.db.data, {
    actor: f.admin,
    requestId: "correlation",
    source: "PUT /api/properties",
  });
  assert.equal(f.db.data.audit_log.length, 2);
  assert.ok(
    f.db.data.audit_log.every((a) => a.changes.requestId === "correlation"),
  );
  assert.equal(
    JSON.stringify(f.db.data.audit_log).includes("sensitive-password"),
    false,
  );
});
test("DXF import creates actual geometry and reports unsupported entities", () => {
  const dxf = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "LINE",
    "8",
    "Walls",
    "10",
    "0",
    "20",
    "0",
    "11",
    "100",
    "21",
    "100",
    "0",
    "CIRCLE",
    "8",
    "Equipment",
    "10",
    "20",
    "20",
    "30",
    "40",
    "5",
    "0",
    "POINT",
    "10",
    "2",
    "20",
    "3",
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");
  const result = importDxf(dxf);
  assert.equal(result.geometry.length, 2);
  assert.equal(result.geometry[0].points[1].y, -100);
  assert.match(result.warnings.join(), /POINT/);
  assert.throws(() => importDxf("AutoCAD Binary DXF"), /текстовый DXF/);
});
