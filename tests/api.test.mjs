import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fixture } from "./fixtures.mjs";
import { postgresFixture } from "./postgres/helpers.mjs";
import { createToken } from "../apps/api/src/auth.js";
import { saveOperation } from "../apps/api/src/operations.js";
const secret = "wirehouse-test-secret";

test("API regression: scoped finance, persisted notification reads, validation and blocked sessions", async (t) => {
  if (!process.env.TEST_POSTGRES_URL)
    return t.skip("TEST_POSTGRES_URL is required for API integration tests");
  const f = fixture();
  t.after(f.cleanup);
  const period = new Date().toISOString().slice(0, 7);
  const invoice = f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period,
    rentAmount: 1000,
    variableAmount: 0,
    dueDate: `${period}-01`,
  });
  f.db.createBillingPayment({
    invoiceId: invoice.id,
    amount: 250,
    paidAt: `${period}-02`,
    method: "bank_transfer",
    reference: "test",
  });
  f.db.createBillingInvoice({
    leaseId: f.otherLease.id,
    period,
    rentAmount: 9000,
    variableAmount: 0,
    dueDate: `${period}-01`,
  });
  saveOperation(f.db, f.admin, "expenses", null, {
    name: "Ремонт",
    propertyId: f.property.id,
    date: `${period}-03`,
    amount: 100,
  });
  const unassigned = f.db.createUser({
    fullName: "Без объекта",
    email: "unassigned@test.local",
    password: "test-password-123",
    role: "manager",
    propertyId: f.property.id,
  });
  f.db.getById("users", unassigned.id).property_id = null;
  const task = f.db.createTicket({
    unitId: f.unit.id,
    createdBy: f.admin.id,
    tenantId: f.tenant.id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "urgent",
    title: "Проверить щит",
    description: "Проверка",
  });
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const pg = await postgresFixture(f.db.data);
  const env = {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(port),
    DATABASE_URL: pg.url,
    POSTGRES_URL: "",
    REDIS_URL: "",
    JWT_ACCESS_SECRET: secret,
    NOTIFICATION_CHANNELS: "in_app",
    TELEGRAM_BOT_TOKEN: "",
    VK_GROUP_TOKEN: "",
  };
  let child;
  let output = "";
  const start = async () => {
    child = spawn(process.execPath, ["apps/api/src/index.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return;
      } catch {}
      if (child.exitCode !== null) throw Error(output);
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error(output);
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  };
  t.after(async () => {
    await stop();
    await pg.cleanup();
  });
  const call = async (path, user = f.manager, method = "GET", body) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken({ sub: user.id, role: user.role }, secret)}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };
  await start();
  assert.equal((await call("/api/solution-contour")).status, 404);
  const invalid = await call("/api/properties", f.admin, "POST", {
    name: "A",
    address: "A",
    totalArea: "100",
    rentableArea: 80,
    warehouseClass: "A",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.ok(invalid.body.fields.some((field) => field.path === "totalArea"));
  assert.equal((await call("/api/agenda", f.worker)).status, 403);
  assert.equal(
    (await call("/api/dashboard/overview", unassigned)).body.properties.length,
    0,
  );
  assert.equal(
    (await call("/api/operations", unassigned)).body.equipment.length,
    0,
  );
  assert.equal(
    (
      await call("/api/properties", unassigned, "POST", {
        name: "Нельзя",
        address: "Москва",
        totalArea: 100,
        rentableArea: 80,
        warehouseClass: "A",
      })
    ).status,
    403,
  );
  assert.equal((await call("/api/agenda?days=365", f.manager)).status, 400);
  assert.equal((await call("/api/agenda?days=90", f.manager)).status, 200);
  assert.equal(
    (
      await call(`/api/leases/${f.lease.id}/renewal`, f.manager, "PUT", {
        status: "contacted",
        note: "Тест API",
        version: 0,
      })
    ).body.item.version,
    1,
  );
  assert.equal(
    (
      await call(`/api/leases/${f.lease.id}/renewal`, f.manager, "PUT", {
        status: "renewing",
        note: "Конкурентное изменение",
        version: 0,
      })
    ).status,
    409,
  );
  let overview = (await call("/api/dashboard/overview")).body;
  assert.equal(overview.finance.collectionBilled, 1000);
  assert.equal(overview.finance.collectionPaid, 250);
  assert.equal(overview.finance.collectionRate, 25);
  assert.equal(overview.finance.noi, 150);
  const tenant = (await call(`/api/tenants/${f.tenant.id}/detail`)).body;
  assert.equal(tenant.summary.paymentDiscipline, 25);
  assert.equal(tenant.summary.arrearsAmount, 750);
  assert.equal(tenant.payments.length, 1);
  const notification = overview.notifications.find(
    (n) => n.entityId === task.id,
  );
  assert.ok(notification?.unread);
  assert.equal(
    (
      await call(
        `/api/notifications/${notification.id}/read`,
        f.manager,
        "POST",
      )
    ).status,
    200,
  );
  await stop();
  await start();
  overview = (await call("/api/dashboard/overview")).body;
  assert.equal(
    overview.notifications.find((n) => n.id === notification.id).unread,
    false,
  );
  const completed = await call(`/api/tickets/${task.id}`, f.manager, "PUT", {
    status: "completed",
  });
  assert.equal(completed.status, 200);
  assert.ok(completed.body.item.resolvedAt);
  overview = (await call("/api/dashboard/overview")).body;
  assert.ok(!overview.notifications.some((n) => n.entityId === task.id));
  assert.equal(
    (await call(`/api/tickets/${task.id}`, f.manager, "PUT", { status: "new" }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(`/api/tickets/${task.id}`, f.manager, "PUT", {
        status: "new",
        reopenReason: "Повторная проверка",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/operations/equipment", f.manager, "POST", {
        name: "Чужое",
        propertyId: f.other.id,
        unitId: f.otherUnit.id,
        type: "Щит",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/users/${f.worker.id}`, f.manager, "PUT", {
        isActive: false,
      })
    ).status,
    200,
  );
  assert.equal((await call("/api/dashboard/overview", f.worker)).status, 401);
  assert.equal(
    (
      await call(`/api/users/${f.admin.id}`, f.manager, "PUT", {
        role: "worker",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/operations", f.admin)).body.audit.some(
      (e) => e.entityId === f.worker.id,
    ),
    true,
  );
  // Permissions are read from the current account, not from an old JWT.
  assert.equal(
    (
      await call(`/api/users/${f.manager.id}`, f.admin, "PUT", {
        permissions: ["workspace.read"],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/operations/equipment", f.manager, "POST", {
        name: "Denied",
        propertyId: f.property.id,
        unitId: f.unit.id,
        type: "Щит",
      })
    ).status,
    403,
  );
  assert.equal((await call("/api/audit", f.manager)).status, 403);
  const structure = (await call("/api/structure", f.admin)).body;
  const floor = structure.floors.find(
    (row) => row.propertyId === f.property.id,
  );
  assert.ok(floor.id);
  assert.equal(
    (await call(`/api/structure/floors/${floor.id}`, f.admin, "DELETE")).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/structure/floors/${floor.id}`, f.admin, "PUT", {
        propertyId: f.property.id,
        entranceId: floor.entranceId,
        name: "Первый этаж",
        number: 1,
        updatedAt: floor.updatedAt,
      })
    ).status,
    200,
  );
  const template = (
    await call("/api/maintenance/templates", f.admin, "POST", {
      propertyId: f.property.id,
      name: "Регламент",
      instructions: "Осмотреть",
      checklist: ["Проверить"],
    })
  ).body.item;
  assert.equal(template.version, 1);
  const plan = (
    await call("/api/operations/plans", f.admin, "POST", {
      propertyId: f.property.id,
      unitId: f.unit.id,
      name: "ППР",
      nextDate: "2029-01-31",
      recurrence: "months",
      intervalCount: 1,
      checklist: template.checklist,
      templateId: template.id,
      templateVersion: 1,
    })
  ).body.item;
  assert.equal(plan.templateVersion, 1);
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
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");
  const geometry = (
    await call("/api/operations/floorplans/import-dxf", f.admin, "POST", {
      content: dxf,
    })
  ).body.geometry;
  const floorplan = await call("/api/operations/floorplans", f.admin, "POST", {
    propertyId: f.property.id,
    name: "Этаж",
    floorId: floor.id,
    kind: "floor",
    image: "",
    markers: [],
    geometry,
  });
  assert.equal(floorplan.status, 201, JSON.stringify(floorplan.body));
  assert.equal(
    (
      await call(
        `/api/operations/floorplans/${floorplan.body.item.id}`,
        f.admin,
        "PUT",
        { name: "Stale", version: 0 },
      )
    ).status,
    409,
  );
  const input = {
    propertyId: f.property.id,
    ticketId: task.id,
    name: "Смета API",
    contractorId: null,
    version: 0,
    lines: [
      {
        kind: "labor",
        catalogId: null,
        description: "Работа",
        unit: "ч",
        quantity: 1,
        unitPrice: 100,
        vatRate: "0",
      },
    ],
  };
  const estimate = (await call("/api/estimates", f.admin, "POST", input)).body
    .item;
  assert.equal(estimate.total, 100);
  assert.equal(
    (
      await call(`/api/estimates/${estimate.id}/submit`, f.admin, "POST", {
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/estimates/${estimate.id}`, f.admin, "PUT", {
        ...input,
        version: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/estimates/${estimate.id}/approve`, f.admin, "POST", {
        version: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/estimates/${estimate.id}/act`, f.admin, "POST", {
        version: 3,
      })
    ).status,
    409,
  );
  const checklist = (await call("/api/tickets", f.admin)).body.items.find(
    (t) => t.id === task.id,
  ).checklistItems;
  for (const item of checklist)
    assert.equal(
      (
        await call(
          `/api/tickets/${task.id}/checklist/${item.id}`,
          f.admin,
          "PUT",
          { completed: true },
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await call(`/api/tickets/${task.id}`, f.admin, "PUT", {
        status: "completed",
      })
    ).status,
    200,
  );
  const issued = await call(
    `/api/estimates/${estimate.id}/act`,
    f.admin,
    "POST",
    { version: 3 },
  );
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.equal(issued.body.act.snapshot.total, 100);
  const audit = (await call(`/api/audit?entityId=${estimate.id}`, f.admin))
    .body;
  assert.equal(audit.items.length, 4);
  assert.ok(audit.items.every((row) => row.actorId === f.admin.id));
  assert.equal(
    (await call("/api/maintenance", f.manager)).body.estimates.length,
    0,
  );
});
