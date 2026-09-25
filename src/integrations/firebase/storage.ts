// @ts-nocheck
/**
 * src/integrations/firebase/storage.ts
 *
 * Firebase Storage helpers — complete Phase 3 implementation.
 *
 * Storage layout (private buckets, owner-scoped):
 *
 *   documents/{userId}/{docId}/document.{ext}   ← document images & PDFs
 *   avatars/{userId}/profile.{ext}              ← profile avatars
 *   tasks/{userId}/{taskId}/image.{ext}         ← task attachment images
 *
 * Access model
 * ────────────
 *   - All files are private (Storage rules enforce authentication + ownership).
 *   - Client-side getDownloadURL() works for the file owner (returns a
 *     long-lived token URL — not time-limited).
 *   - Time-limited signed URLs (1-hour TTL matching Supabase behaviour) must
 *     be obtained from the getSignedUrl Cloud Function, which validates
 *     ownership (and org membership for shared documents) server-side.
 *   - Organization members accessing shared documents must use the
 *     getOrgDocumentSignedUrl helper which calls the Cloud Function with
 *     the organization context.
 *
 * None of the existing Supabase files (documentStorage.ts, signedUrl.ts)
 * are touched by this file — they continue to work as-is.
 */

import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getMetadata,
  type StorageReference,
  type UploadTask,
  type UploadTaskSnapshot,
  type FullMetadata,
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { firebaseStorage, firebaseFunctions } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// Allowed MIME types (mirrors Supabase bucket constraints)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_DOCUMENT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_TASK_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_AVATAR_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

/** Max file size for documents: 10 MB (mirrors Supabase bucket limit). */
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Max file size for task images: 5 MB. */
const MAX_TASK_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Max file size for avatars: 2 MB. */
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type StorageValidationError =
  | { ok: false; error: 'invalid_mime';  message: string }
  | { ok: false; error: 'file_too_large'; message: string };

export type StorageValidationResult = { ok: true } | StorageValidationError;

export function validateDocumentFile(file: File): StorageValidationResult {
  if (!ALLOWED_DOCUMENT_MIMES.has(file.type)) {
    return {
      ok: false,
      error: 'invalid_mime',
      message: `File type "${file.type}" is not allowed. Accepted: JPEG, PNG, WebP, PDF.`,
    };
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      ok: false,
      error: 'file_too_large',
      message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    };
  }
  return { ok: true };
}

export function validateTaskImageFile(file: File): StorageValidationResult {
  if (!ALLOWED_TASK_MIMES.has(file.type)) {
    return {
      ok: false,
      error: 'invalid_mime',
      message: `File type "${file.type}" is not allowed. Accepted: JPEG, PNG, WebP.`,
    };
  }
  if (file.size > MAX_TASK_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: 'file_too_large',
      message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
    };
  }
  return { ok: true };
}

export function validateAvatarFile(file: File): StorageValidationResult {
  if (!ALLOWED_AVATAR_MIMES.has(file.type)) {
    return {
      ok: false,
      error: 'invalid_mime',
      message: `File type "${file.type}" is not allowed. Accepted: JPEG, PNG, WebP.`,
    };
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return {
      ok: false,
      error: 'file_too_large',
      message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract file extension from a MIME type. */
function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg':    'jpg',
    'image/jpg':     'jpg',
    'image/png':     'png',
    'image/webp':    'webp',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}

/**
 * Build a StorageReference for a document image/PDF.
 * Path: documents/{userId}/{docId}/document.{ext}
 */
export function documentImageRef(
  userId: string,
  docId: string,
  ext: string,
): StorageReference {
  return ref(firebaseStorage, `documents/${userId}/${docId}/document.${ext}`);
}

/**
 * Build a StorageReference from a full storage path already stored in Firestore.
 */
export function refFromPath(storagePath: string): StorageReference {
  return ref(firebaseStorage, storagePath);
}

/**
 * Build a StorageReference for a task image.
 * Path: tasks/{userId}/{taskId}/image.{ext}
 */
export function taskImageRef(
  userId: string,
  taskId: string,
  ext: string,
): StorageReference {
  return ref(firebaseStorage, `tasks/${userId}/${taskId}/image.${ext}`);
}

/**
 * Build a StorageReference for a user avatar.
 * Path: avatars/{userId}/profile.{ext}
 */
export function avatarRef(userId: string, ext: string): StorageReference {
  return ref(firebaseStorage, `avatars/${userId}/profile.${ext}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload result type
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** Full Firebase Storage path — store this in the Firestore document. */
  path: string;
  /**
   * Long-lived token-based download URL.
   * For time-limited signed URLs use getDocumentSignedUrl() instead.
   */
  downloadUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload — document image / PDF
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a document image or PDF.
 *
 * Validates MIME type and file size before uploading.
 * Returns the storage path (to store in Firestore) and a download URL.
 *
 * @param userId  Firebase Auth UID of the document owner
 * @param docId   Firestore document ID (used as the storage folder name)
 * @param file    File or Blob to upload
 */
export async function uploadDocumentImage(
  userId: string,
  docId: string,
  file: File,
): Promise<UploadResult> {
  const validation = validateDocumentFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ext       = extFromMime(file.type);
  const storageRef = documentImageRef(userId, docId, ext);

  const snapshot: UploadTaskSnapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: userId, docId },
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);
  return { path: snapshot.ref.fullPath, downloadUrl };
}

/**
 * Upload a document image with progress reporting.
 *
 * Returns an UploadTask — attach .on('state_changed', ...) for progress.
 * Call .then(snapshot => getDownloadURL(snapshot.ref)) when complete.
 *
 * @param userId  Firebase Auth UID
 * @param docId   Firestore document ID
 * @param file    File to upload
 */
export function uploadDocumentImageResumable(
  userId: string,
  docId: string,
  file: File,
): UploadTask {
  const validation = validateDocumentFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ext        = extFromMime(file.type);
  const storageRef = documentImageRef(userId, docId, ext);

  return uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: userId, docId },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload — task image
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a task attachment image.
 *
 * @param userId  Firebase Auth UID
 * @param taskId  Firestore task document ID
 * @param file    Image file to upload
 */
export async function uploadTaskImage(
  userId: string,
  taskId: string,
  file: File,
): Promise<UploadResult> {
  const validation = validateTaskImageFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ext        = extFromMime(file.type);
  const storageRef = taskImageRef(userId, taskId, ext);

  const snapshot: UploadTaskSnapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: userId, taskId },
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);
  return { path: snapshot.ref.fullPath, downloadUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload — avatar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a user profile avatar.
 * Overwrites any existing avatar at the same path.
 *
 * @param userId  Firebase Auth UID
 * @param file    Image file to upload
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<UploadResult> {
  const validation = validateAvatarFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ext        = extFromMime(file.type);
  const storageRef = avatarRef(userId, ext);

  const snapshot: UploadTaskSnapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: userId },
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);
  return { path: snapshot.ref.fullPath, downloadUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Download URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a long-lived token-based download URL from Firebase Storage.
 *
 * This is NOT time-limited — use getDocumentSignedUrl() for a 1-hour URL
 * that matches the Supabase createSignedUrl behaviour.
 *
 * @param storagePath  Full storage path (e.g. "documents/uid/docId/document.jpg")
 */
export async function getFirebaseDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(firebaseStorage, storagePath));
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed URLs  (via Cloud Function — server-side Admin SDK)
// ─────────────────────────────────────────────────────────────────────────────

interface SignedUrlRequest {
  storagePath:      string;
  expiresInSeconds?: number;
}
interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
}

/**
 * Request a time-limited signed URL from the getSignedUrl Cloud Function.
 *
 * The function validates:
 *   - The caller is authenticated (Firebase ID token).
 *   - The path belongs to the caller (owner check).
 *   - OR the path belongs to an org document and the caller is a member.
 *
 * Default TTL: 3600 seconds (1 hour) — matches Supabase createSignedUrl TTL.
 *
 * Replaces: supabase.storage.from(bucket).createSignedUrl(path, 3600)
 *
 * @param storagePath      Full Firebase Storage path
 * @param expiresInSeconds Optional TTL override (min 60, max 604800)
 */
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<{ signedUrl: string; expiresAt: string }> {
  const fn = httpsCallable<SignedUrlRequest, SignedUrlResponse>(
    firebaseFunctions,
    'getSignedUrl',
  );
  const result = await fn({ storagePath, expiresInSeconds });
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete a single file from Firebase Storage.
 *
 * Swallows object-not-found errors so deleting an already-absent file
 * is a no-op (matches Supabase .remove() behaviour on missing files).
 *
 * @param storagePath  Full storage path
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(firebaseStorage, storagePath));
  } catch (err: unknown) {
    // storage/object-not-found is not an error — the file is already gone.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'storage/object-not-found'
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Delete multiple files.
 *
 * Failures are collected and returned rather than thrown so that a single
 * failed delete does not prevent the others from completing.
 *
 * @param storagePaths  Array of full storage paths to delete
 */
export async function deleteStorageFiles(
  storagePaths: string[],
): Promise<{ deleted: string[]; errors: Array<{ path: string; message: string }> }> {
  const deleted: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  await Promise.all(
    storagePaths.map(async (path) => {
      try {
        await deleteStorageFile(path);
        deleted.push(path);
      } catch (err: unknown) {
        errors.push({
          path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return { deleted, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// File existence check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a file exists in Firebase Storage.
 *
 * Returns true if the file exists and the current user has read access;
 * false if it does not exist (storage/object-not-found) or access is denied.
 *
 * @param storagePath  Full storage path
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await getMetadata(ref(firebaseStorage, storagePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata from Firebase Storage.
 *
 * Returns null if the file does not exist or access is denied.
 *
 * @param storagePath  Full storage path
 */
export async function getFileMetadata(storagePath: string): Promise<FullMetadata | null> {
  try {
    return await getMetadata(ref(firebaseStorage, storagePath));
  } catch {
    return null;
  }
}
