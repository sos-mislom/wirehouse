import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture } from "./fixtures.mjs";
import { postgresFixture } from "./postgres/helpers.mjs";
import { createToken } from "../apps/api/src/auth.js";
import {
  verifiedTelegramPhone,
  issueBotLink,
  consumeBotLink,
} from "../apps/api/src/bot-links.js";

test("Enrollment requires an own Telegram contact or a scoped, expiring, single-use link code", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const tenant = f.db.data.users.find((u) => u.tenant_id === f.tenant.id);
  assert.equal(
    verifiedTelegramPhone({
      text: tenant.phone,
      from: { id: 42 },
      chat: { id: 42, type: "private" },
    }),
    "",
  );
  const contact = {
    from: { id: 42 },
    chat: { id: 42, type: "private" },
    contact: { user_id: 43, phone_number: tenant.phone },
  };
  assert.equal(verifiedTelegramPhone(contact), "");
  contact.contact.user_id = 42;
  assert.equal(verifiedTelegramPhone(contact), tenant.phone);
  contact.chat.type = "group";
  assert.equal(verifiedTelegramPhone(contact), "");
  assert.throws(
    () => issueBotLink(f.db, f.worker, tenant.id, "vk"),
    /Нет доступа/,
  );
  const code = issueBotLink(f.db, f.admin, tenant.id, "vk", 1000);
  assert.ok(!JSON.stringify(f.db.data).includes(code.code));
  assert.throws(
    () => consumeBotLink(f.db, "telegram", 42, code.command, "", 2000),
    /недействителен/,
  );
  assert.equal(
    consumeBotLink(f.db, "vk", 42, code.command, "", 2000).user_id,
    tenant.id,
  );
  const stored = f.db.data.users.find((u) => u.id === tenant.id);
  const phone = stored.phone;
  stored.phone = "+79990000998";
  assert.equal(f.db.getOtpBinding("vk", phone), null);
  assert.equal(f.db.getOtpBindingByRecipient("vk", 42), null);
  stored.phone = phone;
  assert.throws(
    () => consumeBotLink(f.db, "vk", 42, code.command, "", 2001),
    /недействителен/,
  );
  const expired = issueBotLink(f.db, f.admin, tenant.id, "vk", 1000);
  assert.throws(
    () => consumeBotLink(f.db, "vk", 42, expired.command, "", 1000000),
    /истёк/,
  );
  const blocked = issueBotLink(f.db, f.admin, tenant.id, "vk");
  f.db.data.users.find((u) => u.id === tenant.id).is_active = 0;
  assert.throws(
    () => consumeBotLink(f.db, "vk", 42, blocked.command),
    /Доступ/,
  );
  assert.equal(f.db.getOtpBindingByRecipient("vk", 42), null);
});

test("Webhook authentication, verified enrollment, OTP delivery, login and replay protection", async (t) => {
  if (!process.env.TEST_POSTGRES_URL)
    return t.skip("TEST_POSTGRES_URL is required for API integration tests");
  const f = fixture();
  t.after(f.cleanup);
  const outbox = path.join(f.dir, "outbox.jsonl");
  fs.writeFileSync(outbox, "");
  const tenant = f.db.data.users.find((u) => u.tenant_id === f.tenant.id);
  const secret = "bot-test-secret";
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const pg = await postgresFixture(f.db.data);
  const readState = () => pg.readState();
  const child = spawn(
    process.execPath,
    ["--import", "./tests/bot-fetch-fixture.mjs", "apps/api/src/index.js"],
    {
      env: {
        ...process.env,
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        DATABASE_URL: pg.url,
        POSTGRES_URL: "",
        REDIS_URL: "",
        JWT_ACCESS_SECRET: secret,
        TEST_BOT_OUTBOX: outbox,
        TELEGRAM_BOT_TOKEN: "fake-telegram-test",
        TELEGRAM_WEBHOOK_SECRET: "tg-test-secret",
        VK_GROUP_TOKEN: "fake-vk-test",
        VK_GROUP_ID: "123",
        VK_WEBHOOK_SECRET: "vk-test-secret",
        VK_CONFIRMATION_CODE: "vk-confirm",
        OTP_DELIVERY_CHANNELS: "telegram,vk",
        ALLOW_OTP_WITHOUT_DELIVERY: "false",
        NOTIFICATION_CHANNELS: "in_app",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stderr.on("data", (d) => (logs += d));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await pg.cleanup();
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  const call = async (p, body, headers = {}) => {
    const r = await fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, text, body: () => JSON.parse(text) };
  };
  const tg = "/api/integrations/telegram/webhook",
    vk = "/api/integrations/vk/webhook";
  const message = {
    from: { id: 42 },
    chat: { id: 42, type: "private" },
    text: tenant.phone,
  };
  assert.equal((await call(tg, { message })).status, 403);
  const tgHeaders = { "x-telegram-bot-api-secret-token": "tg-test-secret" };
  assert.equal((await call(tg, { message }, tgHeaders)).status, 200);
  assert.equal((await readState()).otp_bindings.length, 0);
  message.contact = { user_id: 43, phone_number: tenant.phone };
  await call(tg, { message }, tgHeaders);
  assert.equal((await readState()).otp_bindings.length, 0);
  message.contact.user_id = 42;
  assert.equal((await call(tg, { message }, tgHeaders)).status, 200);
  assert.equal((await readState()).otp_bindings.length, 1);
  assert.equal(
    (await call(vk, { type: "confirmation", group_id: 123 })).status,
    403,
  );
  assert.equal(
    (
      await call(vk, {
        type: "confirmation",
        group_id: 123,
        secret: "vk-test-secret",
      })
    ).text,
    "vk-confirm",
  );
  const headers = {
    Authorization: `Bearer ${createToken({ sub: f.admin.id, role: "admin" }, secret)}`,
  };
  const link = await call(
    "/api/integrations/link-code",
    { userId: tenant.id, channel: "vk" },
    headers,
  );
  assert.equal(link.status, 200, link.text);
  const vkMessage = {
    type: "message_new",
    group_id: 123,
    secret: "vk-test-secret",
    object: {
      message: { from_id: 71, peer_id: 71, text: link.body().command },
    },
  };
  assert.equal((await call(vk, vkMessage)).status, 200);
  assert.equal((await readState()).otp_bindings.length, 2);
  assert.equal(
    (await call("/api/auth/tenant/request-otp", { phone: tenant.phone }))
      .status,
    200,
  );
  const sent = fs
    .readFileSync(outbox, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  const otp = sent
    .map((s) => s.payload.text || s.payload.message)
    .filter((v) => /\b\d{6}\b/.test(v))
    .at(-1)
    .match(/\b\d{6}\b/)[0];
  const login = await call("/api/auth/tenant/verify-otp", {
    phone: tenant.phone,
    otp,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body().user.role, "tenant");
  assert.equal(
    (await call("/api/auth/tenant/verify-otp", { phone: tenant.phone, otp }))
      .status,
    401,
  );
  assert.equal(
    sent.filter((s) => /\b\d{6}\b/.test(s.payload.text || s.payload.message))
      .length,
    2,
  );
  assert.equal(logs, "");
});
