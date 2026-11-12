import { isMobileApp } from "../mobile-product";

// Capacitor's Android WebView opens the camera for a capture input only when
// `accept` is exactly "image/*"; a list of formats falls back to the gallery
// picker, so the worker could not take a photo. Camera photos are JPEG, which
// the server accepts. Browser builds keep the exact list.
export const cameraAccept = (accept: string) =>
  isMobileApp ? "image/*" : accept;

const maxSide = 2048;
const jpegQuality = 0.82;
const leaveBelowBytes = 600 * 1024;

// Phone cameras produce 3–8 MB photos; on a weak warehouse connection they
// often miss the 30 s request deadline. In the mobile app photos are scaled to
// 2048 px and re-encoded as JPEG before upload. Anything else — documents,
// small images, decoding failures, or a result that is not smaller — is sent
// unchanged. Browser builds keep sending the original file.
export async function prepareUpload(file: File): Promise<File> {
  if (
    !isMobileApp ||
    !/^image\/(jpeg|png|webp)$/.test(file.type) ||
    file.size <= leaveBelowBytes
  )
    return file;
  const url = URL.createObjectURL(file);
  try {
    // An <img> applies the EXIF orientation, so portrait photos stay upright.
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      maxSide / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", jpegQuality),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
