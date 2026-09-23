import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture } from "./fixtures.mjs";
import { postgresFixture } from "./postgres/helpers.mjs";
import { saveOperation } from "../apps/api/src/operations.js";
import { createToken } from "../apps/api/src/auth.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
if (!process.env.TEST_POSTGRES_URL)
  throw new Error("TEST_POSTGRES_URL is required for browser tests");
fs.mkdirSync(".deploy", { recursive: true });
const f = fixture();
const secret = "browser-test-secret";
saveOperation(f.db, f.admin, "meters", null, {
  name: "Счётчик исполнителя",
  propertyId: f.property.id,
  unitId: f.unit.id,
  scope: "individual",
  resource: "water",
  tariff: 1,
  initialValue: 10,
  responsibleId: f.worker.id,
});
const period = new Date().toISOString().slice(0, 7);
f.db.updateLease(f.lease.id, {
  endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
});
f.db.createBillingInvoice({
  leaseId: f.lease.id,
  period,
  rentAmount: 1000,
  variableAmount: 50,
  dueDate: `${period}-01`,
});
const pg = await postgresFixture(f.db.data);
const child = spawn(process.execPath, ["apps/api/src/index.js"], {
  env: {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: "3001",
    DATABASE_URL: pg.url,
    POSTGRES_URL: "",
    REDIS_URL: "",
    JWT_ACCESS_SECRET: secret,
    NOTIFICATION_CHANNELS: "in_app",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let apiLogs = "";
child.stderr.on("data", (d) => (apiLogs += d));
const server = http.createServer((req, res) => {
  let file = path.join(
    process.cwd(),
    "apps/web/dist",
    new URL(req.url, "http://localhost").pathname,
  );
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(process.cwd(), "apps/web/dist/index.html");
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "application/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(fs.readFileSync(file));
});
let browser;
try {
  server.listen(5173, "127.0.0.1");
  await once(server, "listening");
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3001/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const loginPage = await browser.newPage({
    viewport: { width: 320, height: 844 },
  });
  await loginPage.route("**/api/auth/tenant/onboarding", (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "telegram",
            label: "Telegram",
            url: "https://t.me/warehousecontourbot",
            enabled: true,
          },
          {
            id: "vk",
            label: "VK",
            url: "https://vk.me/warehouse_contour",
            enabled: true,
          },
          {
            id: "whatsapp",
            label: "WhatsApp",
            url: "https://example.com",
            enabled: true,
          },
        ],
      },
    }),
  );
  await loginPage.goto("http://127.0.0.1:5173");
  await loginPage
    .getByRole("button", { name: "По телефону", exact: true })
    .click();
  assert.equal(
    await loginPage.locator(".tenant-channel").count(),
    0,
    "Returning users do not see setup instructions",
  );
  await loginPage.locator("input[name=phone]").fill("+79990000101");
  await loginPage.screenshot({
    path: ".deploy/phone-login-mobile.png",
    fullPage: true,
  });
  await loginPage
    .getByRole("button", { name: "Подключить мессенджер", exact: true })
    .click();
  assert.equal(await loginPage.locator(".tenant-channel svg").count(), 2);
  assert.equal(
    await loginPage.getByText("WhatsApp", { exact: true }).count(),
    0,
  );
  assert.ok(
    await loginPage
      .locator(".tenant-channel")
      .evaluateAll((buttons) =>
        buttons.every((button) => button.scrollWidth <= button.clientWidth + 1),
      ),
    "Messenger labels are not clipped",
  );
  assert.equal(
    await loginPage
      .getByRole("link", { name: "Открыть Telegram" })
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(34, 158, 217)",
  );
  assert.equal(
    await loginPage
      .getByRole("link", { name: "Открыть VK" })
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(0, 119, 255)",
  );
  assert.ok(
    await loginPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  await loginPage.screenshot({
    path: ".deploy/messenger-login-mobile.png",
    fullPage: true,
  });
  await loginPage
    .getByRole("button", { name: "← Ко входу", exact: true })
    .click();
  assert.equal(
    await loginPage.locator("input[name=phone]").inputValue(),
    "+79990000101",
  );
  await page.addInitScript(
    (token) => localStorage.setItem("warehouse-platform-token", token),
    createToken({ sub: f.admin.id, role: "admin" }, secret),
  );
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("heading", { name: "Дашборд", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Сроки и работы", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Сроки и работы", exact: true })
    .waitFor();
  await page.getByLabel("Период", { exact: true }).selectOption("90");
  await page.locator(".renewal-editor summary").first().waitFor();
  await page.locator(".renewal-editor summary").first().click();
  await page
    .getByLabel("Следующий шаг", { exact: true })
    .first()
    .selectOption("contacted");
  await page
    .getByLabel("Заметка по продлению", { exact: true })
    .first()
    .fill("Обсудить срок до конца недели");
  await page
    .getByRole("button", { name: "Сохранить решение", exact: true })
    .first()
    .click();
  await page.getByText("Решение сохранено", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".renewal-editor summary").first().waitFor();
  assert.match(
    await page.locator(".renewal-editor summary").first().innerText(),
    /Обсуждаем условия/,
  );
  const calendar = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать календарь", exact: true })
    .click();
  assert.equal((await calendar).suggestedFilename(), "wirehouse-agenda.ics");
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Agenda fits mobile",
  );
  await page.screenshot({ path: ".deploy/agenda-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Арендаторы", exact: true }).click();
  await page
    .getByRole("heading", { name: "Арендаторы", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Договоры", exact: true }).click();
  await page.getByRole("heading", { name: "Договоры", exact: true }).waitFor();
  await page.goBack();
  await page
    .getByRole("heading", { name: "Арендаторы", exact: true })
    .waitFor();
  await page.locator(".mvp-table tbody tr").first().click();
  await page
    .getByRole("heading", { name: "Арендатор", exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Сохранить изменения", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page
    .getByRole("heading", { name: "Арендатор", exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Помещения", exact: true }).click();
  await page.getByRole("heading", { name: "Структура и планы" }).waitFor();
  await page.getByRole("button", { name: "Объект А", exact: true }).click();
  await page.getByRole("button", { name: "Планы", exact: true }).click();
  await page.getByRole("button", { name: "Новый план", exact: true }).click();
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
  await page.locator(".plan-upload input").setInputFiles({
    name: "floor.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(dxf),
  });
  await page.getByText(/Импортировано 1 элементов/).waitFor();
  await page
    .getByRole("button", { name: "Нарисовать контур", exact: true })
    .click();
  for (const position of [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 },
  ])
    await page.locator(".plan-canvas").click({ position });
  await page
    .getByRole("button", { name: "Замкнуть контур", exact: true })
    .click();
  await page
    .getByLabel("Помещение на плане", { exact: true })
    .selectOption(f.unit.id);
  await page
    .getByRole("button", { name: "Сохранить план", exact: true })
    .click();
  await page.getByText("План сохранён", { exact: true }).waitFor();
  await page.screenshot({
    path: ".deploy/plan-editor-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Планы", exact: true }).click();
  await page
    .getByLabel("Выбор плана", { exact: true })
    .selectOption({ label: "Новый план" });
  await page.locator(".plan-canvas polygon").waitFor();
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Plan editor fits mobile",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Эксплуатация", exact: true }).click();
  await page
    .getByRole("heading", { name: "Эксплуатация", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page
    .getByLabel("Название *", { exact: true })
    .fill("Тестовая вентиляция");
  await page.getByLabel(/^Объект \*/).selectOption(f.property.id);
  await page.getByLabel(/^Помещение \*/).selectOption(f.unit.id);
  await page
    .getByLabel("Тип оборудования *", { exact: true })
    .fill("Вентиляция");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Тестовая вентиляция", exact: true })
    .waitFor();
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "ППР", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel("Название *", { exact: true }).fill("Тестовое ППР");
  await page.getByLabel(/^Объект \*/).selectOption(f.property.id);
  await page.getByLabel(/^Помещение \*/).selectOption(f.unit.id);
  await page
    .getByLabel("Чек-лист: один пункт на строку *", { exact: true })
    .fill("Осмотр\nПроверка");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Тестовое ППР", exact: true })
    .waitFor();
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "Услуги", exact: true })
    .click();
  await page.getByRole("button", { name: "Материалы", exact: true }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel(/^Название/).fill("Кабель ВВГ");
  await page.getByLabel(/^Объект/).selectOption(f.property.id);
  await page.getByLabel(/^Единица измерения/).fill("м");
  await page.getByLabel(/^Цена без НДС/).fill("125.50");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .locator(".platform-row")
    .getByText("Кабель ВВГ", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Сметы и акты", exact: true }).click();
  await page.getByRole("button", { name: "Новая смета", exact: true }).click();
  await page.getByLabel(/^Название/).fill("Проверка тарификации");
  await page.getByLabel(/^Объект/).selectOption(f.property.id);
  await page.getByLabel(/^Заявка/).selectOption({ index: 1 });
  const estimateTicketId = await page.getByLabel(/^Заявка/).inputValue();
  await page.getByLabel(/^Наименование/).fill("Проверка оборудования");
  await page.getByLabel(/^Количество/).fill("2");
  await page.getByLabel(/^Цена, ₽/).fill("100");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Проверка тарификации", exact: true })
    .click();
  await page
    .getByRole("button", { name: "На согласование", exact: true })
    .click();
  await page.getByRole("button", { name: "Утвердить", exact: true }).click();
  await page
    .getByRole("button", { name: "Выпустить акт", exact: true })
    .click();
  await page
    .getByText("Акт доступен после выполнения заявки", { exact: true })
    .waitFor();
  await page.screenshot({
    path: ".deploy/estimate-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Estimate fits mobile",
  );
  await page.screenshot({
    path: ".deploy/estimate-mobile.png",
    fullPage: true,
  });
  const authorization = {
    Authorization: `Bearer ${createToken({ sub: f.admin.id, role: "admin" }, secret)}`,
  };
  const ticketResponse = await page.request.get(
    "http://127.0.0.1:3001/api/tickets",
    { headers: authorization },
  );
  const estimateTicket = (await ticketResponse.json()).items.find(
    (t) => t.id === estimateTicketId,
  );
  for (const item of estimateTicket.checklistItems) {
    const response = await page.request.put(
      `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/checklist/${item.id}`,
      {
        headers: authorization,
        data: { completed: true },
      },
    );
    assert.equal(response.status(), 200);
  }
  const completed = await page.request.put(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}`,
    {
      headers: authorization,
      data: { status: "completed" },
    },
  );
  assert.equal(completed.status(), 200);
  await page
    .getByRole("button", { name: "Выпустить акт", exact: true })
    .click();
  await page.getByRole("button", { name: /^Открыть АКТ-/ }).click();
  await page.locator("#service-act").waitFor();
  await page.emulateMedia({ media: "print" });
  assert.equal(
    await page
      .locator("#service-act table")
      .evaluate((el) => getComputedStyle(el).display),
    "table",
  );
  assert.equal(
    await page
      .locator("#service-act thead")
      .evaluate((el) => getComputedStyle(el).position),
    "static",
  );
  await page.pdf({ path: ".deploy/service-act.pdf", preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Закрыть акт", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: /^Заявки/ })
    .first()
    .click();
  await page.locator(".kanban-ticket").first().waitFor();
  await page
    .locator(".kanban-ticket select")
    .first()
    .selectOption("in_progress");
  await page.waitForTimeout(250);
  await page.screenshot({ path: ".deploy/kanban-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Пользователи", exact: true }).click();
  await page.getByRole("heading", { name: "Пользователи и доступ" }).waitFor();
  const workerCard = page.locator(".operation-card").filter({
    has: page.getByRole("heading", { name: "Электрик", exact: true }),
  });
  await workerCard.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Имя *", { exact: true }).fill("Электрик обновлён");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("heading", { name: "Электрик обновлён" }).waitFor();
  const tenantCard = page
    .locator(".operation-card")
    .filter({ has: page.getByRole("heading", { name: "Иван", exact: true }) });
  await tenantCard
    .getByText("Подключение мессенджеров", { exact: true })
    .click();
  await tenantCard.getByRole("button", { name: "VK", exact: true }).click();
  await tenantCard.locator(".bot-link-result code").waitFor();
  assert.match(
    await tenantCard.locator(".bot-link-result code").innerText(),
    /^\/link [A-F0-9]{24}$/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".deploy/users-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "No horizontal page overflow on mobile",
  );
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Закрыть", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Меню", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "Биллинг", exact: true }).click();
  await page.getByRole("heading", { name: "Биллинг", exact: true }).waitFor();
  await page.screenshot({ path: ".deploy/billing-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Billing fits mobile",
  );
  for (const width of [320, 360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of [
      "Дашборд",
      "Сроки и работы",
      "Арендаторы",
      "Договоры",
      "Помещения",
      "Эксплуатация",
      "Биллинг",
      "Пользователи",
      "Объекты",
      "Чат",
      "Уведомления",
      "Импорт / экспорт",
      "Профиль",
    ]) {
      await page.getByRole("button", { name: "Меню", exact: true }).click();
      await page
        .locator("#workspace-navigation")
        .getByRole("button", { name: new RegExp("^" + section + "(?:\\s|$)") })
        .click();
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .getByRole("button", { name: "Меню", exact: true })
          .getAttribute("aria-expanded"),
        "false",
      );
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll("main *"))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2);
          })
          .slice(0, 8)
          .map((e) => e.className),
      }));
      assert.ok(
        overflow.scroll <= width + 2,
        `${section} at ${width}px: ${JSON.stringify(overflow)}`,
      );
    }
  }
  // A tenant must reach its workspace without a finance object or staff-only access.
  const tenant = f.db.data.users.find((u) => u.tenant_id === f.tenant.id);
  const tenantPage = await browser.newPage();
  tenantPage.on("pageerror", (e) => errors.push(e.message));
  await tenantPage.addInitScript(
    (token) => localStorage.setItem("warehouse-platform-token", token),
    createToken({ sub: tenant.id, role: "tenant" }, secret),
  );
  await tenantPage.goto("http://127.0.0.1:5173");
  await tenantPage
    .getByRole("heading", { name: "Объявления и услуги" })
    .waitFor();
  await tenantPage.setViewportSize({ width: 320, height: 844 });
  assert.ok(
    await tenantPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Tenant fits 320px",
  );
  await tenantPage.getByRole("button", { name: "Меню", exact: true }).click();
  await tenantPage.keyboard.press("Escape");
  const workerPage = await browser.newPage({
    viewport: { width: 320, height: 844 },
  });
  workerPage.on("pageerror", (e) => errors.push(e.message));
  await workerPage.addInitScript(
    (token) => localStorage.setItem("warehouse-platform-token", token),
    createToken({ sub: f.worker.id, role: "worker" }, secret),
  );
  await workerPage.goto("http://127.0.0.1:5173");
  await workerPage.getByRole("button", { name: "Меню", exact: true }).waitFor();
  await workerPage
    .getByText("Счётчик исполнителя · Вода", { exact: true })
    .click();
  await workerPage.getByLabel("Показание *", { exact: true }).fill("12");
  await workerPage
    .getByRole("button", { name: "Сохранить показание", exact: true })
    .click();
  await workerPage.getByText("Показание сохранено", { exact: true }).waitFor();
  assert.ok(
    await workerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Worker fits 320px",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: navigation, DXF editing and persistence, catalogs, estimate approval and printed act, PPR, kanban, users, mobile, tenant login.",
  );
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    if (pages[0]) {
      await pages[0].screenshot({
        path: ".deploy/browser-failure.png",
        fullPage: true,
      });
      console.error(
        (await pages[0].locator("body").innerText()).slice(0, 4000),
      );
    }
  }
  console.error(apiLogs);
  throw error;
} finally {
  if (browser) await browser.close();
  server.close();
  child.kill("SIGTERM");
  await once(child, "exit");
  if (pg) await pg.cleanup();
  f.cleanup();
}
