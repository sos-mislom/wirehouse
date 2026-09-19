import { parseJsonBody } from "../../http/body.js";
import { consumeBotLink, bindBotUser } from "../../bot-links.js";
import { config } from "../../config.js";

export function createVkWebhookHandler(deps) {
  const {
    db,
    sendVkText,
    serviceUnavailable,
    forbidden,
    extractVkMedia,
    normalizePhoneKey,
    buildTenantChatContexts,
    getSelectedChatContext,
    setSelectedChatContext,
    sendChatContextChoice,
    handleChatContextSelection,
    createCrossChannelTenantMessage,
    handleBotMediaMessage,
    handleBotWorkerTextCommand,
  } = deps;

  const handleVkWebhook = async (request, response) => {
    const update = await parseJsonBody(request);
    if (!config.vkGroupToken || !config.vkWebhookSecret || !config.vkGroupId) {
      serviceUnavailable(response, "VK не настроен");
      return;
    }
    if (
      update.secret !== config.vkWebhookSecret ||
      String(update.group_id) !== String(config.vkGroupId)
    ) {
      forbidden(response);
      return;
    }
    if (update.type === "confirmation") {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(config.vkConfirmationCode);
      return;
    }

    if (config.vkWebhookSecret && update.secret !== config.vkWebhookSecret) {
      forbidden(response);
      return;
    }

    if (update.type !== "message_new") {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end("ok");
      return;
    }

    const message = update.object?.message ?? {};
    const userId = message.from_id;
    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      message.peer_id !== userId
    ) {
      response.end("ok");
      return;
    }
    const payload =
      typeof message.payload === "string"
        ? (() => {
            try {
              return JSON.parse(message.payload);
            } catch {
              return {};
            }
          })()
        : {};
    if (payload?.ctx && userId) {
      await handleChatContextSelection({
        channel: "vk",
        recipientId: userId,
        unitId: payload.ctx,
      });
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end("ok");
      return;
    }

    const vkMedia = extractVkMedia(message);
    if (vkMedia && userId) {
      const binding = db.getOtpBindingByRecipient("vk", userId);
      if (binding) {
        await handleBotMediaMessage({
          channel: "vk",
          binding,
          media: vkMedia,
        });
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        response.end("ok");
        return;
      }
    }

    if (/^\/link(?:\s|$)/i.test(message.text || "")) {
      let text;
      try {
        consumeBotLink(db, "vk", userId, message.text);
        text = "VK подключён. Вернитесь на сайт и запросите код входа.";
      } catch (error) {
        text = error.message;
      }
      await sendVkText({ userId, message: text });
      response.end("ok");
      return;
    }
    const binding = userId ? db.getOtpBindingByRecipient("vk", userId) : null;
    if (binding && message.text) {
      const completed = await handleBotWorkerTextCommand({
        channel: "vk",
        binding,
        text: String(message.text),
      });
      if (completed) {
        await sendVkText({
          userId,
          message: "Заявка завершена. Комментарий сохранён в карточке.",
        });
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        response.end("ok");
        return;
      }
      if (
        /^(сменить объект|выбрать объект|\/object|\/objects)$/i.test(
          String(message.text).trim(),
        )
      ) {
        const user = binding.user_id ? db.getUserById(binding.user_id) : null;
        const contexts = buildTenantChatContexts(user);
        await sendChatContextChoice({
          channel: "vk",
          recipientId: userId,
          contexts,
        });
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        response.end("ok");
        return;
      }
      await createCrossChannelTenantMessage({
        channel: "vk",
        binding,
        text: String(message.text),
      });
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end("ok");
      return;
    }

    await sendVkText({
      userId,
      message:
        "Чтобы подключить VK, отправьте /link и одноразовый код из раздела «Подключение мессенджеров» в кабинете. При первом входе код выдаёт управляющий. Сам по себе номер телефона не подтверждает доступ.",
    });

    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    response.end("ok");
  };

  return {
    handleVkWebhook,
  };
}
