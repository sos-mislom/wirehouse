import Fastify from "fastify";
import type { NotificationDispatchRequest } from "@warehouse/contracts";

const app = Fastify({
  logger: true
});

const port = Number(process.env.TELEGRAM_NOTIFIER_PORT ?? 3020);
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT ?? "";
const defaultChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID ?? "";
const hasToken = Boolean(botToken);

type DispatchBody = NotificationDispatchRequest & {
  chatId?: string;
  telegramChatId?: string;
  text?: string;
  message?: string;
};

type TelegramSendResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

const stringifyValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
};

const resolveChatId = (body: DispatchBody) => {
  return [
    body.recipient.telegramChatId ?? "",
    body.telegramChatId ?? "",
    body.chatId ?? "",
    stringifyValue(body.payload.telegramChatId),
    stringifyValue(body.payload.chatId),
    defaultChatId
  ].find((value) => value.trim()) ?? "";
};

const buildMessageText = (body: DispatchBody) => {
  const title =
    stringifyValue(body.payload.title) ||
    stringifyValue(body.payload.subject) ||
    body.event;
  const directMessage = body.text ?? body.message ?? "";
  const payloadMessage =
    stringifyValue(body.payload.message) ||
    stringifyValue(body.payload.description) ||
    stringifyValue(body.payload.text);
  const message = directMessage || payloadMessage;

  return [title, message].filter(Boolean).join("\n\n").slice(0, 4096);
};

app.get("/health", async () => {
  return {
    status: "ok",
    service: "telegram-notifier",
    mode: hasToken ? "active" : "dry-run"
  };
});

app.post<{ Body: NotificationDispatchRequest }>("/dispatch", async (request, reply) => {
  if (!hasToken) {
    return reply.code(503).send({
      accepted: false,
      channel: "telegram",
      error: "TELEGRAM_BOT_TOKEN is not configured"
    });
  }

  const body = request.body as DispatchBody;
  const chatId = resolveChatId(body);
  if (!chatId) {
    return reply.code(400).send({
      accepted: false,
      channel: "telegram",
      error: "telegramChatId is required"
    });
  }

  const text = buildMessageText(body);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  const payload = (await response.json()) as TelegramSendResponse;
  if (!response.ok || !payload.ok) {
    return reply.code(502).send({
      accepted: false,
      channel: "telegram",
      error: payload.description ?? "Telegram send failed"
    });
  }

  return {
    accepted: true,
    channel: "telegram",
    mode: "active",
    event: request.body.event,
    externalMessageId: payload.result?.message_id
  };
});

try {
  await app.listen({
    host: "0.0.0.0",
    port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
