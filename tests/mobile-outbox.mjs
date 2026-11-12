import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { build } from "vite";
import { chromium } from "playwright";

test(
  "Mobile queue keeps exact retry bodies, isolates accounts and expires before server receipts",
  { timeout: 60000 },
  async (t) => {
    const base = path.resolve(".local/mobile-outbox-tests");
    fs.mkdirSync(base, { recursive: true });
    const directory = fs.mkdtempSync(path.join(base, "run-"));
    t.after(() => {
      assert.ok(
        fs.realpathSync(directory).startsWith(fs.realpathSync(base) + path.sep),
      );
      fs.rmSync(directory, { recursive: true, force: true });
    });
    fs.writeFileSync(
      path.join(directory, "index.html"),
      '<!doctype html><script type="module" src="./entry.js"></script>',
    );
    fs.writeFileSync(
      path.join(directory, "entry.js"),
      `import * as queue from "../../../apps/web/src/platform/outbox.ts"; window.queue = queue; queue.outboxStatus.subscribe(() => {});`,
    );
    await build({
      root: directory,
      configFile: false,
      logLevel: "silent",
      define: {
        "import.meta.env.VITE_WAREHOUSE_MOBILE_ROLES":
          JSON.stringify("tenant,worker"),
      },
      build: { outDir: path.join(directory, "dist") },
    });
    const root = path.join(directory, "dist");
    const server = http.createServer((request, response) => {
      const file = path.resolve(
        root,
        "." + new URL(request.url, "http://localhost").pathname,
      );
      const selected = file === root ? path.join(root, "index.html") : file;
      if (!selected.startsWith(root + path.sep) || !fs.existsSync(selected)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.setHeader(
        "Content-Type",
        selected.endsWith(".js") ? "text/javascript" : "text/html",
      );
      response.end(fs.readFileSync(selected));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const origin = `http://127.0.0.1:${server.address().port}`;
    const ownerToken = (id) =>
      `header.${Buffer.from(JSON.stringify({ sub: id })).toString("base64url")}.test-only-signature`;
    const token = ownerToken("worker-a"),
      otherToken = ownerToken("worker-b");

    await t.test(
      "An advanced workflow body survives a lost reply and app restart under its original key",
      async () => {
        const context = await browser.newContext(),
          page = await context.newPage();
        try {
          await page.goto(origin);
          await page.waitForFunction(() => window.queue);
          const first = await page.evaluate(async (token) => {
            const q = window.queue;
            for (const action of ["start", "pause"])
              await q.enqueueCommand({
                token,
                method: "POST",
                path: "/api/tickets/task-1/workflow/decision",
                body: { action, updatedAt: "version-1" },
                key: `same-original-${action}-key-0001`,
              });
            const sent = [];
            await q.flushOutbox(token, async (entry, body) => {
              sent.push({ key: entry.key, body });
              if (body.action === "start")
                return { item: { updatedAt: "version-2" } };
              throw Object.assign(new Error("Lost reply"), {
                status: 0,
                code: "NETWORK_ERROR",
              });
            });
            return { sent, entries: q.outboxStatus.get() };
          }, token);
          assert.equal(first.sent[1].body.updatedAt, "version-2");
          assert.equal(first.entries.length, 1);
          assert.equal(first.entries[0].body.updatedAt, "version-2");
          await page.reload();
          await page.waitForFunction(
            () => window.queue?.outboxStatus.get().length === 1,
          );
          const retry = await page.evaluate(async (token) => {
            const sent = [];
            await window.queue.flushOutbox(token, async (entry, body) => {
              sent.push({ key: entry.key, body });
              return { item: { updatedAt: "version-3" } };
            });
            return { sent, entries: window.queue.outboxStatus.get() };
          }, token);
          assert.deepEqual(retry.sent[0], first.sent[1]);
          assert.equal(retry.entries.length, 0);
        } finally {
          await context.close();
        }
      },
    );

    await t.test(
      "A command older than the receipt safety window is retained as failed and never resent",
      async () => {
        const context = await browser.newContext(),
          page = await context.newPage();
        try {
          await page.goto(origin);
          await page.waitForFunction(() => window.queue);
          await page.evaluate(async (token) => {
            await window.queue.enqueueCommand({
              token,
              method: "POST",
              path: "/api/tickets/task-1/comments",
              body: { content: "Old ambiguous comment" },
              key: "old-ambiguous-key-000001",
            });
            const entry = {
              ...window.queue.outboxStatus.get()[0],
              createdAt: Date.now() - 24 * 3600000,
            };
            await new Promise((resolve, reject) => {
              const request = indexedDB.open("wirehouse-outbox", 1);
              request.onsuccess = () => {
                const db = request.result,
                  transaction = db.transaction("commands", "readwrite");
                transaction.objectStore("commands").put(entry);
                transaction.oncomplete = () => {
                  db.close();
                  resolve();
                };
                transaction.onerror = () => reject(transaction.error);
              };
              request.onerror = () => reject(request.error);
            });
          }, token);
          await page.reload();
          await page.waitForFunction(
            () => window.queue?.outboxStatus.get().length === 1,
          );
          const result = await page.evaluate(async (token) => {
            let sent = 0;
            await window.queue.flushOutbox(token, async () => {
              sent++;
              return {};
            });
            return { sent, entry: window.queue.outboxStatus.get()[0] };
          }, token);
          assert.equal(result.sent, 0);
          assert.equal(result.entry.status, "failed");
          assert.match(
            result.entry.error,
            /Срок автоматической отправки истёк/,
          );
        } finally {
          await context.close();
        }
      },
    );

    await t.test(
      "Another account cannot send or discard a person's queue; repeated taps enqueue once",
      async () => {
        const context = await browser.newContext(),
          page = await context.newPage();
        try {
          await page.goto(origin);
          await page.waitForFunction(() => window.queue);
          const result = await page.evaluate(
            async ({ token, otherToken }) => {
              const q = window.queue;
              for (const key of [
                "first-tap-key-0000001",
                "second-tap-key-000001",
              ])
                await q.enqueueCommand({
                  token,
                  method: "POST",
                  path: "/api/tickets/task-1/comments",
                  body: { content: "One comment" },
                  key,
                });
              let sent = 0;
              await q.flushOutbox(otherToken, async () => {
                sent++;
                return {};
              });
              await q.discardCommands(otherToken);
              return { sent, entries: q.outboxStatus.get() };
            },
            { token, otherToken },
          );
          assert.equal(result.sent, 0);
          assert.equal(result.entries.length, 1);
          assert.equal(result.entries[0].owner, "worker-a");
        } finally {
          await context.close();
        }
      },
    );
  },
);
