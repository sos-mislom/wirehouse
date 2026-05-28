import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve(process.cwd(), "apps/web/dist");
const targetDir = path.resolve(process.cwd(), "apps/desktop-windows/dist");

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
