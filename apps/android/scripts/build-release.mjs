import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(rootDir, "android");
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradlePath = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

if (!fs.existsSync(gradlePath)) {
  console.error("Gradle wrapper is missing. Run npm --workspace apps/android run android:add first.");
  process.exit(1);
}

const result = spawnSync(gradle, ["bundleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
