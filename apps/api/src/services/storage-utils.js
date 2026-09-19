import path from "node:path";
export function createStorageUtilsService({ fileStorage }) {
  const sanitizeFilename = (value) => {
    const cleaned = path
      .basename(String(value ?? "document"))
      .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "document";
  };

  const documentPathFor = (storedName) =>
    fileStorage.keyFor("documents", storedName);

  const ticketAttachmentPathFor = (storedName) =>
    fileStorage.keyFor("ticket-attachments", storedName);

  const ensureDocumentWithinStorage = (filePath) =>
    fileStorage.isSafeKey(filePath, "documents");

  const ensureTicketAttachmentWithinStorage = (filePath) =>
    fileStorage.isSafeKey(filePath, "ticket-attachments");

  const inferMediaType = (mimeType) => {
    if (String(mimeType).startsWith("image/")) {
      return "image";
    }
    if (String(mimeType).startsWith("video/")) {
      return "video";
    }
    return "file";
  };
  return {
    sanitizeFilename,
    documentPathFor,
    ticketAttachmentPathFor,
    ensureDocumentWithinStorage,
    ensureTicketAttachmentWithinStorage,
    inferMediaType,
  };
}
