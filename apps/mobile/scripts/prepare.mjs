import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
// One application for every mobile role. The bundle ID is permanent once the
// app is published: changing it later creates a different store application.
const appId = "ru.skladkontur.app",
  appName = "Склад Контур",
  platform = process.argv[2] ?? "android";
if (!["android", "ios"].includes(platform))
  throw Error("Usage: prepare.mjs android|ios");
const knownRoles = ["tenant", "worker", "manager", "admin"];
const roles = (process.env.WAREHOUSE_MOBILE_ROLES ?? "tenant,worker")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);
if (
  !roles.length ||
  roles.some((role) => !knownRoles.includes(role)) ||
  new Set(roles).size !== roles.length
)
  throw Error(
    `WAREHOUSE_MOBILE_ROLES must list distinct roles from: ${knownRoles.join(", ")}`,
  );
// Push is enabled per platform only when the customer's credentials are given:
// WAREHOUSE_GOOGLE_SERVICES_JSON (Firebase app config for Android) and
// WAREHOUSE_IOS_PUSH=1 (Apple account with the Push Notifications capability).
const googleServices = process.env.WAREHOUSE_GOOGLE_SERVICES_JSON ?? "";
if (googleServices) {
  const clients = JSON.parse(fs.readFileSync(googleServices, "utf8")).client;
  if (
    !clients?.some(
      (c) => c.client_info?.android_client_info?.package_name === appId,
    )
  )
    throw Error(`${googleServices} has no Android app ${appId}`);
}
const pushPlatforms = [
  ...(googleServices ? ["android"] : []),
  ...(process.env.WAREHOUSE_IOS_PUSH === "1" ? ["ios"] : []),
];
const api = new URL(process.env.VITE_WAREHOUSE_API_BASE_URL ?? "");
// Development only: an emulator talks to a local API over plain HTTP
// (http://10.0.2.2:3001 is the computer running the emulator). The app is then
// served from http://localhost with cleartext traffic allowed, and
// android-release.mjs refuses to sign such a build.
const devHttp = process.env.WAREHOUSE_MOBILE_DEV_HTTP === "1";
if (
  (api.protocol !== "https:" && !(devHttp && api.protocol === "http:")) ||
  api.username ||
  api.password ||
  api.search ||
  api.hash ||
  api.pathname !== "/"
)
  throw Error(
    "Set VITE_WAREHOUSE_API_BASE_URL to the HTTPS CRM origin (plain HTTP only with WAREHOUSE_MOBILE_DEV_HTTP=1)",
  );
const target = path.join(root, ".local/mobile/app");
const { version, dependencies } = JSON.parse(
  fs.readFileSync(path.join(root, "apps/mobile/package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw Error("A stable mobile version is required");
const [major, minor, patch] = version.split(".").map(Number),
  versionCode = major * 10000 + minor * 100 + patch;
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(
  path.join(target, "package.json"),
  // Capacitor registers native plugins from this manifest's dependencies.
  JSON.stringify(
    { name: "wirehouse-mobile", version, private: true, dependencies },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(target, "capacitor.config.json"),
  JSON.stringify(
    {
      appId,
      appName,
      webDir: "www",
      // Android 15 draws apps under the system bars; keep the WebView inside
      // them. iOS draws under the notch and styles/mobile-app.css pads it.
      android: { adjustMarginsForEdgeToEdge: "auto" },
      ...(devHttp
        ? { server: { androidScheme: "http", cleartext: true } }
        : {}),
      // iOS shows a notification banner even while the app is open.
      plugins: {
        PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
      },
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
      VITE_WAREHOUSE_MOBILE_ROLES: roles.join(","),
      VITE_WAREHOUSE_PUSH: pushPlatforms.join(","),
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
if (platform === "android") {
  // Capacitor creates Android/Capacitor template artwork. Replace only its
  // known generated launcher/splash files, then copy the versioned resources.
  const resources = path.join(target, "android/app/src/main/res");
  for (const directory of fs.readdirSync(resources, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    if (directory.name.startsWith("drawable"))
      fs.rmSync(path.join(resources, directory.name, "splash.png"), { force: true });
    if (/^mipmap-(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(directory.name))
      fs.rmSync(path.join(resources, directory.name, "ic_launcher_foreground.png"), {
        force: true,
      });
  }
  for (const file of [
    "drawable/ic_launcher_background.xml",
    "drawable-v24/ic_launcher_foreground.xml",
  ])
    fs.rmSync(path.join(resources, file), { force: true });
  fs.cpSync(path.join(root, "apps/mobile/assets/android/res"), resources, {
    recursive: true,
  });
  // The web interface has no dark theme. Capacitor's DayNight template drew
  // white status bar icons over the light strip above the page (unreadable on
  // the emulator) and would turn that strip dark in system dark mode. Keep the
  // activity light with dark icons; the strip matches the white header.
  const stylesFile = path.join(
    target,
    "android/app/src/main/res/values/styles.xml",
  );
  let styles = fs.readFileSync(stylesFile, "utf8");
  styles = styles.replace(
    'parent="Theme.AppCompat.DayNight.NoActionBar"',
    'parent="Theme.AppCompat.Light.NoActionBar"',
  );
  if (!styles.includes("windowLightStatusBar"))
    styles = styles
      .replace(
        "<resources>",
        '<resources xmlns:tools="http://schemas.android.com/tools">',
      )
      .replace(
        /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
        `$1
        <item name="android:windowBackground">@android:color/white</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar" tools:targetApi="27">true</item>`,
      );
  fs.writeFileSync(stylesFile, styles);
  // Android 11+ hides other apps unless they are declared. Without this the
  // WebView cannot find the camera app for <input capture> and shows the
  // gallery picker instead.
  const manifestFile = path.join(
    target,
    "android/app/src/main/AndroidManifest.xml",
  );
  const manifest = fs.readFileSync(manifestFile, "utf8");
  if (!manifest.includes("android.media.action.IMAGE_CAPTURE"))
    fs.writeFileSync(
      manifestFile,
      manifest.replace(
        /<\/manifest>\s*$/,
        `    <queries>
        <intent>
            <action android:name="android.media.action.IMAGE_CAPTURE" />
        </intent>
    </queries>
</manifest>
`,
      ),
    );
}
if (platform === "ios") {
  fs.cpSync(
    path.join(root, "apps/mobile/assets/ios/AppIcon.appiconset"),
    path.join(target, "ios/App/App/Assets.xcassets/AppIcon.appiconset"),
    { recursive: true },
  );
  // iOS terminates an app that opens the camera without a usage description.
  const plistFile = path.join(target, "ios/App/App/Info.plist");
  let plist = fs.readFileSync(plistFile, "utf8");
  for (const [key, text] of [
    [
      "NSCameraUsageDescription",
      "Камера нужна, чтобы сфотографировать работу, прибор учета или документ.",
    ],
    [
      "NSPhotoLibraryUsageDescription",
      "Доступ к фото нужен, чтобы приложить снимок к заявке или показанию.",
    ],
  ])
    if (!plist.includes(`<key>${key}</key>`))
      plist = plist.replace(
        /<\/dict>\s*<\/plist>\s*$/,
        `\t<key>${key}</key>\n\t<string>${text}</string>\n</dict>\n</plist>\n`,
      );
  fs.writeFileSync(plistFile, plist);
}
// A project prepared earlier with push must not keep it when rebuilt without:
// a free Apple ID cannot sign the push entitlement.
if (platform === "android" && !pushPlatforms.includes("android"))
  fs.rmSync(path.join(target, "android/app/google-services.json"), {
    force: true,
  });
if (platform === "ios" && !pushPlatforms.includes("ios")) {
  fs.rmSync(path.join(target, "ios/App/App/App.entitlements"), { force: true });
  const projectFile = path.join(
    target,
    "ios/App/App.xcodeproj/project.pbxproj",
  );
  fs.writeFileSync(
    projectFile,
    fs
      .readFileSync(projectFile, "utf8")
      .replace(/\n\s*CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g, ""),
  );
}
if (platform === "android" && pushPlatforms.includes("android")) {
  // The Gradle template applies google-services only when this file exists.
  fs.copyFileSync(
    googleServices,
    path.join(target, "android/app/google-services.json"),
  );
  // Android 13+ asks for permission before showing notifications.
  const manifestFile = path.join(
    target,
    "android/app/src/main/AndroidManifest.xml",
  );
  const manifest = fs.readFileSync(manifestFile, "utf8");
  if (!manifest.includes("android.permission.POST_NOTIFICATIONS"))
    fs.writeFileSync(
      manifestFile,
      manifest.replace(
        /<\/manifest>\s*$/,
        '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>\n',
      ),
    );
}
if (platform === "ios" && pushPlatforms.includes("ios")) {
  // Capacitor's push plugin receives the APNs token through these callbacks.
  const delegateFile = path.join(target, "ios/App/App/AppDelegate.swift");
  let delegate = fs.readFileSync(delegateFile, "utf8");
  if (!delegate.includes("didRegisterForRemoteNotificationsWithDeviceToken"))
    delegate = delegate.replace(
      /\n}\s*$/,
      `

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
`,
    );
  fs.writeFileSync(delegateFile, delegate);
  // Xcode signs development builds with "development"; App Store and
  // TestFlight exports switch the entitlement to production.
  fs.writeFileSync(
    path.join(target, "ios/App/App/App.entitlements"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>development</string>
</dict>
</plist>
`,
  );
  const projectFile = path.join(
    target,
    "ios/App/App.xcodeproj/project.pbxproj",
  );
  const project = fs.readFileSync(projectFile, "utf8");
  if (!project.includes("CODE_SIGN_ENTITLEMENTS"))
    fs.writeFileSync(
      projectFile,
      project.replaceAll(
        "INFOPLIST_FILE = App/Info.plist;",
        "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;",
      ),
    );
}
fs.writeFileSync(
  path.join(target, "build-manifest.json"),
  JSON.stringify(
    {
      platform,
      appId,
      roles,
      push: pushPlatforms,
      devHttp,
      apiOrigin: api.origin,
      version,
      nativeArtwork: {
        source: "apps/mobile/assets/manifest.json",
        sha256: createHash("sha256")
          .update(fs.readFileSync(path.join(root, "apps/mobile/assets/manifest.json")))
          .digest("hex"),
        font: "Onest",
        weight: 650,
      },
      builtAt: new Date().toISOString(),
      boundary:
        "Prepared native source; no assertion of device, push or store validation",
    },
    null,
    2,
  ),
);
console.log(`Prepared ${platform} (${roles.join(", ")}): ${target}`);
