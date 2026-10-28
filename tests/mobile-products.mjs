import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";

test(
  "Both mobile products expose only their own login, reject staff identities and retain credentials during a network failure",
  { timeout: 120000 },
  async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    for (const product of ["client", "worker"]) {
      const root = path.resolve(".local/mobile", product, "www");
      assert.ok(
        fs.existsSync(path.join(root, "index.html")),
        "Prepare both native products before testing",
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
      try {
        for (const scenario of ["wrong-role", "expired", "network"]) {
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
              if (endpoint !== "/api/auth/me") {
                workspaceReads++;
                return route.fulfill({
                  status: 500,
                  json: { message: "Unexpected workspace read" },
                });
              }
              if (scenario === "wrong-role")
                return route.fulfill({
                  json: {
                    user: { id: "test-admin", role: "admin", permissions: [] },
                  },
                });
              return route.fulfill({
                status: scenario === "expired" ? 401 : 503,
                json: { message: "Тестовая недоступность", code: "TEST_ONLY" },
              });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            await page.locator(".auth-shell").waitFor();
            assert.equal(await page.locator(".auth-tabs").count(), 0);
            assert.equal(
              await page
                .locator(
                  `input[name="${product === "client" ? "phone" : "email"}"]`,
                )
                .count(),
              1,
            );
            assert.equal(workspaceReads, 0);
            assert.equal(
              await page.evaluate(() =>
                localStorage.getItem("warehouse-platform-token"),
              ),
              scenario === "network" ? "mobile-test-only-token" : null,
            );
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
