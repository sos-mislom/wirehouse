import crypto from "node:crypto";
import path from "node:path";
import {
  isOpenTicket,
  MAX_ATTACHMENT_BYTES,
} from "../../../../packages/contracts/src/domain.js";
import {
  bindBotUser,
  consumeBotLink,
  verifiedTelegramPhone,
} from "../bot-links.js";
import { config } from "../config.js";
import { parseJsonBody } from "../http/body.js";
export function createBotsService({
  db,
  chatContextStore,
  chatContextTtlMs,
  sendTelegramText,
  sendVkText,
  serviceUnavailable,
  forbidden,
  answerTelegramCallback,
  ok,
  extractTelegramMedia,
  normalizePhoneKey,
  sanitizeFilename,
  ticketAttachmentPathFor,
  ensureTicketAttachmentWithinStorage,
  fileStorage,
  inferMediaType,
  downloadTelegramMedia,
  downloadUrlBuffer,
  isCompletionText,
  extractVkMedia,
}) {
  const tenantOnboardingPayload = () => ({
    channels: [
      {
        id: "telegram",
        label: "Telegram",
        url: config.telegramBotUrl,
        enabled: Boolean(
          config.telegramBotUrl &&
          config.telegramBotToken &&
          config.telegramWebhookSecret,
        ),
        instruction:
          "Откройте бота и поделитесь своим контактом кнопкой «Поделиться телефоном».",
      },
      {
        id: "vk",
        label: "VK",
        url: config.vkBotUrl,
        enabled: Boolean(
          config.vkBotUrl &&
          config.vkGroupToken &&
          config.vkWebhookSecret &&
          config.vkGroupId,
        ),
        instruction:
          "Откройте сообщения сообщества. Для первой привязки отправьте одноразовый код из кабинета или полученный у управляющего.",
      },
    ],
  });

  const chatContextKey = (channel, recipientId) => `${channel}:${recipientId}`;

  const buildTenantChatContexts = (user) => {
    if (!user?.tenant_id) {
      return [];
    }
    return db
      .listLeases()
      .filter(
        (lease) =>
          lease.tenant_id === user.tenant_id && lease.stage !== "terminated",
      )
      .map((lease) => {
        const unit = db.getUnit(lease.unit_id);
        const property = unit ? db.getProperty(unit.property_id) : null;
        return {
          leaseId: lease.id,
          unitId: lease.unit_id,
          propertyId: unit?.property_id ?? null,
          label: `${property?.name ?? "Объект"} · ${unit?.number ?? "помещение"}`,
          detail: `${lease.contract_number} · ${unit?.area ?? 0} м2`,
        };
      });
  };

  const getSelectedChatContext = ({ channel, recipientId, contexts }) => {
    const selected = chatContextStore.get(chatContextKey(channel, recipientId));
    return selected
      ? (contexts.find((context) => context.unitId === selected.unitId) ?? null)
      : null;
  };

  const setSelectedChatContext = ({ channel, recipientId, context }) => {
    chatContextStore.set(
      chatContextKey(channel, recipientId),
      {
        unitId: context.unitId,
        leaseId: context.leaseId,
        propertyId: context.propertyId,
      },
      chatContextTtlMs,
    );
  };

  const telegramContextKeyboard = (contexts) => ({
    inline_keyboard: contexts.map((context) => [
      {
        text: context.label.slice(0, 60),
        callback_data: `ctx:${context.unitId}`,
      },
    ]),
  });

  const vkContextKeyboard = (contexts) => ({
    one_time: false,
    inline: true,
    buttons: contexts.map((context) => [
      {
        action: {
          type: "text",
          label: context.label.slice(0, 40),
          payload: JSON.stringify({
            ctx: context.unitId,
          }),
        },
        color: "primary",
      },
    ]),
  });

  const sendChatContextChoice = async ({ channel, recipientId, contexts }) => {
    const text = [
      "У вас несколько объектов/помещений.",
      "Выберите, по какому объекту продолжить чат:",
      ...contexts.map(
        (context, index) =>
          `${index + 1}. ${context.label} (${context.detail})`,
      ),
    ].join("\n");

    if (channel === "telegram" && config.telegramBotToken) {
      await sendTelegramText({
        chatId: recipientId,
        text,
        replyMarkup: telegramContextKeyboard(contexts),
      });
    }
    if (channel === "vk" && config.vkGroupToken) {
      await sendVkText({
        userId: recipientId,
        message: text,
        keyboard: vkContextKeyboard(contexts),
      });
    }
  };

  const handleChatContextSelection = async ({
    channel,
    recipientId,
    unitId,
  }) => {
    const binding = db.getOtpBindingByRecipient(channel, recipientId);
    const user = binding?.user_id ? db.getUserById(binding.user_id) : null;
    const contexts = buildTenantChatContexts(user);
    const context = contexts.find((item) => item.unitId === unitId);
    if (!context) {
      return false;
    }
    setSelectedChatContext({ channel, recipientId, context });
    const text = `Выбран контекст: ${context.label}. Теперь напишите сообщение по этому объекту.`;
    if (channel === "telegram" && config.telegramBotToken) {
      await sendTelegramText({ chatId: recipientId, text });
    }
    if (channel === "vk" && config.vkGroupToken) {
      await sendVkText({ userId: recipientId, message: text });
    }
    return true;
  };

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

  const createCrossChannelTenantMessage = async ({
    channel,
    binding,
    text,
  }) => {
    const user = binding.user_id ? db.getUserById(binding.user_id) : null;
    if (!user || user.role !== "tenant" || !user.tenant_id) {
      return null;
    }

    const scopedTickets = db
      .listTickets()
      .filter((ticket) => ticket.tenant_id === user.tenant_id)
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      );
    const contexts = buildTenantChatContexts(user);
    if (contexts.length === 0) {
      return null;
    }

    let context = getSelectedChatContext({
      channel,
      recipientId: binding.recipient_id,
      contexts,
    });
    if (!context && contexts.length === 1) {
      context = contexts[0];
      setSelectedChatContext({
        channel,
        recipientId: binding.recipient_id,
        context,
      });
    }
    if (!context && contexts.length > 1) {
      await sendChatContextChoice({
        channel,
        recipientId: binding.recipient_id,
        contexts,
      });
      return null;
    }

    let ticket =
      scopedTickets.find(
        (item) => item.unit_id === context.unitId && isOpenTicket(item.status),
      ) ??
      scopedTickets.find((item) => item.unit_id === context.unitId) ??
      null;

    if (!ticket) {
      const lease = db.listLeases().find((item) => item.id === context.leaseId);
      if (!lease) {
        return null;
      }
      const unit = db.getUnit(lease.unit_id);
      ticket = db.createTicket({
        unitId: lease.unit_id,
        tenantId: user.tenant_id,
        propertyId: unit?.property_id,
        createdBy: user.id,
        category: "other",
        priority: "low",
        status: "new",
        sourceChannel: channel,
        title:
          channel === "telegram" ? "Сообщение из Telegram" : "Сообщение из VK",
        description: `${context.label}\n\n${text}`,
      });
    }

    return db.createTicketComment({
      ticketId: ticket.id,
      authorId: user.id,
      sourceChannel: channel,
      content: text,
    });
  };

  const resolveBotTicketTarget = async ({ channel, binding }) => {
    const user = binding.user_id ? db.getUserById(binding.user_id) : null;
    if (!user) {
      return { user: null, ticket: null };
    }

    if (user.role === "tenant" && user.tenant_id) {
      const contexts = buildTenantChatContexts(user);
      if (contexts.length === 0) {
        return { user, ticket: null };
      }

      let context = getSelectedChatContext({
        channel,
        recipientId: binding.recipient_id,
        contexts,
      });
      if (!context && contexts.length === 1) {
        context = contexts[0];
        setSelectedChatContext({
          channel,
          recipientId: binding.recipient_id,
          context,
        });
      }
      if (!context && contexts.length > 1) {
        await sendChatContextChoice({
          channel,
          recipientId: binding.recipient_id,
          contexts,
        });
        return { user, ticket: null, needsContext: true };
      }

      const scopedTickets = db
        .listTickets()
        .filter(
          (ticket) =>
            ticket.tenant_id === user.tenant_id &&
            ticket.unit_id === context.unitId,
        )
        .sort(
          (left, right) =>
            new Date(right.updated_at).getTime() -
            new Date(left.updated_at).getTime(),
        );
      let ticket =
        scopedTickets.find((item) => isOpenTicket(item.status)) ??
        scopedTickets[0] ??
        null;
      if (!ticket) {
        const lease = db
          .listLeases()
          .find((item) => item.id === context.leaseId);
        if (!lease) {
          return { user, ticket: null };
        }
        const unit = db.getUnit(lease.unit_id);
        ticket = db.createTicket({
          unitId: lease.unit_id,
          tenantId: user.tenant_id,
          propertyId: unit?.property_id,
          createdBy: user.id,
          category: "other",
          priority: "low",
          status: "new",
          sourceChannel: channel,
          title:
            channel === "telegram" ? "Вложение из Telegram" : "Вложение из VK",
          description: context.label,
        });
      }
      return { user, ticket };
    }

    if (user.role === "worker") {
      const tickets = db
        .listTickets()
        .filter((ticket) => ticket.assigned_to === user.id)
        .sort(
          (left, right) =>
            new Date(right.updated_at).getTime() -
            new Date(left.updated_at).getTime(),
        );
      return {
        user,
        ticket:
          tickets.find((ticket) => isOpenTicket(ticket.status)) ??
          tickets[0] ??
          null,
      };
    }

    return { user, ticket: null };
  };

  const persistBotTicketAttachment = async ({
    ticket,
    user,
    channel,
    fileName,
    mimeType,
    content,
    note,
  }) => {
    if (!ticket || !user) {
      return null;
    }
    if (content.length === 0) {
      throw new Error("Empty file");
    }
    if (content.length > MAX_ATTACHMENT_BYTES) {
      throw new Error("File is too large");
    }

    const safeFileName = sanitizeFilename(fileName);
    const extension = path.extname(safeFileName);
    const storedName = `${crypto.randomUUID()}${extension || ".bin"}`;
    const filePath = ticketAttachmentPathFor(storedName);
    if (!ensureTicketAttachmentWithinStorage(filePath)) {
      throw new Error("Unsafe attachment path");
    }

    await fileStorage.put({
      key: filePath,
      content,
      contentType: mimeType,
    });

    try {
      const attachment = db.createTicketAttachment({
        ticketId: ticket.id,
        fileName: safeFileName,
        storedName,
        mimeType,
        mediaType: inferMediaType(mimeType),
        sizeBytes: content.length,
        note: note ?? "",
        uploadedBy: user.id,
      });
      const comment = db.createTicketComment({
        ticketId: ticket.id,
        authorId: user.id,
        sourceChannel: channel,
        content: note
          ? `Прикреплён файл: ${safeFileName}\n\n${note}`
          : `Прикреплён файл: ${safeFileName}`,
      });
      return { attachment, comment };
    } catch (error) {
      await fileStorage.delete({ key: filePath });
      throw error;
    }
  };

  const handleBotMediaMessage = async ({ channel, binding, media }) => {
    const { user, ticket, needsContext } = await resolveBotTicketTarget({
      channel,
      binding,
    });
    if (!user || !ticket) {
      return { attached: false, needsContext: Boolean(needsContext) };
    }

    const payload =
      channel === "telegram"
        ? await downloadTelegramMedia(media)
        : {
            ...(await downloadUrlBuffer(media.downloadUrl)),
            fileName: media.fileName,
            mimeType: media.mimeType,
            note: media.note ?? "",
          };
    const result = await persistBotTicketAttachment({
      ticket,
      user,
      channel,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      content: payload.content,
      note: payload.note,
    });

    if (user.role === "worker" && isCompletionText(payload.note)) {
      db.updateTicket(ticket.id, {
        status: "completed",
        updatedBy: user.id,
      });
    }

    return {
      attached: true,
      ticketId: ticket.id,
      attachmentId: result?.attachment?.id ?? null,
    };
  };

  const handleBotWorkerTextCommand = async ({ channel, binding, text }) => {
    const { user, ticket } = await resolveBotTicketTarget({ channel, binding });
    if (!user || user.role !== "worker" || !ticket || !isCompletionText(text)) {
      return false;
    }

    db.updateTicket(ticket.id, {
      status: "completed",
      updatedBy: user.id,
    });
    db.createTicketComment({
      ticketId: ticket.id,
      authorId: user.id,
      sourceChannel: channel,
      content: text,
    });
    return true;
  };

  const buildOutboundTicketMessage = ({ ticket, author, content }) =>
    [
      `склад контур: ${author.full_name ?? "Сотрудник"} ответил по заявке ${ticket.number ?? ""}`.trim(),
      ticket.title ? `Тема: ${ticket.title}` : null,
      content,
    ]
      .filter(Boolean)
      .join("\n\n");

  const deliverTicketCommentToTenant = async ({ ticket, author, content }) => {
    const tenantId = ticket?.tenant_id ?? ticket?.tenantId ?? null;
    if (!tenantId || author.role === "tenant") {
      return {
        delivered: false,
        channels: [],
        errors: [],
      };
    }

    const tenantUser = db.getTenantPortalUser(tenantId);
    const bindings = db
      .getActiveOtpBindingsForUser(tenantUser)
      .filter((binding) => ["telegram", "vk"].includes(binding.channel));

    const message = buildOutboundTicketMessage({ ticket, author, content });
    const tasks = bindings
      .map((binding) => {
        if (binding.channel === "telegram" && config.telegramBotToken) {
          return {
            channel: "telegram",
            run: () =>
              sendTelegramText({ chatId: binding.recipient_id, text: message }),
          };
        }
        if (binding.channel === "vk" && config.vkGroupToken) {
          return {
            channel: "vk",
            run: () => sendVkText({ userId: binding.recipient_id, message }),
          };
        }
        return null;
      })
      .filter(Boolean);

    if (tasks.length === 0) {
      return {
        delivered: false,
        channels: [],
        errors: [
          "У арендатора нет привязанного Telegram/VK для обратной отправки",
        ],
      };
    }

    const results = await Promise.all(
      tasks.map(async (task) => {
        try {
          await task.run();
          return {
            channel: task.channel,
            ok: true,
          };
        } catch (error) {
          return {
            channel: task.channel,
            ok: false,
            error: error instanceof Error ? error.message : "Delivery failed",
          };
        }
      }),
    );

    return {
      delivered: results.some((result) => result.ok),
      channels: results
        .filter((result) => result.ok)
        .map((result) => result.channel),
      errors: results
        .filter((result) => !result.ok)
        .map((result) => `${result.channel}: ${result.error}`),
    };
  };

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
    tenantOnboardingPayload,
    chatContextKey,
    buildTenantChatContexts,
    getSelectedChatContext,
    setSelectedChatContext,
    telegramContextKeyboard,
    vkContextKeyboard,
    sendChatContextChoice,
    handleChatContextSelection,
    parseTelegramPhone,
    handleTelegramWebhook,
    createCrossChannelTenantMessage,
    resolveBotTicketTarget,
    persistBotTicketAttachment,
    handleBotMediaMessage,
    handleBotWorkerTextCommand,
    buildOutboundTicketMessage,
    deliverTicketCommentToTenant,
    handleVkWebhook,
  };
}
