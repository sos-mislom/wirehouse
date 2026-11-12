import type { ApiErrorDto } from "../../../../packages/contracts/src/requests.ts";

const fieldLabels: Record<string, string> = {
  title: "Тема",
  description: "Описание",
  name: "Название",
  unitId: "Помещение",
  propertyId: "Объект",
  leaseId: "Договор",
  accountId: "Лицевой счёт",
  meterId: "Прибор",
  periodId: "Период",
  value: "Показание",
  email: "Электронная почта",
  phone: "Телефон",
  password: "Пароль",
  code: "Код подтверждения",
  category: "Категория",
  priority: "Приоритет",
  content: "Комментарий",
  fileName: "Имя файла",
};

export function validationMessage(fields: ApiErrorDto["fields"]) {
  return fields
    ?.map((field) => {
      const key = field.path?.split(/[.\[]/, 1)[0];
      const label = key && fieldLabels[key];
      return label ? `${label}: ${field.message}` : field.message;
    })
    .join("; ");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiErrorDto["fields"];
  constructor(
    message: string,
    status: number,
    code: string,
    fields: ApiErrorDto["fields"] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export class RequestCancelledError extends Error {
  constructor(cause?: unknown) {
    super("Request cancelled", cause === undefined ? undefined : { cause });
    this.name = "AbortError";
  }
}

export function isRequestCancelled(error: unknown, signal?: AbortSignal) {
  if (
    errorName(error) === "TimeoutError" ||
    errorName(signal?.reason) === "TimeoutError"
  )
    return false;
  return signal?.aborted === true || errorName(error) === "AbortError";
}

function errorName(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error
    ? error.name
    : undefined;
}

export function normalizeRequestError(error: unknown, signal?: AbortSignal) {
  if (error instanceof ApiError) return error;
  if (isRequestCancelled(error, signal))
    return new RequestCancelledError(error);
  if (errorName(error) === "TimeoutError")
    return new ApiError(
      "Сервер не ответил вовремя. Повторите попытку.",
      0,
      "REQUEST_TIMEOUT",
      [],
      error,
    );
  if (error instanceof TypeError || errorName(error) === "NetworkError")
    return new ApiError(
      "Не удалось связаться с сервером. Проверьте соединение и повторите попытку.",
      0,
      "NETWORK_ERROR",
      [],
      error,
    );
  return error;
}

// A cancelled refresh has no result to apply and is not an action failure.
export async function completeActiveRead(read: () => Promise<void>) {
  try {
    await read();
  } catch (error) {
    if (!isRequestCancelled(error)) throw error;
  }
}
