import { isOpenTicket } from "../../../../../packages/contracts/src/domain.js";
import { config } from "../../config.js";

export function createBotContextManager(deps) {
  const {
    db,
    chatContextStore,
    chatContextTtlMs,
    sendTelegramText,
    sendVkText,
  } = deps;

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
    createCrossChannelTenantMessage,
    resolveBotTicketTarget,
  };
}
