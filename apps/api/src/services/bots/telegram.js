import { parseJsonBody } from "../http/body.js";
import { verifiedTelegramPhone, consumeBotLink, bindBotUser } from "../bot-links.js";
import { config } from "../config.js";

export function createTelegramWebhookHandler(deps) {
  const {
    db,
    sendTelegramText,
    answerTelegramCallback,
    serviceUnavailable,
    forbidden,
    ok,
    extractTelegramMedia,
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

  const parseTelegramPhone = (message) => {
    const value = message?.contact?.phone_number ?? message?.text ?? "";
    const match = String(value).match(/\+?\d[\d\s().-]{8,}\d/);
    if (!match) {
      return "";
    }

    const raw = match[0].replace(/[^\d+]/g, "");
    if (raw.startsWith("+")) {
      return raw;
    }
    if (raw.length === 11 && raw.startsWith("8")) {
      return `+7${raw.slice(1)}`;
    }
    return raw.length === 11 && raw.startsWith("7") ? `+${raw}` : raw;
  };

  const handleTelegramWebhook = async (request, response) => {
    if (!config.telegramBotToken || !config.telegramWebhookSecret) {
      serviceUnavailable(response, "Telegram не настроен");
      return;
    }
    if (config.telegramWebhookSecret) {
      const actualSecret = request.headers["x-telegram-bot-api-secret-token"];
      if (actualSecret !== config.telegramWebhookSecret) {
        forbidden(response);
        return;
      }
    }

    const update = await parseJsonBody(request);
    const callbackQuery = update.callback_query ?? null;
    if (callbackQuery?.data?.startsWith("ctx:")) {
      const chatId = callbackQuery.message?.chat?.id;
      const selected = chatId
        ? await handleChatContextSelection({
            channel: "telegram",
            recipientId: chatId,
            unitId: callbackQuery.data.slice(4),
          })
        : false;
      await answerTelegramCallback({
        callbackQueryId: callbackQuery.id,
        text: selected ? "Контекст выбран" : "Не удалось выбрать объект",
      });
      ok(response, { success: true, selected });
      return;
    }

    const message = update.message ?? update.edited_message ?? null;
    const chatId = message?.chat?.id;
    if (!chatId) {
      ok(response, { success: true });
      return;
    }

    if (
      message.chat?.type !== "private" ||
      String(chatId) !== String(message.from?.id)
    ) {
      ok(response, { success: true });
      return;
    }

    const media = extractTelegramMedia(message);
    if (media) {
      const binding = db.getOtpBindingByRecipient("telegram", chatId);
      if (binding) {
        try {
          const result = await handleBotMediaMessage({
            channel: "telegram",
            binding,
            media,
          });
          ok(response, { success: true, ...result });
        } catch (error) {
          ok(response, {
            success: false,
            error: error instanceof Error ? error.message : "Attachment failed",
          });
        }
        return;
      }
    }

    if (/^\/link(?:\s|$)/i.test(message.text || "")) {
      let text;
      try {
        consumeBotLink(db, "telegram", chatId, message.text);
        text = "Telegram подключён. Вернитесь на сайт и запросите код входа.";
      } catch (error) {
        text = error.message;
      }
      await sendTelegramText({ chatId, text });
      ok(response, { success: true });
      return;
    }
    const phone = verifiedTelegramPhone(message);
    if (!phone) {
      const binding = db.getOtpBindingByRecipient("telegram", chatId);
      if (binding && message?.text && !String(message.text).startsWith("/")) {
        const completed = await handleBotWorkerTextCommand({
          channel: "telegram",
          binding,
          text: String(message.text),
        });
        if (completed) {
          if (config.telegramBotToken) {
            await sendTelegramText({
              chatId,
              text: "Заявка завершена. Комментарий сохранён в карточке.",
            });
          }
          ok(response, { success: true, completed: true });
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
            channel: "telegram",
            recipientId: chatId,
            contexts,
          });
          ok(response, { success: true, contextChoice: true });
          return;
        }
        await createCrossChannelTenantMessage({
          channel: "telegram",
          binding,
          text: String(message.text),
        });
        ok(response, { success: true, routed: true });
        return;
      }

      if (config.telegramBotToken) {
        await sendTelegramText({
          chatId,
          text: "Поделитесь своим телефоном кнопкой ниже. Номер должен совпадать с указанным в договоре. Либо отправьте /link и одноразовый код из кабинета.",
          replyMarkup: {
            keyboard: [
              [{ text: "Поделиться телефоном", request_contact: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      ok(response, { success: true, bound: false });
      return;
    }

    const user =
      db.getTenantUserByNormalizedPhone(phone) ??
      db.getUserByPredicate(
        (item) =>
          normalizePhoneKey(item.phone) === normalizePhoneKey(phone) &&
          item.role !== "tenant" &&
          item.is_active === 1,
      );
    if (!user) {
      if (config.telegramBotToken) {
        await sendTelegramText({
          chatId,
          text: "Этот телефон не найден в склад контур. Проверьте номер или обратитесь к администратору.",
        });
      }
      ok(response, { success: true, bound: false });
      return;
    }

    try {
      bindBotUser(
        db,
        user,
        "telegram",
        chatId,
        [message.from?.first_name, message.from?.last_name]
          .filter(Boolean)
          .join(" "),
      );
    } catch (error) {
      if (!error.status) throw error;
      await sendTelegramText({ chatId, text: error.message });
      ok(response, { success: true });
      return;
    }

    if (config.telegramBotToken) {
      await sendTelegramText({
        chatId,
        text:
          user.role === "tenant"
            ? "Телефон привязан. Теперь вернитесь на страницу входа арендатора и запросите код."
            : "Телефон сотрудника привязан. Теперь можно получать коды восстановления пароля в Telegram.",
      });
    }

    if (user.role === "tenant") {
      const contexts = buildTenantChatContexts(user);
      if (contexts.length > 1) {
        await sendChatContextChoice({
          channel: "telegram",
          recipientId: chatId,
          contexts,
        });
      }
    }

    ok(response, { success: true, bound: true });
  };


  return {
    parseTelegramPhone,
    handleTelegramWebhook,
  };
}
