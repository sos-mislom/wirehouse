import Fastify from "fastify";
import type { NotificationDispatchRequest } from "@warehouse/contracts";

const app = Fastify({
  logger: true
});

const port = Number(process.env.VK_NOTIFIER_PORT ?? 3030);
const hasToken = Boolean(process.env.VK_GROUP_TOKEN);

app.get("/health", async () => {
  return {
    status: "ok",
    service: "vk-notifier",
    mode: hasToken ? "active" : "dry-run"
  };
});

app.post<{ Body: NotificationDispatchRequest }>("/dispatch", async (request) => {
  return {
    accepted: true,
    channel: "vk",
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

