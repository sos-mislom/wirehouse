import { saveReadingPeriod } from "../apps/api/src/domain/readings.js";
import { saveSource } from "../apps/api/src/domain/accounting.js";
import { scheduleFile } from "./maintenance-fixtures.mjs";
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
const journalSource = saveSource(f.db, f.admin, null, {
  name: "Бухгалтерия производственно-складского комплекса для проверки журнала",
  environment: "test",
  active: true,
});
for (const direction of ["inbox", "outbox"])
  for (let i = 0; i < (direction === "inbox" ? 120 : 12); i++) {
    f.db.data[`exchange_${direction}`].push({
      id: `journal-${direction}-${i}`,
      sourceId: journalSource.id,
      messageId: `journal-${direction}-${String(i).padStart(3, "0")}`,
      kind: "accounts",
      payloadHash: "browser-hash",
      payload: {},
      status: "failed",
      attempts: 1,
      error:
        "Ошибка тестового обмена: договор с указанным внешним идентификатором не сопоставлен",
      result: null,
      correlationId: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      nextAttemptAt: null,
    });
  }
const browserTicket = f.db.createTicket({
  unitId: f.unit.id,
  tenantId: f.tenant.id,
  leaseId: f.lease.id,
  createdBy: f.admin.id,
  assignedTo: f.worker.id,
  title: "Проверка переписки арендатора",
  description: "Проверить переход между списком и перепиской",
  category: "maintenance",
  priority: "medium",
});
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
saveReadingPeriod(f.db, f.admin, {
  propertyId: f.property.id,
  name: "Период для проверки",
  startsOn: period + "-01",
  endsOn: new Date().toISOString().slice(0, 10),
  photoRequired: false,
  thresholdPercent: 50,
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
    WAREHOUSE_DOCUMENTS_PATH: f.dir + "/documents",
    WAREHOUSE_TICKET_ATTACHMENTS_PATH: f.dir + "/tickets",
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
const capture = async (page, options) => {
  if (!process.env.SKIP_SCREENSHOTS) await page.screenshot(options);
};
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
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.__realtimeSockets = [];
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("/api/realtime")) {
          window.__realtimeSockets.push(this);
          this.addEventListener("message", (event) => {
            if (JSON.parse(event.data).type === "ready") this.__ready = true;
          });
        }
      }
    };
  });
  async function navigateManager(label) {
    const menu = page.getByRole("button", { name: "Меню", exact: true });
    if (await menu.isVisible()) await menu.click();
    const nav = page.locator("#workspace-navigation");
    const button = nav.getByRole("button", {
      name: new RegExp("^" + label + "(?: |$)"),
    });
    if (!(await button.isVisible()))
      await nav.locator(".workspace-extra-nav > summary").click();
    await button.click();
  }
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
  await capture(loginPage, {
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
  await capture(loginPage, {
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
  await page.getByRole("heading", { name: "Главная", exact: true }).waitFor();
  await navigateManager("Сроки и работы");
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
  await capture(page, { path: ".deploy/agenda-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateManager("Арендаторы");
  await page
    .getByRole("heading", { name: "Арендаторы", exact: true })
    .waitFor();
  await navigateManager("Договоры");
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
  await navigateManager("Помещения");
  await page.getByText("Структура и планы объекта", { exact: true }).click();
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
  await capture(page, {
    path: ".deploy/plan-editor-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByText("Структура и планы объекта", { exact: true }).click();
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
  await navigateManager("Эксплуатация");
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
  await page.getByText("Тестовая вентиляция", { exact: true }).waitFor();
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
  await page.getByText("Тестовое ППР", { exact: true }).waitFor();
  await page.getByText("Импорт графика ППР", { exact: true }).click();
  const schedule = scheduleFile(f);
  await page.getByLabel("Файл графика ППР", { exact: true }).setInputFiles({
    name: schedule.fileName,
    mimeType: "text/csv",
    buffer: Buffer.from(schedule.contentBase64, "base64"),
  });
  await page
    .getByRole("button", { name: "Проверить файл", exact: true })
    .click();
  await page
    .getByText("Строк: 1. Готово: 1. Уже загружено: 0. Ошибок: 0.", {
      exact: true,
    })
    .waitFor();
  await capture(page, {
    path: ".deploy/maintenance-import-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "PPR import fits mobile",
  );
  await capture(page, {
    path: ".deploy/maintenance-import-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Загрузить графики (1)", exact: true })
    .click();
  await page
    .getByText("Загружено графиков: 1. Уже существовали: 0.", { exact: true })
    .waitFor();
  await page.getByText("Проверка фильтра", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Проверить файл", exact: true })
    .click();
  await page
    .getByText("Строк: 1. Готово: 0. Уже загружено: 1. Ошибок: 0.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Загрузить графики (0)", exact: true })
      .isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await page.getByLabel(/^Заявка/).selectOption(browserTicket.id);
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
  assert.equal(
    await page
      .getByRole("button", { name: "Выпустить акт", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByText(
      "Акт станет доступен после приемки результата и завершения обязательного чек-листа.",
      { exact: true },
    )
    .waitFor();
  await capture(page, {
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
  await capture(page, {
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
  const sourceResponse = await page.request.post(
    "http://127.0.0.1:3001/api/accounting/sources",
    {
      headers: authorization,
      data: {
        name: "Учет для проверки",
        environment: "production",
        active: true,
      },
    },
  );
  assert.equal(sourceResponse.status(), 200);
  const source = (await sourceResponse.json()).item;
  const contextTicket = (
    await (
      await page.request.get("http://127.0.0.1:3001/api/tickets", {
        headers: authorization,
      })
    ).json()
  ).items.find((t) => t.id === estimateTicketId);
  if (!contextTicket.leaseId) {
    const linked = await page.request.put(
      `http://127.0.0.1:3001/api/tickets/${estimateTicketId}`,
      { headers: authorization, data: { leaseId: f.lease.id } },
    );
    assert.equal(linked.status(), 200);
  }
  const accountResponse = await page.request.post(
    "http://127.0.0.1:3001/api/accounting/accounts",
    {
      headers: authorization,
      data: {
        sourceId: source.id,
        leaseId: f.lease.id,
        externalId: "browser-account",
        number: "001",
        status: "active",
        validFrom: f.lease.start_date,
        validTo: null,
      },
    },
  );
  assert.equal(accountResponse.status(), 200);
  const account = (await accountResponse.json()).item;
  let workflow = (
    await (
      await page.request.get(
        `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/workflow`,
        { headers: authorization },
      )
    ).json()
  ).item;
  const terms = await page.request.post(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/workflow/terms`,
    {
      headers: authorization,
      data: {
        updatedAt: workflow.updatedAt,
        paid: true,
        amount: 200,
        accountId: account.id,
        requireBeforePhoto: false,
        requireAfterPhoto: false,
      },
    },
  );
  assert.equal(terms.status(), 200);
  workflow = (await terms.json()).item;
  const agreement = await page.request.post(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/workflow/decision`,
    {
      headers: authorization,
      data: { updatedAt: workflow.updatedAt, action: "approve", reason: "" },
    },
  );
  assert.equal(agreement.status(), 200);
  const started = await page.request.put(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}`,
    { headers: authorization, data: { status: "in_progress" } },
  );
  assert.equal(started.status(), 200);
  const completed = await page.request.put(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}`,
    {
      headers: authorization,
      data: { status: "completed" },
    },
  );
  assert.equal(completed.status(), 200);
  workflow = (
    await (
      await page.request.get(
        `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/workflow`,
        { headers: authorization },
      )
    ).json()
  ).item;
  const accepted = await page.request.post(
    `http://127.0.0.1:3001/api/tickets/${estimateTicketId}/workflow/decision`,
    {
      headers: authorization,
      data: { updatedAt: workflow.updatedAt, action: "accept", reason: "" },
    },
  );
  assert.equal(accepted.status(), 200);
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
  await capture(page, { path: ".deploy/kanban-desktop.png", fullPage: true });
  await navigateManager("Пользователи");
  await page.getByRole("heading", { name: "Пользователи и доступ" }).waitFor();
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Электрик", { exact: true }) })
    .click();
  const workerCard = page.locator(".operation-card").filter({
    has: page.getByRole("heading", { name: "Электрик", exact: true }),
  });
  await workerCard.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Имя *", { exact: true }).fill("Электрик обновлён");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("heading", { name: "Электрик обновлён" }).waitFor();
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Иван", { exact: true }) })
    .click();
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
  await capture(page, { path: ".deploy/users-mobile.png", fullPage: true });
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
  await navigateManager("Платежи");
  await page.getByRole("heading", { name: "Платежи", exact: true }).waitFor();
  await capture(page, { path: ".deploy/billing-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Billing fits mobile",
  );
  for (const width of [320, 360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of [
      "Главная",
      "Сроки и работы",
      "Арендаторы",
      "Договоры",
      "Помещения",
      "Эксплуатация",
      "Платежи",
      "Пользователи",
      "Объекты",
      "Чат",
      "Уведомления",
      "Импорт / экспорт",
      "Профиль",
    ]) {
      await page.getByRole("button", { name: "Меню", exact: true }).click();
      await navigateManager(section);
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
  await page.setViewportSize({ width: 390, height: 844 });
  const quickNav = page.getByRole("navigation", { name: "Быстрые переходы" });
  await quickNav.getByRole("button", { name: "Главная", exact: true }).click();
  await page.getByRole("heading", { name: "Главная", exact: true }).waitFor();
  assert.equal(
    await quickNav
      .getByRole("button", { name: "Главная", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    await page.locator(".workspace-extra-nav").getAttribute("open"),
    null,
  );
  assert.equal(await page.locator(".dashboard-page .mvp-metric").count(), 0);
  assert.equal(
    await page.locator(".dashboard-page .forecast-summary").count(),
    0,
  );
  await quickNav.getByRole("button", { name: "Платежи", exact: true }).click();
  const forecast = page.locator(".billing-forecast");
  await forecast.locator(":scope > summary").click();
  await forecast.locator(".forecast-summary").waitFor();
  await quickNav.getByRole("button", { name: "Главная", exact: true }).click();
  await page.getByRole("heading", { name: "Главная", exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await quickNav.getByRole("button", { name: "Заявки", exact: true }).click();
  await page.getByRole("heading", { name: "Заявки", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    "A new section opens from its heading",
  );
  const view = page.getByRole("group", { name: "Вид заявок" });
  await view.getByRole("button", { name: "Канбан", exact: true }).click();
  assert.equal(
    await view
      .getByRole("button", { name: "Канбан", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await quickNav.getByRole("button", { name: "Чат", exact: true }).click();
  await page.getByRole("button", { name: "К списку чатов" }).click();
  assert.equal(await page.locator(".chat-thread-pane").isVisible(), true);
  assert.equal(
    await page.locator(".chat-conversation-pane").isVisible(),
    false,
  );
  await page.locator(".mvp-thread").first().click();
  assert.equal(await page.locator(".chat-conversation-pane").isVisible(), true);
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  assert.equal(await page.locator(".mvp-main").getAttribute("inert"), "");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(
    () => !document.querySelector(".mvp-main").hasAttribute("inert"),
  );
  assert.equal(await page.locator("#workspace-navigation").isVisible(), true);
  assert.equal(await quickNav.isVisible(), false);

  await page.setViewportSize({ width: 1100, height: 900 });
  await navigateManager("Помещения");
  await page.getByRole("heading", { name: "Помещения", exact: true }).waitFor();
  await page.getByText("Структура и планы объекта", { exact: true }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Unit filters and expanded structure fit a narrow desktop",
  );

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
  await workerPage.getByText("Передать показание", { exact: true }).click();
  await workerPage
    .getByRole("combobox", { name: "Прибор", exact: true })
    .selectOption({ label: "Счётчик исполнителя · 101" });
  await workerPage
    .getByRole("combobox", { name: "Период ввода", exact: true })
    .selectOption({ index: 1 });
  await workerPage.getByLabel("Новое показание", { exact: true }).fill("12");
  await workerPage
    .getByRole("button", { name: "Отправить на проверку", exact: true })
    .click();
  await workerPage
    .getByText("Показание отправлено инженеру на проверку", { exact: true })
    .waitFor();
  assert.ok(
    await workerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Worker fits 320px",
  );
  // Compact data composition and business functions share the actual working screens.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateManager("Платежи");
  assert.equal(
    await page.locator(".billing-reconciliation").getAttribute("open"),
    null,
  );
  const invoiceTableTop = await page
    .locator('.data-register[aria-label="Реестр счетов"]')
    .evaluate((e) => e.getBoundingClientRect().top);
  assert.ok(
    invoiceTableTop < 500,
    "Invoices are visible above the fold on desktop",
  );
  await page
    .getByRole("button", { name: "Лицевые счета", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Лицевые счета", exact: true })
    .getByText("001", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Вид таблицы: Лицевые счета", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Плотность", exact: true })
    .selectOption("comfortable");
  assert.equal(
    await page
      .locator('.data-register--comfortable[aria-label="Лицевые счета"]')
      .count(),
    1,
  );
  await page.getByRole("checkbox", { name: "Договор", exact: true }).uncheck();
  assert.equal(
    await page
      .getByRole("columnheader", { name: "Договор", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("row")
    .filter({ has: page.getByText("001", { exact: true }) })
    .press("Enter");
  await page.getByRole("heading", { name: /^ЛС 001/ }).waitFor();
  await capture(page, {
    path: ".deploy/business-desktop-accounts.png",
    fullPage: true,
  });
  await page.getByText("Источники учета и обмен", { exact: true }).click();
  await page.getByText("Журнал обмена", { exact: true }).click();
  const journal = page.getByRole("region", { name: "Сообщения", exact: true });
  const journalSearch = journal.getByRole("textbox", {
    name: "Поиск: Сообщения",
    exact: true,
  });
  await journalSearch.fill("journal-");
  await journal
    .getByRole("status")
    .filter({ hasText: "1–25 из 132" })
    .waitFor();
  await journal.getByRole("button", { name: "Далее", exact: true }).click();
  await journal
    .getByRole("status")
    .filter({ hasText: "26–50 из 132" })
    .waitFor();
  await journalSearch.fill("journal-inbox-000");
  await journal.getByText("journal-inbox-000", { exact: true }).waitFor();
  assert.equal(
    await journal.locator("tbody tr").count(),
    1,
    "Server search reaches records older than the previous last-100 window",
  );
  let releaseOld, signalOld;
  const heldOld = new Promise((resolve) => {
      releaseOld = resolve;
    }),
    oldStarted = new Promise((resolve) => {
      signalOld = resolve;
    });
  const delayedSearch = async (route) => {
    if (new URL(route.request().url()).searchParams.get("q") !== "задержанный")
      return route.continue();
    signalOld();
    await heldOld;
    try {
      await route.fulfill({
        status: 500,
        json: { error: "Устаревшая ошибка", code: "TEST_ERROR" },
      });
    } catch {}
  };
  await page.route("**/api/accounting/exchange?**", delayedSearch);
  try {
    await journalSearch.fill("задержанный");
    await oldStarted;
    await journalSearch.fill("journal-inbox-001");
    await journal.getByText("journal-inbox-001", { exact: true }).waitFor();
    releaseOld();
    await page.waitForTimeout(250);
    assert.equal(
      await page.getByText("Устаревшая ошибка", { exact: true }).count(),
      0,
    );
    assert.equal(
      await journal.getByText("journal-inbox-001", { exact: true }).count(),
      1,
    );
  } finally {
    releaseOld();
    await page.unroute("**/api/accounting/exchange?**", delayedSearch);
  }
  let failNext = true;
  const failSearch = (route) => {
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        json: { error: "Проверка повторной загрузки", code: "TEST_ERROR" },
      });
    }
    return route.continue();
  };
  await page.route("**/api/accounting/exchange?**", failSearch);
  try {
    await journalSearch.fill("journal-inbox-002");
    await page
      .getByRole("alert")
      .filter({ hasText: "Проверка повторной загрузки" })
      .waitFor();
    await journal.getByText("journal-inbox-002", { exact: true }).waitFor();
  } finally {
    await page.unroute("**/api/accounting/exchange?**", failSearch);
  }
  await journalSearch.fill("");
  await journal.getByRole("button", { name: "Фильтры", exact: true }).click();
  await journal
    .getByRole("combobox", { name: "Источник", exact: true })
    .selectOption(journalSource.id);
  await journal
    .getByRole("combobox", { name: "Направление", exact: true })
    .selectOption("outbox");
  await journal
    .getByRole("combobox", { name: "Результат", exact: true })
    .selectOption("failed");
  await journal.getByText("journal-outbox-011", { exact: true }).waitFor();
  assert.equal(await journal.locator("tbody tr").count(), 12);
  await journal
    .getByRole("button", { name: "Повторить", exact: true })
    .first()
    .click();
  await page
    .getByText("Повторная обработка запрошена. Результат появится в журнале.", {
      exact: true,
    })
    .waitFor();
  await journal.getByText("journal-outbox-010", { exact: true }).waitFor();
  assert.equal(await journal.locator("tbody tr").count(), 11);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await journal.getByRole("heading").scrollIntoViewIfNeeded();
    if (process.env.PAGED_SCREENSHOTS) {
      fs.mkdirSync("output/playwright", { recursive: true });
      await page.screenshot({
        path: `output/playwright/exchange-${width}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateManager("Пользователи");
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "Аудит", exact: true })
    .click();
  const auditRegister = page.getByRole("region", {
    name: "Аудит изменений",
    exact: true,
  });
  await auditRegister.locator("tbody tr").first().waitFor();
  await auditRegister
    .getByRole("textbox", { name: "Поиск: Аудит изменений", exact: true })
    .fill(f.worker.id);
  await auditRegister.locator("tbody tr").first().waitFor();
  await auditRegister
    .getByRole("button", { name: "Состав изменений", exact: true })
    .first()
    .click();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await auditRegister.getByRole("heading").scrollIntoViewIfNeeded();
    const detail = auditRegister.getByRole("region", {
      name: "Подробности изменения",
      exact: true,
    });
    assert.ok(
      (await detail.evaluate(
        (e) =>
          e.getBoundingClientRect().width /
          e.closest("table").getBoundingClientRect().width,
      )) > 0.8,
      "Audit details use the full record width",
    );
    if (process.env.PAGED_SCREENSHOTS)
      await page.screenshot({ path: `output/playwright/audit-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await auditRegister
    .getByRole("button", { name: "Закрыть подробности", exact: true })
    .click();
  assert.equal(
    await auditRegister
      .getByRole("button", { name: "Состав изменений", exact: true })
      .first()
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "Доступ", exact: true })
    .click();
  await page.getByRole("heading", { name: /^Контекстные права/ }).waitFor();
  await page
    .getByRole("button", { name: "Назначить доступ", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Пользователь", exact: true })
    .selectOption({ label: "Иван" });
  await page
    .getByRole("combobox", { name: "Бизнес-роль", exact: true })
    .selectOption("owner");
  await page
    .getByRole("combobox", { name: "Тип области", exact: true })
    .selectOption("property");
  assert.equal(
    await page
      .getByRole("checkbox", {
        name: "Просмотр начислений и оплат",
        exact: true,
      })
      .count(),
    0,
    "Property ownership does not offer account financial permissions",
  );
  await page
    .getByRole("combobox", { name: "Тип области", exact: true })
    .selectOption("lease");
  await page
    .getByRole("combobox", { name: "Область", exact: true })
    .selectOption(f.lease.id);
  const permissionOptions = page
    .locator(".permission-grid")
    .getByRole("checkbox");
  await permissionOptions.first().focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await permissionOptions
      .nth(1)
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("ArrowUp");
  assert.equal(
    await permissionOptions
      .first()
      .evaluate((e) => e === document.activeElement),
    true,
  );
  const historyOption = page.getByRole("checkbox", {
    name: "Сохранить просмотр истории после окончания срока",
    exact: true,
  });
  assert.equal(
    await historyOption.isChecked(),
    true,
    "Uncontrolled initial selection is preserved",
  );
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const geometry = await historyOption.evaluate((e) => {
      const label = e.closest("label"),
        mark = label.querySelector(".ui-checkbox__mark"),
        caption = label.querySelector(".ui-checkbox__caption");
      const l = label.getBoundingClientRect(),
        m = mark.getBoundingClientRect(),
        c = caption.getBoundingClientRect();
      return {
        height: l.height,
        offset: m.top - c.top,
        gap: c.left - m.right,
        width: m.width,
      };
    });
    assert.ok(geometry.height >= (width < 760 ? 44 : 36));
    assert.equal(geometry.width, 18);
    assert.ok(
      geometry.offset >= 0 && geometry.offset <= 2,
      "Marker stays aligned with the first caption line",
    );
    assert.equal(geometry.gap, 8);
    for (const control of [
      page.getByLabel("Доступ с", { exact: true }),
      page.getByRole("combobox", { name: "Тип области", exact: true }),
    ])
      assert.equal(
        await control.evaluate((e) => e.getBoundingClientRect().height),
        width < 760 ? 44 : 36,
        "Inputs and selects use the same control height",
      );
    assert.equal(
      await historyOption
        .locator("..")
        .locator(".ui-checkbox__caption")
        .evaluate((e) => getComputedStyle(e).color),
      "rgb(34, 34, 34)",
      "Enabled option captions retain the primary text color",
    );
    if (process.env.CHECKBOX_SCREENSHOTS) {
      fs.mkdirSync("output/playwright", { recursive: true });
      await page.locator(".permission-grid").screenshot({
        path: `output/playwright/checkbox-permissions-${width}.png`,
      });
      await historyOption
        .locator("..")
        .screenshot({ path: `output/playwright/checkbox-wrap-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("Основание", { exact: true })
    .fill("Назначение собственника для проверки");
  await page
    .getByRole("button", { name: "Сохранить доступ", exact: true })
    .click();
  await page.getByText("Сохранено", { exact: true }).waitFor();
  await capture(page, {
    path: ".deploy/business-desktop-access.png",
    fullPage: true,
  });
  await navigateManager("Эксплуатация");
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "Счётчики", exact: true })
    .click();
  await page.getByRole("button", { name: "Показания", exact: true }).click();
  await page
    .getByRole("region", { name: "Показания", exact: true })
    .getByRole("row")
    .filter({ hasText: "На проверке" })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Решение инженера", exact: true })
    .selectOption("false");
  assert.equal(
    await page
      .getByLabel("Обоснование", { exact: true })
      .evaluate((e) => e.required && !e.checkValidity()),
    true,
    "Rejecting a normal reading requires a reason before submission",
  );
  await page
    .getByRole("combobox", { name: "Решение инженера", exact: true })
    .selectOption("true");
  await page
    .getByRole("button", { name: "Сохранить решение", exact: true })
    .click();
  await page.getByText("Решение сохранено", { exact: true }).waitFor();
  await capture(page, {
    path: ".deploy/business-desktop-readings.png",
    fullPage: true,
  });
  await page
    .locator(".operations-nav")
    .getByRole("button", { name: "ППР", exact: true })
    .click();
  await page
    .getByText("Исполнение ППР: план, факт и переносы", { exact: true })
    .click();
  await page
    .getByRole("region", { name: "Задания ППР", exact: true })
    .getByRole("row")
    .nth(1)
    .click();
  await page
    .getByLabel("Новый срок, если нужен перенос", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page
    .getByLabel("Причина", { exact: true })
    .fill("Нет доступа в помещение");
  await page
    .getByLabel("Техническое замечание", { exact: true })
    .fill("Повторный осмотр после открытия помещения");
  await page
    .getByRole("button", { name: "Сохранить изменение", exact: true })
    .click();
  await page
    .getByText("Изменение задания сохранено", { exact: true })
    .waitFor();
  await navigateManager("Объекты");
  await page.getByText("Реестр документов", { exact: true }).click();
  const documentRegister = page.getByRole("region", {
    name: "Документы",
    exact: true,
  });
  await documentRegister.getByText(/АКТ-.*html/).waitFor();
  await documentRegister.getByRole("row").nth(1).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать файл", exact: true }).click();
  assert.match((await download).suggestedFilename(), /АКТ-.*html/);
  await capture(page, {
    path: ".deploy/business-desktop-documents.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["Платежи", "Пользователи", "Эксплуатация", "Объекты"]) {
      await navigateManager(name);
      if (name === "Платежи")
        await page
          .getByRole("button", { name: "Лицевые счета", exact: true })
          .click();
      if (name === "Пользователи")
        await page
          .getByRole("combobox", { name: "Раздел", exact: true })
          .selectOption("access");
      if (name === "Эксплуатация") {
        await page
          .getByRole("combobox", { name: "Раздел", exact: true })
          .selectOption("meters");
        await page
          .getByRole("button", { name: "Показания", exact: true })
          .click();
      }
      if (name === "Объекты")
        await page.getByText("Реестр документов", { exact: true }).click();
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name} business views fit ${width}`,
      );
      await capture(page, {
        path: `.deploy/business-${width}-${name}.png`,
        fullPage: true,
      });
    }
  }
  await page.route("**/api/accounting", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        ...data,
        accounts: Array.from({ length: 80 }, (_, i) => ({
          ...account,
          id: `account-${i}`,
          number: `ЛС-ТЕСТ-${String(i).padStart(3, "0")}`,
        })),
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateManager("Платежи");
  await page
    .getByRole("button", { name: "Лицевые счета", exact: true })
    .click();
  const denseRegister = page.getByRole("region", {
    name: "Лицевые счета",
    exact: true,
  });
  await denseRegister.getByText("ЛС-ТЕСТ-000", { exact: true }).waitFor();
  assert.equal(await denseRegister.locator("tbody tr").count(), 25);
  await denseRegister
    .getByRole("button", { name: "Вид таблицы: Лицевые счета", exact: true })
    .click();
  await denseRegister
    .getByRole("combobox", { name: "Записей на странице", exact: true })
    .selectOption("10");
  const pagination = denseRegister.getByRole("navigation", {
    name: "Страницы: Лицевые счета",
    exact: true,
  });
  await pagination.getByRole("button", { name: "Далее", exact: true }).click();
  await denseRegister.getByText("ЛС-ТЕСТ-010", { exact: true }).waitFor();
  assert.equal(await denseRegister.locator("tbody tr").count(), 10);
  await denseRegister
    .getByRole("textbox", { name: "Поиск: Лицевые счета", exact: true })
    .fill("ЛС-ТЕСТ-079");
  await denseRegister.getByText("ЛС-ТЕСТ-079", { exact: true }).waitFor();
  assert.equal(
    await denseRegister.locator("tbody tr").count(),
    1,
    "Search includes records from all pages",
  );
  await denseRegister
    .getByRole("textbox", { name: "Поиск: Лицевые счета", exact: true })
    .fill("");
  await denseRegister.getByText("ЛС-ТЕСТ-000", { exact: true }).waitFor();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Paginated long lists fit ${width}`,
    );
  }
  await page.unroute("**/api/accounting");
  // The person accepting work can inspect both stages, including after closure.
  const proofTicketResponse = await page.request.post(
    "http://127.0.0.1:3001/api/tickets",
    {
      headers: authorization,
      data: {
        unitId: f.unit.id,
        tenantId: f.tenant.id,
        leaseId: f.lease.id,
        assignedTo: f.worker.id,
        category: "electrical",
        priority: "medium",
        title: "Приемка работы с фотографиями",
        description: "Проверить фотографии этапов",
      },
    },
  );
  assert.equal(proofTicketResponse.status(), 201);
  const proofTicket = (await proofTicketResponse.json()).item;
  await page.reload();
  await page.getByRole("button", { name: "Меню", exact: true }).waitFor();
  await navigateManager("Заявки");
  await page
    .getByRole("group", { name: "Вид заявок" })
    .getByRole("button", { name: "Канбан", exact: true })
    .click();
  await page
    .locator(".kanban-ticket")
    .filter({ hasText: proofTicket.title })
    .getByRole("button")
    .first()
    .click();
  const termsPanel = page.locator(".ticket-workflow");
  await termsPanel.getByText("Условия работы", { exact: true }).click();
  const paidToggle = termsPanel.getByRole("checkbox", {
    name: "Платная работа",
    exact: true,
  });
  const amountField = termsPanel.getByRole("spinbutton", {
    name: "Стоимость, ₽",
    exact: true,
  });
  assert.equal(await amountField.isDisabled(), true);
  await paidToggle.locator("..").locator(".ui-checkbox__caption").click();
  assert.equal(
    await paidToggle.isChecked(),
    true,
    "Clicking the caption toggles a controlled checkbox",
  );
  await paidToggle.focus();
  await page.keyboard.press("Space");
  assert.equal(await paidToggle.isChecked(), false);
  await page.keyboard.press("Enter");
  assert.equal(
    await paidToggle.isChecked(),
    true,
    "Enter selects the option without submitting the form",
  );
  assert.equal(
    await termsPanel
      .getByRole("button", { name: "Сохранить условия", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await paidToggle.evaluate((e) => {
      const mark = e.nextElementSibling;
      return (
        e.matches(":focus-visible") &&
        getComputedStyle(mark).outlineStyle === "solid"
      );
    }),
    true,
    "Keyboard selection retains a visible focus marker",
  );
  await paidToggle.uncheck();
  await paidToggle.check();
  await amountField.fill("100");
  const liveComment = "Автоматическое сообщение без обновления страницы";
  const liveCommentResponse = await page.request.post(
    `http://127.0.0.1:3001/api/tickets/${proofTicket.id}/comments`,
    {
      headers: authorization,
      data: { content: liveComment },
    },
  );
  assert.equal(
    liveCommentResponse.status(),
    201,
    await liveCommentResponse.text(),
  );
  await page
    .locator(".comment-card")
    .getByText(liveComment, { exact: true })
    .waitFor();
  assert.equal(
    await amountField.inputValue(),
    "100",
    "Background data cannot reset a work draft",
  );
  assert.equal(await paidToggle.isChecked(), true);

  assert.equal(
    await termsPanel
      .getByRole("combobox", { name: "Лицевой счет", exact: true })
      .evaluate((e) => e.required),
    true,
  );
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Work terms fit ${width}`,
    );
    if (process.env.WORKFLOW_SCREENSHOTS || process.env.CHECKBOX_SCREENSHOTS) {
      fs.mkdirSync("output/playwright", { recursive: true });
      await termsPanel.screenshot({
        path: `output/playwright/work-terms-${width}.png`,
      });
    }
  }
  const beforePhoto = termsPanel.getByRole("checkbox", {
    name: "До начала работ",
    exact: true,
  });
  const afterPhoto = termsPanel.getByRole("checkbox", {
    name: "После выполнения",
    exact: true,
  });
  await beforePhoto.check();
  await afterPhoto.uncheck();
  assert.deepEqual(
    await beforePhoto.evaluate((e) => {
      const values = new FormData(e.form);
      return [values.get("before"), values.get("after")];
    }),
    ["on", null],
    "Native checkbox names and values survive the component migration",
  );
  await beforePhoto.uncheck();
  await paidToggle.uncheck();
  assert.equal(await amountField.inputValue(), "0");
  await termsPanel
    .getByRole("button", { name: "Сохранить условия", exact: true })
    .click();
  await termsPanel
    .getByText(
      "Условия сохранены. Предыдущее согласование больше не действует.",
      { exact: true },
    )
    .waitFor();
  const proofWorkflow = async () =>
    (
      await (
        await page.request.get(
          `http://127.0.0.1:3001/api/tickets/${proofTicket.id}/workflow`,
          { headers: authorization },
        )
      ).json()
    ).item;
  const proofDecision = async (action) => {
    const w = await proofWorkflow();
    const response = await page.request.post(
      `http://127.0.0.1:3001/api/tickets/${proofTicket.id}/workflow/decision`,
      {
        headers: authorization,
        data: { updatedAt: w.updatedAt, action, reason: "" },
      },
    );
    assert.equal(response.status(), 200, await response.text());
  };
  for (const phase of ["before", "after"]) {
    const response = await page.request.post(
      "http://127.0.0.1:3001/api/documents",
      {
        headers: authorization,
        data: {
          fileName: phase + ".jpg",
          name: phase === "before" ? "До работ.jpg" : "Результат работ.jpg",
          category: "photo",
          mimeType: "image/jpeg",
          contentBase64: Buffer.from([
            255, 216, 255, 1, 2, 3, 255, 217,
          ]).toString("base64"),
          links: [{ entityType: "tickets", entityId: proofTicket.id, phase }],
        },
      },
    );
    assert.equal(response.status(), 200, await response.text());
    if (phase === "before") await proofDecision("start");
  }
  await proofDecision("submit");
  await tenantPage.reload();
  await tenantPage.getByRole("button", { name: "Меню", exact: true }).click();
  await tenantPage
    .locator("#workspace-navigation")
    .getByRole("button", { name: /^Заявки(?: |$)/ })
    .click();
  await tenantPage
    .locator(".ticket-card")
    .filter({ hasText: "Приемка работы с фотографиями" })
    .click();
  const proofPanel = tenantPage.locator(".ticket-workflow");
  await proofPanel
    .getByRole("button", { name: "Принять результат", exact: true })
    .waitFor();
  for (const width of [1440, 320]) {
    await tenantPage.setViewportSize({ width, height: 900 });
    await proofPanel
      .getByRole("button", { name: "До работ.jpg", exact: true })
      .waitFor();
    await proofPanel
      .getByRole("button", { name: "Результат работ.jpg", exact: true })
      .waitFor();
    assert.equal(
      await proofPanel.locator('input[type="file"]').count(),
      0,
      "Acceptance does not grant evidence upload rights",
    );
    assert.ok(
      await tenantPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Work evidence fits ${width}`,
    );
    if (process.env.WORKFLOW_SCREENSHOTS) {
      fs.mkdirSync("output/playwright", { recursive: true });
      await proofPanel.screenshot({
        path: `output/playwright/work-acceptance-${width}.png`,
      });
    }
  }
  const proofDownload = tenantPage.waitForEvent("download");
  await proofPanel
    .getByRole("button", { name: "Результат работ.jpg", exact: true })
    .click();
  assert.equal(
    (await proofDownload).suggestedFilename(),
    "Результат работ.jpg",
  );
  await proofPanel
    .getByRole("button", { name: "Принять результат", exact: true })
    .click();
  await proofPanel
    .getByRole("heading", { name: "Результат принят", exact: true })
    .waitFor();
  await proofPanel
    .locator(".work-disclosure > summary")
    .filter({ hasText: /^Фотографии работ/ })
    .click();
  await proofPanel
    .getByRole("button", { name: "Результат работ.jpg", exact: true })
    .waitFor();
  // Drop one notification, then reconnect without reloading the document.
  const reconnectDraft = "Черновик сохраняется при восстановлении соединения";
  const commentDraft = page.locator('.comment-form textarea[name="content"]');
  await commentDraft.fill(reconnectDraft);
  await page.waitForFunction(() =>
    window.__realtimeSockets.some((ws) => ws.readyState === WebSocket.OPEN),
  );
  await page.evaluate(() => {
    window.__realtimeSockets
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .forEach((ws) => {
        ws.onmessage = null;
      });
  });
  const missedComment = "Пропущенное событие восстановлено после подключения";
  const missedResponse = await page.request.post(
    `http://127.0.0.1:3001/api/tickets/${proofTicket.id}/comments`,
    {
      headers: authorization,
      data: { content: missedComment },
    },
  );
  assert.equal(missedResponse.status(), 201, await missedResponse.text());
  await page.waitForTimeout(600);
  const socketsBeforeReconnect = await page.evaluate(
    () => window.__realtimeSockets.length,
  );
  await page.evaluate(() =>
    window.__realtimeSockets
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .forEach((ws) => ws.close(4000, "Test reconnect")),
  );
  await page.waitForFunction(
    (count) =>
      window.__realtimeSockets.length > count &&
      window.__realtimeSockets.some(
        (ws) => ws.readyState === WebSocket.OPEN && ws.__ready,
      ),
    socketsBeforeReconnect,
  );
  await page
    .locator(".comment-card")
    .getByText(missedComment, { exact: true })
    .waitFor();
  assert.equal(await commentDraft.inputValue(), reconnectDraft);
  assert.equal(
    await page.evaluate(
      () =>
        window.__realtimeSockets.filter(
          (ws) => ws.readyState === WebSocket.OPEN,
        ).length,
    ),
    1,
    "One socket per workspace",
  );
  assert.equal(
    await page
      .getByRole("button", { name: /^Обновить(?: данные| журнал)?$/ })
      .count(),
    0,
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
