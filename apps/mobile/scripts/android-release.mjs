import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { androidProject, root, runGradle } from "./gradle.mjs";

// Signed Android release (AAB for stores, APK for direct installation) of the
// project prepared by prepare.mjs. The keystore and passwords come from the
// environment and are never written into the repository: keystore.properties
// is generated inside the ignored .local/ directory.
//
// Keep the keystore safe: Android accepts an update only when it is signed
// with the same key as the installed app.
execFileSync(
  process.execPath,
  [path.join(root, "scripts/check-release-env.mjs"), "android"],
  { stdio: "inherit" },
);
const manifestFile = path.join(root, ".local/mobile/app/build-manifest.json");
const prepared = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  : {};
if (prepared.devHttp || !String(prepared.apiOrigin ?? "").startsWith("https:"))
  throw Error(
    "This project was prepared for development (plain HTTP API). Run prepare.mjs android with the HTTPS CRM origin and without WAREHOUSE_MOBILE_DEV_HTTP first.",
  );
const appGradle = path.join(androidProject, "app/build.gradle");
if (!fs.existsSync(appGradle))
  throw Error("Run apps/mobile/scripts/prepare.mjs android first");

fs.writeFileSync(
  path.join(androidProject, "keystore.properties"),
  [
    `storeFile=${process.env.ANDROID_KEYSTORE_PATH.replaceAll("\\", "/")}`,
    `storePassword=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `keyAlias=${process.env.ANDROID_KEY_ALIAS}`,
    `keyPassword=${process.env.ANDROID_KEY_PASSWORD}`,
    "",
  ].join("\n"),
);

let gradle = fs.readFileSync(appGradle, "utf8");
if (!gradle.includes("keystoreProperties"))
  gradle = `def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

${gradle}`;
if (!gradle.includes("signingConfigs {"))
  gradle = gradle.replace(
    /android\s*\{/,
    `android {
    signingConfigs {
        release {
            keyAlias keystoreProperties["keyAlias"]
            keyPassword keystoreProperties["keyPassword"]
            storeFile file(keystoreProperties["storeFile"])
            storePassword keystoreProperties["storePassword"]
        }
    }`,
  );
if (
  !/buildTypes\s*\{\s*release\s*\{[^}]*signingConfig signingConfigs\.release/.test(
    gradle,
  )
)
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{)/,
    `$1
            signingConfig signingConfigs.release`,
  );
fs.writeFileSync(appGradle, gradle);

const status = runGradle(["bundleRelease", "assembleRelease"]);
if (status !== 0) process.exit(status);

const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "apps/mobile/package.json"), "utf8"),
);
const releaseDir = path.join(root, ".local/mobile/release");
fs.mkdirSync(releaseDir, { recursive: true });
const outputs = [
  ["app/build/outputs/bundle/release/app-release.aab", "aab"],
  ["app/build/outputs/apk/release/app-release.apk", "apk"],
];
for (const [source, extension] of outputs) {
  const from = path.join(androidProject, source);
  if (!fs.existsSync(from)) throw Error(`Release build produced no ${source}`);
  const to = path.join(releaseDir, `sklad-kontur-${version}.${extension}`);
  fs.copyFileSync(from, to);
  console.log(`Signed ${extension.toUpperCase()}: ${path.relative(root, to)}`);
}
