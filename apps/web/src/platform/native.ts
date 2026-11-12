import { TOKEN_KEY } from "../shared/navigation";
import { wipeSavedResponses } from "./offline-cache";

// The Capacitor native runtime injects window.Capacitor before the page loads.
// Reading it directly keeps @capacitor/* out of the browser bundle: plugins are
// imported lazily and only inside the installed app.
export const isNativeApp =
  (
    globalThis as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor?.isNativePlatform?.() === true;

// Capacitor plugins are proxies that answer every property, including `then`,
// so a plugin must never be the resolved value of a promise.
const withPreferences = async <T>(
  use: (
    store: (typeof import("@capacitor/preferences"))["Preferences"],
  ) => Promise<T>,
) => use((await import("@capacitor/preferences")).Preferences);

// iOS may clear WebView storage under memory pressure, which would sign the
// person out. localStorage stays the synchronous working copy; inside the app
// the token is mirrored to native preferences and restored before start-up.
export async function restoreSessionToken() {
  if (!isNativeApp || window.localStorage.getItem(TOKEN_KEY)) return;
  try {
    const { value } = await withPreferences((store) =>
      store.get({ key: TOKEN_KEY }),
    );
    if (value) window.localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Start signed out rather than block the app.
  }
}

export function storeSessionToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  if (isNativeApp)
    void withPreferences((store) =>
      store.set({ key: TOKEN_KEY, value: token }),
    ).catch(() => undefined);
}

export function clearSessionToken() {
  wipeSavedResponses();
  window.localStorage.removeItem(TOKEN_KEY);
  if (isNativeApp)
    void withPreferences((store) => store.remove({ key: TOKEN_KEY })).catch(
      () => undefined,
    );
}

const previewableType =
  /^(application\/pdf|image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+|video\/[\w.+-]+)$/;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// WebViews ignore <a download> and blob: links. In the app the file is written
// to the cache and handed to the system share sheet (open in a viewer, save to
// Files, send to a messenger). The browser keeps its usual download/preview.
export async function deliverFile(
  blob: Blob,
  fileName: string,
  { preferPreview = false }: { preferPreview?: boolean } = {},
) {
  if (!isNativeApp) {
    const url = URL.createObjectURL(blob);
    if (preferPreview && previewableType.test(blob.type)) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const safeName =
    fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "document";
  await Filesystem.rmdir({
    path: "shared-files",
    directory: Directory.Cache,
    recursive: true,
  }).catch(() => undefined);
  // A folder per file keeps the original name visible to the receiving app.
  const { uri } = await Filesystem.writeFile({
    path: `shared-files/${Date.now()}/${safeName}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ title: safeName, files: [uri] });
  } catch (error) {
    if (!/cancel/i.test(error instanceof Error ? error.message : String(error)))
      throw error;
  }
}
