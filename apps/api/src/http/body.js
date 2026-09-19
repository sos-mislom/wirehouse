import { requestContracts } from "../../../../packages/contracts/src/requests.ts";
export class RequestError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST", fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export function parseDto(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message:
      issue.code === "unrecognized_keys"
        ? `Неизвестные поля: ${issue.keys.join(", ")}`
        : issue.code === "invalid_type"
          ? ({
              number: "Ожидается число",
              string: "Ожидается строка",
              boolean: "Ожидается да или нет",
              array: "Ожидается список",
              object: "Ожидается объект",
            }[issue.expected] ?? "Неверный тип значения")
          : issue.code === "too_small"
            ? "Значение отсутствует или меньше допустимого"
            : issue.code === "too_big"
              ? "Значение превышает допустимое"
              : issue.code === "invalid_format"
                ? "Некорректный формат"
                : issue.code === "invalid_value"
                  ? "Недопустимое значение"
                  : issue.message,
  }));
  throw new RequestError(
    "Проверьте поля запроса",
    400,
    "VALIDATION_ERROR",
    fields,
  );
}
export async function parseJsonBody(request) {
  const path = new URL(request.url, "http://localhost").pathname;
  const upload =
    /\/(attachments|documents|imports)(\/|$)/.test(path) ||
    /^\/api\/operations\/floorplans/.test(path);
  const limit = upload ? 140 * 1024 * 1024 : 1024 * 1024;
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")
  )
    throw new RequestError(
      "Ожидается Content-Type: application/json",
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit)
      throw new RequestError(
        "Превышен максимальный размер запроса",
        413,
        "PAYLOAD_TOO_LARGE",
      );
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Некорректный JSON", 400, "INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestError("Тело запроса должно быть JSON-объектом");
  // Providers own their webhook envelope; application DTOs never accept arbitrary keys.
  if (/^\/api\/integrations\/(telegram|vk)\/webhook$/.test(path)) return value;
  const contract = requestContracts.find(
    (c) => c.method === request.method && c.path.test(path),
  );
  if (!contract)
    throw new RequestError("Контракт запроса не найден", 404, "NOT_FOUND");
  return parseDto(contract.schema, value);
}
