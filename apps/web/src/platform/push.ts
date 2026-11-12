import { useEffect, useRef } from "react";
import { apiRequest } from "../api/client";
import { isNativeApp } from "./native";

// Push notifications in the installed app. A platform is enabled only when the
// build was prepared with its credentials (VITE_WAREHOUSE_PUSH, set by
// apps/mobile/scripts/prepare.mjs): on Android, registering without the
// Firebase configuration would crash the app.
const configuredPlatforms = String(import.meta.env.VITE_WAREHOUSE_PUSH ?? "")
  .split(",")
  .map((platform) => platform.trim());
const deviceKey = "warehouse-push-device";

const nativePlatform = () => {
  const platform = (
    globalThis as { Capacitor?: { getPlatform?: () => string } }
  ).Capacitor?.getPlatform?.();
  return platform === "android" || platform === "ios" ? platform : null;
};

type PushData = Record<string, string | undefined>;
let sessionToken: string | undefined;
let openFromNotification: ((data: PushData) => void) | undefined;
let listening: Promise<void> | undefined;

async function enablePush(token: string, open: (data: PushData) => void) {
  const platform = nativePlatform();
  if (!isNativeApp || !platform || !configuredPlatforms.includes(platform))
    return;
  sessionToken = token;
  openFromNotification = open;
  // Capacitor plugins answer every property, including `then`; never return
  // the plugin itself from a promise.
  const { PushNotifications } = await import("@capacitor/push-notifications");
  listening ??= Promise.all([
    PushNotifications.addListener("registration", ({ value }) => {
      if (!sessionToken) return;
      try {
        window.localStorage.setItem(deviceKey, value);
      } catch {
        // The server mapping is what matters; sign-out just cannot remove it.
      }
      void apiRequest("/api/push/devices", {
        method: "POST",
        token: sessionToken,
        body: { token: value, platform },
      }).catch(() => undefined);
    }),
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      ({ notification }) => openFromNotification?.(notification.data ?? {}),
    ),
  ]).then(() => undefined);
  await listening;
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive.startsWith("prompt"))
    permission = await PushNotifications.requestPermissions();
  if (permission.receive === "granted") await PushNotifications.register();
}

// On sign-out the device stops receiving this account's notifications.
export function disablePush(token: string | undefined) {
  sessionToken = undefined;
  const device = window.localStorage.getItem(deviceKey);
  if (!token || !device) return;
  window.localStorage.removeItem(deviceKey);
  void apiRequest("/api/push/devices/remove", {
    method: "POST",
    token,
    body: { token: device },
  }).catch(() => undefined);
}

export function usePushNotifications(
  token: string | undefined,
  openTicket: (ticketId: string) => void,
) {
  const open = useRef(openTicket);
  open.current = openTicket;
  useEffect(() => {
    if (!token) return;
    void enablePush(token, (data) => {
      if (data.entityType === "ticket" && data.entityId)
        open.current(data.entityId);
    }).catch(() => undefined);
  }, [token]);
}
