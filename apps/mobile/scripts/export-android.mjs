import fs from "node:fs";
import path from "node:path";
import { androidProject, root } from "./gradle.mjs";

// Copies the prepared Android project to another folder, typically a Windows
// drive when the repository lives in WSL: Android Studio builds poorly from
// \\wsl$ paths. The Capacitor Gradle files reference the plugins by relative
// path (../../../../node_modules/...), so the same layout is recreated.
//   node apps/mobile/scripts/export-android.mjs /mnt/c/Users/<you>/wirehouse-mobile
const target = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || target === root)
  throw Error("Usage: export-android.mjs <folder outside the repository>");
if (!fs.existsSync(path.join(androidProject, "app/build.gradle")))
  throw Error("Run apps/mobile/scripts/prepare.mjs android first");

// Android Studio's own files stay in the target between exports: the SDK path
// (local.properties), project settings and build caches.
const skip = new Set(["build", ".gradle", ".idea", "local.properties"]);
const copy = (from, to) =>
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => !skip.has(path.basename(source)),
  });

const androidTarget = path.join(target, ".local/mobile/app/android");
fs.mkdirSync(androidTarget, { recursive: true });
for (const name of fs.readdirSync(androidTarget))
  if (!skip.has(name))
    fs.rmSync(path.join(androidTarget, name), { recursive: true, force: true });
copy(androidProject, androidTarget);
const plugins = Object.keys(
  JSON.parse(
    fs.readFileSync(path.join(root, ".local/mobile/app/package.json"), "utf8"),
  ).dependencies ?? {},
).filter(
  (name) =>
    fs.existsSync(path.join(root, "node_modules", name, "android")) ||
    name === "@capacitor/android",
);
for (const name of plugins) {
  const packageTarget = path.join(target, "node_modules", name);
  fs.rmSync(packageTarget, { recursive: true, force: true });
  copy(path.join(root, "node_modules", name), packageTarget);
}
console.log(
  `Android project: ${androidTarget}\nOpen it in Android Studio; plugins copied: ${plugins.join(", ")}`,
);
