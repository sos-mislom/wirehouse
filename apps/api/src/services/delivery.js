import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { config } from "../config.js";
export function createDeliveryService({
  mfaChallengeStore,
  normalizeWhatsAppPhone,
  normalizePhoneKey,
  db,
  getMappedValue,
}) {
  const timeoutSignal = (timeoutMs = 8000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      cancel: () => clearTimeout(timeout),
    };
  };

  const fetchJson = async (url, options) => {
    const { signal, cancel } = timeoutSignal();
    try {
      const response = await fetch(url, {
        ...options,
        signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(
          payload?.description ??
            payload?.error?.message ??
            payload?.error_msg ??
            `HTTP ${response.status}`,
        );
      }
      return payload;
    } finally {
      cancel();
    }
  };

  const buildOtpMessage = (code) =>
    `Код входа в склад контур: ${code}. Никому не сообщайте код. Он действует 5 минут.`;

  const buildPasswordResetMessage = (code) =>
    `Код восстановления пароля склад контур: ${code}. Если вы не запрашивали сброс, сообщите администратору. Код действует 10 минут.`;

  const hashResetCode = ({ userId, code }) =>
    crypto
      .createHash("sha256")
      .update(`${userId}:${code}:${config.jwtSecret}`)
      .digest("hex");

  const encodeEmailHeader = (value) => {
    const text = String(value ?? "");
    return /^[\x00-\x7F]*$/.test(text)
      ? text
      : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
  };

  const smtpRead = (socket) =>
    new Promise((resolve, reject) => {
      let buffer = "";
      const onData = (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1] ?? "";
        if (/^\d{3} /.test(last)) {
          cleanup();
          resolve(buffer);
        }
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      socket.on("data", onData);
      socket.on("error", onError);
    });

  const smtpCommand = async (socket, command, okCodes = ["250"]) => {
    socket.write(`${command}\r\n`);
    const response = await smtpRead(socket);
    if (!okCodes.some((code) => response.startsWith(code))) {
      throw new Error(response.trim());
    }
    return response;
  };

  const createSmtpSocket = () =>
    new Promise((resolve, reject) => {
      const socket = config.smtpSecure
        ? tls.connect(config.smtpPort, config.smtpHost, {
            servername: config.smtpHost,
          })
        : net.connect(config.smtpPort, config.smtpHost);
      socket.setTimeout(10000);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("SMTP timeout")));
      socket.once("connect", () => resolve(socket));
    });

  const sendEmail = async ({ to, subject, text }) => {
    if (!config.smtpHost || !to) {
      throw new Error("SMTP is not configured");
    }

    let socket = await createSmtpSocket();
    try {
      await smtpRead(socket);
      await smtpCommand(socket, `EHLO ${config.smtpHost}`, ["250"]);
      if (!config.smtpSecure) {
        await smtpCommand(socket, "STARTTLS", ["220"]);
        socket = tls.connect({
          socket,
          servername: config.smtpHost,
        });
        await smtpCommand(socket, `EHLO ${config.smtpHost}`, ["250"]);
      }
      if (config.smtpUser && config.smtpPassword) {
        await smtpCommand(socket, "AUTH LOGIN", ["334"]);
        await smtpCommand(
          socket,
          Buffer.from(config.smtpUser).toString("base64"),
          ["334"],
        );
        await smtpCommand(
          socket,
          Buffer.from(config.smtpPassword).toString("base64"),
          ["235"],
        );
      }
      const fromMatch = config.smtpFrom.match(/<([^>]+)>/);
      const fromEmail = fromMatch?.[1] ?? config.smtpFrom;
      await smtpCommand(socket, `MAIL FROM:<${fromEmail}>`, ["250"]);
      await smtpCommand(socket, `RCPT TO:<${to}>`, ["250", "251"]);
      await smtpCommand(socket, "DATA", ["354"]);
      const message = [
        `From: ${encodeEmailHeader(config.smtpFrom)}`,
        `To: ${to}`,
        `Subject: ${encodeEmailHeader(subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        String(text ?? "").replace(/\r?\n\./g, "\n.."),
        ".",
      ].join("\r\n");
      await smtpCommand(socket, message, ["250"]);
      await smtpCommand(socket, "QUIT", ["221"]);
      return { messageId: crypto.randomUUID() };
    } finally {
      socket.destroy();
    }
  };

  const createMfaChallenge = (user) => {
    const challenge = crypto.randomUUID();
    mfaChallengeStore.set(
      challenge,
      {
        userId: user.id,
        attempts: 0,
      },
      config.mfaChallengeTtlMs,
    );
    return challenge;
  };

  const consumeMfaChallenge = (challenge) => {
    const entry = mfaChallengeStore.get(challenge);
    if (!entry) {
      mfaChallengeStore.delete(challenge);
      return null;
    }
    entry.attempts += 1;
    if (entry.attempts > 5) {
      mfaChallengeStore.delete(challenge);
      return null;
    }
    mfaChallengeStore.set(challenge, entry, config.mfaChallengeTtlMs);
    return entry;
  };

  const sendTelegramText = async ({ chatId, text, replyMarkup = null }) => {
    const payload = await fetchJson(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      },
    );

    if (!payload.ok) {
      throw new Error(payload.description ?? "Telegram send failed");
    }
  };

  const answerTelegramCallback = async ({ callbackQueryId, text }) => {
    if (!callbackQueryId || !config.telegramBotToken) {
      return;
    }
    await fetchJson(
      `https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      },
    );
  };

  const sendTelegramOtp = async ({ chatId, code }) =>
    sendTelegramText({
      chatId,
      text: buildOtpMessage(code),
    });

  const sendVkOtp = async ({ userId, code }) => {
    return sendVkText({
      userId,
      message: buildOtpMessage(code),
    });
  };

  const sendVkText = async ({ userId, message, keyboard = null }) => {
    const body = new URLSearchParams({
      access_token: config.vkGroupToken,
      v: config.vkApiVersion,
      user_id: userId,
      random_id: String(crypto.randomInt(1, 2147483647)),
      message,
    });
    if (keyboard) {
      body.set("keyboard", JSON.stringify(keyboard));
    }
    const payload = await fetchJson("https://api.vk.com/method/messages.send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (payload.error) {
      throw new Error(payload.error.error_msg ?? "VK send failed");
    }
  };

  const downloadUrlBuffer = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`);
    }

    return {
      content: Buffer.from(await response.arrayBuffer()),
      mimeType:
        response.headers.get("content-type") ?? "application/octet-stream",
    };
  };

  const extractTelegramMedia = (message) => {
    const photo =
      Array.isArray(message?.photo) && message.photo.length > 0
        ? [...message.photo].sort(
            (left, right) =>
              Number(right.file_size ?? 0) - Number(left.file_size ?? 0),
          )[0]
        : null;
    if (photo?.file_id) {
      return {
        fileId: photo.file_id,
        fileName: `telegram-photo-${photo.file_unique_id ?? photo.file_id}.jpg`,
        mimeType: "image/jpeg",
        note: message.caption ?? "",
      };
    }

    if (message?.video?.file_id) {
      return {
        fileId: message.video.file_id,
        fileName:
          message.video.file_name ??
          `telegram-video-${message.video.file_unique_id ?? message.video.file_id}.mp4`,
        mimeType: message.video.mime_type ?? "video/mp4",
        note: message.caption ?? "",
      };
    }

    if (message?.document?.file_id) {
      return {
        fileId: message.document.file_id,
        fileName:
          message.document.file_name ??
          `telegram-document-${message.document.file_unique_id ?? message.document.file_id}`,
        mimeType: message.document.mime_type ?? "application/octet-stream",
        note: message.caption ?? "",
      };
    }

    return null;
  };

  const downloadTelegramMedia = async (media) => {
    if (!config.telegramBotToken) {
      throw new Error("Telegram bot token is not configured");
    }

    const metadataResponse = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(media.fileId)}`,
    );
    const metadata = await metadataResponse.json();
    if (!metadataResponse.ok || !metadata.ok || !metadata.result?.file_path) {
      throw new Error(metadata.description ?? "Telegram file metadata failed");
    }

    const downloaded = await downloadUrlBuffer(
      `https://api.telegram.org/file/bot${config.telegramBotToken}/${metadata.result.file_path}`,
    );
    return {
      content: downloaded.content,
      mimeType: media.mimeType || downloaded.mimeType,
      fileName: media.fileName || path.basename(metadata.result.file_path),
      note: media.note ?? "",
    };
  };

  const extractVkMedia = (message) => {
    const attachments = Array.isArray(message?.attachments)
      ? message.attachments
      : [];
    const photoAttachment = attachments.find(
      (attachment) =>
        attachment.type === "photo" && attachment.photo?.sizes?.length,
    );
    if (photoAttachment) {
      const size = [...photoAttachment.photo.sizes].sort(
        (left, right) =>
          Number((right.width ?? 0) * (right.height ?? 0)) -
          Number((left.width ?? 0) * (left.height ?? 0)),
      )[0];
      if (size?.url) {
        return {
          downloadUrl: size.url,
          fileName: `vk-photo-${photoAttachment.photo.id ?? Date.now()}.jpg`,
          mimeType: "image/jpeg",
          note: message.text ?? "",
        };
      }
    }

    const docAttachment = attachments.find(
      (attachment) => attachment.type === "doc" && attachment.doc?.url,
    );
    if (docAttachment) {
      return {
        downloadUrl: docAttachment.doc.url,
        fileName:
          docAttachment.doc.title ??
          `vk-document-${docAttachment.doc.id ?? Date.now()}.${docAttachment.doc.ext ?? "bin"}`,
        mimeType: "application/octet-stream",
        note: message.text ?? "",
      };
    }

    return null;
  };

  const isCompletionText = (value) =>
    /(^|\s)(готово|готов|завершено|завершил|выполнено|сделано|закрыть|закрыл)(\s|$)/i.test(
      String(value ?? ""),
    );

  const sendWhatsAppOtp = async ({ phone, code }) => {
    const payload = await fetchJson(
      `https://graph.facebook.com/v20.0/${config.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.whatsappAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizeWhatsAppPhone(phone),
          type: "template",
          template: {
            name: config.whatsappOtpTemplateName,
            language: {
              code: config.whatsappOtpTemplateLanguage,
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: code,
                  },
                ],
              },
            ],
          },
        }),
      },
    );

    if (payload.error) {
      throw new Error(payload.error.message ?? "WhatsApp send failed");
    }
  };

  const deliverTenantOtp = async ({ user, phone, code }) => {
    const phoneKey = normalizePhoneKey(phone);
    const tenant = user.tenant_id ? db.getTenant(user.tenant_id) : null;
    const telegramBinding = db.getOtpBinding("telegram", phoneKey);
    const vkBinding = db.getOtpBinding("vk", phoneKey);
    const telegramChatId =
      tenant?.telegram_chat_id ??
      telegramBinding?.recipient_id ??
      getMappedValue(
        config.telegramOtpChatIds,
        phone,
        phoneKey,
        user.id,
        user.tenant_id,
      );
    const vkUserId =
      tenant?.vk_user_id ??
      vkBinding?.recipient_id ??
      getMappedValue(
        config.vkOtpUserIds,
        phone,
        phoneKey,
        user.id,
        user.tenant_id,
      );
    const channels = new Set(config.otpDeliveryChannels);
    const tasks = [];

    if (channels.has("telegram") && config.telegramBotToken && telegramChatId) {
      tasks.push({
        channel: "telegram",
        run: () => sendTelegramOtp({ chatId: telegramChatId, code }),
      });
    }

    if (channels.has("vk") && config.vkGroupToken && vkUserId) {
      tasks.push({
        channel: "vk",
        run: () => sendVkOtp({ userId: vkUserId, code }),
      });
    }

    if (
      channels.has("whatsapp") &&
      config.whatsappAccessToken &&
      config.whatsappPhoneNumberId &&
      config.whatsappOtpTemplateName
    ) {
      tasks.push({
        channel: "whatsapp",
        run: () => sendWhatsAppOtp({ phone, code }),
      });
    }

    if (tasks.length === 0) {
      return {
        delivered: false,
        channels: [],
        errors: [
          "Сначала привяжите Telegram или VK во вкладке арендатора, затем запросите код ещё раз",
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

  const deliverPasswordResetCode = async ({ user, code }) => {
    const bindings = db.getActiveOtpBindingsForUser(user);
    const tasks = bindings
      .filter((binding) => config.otpDeliveryChannels.includes(binding.channel))
      .map((binding) => ({
        channel: binding.channel,
        run: () => {
          if (binding.channel === "telegram" && config.telegramBotToken) {
            return sendTelegramText({
              chatId: binding.recipient_id,
              text: buildPasswordResetMessage(code),
            });
          }
          if (binding.channel === "vk" && config.vkGroupToken) {
            return sendVkText({
              userId: binding.recipient_id,
              message: buildPasswordResetMessage(code),
            });
          }
          throw new Error("Channel is not configured");
        },
      }));

    if (config.notificationChannels.includes("email") && user.email) {
      tasks.push({
        channel: "email",
        run: () =>
          sendEmail({
            to: user.email,
            subject: "Код восстановления пароля склад контур",
            text: buildPasswordResetMessage(code),
          }),
      });
    }

    if (tasks.length === 0) {
      return {
        delivered: false,
        channels: [],
        errors: [
          "Сначала привяжите Telegram или VK к телефону сотрудника, затем запросите восстановление ещё раз",
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
    timeoutSignal,
    fetchJson,
    buildOtpMessage,
    buildPasswordResetMessage,
    hashResetCode,
    encodeEmailHeader,
    smtpRead,
    smtpCommand,
    createSmtpSocket,
    sendEmail,
    createMfaChallenge,
    consumeMfaChallenge,
    sendTelegramText,
    answerTelegramCallback,
    sendTelegramOtp,
    sendVkOtp,
    sendVkText,
    downloadUrlBuffer,
    extractTelegramMedia,
    downloadTelegramMedia,
    extractVkMedia,
    isCompletionText,
    sendWhatsAppOtp,
    deliverTenantOtp,
    deliverPasswordResetCode,
  };
}
