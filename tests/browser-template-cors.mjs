import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import { createMaintenanceImportRoutes } from "../apps/api/src/routes/maintenance-import.js";
import { createDocumentsRegistryRoutes } from "../apps/api/src/routes/documents-registry.js";
import { readDocumentTemplate } from "../apps/api/src/services/document-templates.js";

// Real production route handlers and committed files over two independent HTTP
// origins. Authentication is a local route-test fixture; no production or DB.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wirehouse-template-cors-"));
const proof = { realRouteHandlers: true, separateBrowserOrigin: true, files: [], productionRequests: 0 };
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const send = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify(body));
};
const requireAuth = (request, response) => {
  if (request.headers.authorization === "Bearer cors-admin") return { id: "cors-admin", role: "admin" };
  if (request.headers.authorization === "Bearer cors-restricted") return { id: "cors-restricted", role: "manager", permissions: [] };
  send(response, 401, { error: "Authentication required" });
  return null;
};
const dependencies = { requireAuth, json: send, ok: (response, body) => send(response, 200, body) };
const routes = [createMaintenanceImportRoutes(dependencies), createDocumentsRegistryRoutes(dependencies)];
let optionsRequests = 0;
const api = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    optionsRequests++;
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "authorization" });
    response.end();
    return;
  }
  try {
    for (const route of routes) if (await route(request, response, new URL(request.url, "http://127.0.0.1"))) return;
    send(response, 404, { error: "Not found" });
  } catch (error) { send(response, 500, { error: error.message }); }
});
const web = http.createServer((_request, response) => response.end("<!doctype html><title>Template cross-origin test</title>"));
let browser;
try {
  api.listen(0, "127.0.0.1"); web.listen(0, "127.0.0.1");
  await Promise.all([once(api, "listening"), once(web, "listening")]);
  const apiOrigin = `http://127.0.0.1:${api.address().port}`, webOrigin = `http://127.0.0.1:${web.address().port}`;
  assert.notEqual(apiOrigin, webOrigin);
  browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(webOrigin);
  for (const [endpoint, filename, format] of [
    ["/api/maintenance-import/template", "maintenance-plans.xlsx", "xlsx"],
    ["/api/documents/templates/lease-agreement/pdf", "lease.pdf", "pdf"],
    ["/api/documents/templates/lease-agreement/docx", "lease.docx", "docx"],
  ]) {
    const actual = await page.evaluate(async ({ url, filename }) => {
      const response = await fetch(url, { headers: { Authorization: "Bearer cors-admin" } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes], { type: response.headers.get("Content-Type") }));
      link.download = filename;
      link.textContent = filename;
      document.body.append(link);
      return { status: response.status, disposition: response.headers.get("Content-Disposition"), type: response.headers.get("Content-Type"), bytes: Array.from(bytes) };
    }, { url: apiOrigin + endpoint, filename });
    assert.equal(actual.status, 200); assert.ok(actual.disposition); assert.ok(actual.bytes.length > 100);
    const bytes = Buffer.from(actual.bytes);
    const downloadEvent = page.waitForEvent("download"); await page.locator("a").last().click();
    const download = await downloadEvent; assert.equal(download.suggestedFilename(), filename);
    const destination = path.join(directory, filename); await download.saveAs(destination); assert.equal(sha(fs.readFileSync(destination)), sha(bytes));
    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
      assert.equal(workbook.worksheets.length, 1); assert.equal(workbook.worksheets[0].columnCount, 16);
    } else {
      const expected = await readDocumentTemplate("lease-agreement", format); assert.equal(sha(bytes), expected.sha256);
      assert.equal(bytes.subarray(0, format === "pdf" ? 5 : 2).toString(), format === "pdf" ? "%PDF-" : "PK");
    }
    // Static template responses can be privately cached; use distinct URLs so
    // these checks reach the route under each independent authentication state.
    const denied = await page.evaluate(async (url) => (await fetch(url, { headers: { Authorization: "Bearer cors-restricted" } })).status, apiOrigin + endpoint + "?qa=restricted");
    assert.equal(denied, 403, "CORS must not grant template permissions");
    const anonymous = await page.evaluate(async (url) => (await fetch(url)).status, apiOrigin + endpoint + "?qa=anonymous");
    assert.equal(anonymous, 401, "CORS must not remove authentication");
    proof.files.push({ endpoint, format, bytes: bytes.length, sha256: sha(bytes), readableContentDisposition: true, realBrowserDownloadVerified: true, restricted403: true, anonymous401: true });
  }
  assert.ok(optionsRequests >= 3); proof.preflightRequests = optionsRequests; proof.passed = true;
  if (process.env.WIREHOUSE_QA_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.WIREHOUSE_QA_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.WIREHOUSE_QA_EVIDENCE_DIR, "template-cors-fixed-browser-proof.json"), JSON.stringify(proof, null, 2) + "\n");
  }
  console.log(JSON.stringify(proof));
} finally {
  await browser?.close();
  api.closeAllConnections(); web.closeAllConnections();
  await Promise.all([new Promise((resolve) => api.close(resolve)), new Promise((resolve) => web.close(resolve))]);
  const resolved = fs.realpathSync(directory);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("wirehouse-template-cors-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
