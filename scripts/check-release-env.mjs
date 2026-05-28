import fs from "node:fs";

const target = process.argv[2];

const requirements = {
  windows: [
    ["CSC_LINK", "Windows code-signing certificate path/base64 or secure URL for electron-builder"],
    ["CSC_KEY_PASSWORD", "Windows code-signing certificate password"]
  ],
  android: [
    ["ANDROID_HOME", "Android SDK path"],
    ["ANDROID_KEYSTORE_PATH", "Android release keystore path"],
    ["ANDROID_KEYSTORE_PASSWORD", "Android keystore password"],
    ["ANDROID_KEY_ALIAS", "Android key alias"],
    ["ANDROID_KEY_PASSWORD", "Android key password"]
  ]
};

if (!requirements[target]) {
  console.error("Usage: node scripts/check-release-env.mjs <windows|android>");
  process.exit(2);
}

const missing = requirements[target].filter(([key]) => !String(process.env[key] ?? "").trim());

if (missing.length > 0) {
  console.error(`Missing ${target} release environment:`);
  for (const [key, description] of missing) {
    console.error(`- ${key}: ${description}`);
  }
  process.exit(1);
}

if (target === "android") {
  const pathRequirements = ["ANDROID_HOME", "ANDROID_KEYSTORE_PATH"];
  const missingPaths = pathRequirements.filter((key) => !fs.existsSync(process.env[key]));

  if (missingPaths.length > 0) {
    console.error("Invalid android release paths:");
    for (const key of missingPaths) {
      console.error(`- ${key}: ${process.env[key]}`);
    }
    process.exit(1);
  }
}

if (target === "windows") {
  const cscLink = String(process.env.CSC_LINK ?? "").trim();
  const looksLikeFilePath = !/^https?:\/\//i.test(cscLink) && !/^data:/i.test(cscLink) && /[\\/]|\.p(?:12|fx)$/i.test(cscLink);

  if (looksLikeFilePath && !fs.existsSync(cscLink)) {
    console.error(`Invalid windows code-signing certificate path: ${cscLink}`);
    process.exit(1);
  }
}

console.log(`${target} release environment is ready.`);
