import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(rootDir, "android");
const appBuildGradle = path.join(androidDir, "app", "build.gradle");

if (fs.existsSync(appBuildGradle)) {
  console.log("Capacitor Android project is present.");
  process.exit(0);
}

console.log("Capacitor Android project is missing. Creating it with `npx cap add android`...");

const result = spawnSync("npx", ["cap", "add", "android"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
