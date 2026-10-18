import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { createToken } from "../../apps/api/src/auth.js";
import { saveAssignment } from "../../apps/api/src/domain/context-access.js";

test("HTTP lists, file URLs and exports enforce history dates and document write permissions", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const current = new Date().toISOString().slice(0, 7);
  const previous = new Date(
    Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)) - 2, 1),
  )
    .toISOString()
    .slice(0, 7);
  const portal = f.db.getTenantPortalUser(f.tenant.id);
  f.db.data.user_assignments = f.db.data.user_assignments.filter(
    (a) => a.userId !== portal.id && a.userId !== f.manager.id,
  );
  for (const [user, businessRole, scopeType, scopeId] of [
    [portal, "owner", "lease", f.lease.id],
    [f.manager, "manager", "property", f.property.id],
  ])
    saveAssignment(f.db, f.admin, null, {
      userId: user.id,
      businessRole,
      scopeType,
      scopeId,
      permissions: [
        "workspace.read",
        "finance.read",
        "documents.read",
        ...(businessRole === "manager"
          ? ["documents.write", "leases.write"]
          : []),
      ],
      validFrom: "2020-01-01",
      validTo: previous + "-28",
      retainHistory: true,
      reason: "Исторический доступ",
    });
  f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period: previous,
    rentAmount: 123,
    dueDate: previous + "-15",
  });
  f.db.createBillingInvoice({
    leaseId: f.lease.id,
    period: current,
    rentAmount: 987654,
    dueDate: current + "-15",
  });
  fs.mkdirSync(f.dir + "/documents");
  const files = ["history.pdf", "new.pdf"].map((storedName) => {
    fs.writeFileSync(f.dir + "/documents/" + storedName, "%PDF-test");
    return f.db.createLeaseDocument({
      leaseId: f.lease.id,
      fileName: storedName,
      storedName,
      category: "lease",
      mimeType: "application/pdf",
      sizeBytes: 9,
      uploadedBy: f.admin.id,
    });
  });
  f.db.getById("entity_documents", files[0].id).createdAt =
    previous + "-01T00:00:00.000Z";
  f.db.getById("lease_documents", files[0].id).created_at =
    previous + "-01T00:00:00.000Z";
  const pg = await postgresFixture(f.db.data);
  t.after(pg.cleanup);
  const listener = net.createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const secret = "history-integration-secret-at-least-32-characters";
  let logs = "";
  const api = spawn(process.execPath, ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: pg.url,
      POSTGRES_URL: "",
      REDIS_URL: "",
      JWT_ACCESS_SECRET: secret,
      NOTIFICATION_CHANNELS: "in_app",
      WAREHOUSE_DOCUMENTS_PATH: f.dir + "/documents",
      WAREHOUSE_TICKET_ATTACHMENTS_PATH: f.dir + "/tickets",
      TELEGRAM_BOT_TOKEN: "",
      VK_GROUP_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", (d) => (logs += d));
  api.stderr.on("data", (d) => (logs += d));
  t.after(async () => {
    if (api.exitCode === null) {
      api.kill("SIGTERM");
      await once(api, "exit");
    }
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    if (api.exitCode !== null) throw Error(logs);
    await new Promise((r) => setTimeout(r, 30));
  }
  const call = async (path, actor = portal, method = "GET", body) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${createToken({ sub: actor.id }, secret)}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      body: response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : null,
    };
  };
  for (const actor of [portal, f.manager]) {
    const list = await call(`/api/leases/${f.lease.id}/documents`, actor);
    assert.equal(list.status, 200, list.text);
    assert.deepEqual(
      list.body.items.map((d) => d.id),
      [files[0].id],
    );
    assert.deepEqual(
      (await call("/api/documents", actor)).body.items.map((d) => d.id),
      [files[0].id],
    );
    assert.equal(
      (await call(`/api/documents/${files[0].id}/file`, actor)).status,
      200,
    );
    assert.equal(
      (await call(`/api/leases/${f.lease.id}/documents/${files[0].id}`, actor))
        .status,
      200,
    );
    assert.equal(
      (await call(`/api/documents/${files[1].id}/file`, actor)).status,
      403,
    );
    assert.equal(
      (await call(`/api/leases/${f.lease.id}/documents/${files[1].id}`, actor))
        .status,
      403,
    );
    for (const path of [
      "/api/exports/billing-ledger",
      `/api/units/${f.unit.id}/export`,
    ]) {
      const exported = await call(path, actor);
      assert.equal(exported.status, 200, exported.text);
      assert.ok(!exported.text.includes("987654"), path);
      assert.ok(!exported.text.includes("new.pdf"), path);
    }
    assert.deepEqual(
      (
        await call(`/api/tenants/${f.tenant.id}/detail`, actor)
      ).body.payments.map((p) => p.amount),
      [123],
    );
  }
  const dashboard = (await call("/api/dashboard/overview", f.manager)).body;
  assert.equal(dashboard.finance.collectionBilled, 0);
  assert.equal(dashboard.finance.arrearsAmount, 123);
  assert.ok(dashboard.finance.series.every((s) => s.details.length === 0));
  assert.equal(
    (
      await call(`/api/leases/${f.lease.id}/documents`, f.manager, "POST", {
        fileName: "denied.pdf",
        mimeType: "application/pdf",
        contentBase64: "YQ==",
        category: "other",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/api/leases/${f.lease.id}/documents/${files[0].id}`,
        f.manager,
        "DELETE",
      )
    ).status,
    403,
  );
});
