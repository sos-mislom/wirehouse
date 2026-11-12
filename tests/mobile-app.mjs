import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";

// Serves the prepared www bundle the way the native shell loads it.
async function serveMobileBuild() {
  const root = path.resolve(".local/mobile/app/www");
  assert.ok(
    fs.existsSync(path.join(root, "index.html")),
    "Run apps/mobile/scripts/prepare.mjs before testing",
  );
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      root,
      "." + (name === "/" ? "/index.html" : name),
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(fs.readFileSync(file));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

test(
  "The mobile app offers tenant and worker login, rejects other roles and retains credentials during a network failure",
  { timeout: 120000 },
  async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    {
      const server = await serveMobileBuild();
      try {
        for (const scenario of ["admin", "manager", "expired", "network"]) {
          const context = await browser.newContext({
              viewport: { width: 390, height: 844 },
            }),
            page = await context.newPage();
          try {
            let workspaceReads = 0;
            await page.addInitScript(() =>
              localStorage.setItem(
                "warehouse-platform-token",
                "mobile-test-only-token",
              ),
            );
            await page.route("**/api/**", (route) => {
              const endpoint = new URL(route.request().url()).pathname;
              if (endpoint === "/api/auth/tenant/onboarding")
                return route.fulfill({ json: { channels: [] } });
              if (endpoint === "/api/auth/staff/login")
                return route.fulfill({
                  json: {
                    token: "mobile-test-only-token",
                    user: { id: `test-${scenario}`, role: scenario },
                  },
                });
              if (endpoint !== "/api/auth/me") {
                workspaceReads++;
                return route.fulfill({
                  status: 500,
                  json: { message: "Unexpected workspace read" },
                });
              }
              if (scenario === "admin" || scenario === "manager")
                return route.fulfill({
                  json: {
                    user: {
                      id: `test-${scenario}`,
                      role: scenario,
                      permissions: [],
                    },
                  },
                });
              return route.fulfill({
                status: scenario === "expired" ? 401 : 503,
                json: { message: "Тестовая недоступность", code: "TEST_ONLY" },
              });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            await page.locator(".auth-shell").waitFor();
            const loginTabs = page.getByRole("tablist", {
              name: "Способ входа",
            });
            await loginTabs.waitFor();
            assert.equal(await page.locator('input[name="phone"]').count(), 1);
            await loginTabs
              .getByRole("tab", { name: "Сотрудник", exact: true })
              .click();
            assert.equal(await page.locator('input[name="email"]').count(), 1);
            assert.equal(await page.locator('input[name="phone"]').count(), 0);
            assert.equal(workspaceReads, 0);
            assert.equal(
              await page.evaluate(() =>
                localStorage.getItem("warehouse-platform-token"),
              ),
              scenario === "network" ? "mobile-test-only-token" : null,
            );
            if (scenario === "admin" || scenario === "manager") {
              await page
                .locator('input[name="email"]')
                .fill("staff@test.invalid");
              await page.locator('input[name="password"]').fill("test-only");
              await page.locator('form button[type="submit"]').first().click();
              await page
                .getByText(
                  "Эта учетная запись не используется в мобильном приложении",
                )
                .waitFor();
              assert.equal(workspaceReads, 0);
              assert.equal(
                await page.evaluate(() =>
                  localStorage.getItem("warehouse-platform-token"),
                ),
                null,
              );
            }
            if (scenario === "network")
              await page
                .getByRole("button", {
                  name: "Повторить подключение",
                  exact: true,
                })
                .waitFor();
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
            );
          } finally {
            await context.close();
          }
        }
      } finally {
        await new Promise((r) => server.close(r));
      }
    }
  },
);

test(
  "Inside the native shell the session token is restored from native preferences and cleared from them when the server rejects it",
  { timeout: 60000 },
  async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const server = await serveMobileBuild();
    t.after(() => new Promise((r) => server.close(r)));
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await context.newPage();
    const calls = [];
    await context.exposeFunction("__recordNativeCall", (call) =>
      calls.push(call),
    );
    // Minimal stand-in for the Capacitor native bridge: Preferences only.
    await page.addInitScript(() => {
      const store = { "warehouse-platform-token": "native-test-only-token" };
      window.androidBridge = {};
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        PluginHeaders: [
          {
            name: "Preferences",
            methods: ["get", "set", "remove"].map((name) => ({
              name,
              rtype: "promise",
            })),
          },
        ],
        nativePromise: async (plugin, method, options) => {
          await window.__recordNativeCall(`${plugin}.${method}`);
          if (method === "get") return { value: store[options.key] ?? null };
          if (method === "set") store[options.key] = options.value;
          if (method === "remove") delete store[options.key];
          return {};
        },
      };
    });
    let authorization = "";
    await page.route("**/api/**", (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint === "/api/auth/tenant/onboarding")
        return route.fulfill({ json: { channels: [] } });
      if (endpoint === "/api/auth/me")
        authorization = route.request().headers().authorization ?? "";
      return route.fulfill({
        status: 401,
        json: { message: "Тестовый отказ", code: "TEST_ONLY" },
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".auth-shell").waitFor();
    assert.equal(authorization, "Bearer native-test-only-token");
    assert.ok(calls.includes("Preferences.get"));
    // The rejected token is cleared from native storage as well.
    for (let i = 0; i < 20 && !calls.includes("Preferences.remove"); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(calls.includes("Preferences.remove"), calls.join(", "));
  },
);
