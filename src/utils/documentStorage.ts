import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "./signedUrl";

export const DOCUMENT_BUCKET = "document-images";

/** Storage-safe file extension (letters/digits only, max 8 chars). */
function safeExtension(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const fromType = file.type?.split("/")[1];
  const raw = (fromName || fromType || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return (raw || "bin").slice(0, 8);
}

/**
 * Verifies that an object really exists AND is readable at `path`.
 * Uses the same read path the preview uses (createSignedUrl), so a path
 * can only ever be persisted if the preview will be able to load it.
 */
export async function verifyStorageObject(path: string): Promise<void> {
  const folder = path.substring(0, path.lastIndexOf("/"));
  const fileName = path.substring(path.lastIndexOf("/") + 1);

  const { data: listed, error: listError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .list(folder, { limit: 100, search: fileName });

  const existsInBucket = !listError && (listed || []).some((o) => o.name === fileName);

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, 60);

  if (signError || !signed?.signedUrl) {
    console.error("Upload verification failed", {
      path,
      existsInBucket,
      listError,
      signError,
      folderContents: listed,
    });
    throw new Error(
      existsInBucket
        ? `Upload verification failed: the file was stored at "${path}" but cannot be read back (storage read policy is blocking it).`
        : `Upload verification failed: no object exists at "${path}" in the ${DOCUMENT_BUCKET} bucket.`
    );
  }
}

/**
 * Upload original PDF or image with zero compression.
 *
 * Guarantees the returned path is the exact key Supabase stored the object
 * under, and that the object is readable back, before any caller writes it
 * to documents.image_path.
 */
export async function uploadDocumentOriginal(file: File, userId: string): Promise<string> {
  if (!file) throw new Error("No file provided");
  if (!userId) throw new Error("Missing user id for upload");

  const docUuid = crypto.randomUUID();
  const filePath = `documents/${userId}/${docUuid}/document.${safeExtension(file)}`;

  // Upload raw file with NO compression or transformation
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) {
    console.error("Storage upload error:", { filePath, error });
    throw error;
  }

  // Supabase is the source of truth for the stored key.
  const storedPath = data?.path || filePath;
  await verifyStorageObject(storedPath);

  return storedPath;
}


/**
 * Get a signed URL for a document image
 * This should be used when displaying documents in the UI
 */
export async function getDocumentSignedUrl(imagePath: string): Promise<string | null> {
  return getSignedUrl('document-images', imagePath);
}

/**
 * Get page count from PDF file
 */
export async function getPDFPageCount(file: File): Promise<number> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    const pdfWorkerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default as unknown as string;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await getDocument({ data: arrayBuffer }).promise;
    return pdfDoc.numPages;
  } catch (err) {
    console.error("Error counting PDF pages:", err);
    return 1;
  }
}
