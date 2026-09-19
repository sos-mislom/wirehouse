import { createBotContextManager } from "./bots/context.js";
import { createBotMediaHandler } from "./bots/media.js";
import { createTelegramWebhookHandler } from "./bots/telegram.js";
import { createVkWebhookHandler } from "./bots/vk.js";

export function createBotsService(deps) {
  const contextManager = createBotContextManager(deps);

  const mediaHandler = createBotMediaHandler({
    ...deps,
    ...contextManager,
  });

  const telegramHandler = createTelegramWebhookHandler({
    ...deps,
    ...contextManager,
    ...mediaHandler,
  });

  const vkHandler = createVkWebhookHandler({
    ...deps,
    ...contextManager,
    ...mediaHandler,
  });

  return {
    ...contextManager,
    ...mediaHandler,
    ...telegramHandler,
    ...vkHandler,
  };
}
