import { slaState } from "../../../../packages/contracts/src/domain";
import { copy, type Locale } from "../projectData";
import {
  type CommentDelivery,
  type FinanceSummary,
  type Ticket,
} from "./types";

export const formatDate = (value: string | null, locale: Locale) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

export const daysUntil = (isoDate: string | null) => {
  if (!isoDate) {
    return null;
  }

  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

export const formatMoney = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);

export const formatCompactMoney = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "RUB",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export const formatArea = (value: number, locale: Locale) =>
  `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value)} м²`;

export const formatDateTime = (value: string | null, locale: Locale) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const formatChannel = (value: string, locale: Locale) => {
  if (value === "telegram") {
    return "Telegram";
  }
  if (value === "vk") {
    return "VK";
  }
  if (value === "whatsapp") {
    return "WhatsApp";
  }
  return locale === "ru" ? "Система" : "System";
};

export const getChatRoleLabel = (
  role: string | null,
  locale: Locale,
  isTenantView: boolean,
) => {
  if (role === "tenant") {
    return isTenantView
      ? locale === "ru"
        ? "Вы"
        : "You"
      : locale === "ru"
        ? "Арендатор"
        : "Tenant";
  }
  if (role === "worker") {
    return locale === "ru" ? "Служба эксплуатации" : "Operations";
  }
  if (role === "manager" || role === "admin") {
    return locale === "ru" ? "Управляющая команда" : "Management team";
  }
  return locale === "ru" ? "Система" : "System";
};

export const supportedFileHint = (locale: Locale) =>
  locale === "ru"
    ? "Можно приложить фото, видео, PDF, DOC/DOCX, XLS/XLSX, JPG/PNG, TXT или CSV."
    : "You can attach photos, videos, PDF, DOC/DOCX, XLS/XLSX, JPG/PNG, TXT, or CSV.";

export const formatFileSize = (value: number, locale: Locale) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MB`;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(index, index + chunkSize)),
    );
  }
  return window.btoa(chunks.join(""));
};

export const formatDeliveryNotice = (
  baseMessage: string,
  delivery: CommentDelivery | undefined,
  locale: Locale,
) => {
  if (!delivery || delivery.channels.length === 0) {
    return baseMessage;
  }
  const channels = delivery.channels
    .map((channel) => formatChannel(channel, locale))
    .join(", ");
  return locale === "ru"
    ? `${baseMessage}. Отправлено: ${channels}`
    : `${baseMessage}. Sent to: ${channels}`;
};

export const priorityWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const getSlaState = (ticket: Ticket | null, locale: Locale) => {
  const value = slaState(ticket);
  if (value.state === "none") return { tone: "info", label: "Срок не задан" };
  if (value.state === "finished")
    return { tone: "success", label: "Завершена · отсчёт остановлен" };
  if (value.state === "overdue")
    return { tone: "critical", label: `Просрочено ${value.hours} ч` };
  return {
    tone: value.state === "warning" ? "warning" : "info",
    label: `Осталось ${value.hours} ч`,
  };
};

export const getTicketStatusLabel = (status: string | null, locale: Locale) => {
  const labels = copy[locale].ticketStatuses as Record<string, string>;
  return status ? (labels[status] ?? status) : "—";
};

export const getImportApprovalStatusLabel = (
  status: string,
  locale: Locale,
) => {
  if (status === "pending") {
    return locale === "ru" ? "ожидает" : "pending";
  }
  if (status === "approved") {
    return locale === "ru" ? "подтверждён" : "approved";
  }
  if (status === "rejected") {
    return locale === "ru" ? "отклонён" : "rejected";
  }
  return status;
};

export const getCollectionBasisLabel = (
  finance: FinanceSummary,
  locale: Locale,
) =>
  `${formatCompactMoney(finance.collectionPaid, locale)} / ${formatCompactMoney(finance.collectionBilled, locale)}`;

export const paymentMethodLabel = (method: string) =>
  ({
    bank_transfer: "Банковский перевод",
    invoice: "Счёт",
    cash: "Наличные",
    card: "Карта",
  })[method] ?? method;

export const reconciliationLabel = (status: string) =>
  ({
    matched: "Сверено",
    overpaid: "Переплата",
    partial: "Частичная оплата",
    overdue: "Просрочено",
    unpaid: "Ожидается оплата",
  })[status] ?? status;

export const countLabel = (count: number, forms: string[]) =>
  `${count} ${forms[count % 100 >= 11 && count % 100 <= 14 ? 2 : count % 10 === 1 ? 0 : count % 10 >= 2 && count % 10 <= 4 ? 1 : 2]}`;
