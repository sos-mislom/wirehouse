import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const backupDir = process.env.POSTGRES_BACKUP_DIR ?? path.resolve("backups/postgres");
const keep = Number(process.env.POSTGRES_BACKUP_KEEP ?? 14);
const pgDumpBin = process.env.PG_DUMP_BIN ?? "pg_dump";

if (!databaseUrl) {
  console.error("DATABASE_URL or POSTGRES_URL is required");
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `warehouse-platform-${stamp}.dump`);
const result = spawnSync(pgDumpBin, ["--format=custom", "--file", target, databaseUrl], {
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const backups = fs
  .readdirSync(backupDir)
  .filter((file) => file.startsWith("warehouse-platform-") && file.endsWith(".dump"))
  .map((file) => ({
    file,
    fullPath: path.join(backupDir, file),
    mtimeMs: fs.statSync(path.join(backupDir, file)).mtimeMs
  }))
  .sort((left, right) => right.mtimeMs - left.mtimeMs);

for (const oldBackup of backups.slice(Number.isFinite(keep) ? keep : 14)) {
  fs.unlinkSync(oldBackup.fullPath);
}

console.log(`PostgreSQL backup created: ${target}`);
