import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "capacitor.config.json");
const remoteUrl = String(process.env.WAREHOUSE_APP_REMOTE_URL || "").trim();
const appId = String(process.env.WAREHOUSE_ANDROID_APP_ID || "ru.skladkontur.app").trim();
const appName = String(process.env.WAREHOUSE_ANDROID_APP_NAME || "sklad kontur").trim();

const config = {
  appId,
  appName,
  webDir: "../web/dist",
  bundledWebRuntime: false
};

if (remoteUrl) {
  config.server = {
    url: remoteUrl,
    cleartext: false
  };
}

fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
