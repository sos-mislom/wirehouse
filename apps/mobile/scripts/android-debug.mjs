import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const product = process.argv[2];
if (!["client", "worker"].includes(product))
  throw Error("Choose client or worker");
const native = path.join(root, ".local/mobile", product, "android");
if (!fs.existsSync(path.join(native, "gradlew.bat")))
  throw Error("Prepare the Android product first");
if (!process.env.ANDROID_HOME) throw Error("ANDROID_HOME is required");
fs.writeFileSync(
  path.join(native, "local.properties"),
  `sdk.dir=${process.env.ANDROID_HOME.replaceAll("\\", "/")}\n`,
);
if (!process.env.JAVA_HOME) throw Error("JAVA_HOME must select JDK 21");
const result = spawnSync(
  path.join(
    process.env.JAVA_HOME,
    "bin",
    process.platform === "win32" ? "java.exe" : "java",
  ),
  [
    "-Dorg.gradle.appname=gradlew",
    "-classpath",
    path.join(native, "gradle/wrapper/gradle-wrapper.jar"),
    "org.gradle.wrapper.GradleWrapperMain",
    "assembleDebug",
    "--no-daemon",
  ],
  {
    cwd: native,
    stdio: "inherit",
    env: {
      ...process.env,
      GRADLE_USER_HOME:
        process.env.GRADLE_USER_HOME ??
        path.join(root, ".local/mobile/gradle-cache"),
    },
  },
);
process.exit(result.status ?? 1);
