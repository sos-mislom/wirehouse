import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import http2 from "node:http2";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { createToken } from "../../apps/api/src/auth.js";

const secret = "wirehouse-test-secret";

const freePort = async () => {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((r) => socket.close(r));
  return port;
};

// Verifies a compact JWS the way FCM's token endpoint and APNs would.
const verifyJwt = (jwt, publicKey, algorithm) => {
  const [header, payload, signature] = jwt.split(".");
  const valid = crypto.verify(
    algorithm === "ES256" ? "sha256" : "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    algorithm === "ES256"
      ? { key: publicKey, dsaEncoding: "ieee-p1363" }
      : publicKey,
    Buffer.from(signature, "base64url"),
  );
  return valid ? JSON.parse(Buffer.from(payload, "base64url")) : null;
};

test("Push notifications reach registered Android and iOS devices after commit and drop rejected tokens", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const ticket = f.db.createTicket({
    propertyId: f.property.id,
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "medium",
    title: "Проверить щит",
    description: "Проверка",
  });
  const tenantUser = f.db.data.users.find((u) => u.tenant_id === f.tenant.id);
  assert.ok(tenantUser, "fixture tenant account");

  // Fake Firebase: OAuth token endpoint and HTTP v1 send endpoint.
  const fcmKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fcmMessages = [];
  const fcmPort = await freePort();
  const fcm = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/token") {
      const claims = verifyJwt(
        new URLSearchParams(body).get("assertion"),
        fcmKeys.publicKey,
        "RS256",
      );
      assert.equal(claims?.iss, "push@test.iam.gserviceaccount.com");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ access_token: "fcm-access", expires_in: 3600 }),
      );
    }
    assert.equal(req.url, "/v1/projects/wirehouse-test/messages:send");
    assert.equal(req.headers.authorization, "Bearer fcm-access");
    const { message } = JSON.parse(body);
    fcmMessages.push(message);
    if (message.token.startsWith("gone-")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: {
            status: "NOT_FOUND",
            details: [{ errorCode: "UNREGISTERED" }],
          },
        }),
      );
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "projects/wirehouse-test/messages/1" }));
  });
  fcm.listen(fcmPort, "127.0.0.1");
  await once(fcm, "listening");

  // Fake APNs over cleartext HTTP/2.
  const apnsKeys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const apnsRequests = [];
  const apnsPort = await freePort();
  const apns = http2.createServer();
  apns.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (body += chunk));
    stream.on("end", () => {
      const claims = verifyJwt(
        headers.authorization.replace(/^bearer /, ""),
        apnsKeys.publicKey,
        "ES256",
      );
      apnsRequests.push({ headers, body: JSON.parse(body), claims });
      stream.respond({ ":status": 200 });
      stream.end();
    });
  });
  apns.listen(apnsPort, "127.0.0.1");
  await once(apns, "listening");
  t.after(() => {
    fcm.close();
    apns.close();
  });

  const pg = await postgresFixture(f.db.data);
  const port = await freePort();
  const child = spawn(process.execPath, ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: pg.url,
      REDIS_URL: "",
      JWT_ACCESS_SECRET: secret,
      NOTIFICATION_CHANNELS: "in_app",
      TELEGRAM_BOT_TOKEN: "",
      VK_GROUP_TOKEN: "",
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: "wirehouse-test",
        client_email: "push@test.iam.gserviceaccount.com",
        private_key: fcmKeys.privateKey.export({
          type: "pkcs8",
          format: "pem",
        }),
        token_uri: `http://127.0.0.1:${fcmPort}/token`,
      }),
      FCM_API_ORIGIN: `http://127.0.0.1:${fcmPort}`,
      APNS_PRIVATE_KEY: apnsKeys.privateKey.export({
        type: "pkcs8",
        format: "pem",
      }),
      APNS_KEY_ID: "KEY1234567",
      APNS_TEAM_ID: "TEAM123456",
      APNS_ORIGIN: `http://127.0.0.1:${apnsPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await pg.cleanup();
  });
  const base = `http://127.0.0.1:${port}`;
  for (let ready = false, deadline = Date.now() + 30_000; !ready;) {
    if (child.exitCode !== null || Date.now() > deadline) throw Error(output);
    ready = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (!ready) await new Promise((r) => setTimeout(r, 50));
  }
  const call = async (user, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken({ sub: user.id, role: user.role }, secret)}`,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const devices = async () =>
    (
      await pg.pool.query(
        "SELECT token, user_id, platform FROM warehouse.push_devices ORDER BY token",
      )
    ).rows;

  const workerToken = "worker-android-token-0001";
  const goneToken = "gone-android-token-00001";
  const tenantToken = "a".repeat(64);
  assert.equal(
    (
      await call(f.worker, "/api/push/devices", {
        token: workerToken,
        platform: "android",
      })
    ).status,
    200,
  );
  await call(f.worker, "/api/push/devices", {
    token: goneToken,
    platform: "android",
  });
  await call(tenantUser, "/api/push/devices", {
    token: tenantToken,
    platform: "ios",
  });
  assert.equal(
    (
      await call(f.worker, "/api/push/devices", {
        token: workerToken,
        platform: "windows",
      })
    ).status,
    400,
  );
  assert.equal((await devices()).length, 3);

  // A manager's comment notifies the assigned worker and the tenant.
  const comment = await call(f.manager, `/api/tickets/${ticket.id}/comments`, {
    content: "Электрик приедет в 15:00",
  });
  assert.equal(comment.status, 201);
  for (
    let deadline = Date.now() + 10_000;
    (fcmMessages.length < 2 || apnsRequests.length < 1) &&
    Date.now() < deadline;
  )
    await new Promise((r) => setTimeout(r, 50));

  const toWorker = fcmMessages.find((m) => m.token === workerToken);
  assert.ok(toWorker, output);
  assert.equal(toWorker.notification.body, "Электрик приедет в 15:00");
  assert.match(toWorker.notification.title, /новый комментарий/);
  assert.equal(toWorker.data.entityType, "ticket");
  assert.equal(toWorker.data.entityId, ticket.id);

  assert.equal(apnsRequests.length, 1, output);
  const [toTenant] = apnsRequests;
  assert.equal(toTenant.headers[":path"], `/3/device/${tenantToken}`);
  assert.equal(toTenant.headers["apns-topic"], "ru.skladkontur.app");
  assert.equal(toTenant.claims?.iss, "TEAM123456");
  assert.equal(toTenant.body.aps.alert.body, "Электрик приедет в 15:00");
  assert.equal(toTenant.body.entityId, ticket.id);

  // The token FCM reported as unregistered is removed.
  for (
    let deadline = Date.now() + 5_000;
    (await devices()).some((d) => d.token === goneToken) &&
    Date.now() < deadline;
  )
    await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(
    (await devices()).map((d) => d.token),
    [tenantToken, workerToken].sort(),
  );

  // Removal only affects the caller's own device.
  await call(f.manager, "/api/push/devices/remove", { token: tenantToken });
  assert.equal((await devices()).length, 2);
  await call(f.worker, "/api/push/devices/remove", { token: workerToken });
  assert.deepEqual(
    (await devices()).map((d) => d.token),
    [tenantToken],
  );
});
