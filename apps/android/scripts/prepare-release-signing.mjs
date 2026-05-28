import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(rootDir, "android");
const appBuildGradle = path.join(androidDir, "app", "build.gradle");
const propertiesPath = path.join(androidDir, "keystore.properties");

if (!fs.existsSync(appBuildGradle)) {
  console.error("Capacitor Android project is missing. Run npm --workspace apps/android run android:add first.");
  process.exit(1);
}

const keystorePath = process.env.ANDROID_KEYSTORE_PATH;
const keystorePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;

if (!fs.existsSync(keystorePath)) {
  console.error(`Android release keystore does not exist: ${keystorePath}`);
  process.exit(1);
}

fs.writeFileSync(
  propertiesPath,
  [
    `storeFile=${keystorePath.replace(/\\/g, "\\\\")}`,
    `storePassword=${keystorePassword}`,
    `keyAlias=${keyAlias}`,
    `keyPassword=${keyPassword}`,
    ""
  ].join("\n"),
  "utf8"
);

let gradle = fs.readFileSync(appBuildGradle, "utf8");

if (!gradle.includes("keystoreProperties")) {
  gradle = `def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

${gradle}`;
}

if (!gradle.includes("signingConfigs {")) {
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
    }`
  );
}

if (!/release\s*\{[\s\S]*signingConfig signingConfigs\.release/.test(gradle)) {
  gradle = gradle.replace(
    /release\s*\{/,
    `release {
            signingConfig signingConfigs.release`
  );
}

fs.writeFileSync(appBuildGradle, gradle, "utf8");
console.log("Android release signing is configured.");
