/**
 * src/utils/documentStorage.ts — Firebase Storage document upload layer
 *
 * Drop-in replacement for the Supabase Storage upload utility.
 * Public API is identical so all callers compile without changes:
 *   uploadDocumentOriginal(file, userId)
 *   getDocumentSignedUrl(imagePath)
 *   getPDFPageCount(file)
 */

import { ref, uploadBytes } from 'firebase/storage';
import { firebaseStorage } from '@/integrations/firebase/client';
import { getSignedUrl } from './signedUrl';

/**
 * Upload an original PDF or image to Firebase Storage with zero compression.
 *
 * Path convention (mirrors the Supabase path):
 *   documents/{userId}/{uuid}/document.{ext}
 *
 * Returns the full storage path (not a URL) for storing in Firestore.
 * Use getDocumentSignedUrl(path) or getSignedUrl() to generate a display URL.
 */
export async function uploadDocumentOriginal(
  file: File,
  userId: string,
): Promise<string | null> {
  try {
    if (!file) throw new Error('No file provided');

    const docUuid = crypto.randomUUID();
    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'file';
    const filePath = `documents/${userId}/${docUuid}/document.${fileExt}`;

    const storageRef = ref(firebaseStorage, filePath);

    await uploadBytes(storageRef, file, {
      contentType:    file.type,
      cacheControl:   'private, max-age=3600',
      customMetadata: { uploadedBy: userId, docId: docUuid },
    });

    return filePath;
  } catch (err) {
    console.error('[documentStorage] Upload error:', err);
    throw err;
  }
}

/**
 * Convert any image source (data URL, blob URL, http URL) into a real image blob.
 * Guards against sources that resolve to an HTML page (which Storage rejects).
 */
export async function srcToImageBlob(src: string): Promise<Blob> {
  try {
    const blob = await fetch(src).then((r) => r.blob());
    if (blob.type.startsWith('image/') && blob.size > 0) return blob;
  } catch { /* fall through to canvas */ }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read the image. Please capture it again.'));
    i.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image conversion failed'))), 'image/jpeg', 0.92),
  );
}

/**
 * Get a time-limited signed URL for a document image.
 * Wrapper around getSignedUrl for backwards compatibility.
 */
export async function getDocumentSignedUrl(imagePath: string): Promise<string | null> {
  return getSignedUrl('document-images', imagePath);
}

/**
 * Get page count from a PDF file using pdf.js.
 * Unchanged from the Supabase version — no backend dependency.
 */
export async function getPDFPageCount(file: File): Promise<number> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    const pdfWorkerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default as unknown as string;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await getDocument({ data: arrayBuffer }).promise;
    return pdfDoc.numPages;
  } catch (err) {
    console.error('[documentStorage] Error counting PDF pages:', err);
    return 1;
  }
}
