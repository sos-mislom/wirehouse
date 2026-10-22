import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const output = path.resolve(process.argv[2] || ".deploy/release.tar.gz");
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "wirehouse-release-"));
const allowed = (file) =>
  [
    "package.json",
    "package-lock.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "scripts/create-initial-admin.mjs",
    "README.md",
    "scripts/build-one-c.py",
    "scripts/configure-one-c.py",
    "scripts/inspect-one-c.py",
    "scripts/inspect-one-c-data.py",
  ].includes(file) ||
  [
    "apps/api/src/",
    "packages/contracts/",
    "infra/deploy/",
    "docs/",
    "integrations/one-c/",
  ].some((prefix) => file.startsWith(prefix));
try {
  if (
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim()
  )
    throw new Error(
      "Commit release changes before packaging so REVISION identifies the deployed sources",
    );
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file && allowed(file));
  for (const file of files) {
    const target = path.join(staging, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  if (!fs.existsSync("apps/web/dist/index.html"))
    throw new Error("Run npm run build:web before packaging");
  fs.writeFileSync(
    path.join(staging, "REVISION"),
    `${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}\n`,
  );
  fs.cpSync("apps/web/dist", path.join(staging, "apps/web/dist"), {
    recursive: true,
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync("tar", ["-czf", output, "-C", staging, "."]);
  console.log(
    `Release archive: ${output}; ${files.length} versioned source files plus web build`,
  );
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
