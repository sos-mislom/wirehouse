import crypto from "node:crypto";
export function createDomainUtilsService({}) {
  const validateRequired = (payload, keys) => {
    for (const key of keys) {
      if (
        payload[key] === undefined ||
        payload[key] === null ||
        payload[key] === ""
      ) {
        return key;
      }
    }
    return null;
  };

  const activeLeaseStages = new Set(["signed", "active", "prolongation"]);

  const sumBy = (items, selector) =>
    items.reduce((total, item) => total + selector(item), 0);

  const priorityWeights = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const notificationToneWeights = {
    critical: 4,
    warning: 3,
    info: 2,
    success: 1,
  };

  const statusLabels = {
    new: "Новая",
    accepted: "Принята",
    in_progress: "В работе",
    completed: "Выполнена",
    waiting_tenant: "Ожидает арендатора",
    resolved: "Решена",
    closed: "Закрыта",
    rejected: "Отклонена",
  };

  const translateStatus = (status) => statusLabels[status] ?? status;

  const roleWeights = {
    admin: 0,
    manager: 1,
    worker: 2,
    tenant: 3,
  };

  const collectionWeights = {
    low: 0.985,
    medium: 0.945,
    high: 0.89,
  };

  const startOfMonth = (value = new Date()) =>
    new Date(value.getFullYear(), value.getMonth(), 1);

  const addMonths = (value, months) =>
    new Date(value.getFullYear(), value.getMonth() + months, 1);

  const toIsoDay = (value) => value.toISOString().slice(0, 10);

  const createOtpCode = () =>
    String(crypto.randomInt(0, 1000000)).padStart(6, "0");

  const normalizePhoneKey = (value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8")) {
      return `+7${digits.slice(1)}`;
    }
    if (digits.length === 11 && digits.startsWith("7")) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+7${digits}`;
    }
    return String(value ?? "").replace(/[^\d+]/g, "");
  };

  const normalizeWhatsAppPhone = (value) =>
    String(value ?? "").replace(/\D/g, "");

  const getMappedValue = (map, ...keys) => {
    for (const key of keys) {
      const value = map[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  };

  const formatMonthLabel = (value) =>
    new Intl.DateTimeFormat("ru-RU", {
      month: "long",
    })
      .format(value)
      .replace(".", "");

  const roundMetric = (value) => Number(value.toFixed(1));

  const money = (value) => Math.round(value);

  const daysUntilIso = (isoDate) => {
    const ms = new Date(isoDate).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  const compareByDateDesc = (left, right) =>
    new Date(right).getTime() - new Date(left).getTime();

  const compareNotifications = (left, right) => {
    const toneDelta =
      (notificationToneWeights[right.tone] ?? 0) -
      (notificationToneWeights[left.tone] ?? 0);
    if (toneDelta !== 0) {
      return toneDelta;
    }

    return compareByDateDesc(left.createdAt, right.createdAt);
  };
  return {
    validateRequired,
    activeLeaseStages,
    sumBy,
    priorityWeights,
    notificationToneWeights,
    statusLabels,
    translateStatus,
    roleWeights,
    collectionWeights,
    startOfMonth,
    addMonths,
    toIsoDay,
    createOtpCode,
    normalizePhoneKey,
    normalizeWhatsAppPhone,
    getMappedValue,
    formatMonthLabel,
    roundMetric,
    money,
    daysUntilIso,
    compareByDateDesc,
    compareNotifications,
  };
}
