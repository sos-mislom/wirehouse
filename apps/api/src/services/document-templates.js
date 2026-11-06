import { readFile, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const loadFile = promisify(readFile);
const base = new URL("../../assets/document-templates/", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("catalog.json", base), "utf8"));
const byId = new Map(catalog.items.map((item) => [item.id, item]));

/** Public blank forms only; no customer data, storage keys or filesystem paths. */
export function listDocumentTemplates({ entityType, category } = {}) {
  return structuredClone(
    catalog.items
      .filter((item) => !entityType || item.entityTypes.includes(entityType))
      .filter((item) => !category || item.category === category)
      .map(({ files, ...item }) => ({
        ...item,
        files: files.map(({ asset, ...file }) => file),
      })),
  );
}

/** Closed catalog lookup prevents path traversal or arbitrary local file reads. */
export async function readDocumentTemplate(id, format) {
  const item = byId.get(id);
  const file = item?.files.find((candidate) => candidate.format === format);
  if (!file || !["pdf", "docx"].includes(format)) {
    throw Object.assign(new Error("Шаблон не найден"), { status: 404 });
  }
  let content;
  try {
    content = await loadFile(new URL(file.asset, base));
  } catch {
    throw Object.assign(new Error("Файл шаблона недоступен"), { status: 503 });
  }
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== file.sha256 || content.length !== file.sizeBytes) {
    throw Object.assign(new Error("Файл шаблона повреждён"), { status: 503 });
  }
  return { filename: file.filename, mimeType: file.mimeType, content, sha256 };
}
