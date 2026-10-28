import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const product = process.argv[2],
  platform = process.argv[3] ?? "android";
if (
  !["client", "worker"].includes(product) ||
  !["android", "ios"].includes(platform)
)
  throw Error("Usage: prepare.mjs client|worker android|ios");
const api = new URL(process.env.VITE_WAREHOUSE_API_BASE_URL ?? "");
if (
  api.protocol !== "https:" ||
  api.username ||
  api.password ||
  api.search ||
  api.hash ||
  api.pathname !== "/"
)
  throw Error("Set VITE_WAREHOUSE_API_BASE_URL to the HTTPS CRM origin");
const target = path.join(root, ".local/mobile", product);
if (path.relative(path.join(root, ".local/mobile"), target) !== product)
  throw Error("Generated product path escaped the workspace");
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify(
    { name: `wirehouse-${product}`, version: "0.3.0", private: true },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(target, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: `ru.skladkontur.${product}`,
      appName:
        product === "client"
          ? "Склад Контур · Клиент"
          : "Склад Контур · Исполнитель",
      webDir: "www",
    },
    null,
    2,
  ),
);
const nodeModules = path.join(target, "node_modules");
if (!fs.existsSync(nodeModules))
  fs.symlinkSync(
    path.join(root, "node_modules"),
    nodeModules,
    process.platform === "win32" ? "junction" : "dir",
  );
const vite = path.join(root, "node_modules/vite/bin/vite.js");
execFileSync(
  process.execPath,
  [vite, "build", "--outDir", path.join(target, "www"), "--emptyOutDir"],
  {
    cwd: path.join(root, "apps/web"),
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_WAREHOUSE_PRODUCT: product,
      VITE_WAREHOUSE_API_BASE_URL: api.origin,
    },
  },
);
const cap = path.join(root, "node_modules/@capacitor/cli/bin/capacitor");
if (!fs.existsSync(path.join(target, platform)))
  execFileSync(process.execPath, [cap, "add", platform], {
    cwd: target,
    stdio: "inherit",
  });
execFileSync(process.execPath, [cap, "sync", platform], {
  cwd: target,
  stdio: "inherit",
});
const nativeVersionFile =
  platform === "android"
    ? path.join(target, "android/app/build.gradle")
    : path.join(target, "ios/App/App.xcodeproj/project.pbxproj");
let nativeVersion = fs.readFileSync(nativeVersionFile, "utf8");
nativeVersion =
  platform === "android"
    ? nativeVersion
        .replace(/versionCode\s+\d+/, "versionCode 300")
        .replace(/versionName\s+"[^"]+"/, 'versionName "0.3.0"')
    : nativeVersion
        .replace(
          /CURRENT_PROJECT_VERSION = [^;]+;/g,
          "CURRENT_PROJECT_VERSION = 300;",
        )
        .replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = 0.3.0;");
fs.writeFileSync(nativeVersionFile, nativeVersion);
fs.writeFileSync(
  path.join(target, "build-manifest.json"),
  JSON.stringify(
    {
      product,
      platform,
      appId: `ru.skladkontur.${product}`,
      apiOrigin: api.origin,
      version: "0.3.0",
      builtAt: new Date().toISOString(),
      boundary:
        "Prepared native source; no assertion of device, push or store validation",
    },
    null,
    2,
  ),
);
console.log(`Prepared ${product}/${platform}: ${target}`);
