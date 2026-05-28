import Fastify from "fastify";
import type { NotificationDispatchRequest } from "@warehouse/contracts";

const app = Fastify({
  logger: true
});

const port = Number(process.env.VK_NOTIFIER_PORT ?? 3030);
const groupToken = process.env.VK_GROUP_TOKEN ?? process.env.VK_BOT ?? "";
const apiVersion = process.env.VK_API_VERSION ?? "5.199";
const defaultUserId = process.env.VK_DEFAULT_USER_ID ?? "";
const hasToken = Boolean(groupToken);

type DispatchBody = NotificationDispatchRequest & {
  userId?: string;
  vkUserId?: string;
  text?: string;
  message?: string;
};

type VkSendResponse = {
  response?: number;
  error?: {
    error_code?: number;
    error_msg?: string;
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

const resolveUserId = (body: DispatchBody) => {
  return [
    body.recipient.vkUserId ?? "",
    body.vkUserId ?? "",
    body.userId ?? "",
    stringifyValue(body.payload.vkUserId),
    stringifyValue(body.payload.userId),
    defaultUserId
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

  return [title, message].filter(Boolean).join("\n\n");
};

app.get("/health", async () => {
  return {
    status: "ok",
    service: "vk-notifier",
    mode: hasToken ? "active" : "dry-run"
  };
});

app.post<{ Body: NotificationDispatchRequest }>("/dispatch", async (request, reply) => {
  if (!hasToken) {
    return reply.code(503).send({
      accepted: false,
      channel: "vk",
      error: "VK_GROUP_TOKEN is not configured"
    });
  }

  const body = request.body as DispatchBody;
  const userId = resolveUserId(body);
  if (!userId) {
    return reply.code(400).send({
      accepted: false,
      channel: "vk",
      error: "vkUserId is required"
    });
  }

  const params = new URLSearchParams({
    access_token: groupToken,
    v: apiVersion,
    user_id: userId,
    random_id: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
    message: buildMessageText(body)
  });

  const response = await fetch("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const payload = (await response.json()) as VkSendResponse;
  if (!response.ok || payload.error) {
    return reply.code(502).send({
      accepted: false,
      channel: "vk",
      error: payload.error?.error_msg ?? "VK send failed"
    });
  }

  return {
    accepted: true,
    channel: "vk",
    mode: "active",
    event: request.body.event,
    externalMessageId: payload.response
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
