import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "./signedUrl";

/**
 * Upload original PDF or image with zero compression
 * 
 * This function stores the raw, original file without any quality reduction,
 * compression, or conversion. PDFs remain as PDFs, images remain as images.
 * 
 * Returns the file path (not a public URL) for secure signed URL generation.
 */
export async function uploadDocumentOriginal(file: File, userId: string): Promise<string | null> {
  try {
    if (!file) throw new Error("No file provided");

    // Generate unique folder structure
    const docUuid = crypto.randomUUID();
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'file';
    const filePath = `documents/${userId}/${docUuid}/document.${fileExt}`;

    // Upload raw file with NO compression or transformation
    const { error } = await supabase.storage
      .from("document-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) throw error;

    // Return the file path for database storage
    // Signed URLs should be generated when displaying the document
    return filePath;
  } catch (err) {
    console.error("Upload error:", err);
    throw err;
  }
}

/**
 * Upload the PROCESSED (cropped & enhanced) document as the canonical artifact.
 * This is the ONLY image written for camera/gallery scans — no raw frame is stored.
 */
export async function uploadProcessedDocument(file: File, userId: string): Promise<string | null> {
  if (!file) throw new Error("No file provided");

  const docUuid = crypto.randomUUID();
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `documents/${userId}/${docUuid}/processed-document.${fileExt}`;

  const { error } = await supabase.storage
    .from("document-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  return filePath;
}

/**
 * Verification log for the processed-only storage contract.
 */
export async function verifyProcessedDocument(imagePath: string): Promise<void> {
  try {
    const dir = imagePath.substring(0, imagePath.lastIndexOf('/'));
    const name = imagePath.substring(imagePath.lastIndexOf('/') + 1);
    const { data: listed } = await supabase.storage.from("document-images").list(dir);
    const exists = !!listed?.some((o) => o.name === name);
    const signed = await getSignedUrl('document-images', imagePath);
    console.log("PROCESSED DOCUMENT VERIFICATION", {
      image_path: imagePath,
      storage_object_exists: exists,
      signed_url: signed ? `${signed.slice(0, 80)}...` : null,
      preview_source: "image_path (processed artifact)",
    });
  } catch (e) {
    console.warn("PROCESSED DOCUMENT VERIFICATION failed", e);
  }
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
