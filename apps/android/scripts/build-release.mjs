import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(rootDir, "..", "..");
const androidDir = path.join(rootDir, "android");
const releaseDir = path.join(rootDir, "release");
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradlePath = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const appName = "sklad-kontur";
const version = packageJson.version ?? "0.0.0";

if (!fs.existsSync(gradlePath)) {
  console.error("Gradle wrapper is missing. Run npm --workspace apps/android run android:add first.");
  process.exit(1);
}

for (const task of ["bundleRelease", "assembleRelease"]) {
  const result = spawnSync(gradle, [task], {
    cwd: androidDir,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

const findArtifacts = (dir, extensions, results = []) => {
  if (!fs.existsSync(dir)) {
    return results;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findArtifacts(fullPath, extensions, results);
    } else if (extensions.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
};

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const artifacts = findArtifacts(path.join(androidDir, "app", "build", "outputs"), [".aab", ".apk"]);

for (const sourcePath of artifacts) {
  const extension = path.extname(sourcePath);
  const type = extension === ".aab" ? "bundle" : "apk";
  const targetName = `${appName}-${version}-android-release-${type}${extension}`;
  fs.copyFileSync(sourcePath, path.join(releaseDir, targetName));
}

if (artifacts.length === 0) {
  console.error("Android release finished but no APK/AAB artifacts were found.");
  process.exit(1);
}

console.log(`Android release artifacts copied to ${path.relative(workspaceRoot, releaseDir)}.`);
