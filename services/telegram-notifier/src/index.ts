import Fastify from "fastify";
import type { NotificationDispatchRequest } from "@warehouse/contracts";

const app = Fastify({
  logger: true
});

const port = Number(process.env.TELEGRAM_NOTIFIER_PORT ?? 3020);
const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);

app.get("/health", async () => {
  return {
    status: "ok",
    service: "telegram-notifier",
    mode: hasToken ? "active" : "dry-run"
  };
});

app.post<{ Body: NotificationDispatchRequest }>("/dispatch", async (request) => {
  return {
    accepted: true,
    channel: "telegram",
    mode: hasToken ? "active" : "dry-run",
    event: request.body.event
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

