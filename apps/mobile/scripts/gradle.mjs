import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const androidProject = path.join(root, ".local/mobile/app/android");

// Runs Gradle tasks in the prepared Android project with the JDK from
// JAVA_HOME. The wrapper jar is invoked directly, so it works the same on
// Windows, Linux and macOS.
export function runGradle(tasks) {
  if (
    !fs.existsSync(
      path.join(androidProject, "gradle/wrapper/gradle-wrapper.jar"),
    )
  )
    throw Error("Run apps/mobile/scripts/prepare.mjs android first");
  if (!process.env.ANDROID_HOME) throw Error("ANDROID_HOME is required");
  fs.writeFileSync(
    path.join(androidProject, "local.properties"),
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
      path.join(androidProject, "gradle/wrapper/gradle-wrapper.jar"),
      "org.gradle.wrapper.GradleWrapperMain",
      ...tasks,
      "--no-daemon",
    ],
    {
      cwd: androidProject,
      stdio: "inherit",
      env: {
        ...process.env,
        GRADLE_USER_HOME:
          process.env.GRADLE_USER_HOME ??
          path.join(root, ".local/mobile/gradle-cache"),
      },
    },
  );
  return result.status ?? 1;
}
