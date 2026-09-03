/**
 * shareDocument
 *
 * Downloads the file from Supabase Storage via a short-lived signed URL,
 * writes it to the device's temporary directory using @capacitor/filesystem,
 * then invokes the native share sheet via @capacitor/share.
 *
 * On web (no Capacitor) it falls back to opening the signed URL in a new tab,
 * which allows Save-As / browser sharing.
 *
 * Security:
 *  - Uses a 60-second signed URL — only the caller (authenticated user) can
 *    obtain it, and it expires quickly.
 *  - The temp file is written to `Cache` directory (not publicly accessible).
 *  - Private documents are NOT made publicly accessible; no public bucket URLs
 *    are used.
 *
 * @returns void — throws on unrecoverable error.
 */

import { Capacitor } from "@capacitor/core";
import { getSignedUrl } from "@/utils/signedUrl";

/** Derive a safe filename from the document name + storage path extension. */
function buildFilename(documentName: string, imagePath: string): string {
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "bin";
  // Sanitise name: keep alphanumerics, spaces, hyphens, underscores
  const safeName = documentName
    .replace(/[^a-z0-9 \-_]/gi, "_")
    .trim()
    .substring(0, 60);
  return `${safeName || "document"}.${ext}`;
}

export async function shareDocument(
  documentName: string,
  imagePath: string | null
): Promise<void> {
  if (!imagePath) {
    throw new Error("This document has no file attached to share.");
  }

  // 1. Get a short-lived signed URL (60 s is enough to fetch the bytes)
  const signedUrl = await getSignedUrl("document-images", imagePath, 60);
  if (!signedUrl) {
    throw new Error("Could not generate a download URL. Please check your connection.");
  }

  // 2. On web, just open in a new tab — user can Save As or copy the URL
  if (!Capacitor.isNativePlatform()) {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // 3. On native: download bytes, write to temp cache, then invoke share sheet
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "bin";
  const filename = buildFilename(documentName, imagePath);

  // Fetch the file as a blob
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download document (HTTP ${response.status}).`);
  }
  const blob = await response.blob();

  // Convert to base64 for Filesystem.writeFile
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URI prefix "data:<mime>;base64,"
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Write to Cache directory (temp, not user-visible, not backed up)
  const writeResult = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  const fileUri = writeResult.uri;

  // Invoke native share sheet
  await Share.share({
    title: documentName,
    text: `Sharing: ${documentName}`,
    url: fileUri,
    dialogTitle: `Share ${documentName}`,
  });

  // Best-effort cleanup — delete the temp file after share sheet closes.
  // Failure here is non-fatal.
  try {
    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Cache,
    });
  } catch {
    /* noop */
  }
}
