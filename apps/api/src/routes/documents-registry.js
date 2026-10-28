import crypto from "node:crypto";
import { contextCan } from "../domain/context-access.js";
import path from "node:path";
import { parseJsonBody } from "../http/body.js";
import { businessError, requiredRecord } from "../domain/accounting.js";
import {
  canReadDocument,
  listDocuments,
  validateDocumentLinks,
  registerDocument,
  renderServiceAct,
} from "../domain/documents.js";
export function createDocumentsRegistryRoutes({
  db,
  requireAuth,
  ok,
  json,
  fileStorage,
  sanitizeFilename,
}) {
  return async (request, response, url) => {
    if (!/^\/api\/documents(?:\/|$)/.test(url.pathname)) return false;
    const actor = requireAuth(request, response);
    if (!actor) return true;
    try {
      if (
        request.method === "GET" &&
        url.pathname === "/api/documents/contexts"
      ) {
        ok(response, {
          buildings: db.data.buildings
            .filter((r) =>
              contextCan(db, actor, "documents.read", "buildings", r.id),
            )
            .map(({ id, name, propertyId }) => ({ id, name, propertyId })),
        });
        return true;
      }
      if (request.method === "GET" && url.pathname === "/api/documents") {
        const type = url.searchParams.get("entityType"),
          id = url.searchParams.get("entityId");
        ok(response, {
          items: listDocuments(db, actor).filter(
            (d) =>
              !type ||
              d.links.some(
                (l) => l.entityType === type && (!id || l.entityId === id),
              ),
          ),
        });
        return true;
      }
      if (request.method === "POST" && url.pathname === "/api/documents") {
        const body = await parseJsonBody(request);
        validateDocumentLinks(db, actor, body);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64))
          throw businessError("Некорректное содержимое файла");
        const content = Buffer.from(body.contentBase64, "base64");
        if (
          !content.length ||
          content.length > 12 * 1024 * 1024 ||
          content.toString("base64") !== body.contentBase64
        )
          throw businessError("Размер файла должен быть от 1 байта до 12 МБ");
        const allowed = new Set([
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
          "text/plain",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/dxf",
          "image/vnd.dxf",
        ]);
        if (!allowed.has(body.mimeType))
          throw businessError("Формат файла не поддерживается", 415);
        if (body.category === "photo" && !body.mimeType.startsWith("image/"))
          throw businessError("Для фотографии нужен файл изображения");
        const signatures = {
          "image/jpeg":
            content[0] === 255 && content[1] === 216 && content[2] === 255,
          "image/png": content
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          "image/webp":
            content.toString("ascii", 0, 4) === "RIFF" &&
            content.toString("ascii", 8, 12) === "WEBP",
        };
        if (body.mimeType in signatures && !signatures[body.mimeType])
          throw businessError(
            "Содержимое не соответствует формату изображения",
          );
        const storedName =
            crypto.randomUUID() + path.extname(sanitizeFilename(body.fileName)),
          key = fileStorage.keyFor("documents", storedName);
        await fileStorage.put({ key, content, contentType: body.mimeType });
        try {
          ok(response, {
            item: db.transaction(() =>
              registerDocument(db, actor, body, storedName, content.length),
            ),
          });
        } catch (error) {
          await fileStorage.delete({ key });
          throw error;
        }
        return true;
      }
      const match = url.pathname.match(
        /^\/api\/documents\/([a-zA-Z0-9-]+)\/file$/,
      );
      if (match && request.method === "GET") {
        const doc = requiredRecord(db, "entity_documents", match[1]);
        if (!canReadDocument(db, actor, doc.id))
          throw businessError("Нет доступа к документу", 403);
        if (doc.url?.startsWith("service-act:")) {
          const act = requiredRecord(db, "service_acts", doc.url.slice(12));
          response.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'",
            "Cache-Control": "private, no-store",
          });
          response.end(renderServiceAct(act));
          return true;
        }
        if (doc.url) throw businessError("Неизвестный тип документа", 409);
        const content = await fileStorage.get({
          key: fileStorage.keyFor(doc.storageKind, doc.storedName),
        });
        if (!content) throw businessError("Файл отсутствует в хранилище", 404);
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": doc.mimeType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        });
        response.end(content);
        return true;
      }
      throw businessError("Маршрут не найден", 404);
    } catch (error) {
      json(response, error.status ?? 400, {
        error: error.message,
        code: error.code ?? "INVALID_REQUEST",
      });
    }
    return true;
  };
}
