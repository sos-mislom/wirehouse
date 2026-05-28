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

console.log(`${target} release environment is ready.`);
