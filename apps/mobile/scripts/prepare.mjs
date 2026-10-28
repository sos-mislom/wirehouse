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
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "apps/mobile/package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw Error("A stable mobile version is required");
const [major, minor, patch] = version.split(".").map(Number),
  versionCode = major * 10000 + minor * 100 + patch;
if (path.relative(path.join(root, ".local/mobile"), target) !== product)
  throw Error("Generated product path escaped the workspace");
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify(
    { name: `wirehouse-${product}`, version, private: true },
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
        .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
        .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)
    : nativeVersion
        .replace(
          /CURRENT_PROJECT_VERSION = [^;]+;/g,
          `CURRENT_PROJECT_VERSION = ${versionCode};`,
        )
        .replace(
          /MARKETING_VERSION = [^;]+;/g,
          `MARKETING_VERSION = ${version};`,
        );
fs.writeFileSync(nativeVersionFile, nativeVersion);
fs.writeFileSync(
  path.join(target, "build-manifest.json"),
  JSON.stringify(
    {
      product,
      platform,
      appId: `ru.skladkontur.${product}`,
      apiOrigin: api.origin,
      version,
      builtAt: new Date().toISOString(),
      boundary:
        "Prepared native source; no assertion of device, push or store validation",
    },
    null,
    2,
  ),
);
console.log(`Prepared ${product}/${platform}: ${target}`);
