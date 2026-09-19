import crypto from "node:crypto";
import path from "node:path";
import { MAX_ATTACHMENT_BYTES } from "../../../../../packages/contracts/src/domain.js";

export function createBotMediaHandler(deps) {
  const {
    db,
    fileStorage,
    sanitizeFilename,
    ticketAttachmentPathFor,
    ensureTicketAttachmentWithinStorage,
    inferMediaType,
    downloadTelegramMedia,
    downloadUrlBuffer,
    sendTelegramText,
    sendVkText,
    isCompletionText,
    resolveBotTicketTarget,
  } = deps;

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


  return {
    persistBotTicketAttachment,
    handleBotMediaMessage,
    handleBotWorkerTextCommand,
    buildOutboundTicketMessage,
    deliverTicketCommentToTenant,
  };
}
