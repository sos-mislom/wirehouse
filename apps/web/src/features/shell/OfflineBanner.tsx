import { useSyncExternalStore } from "react";
import { offlineStatus } from "../../platform/offline-cache";

const savedAtLabel = (savedAt: number) => {
  const saved = new Date(savedAt);
  const time = saved.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return saved.toDateString() === new Date().toDateString()
    ? `сегодня в ${time}`
    : `${saved.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${time}`;
};

// Shown in the mobile app while reads are answered from saved data. The
// commands named here are the ones platform/outbox.ts queues.
export function OfflineBanner() {
  const offlineSince = useSyncExternalStore(
    offlineStatus.subscribe,
    offlineStatus.get,
  );
  if (offlineSince === null) return null;
  return (
    <div className="banner banner--offline" role="status">
      <strong>Нет связи с сервером.</strong> Показаны данные, сохранённые{" "}
      {savedAtLabel(offlineSince)}. Комментарии, фото и действия по заявкам
      сохранятся на телефоне и отправятся сами, остальные изменения — только при
      связи.
    </div>
  );
}
