import { supabase } from "@/integrations/supabase/client";

/**
 * Default signed URL expiration time (1 hour in seconds)
 */
const DEFAULT_EXPIRY_SECONDS = 3600;

/**
 * Cache for signed URLs to avoid unnecessary API calls
 * Key: bucket:path, Value: { url: string, expiresAt: number }
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Buffer time before expiration to refresh URL (5 minutes in milliseconds)
 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Generate a signed URL for a file in Supabase storage
 * Uses caching to avoid redundant API calls
 * 
 * @param bucket - Storage bucket name
 * @param path - File path within the bucket
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Signed URL or null if generation fails
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = DEFAULT_EXPIRY_SECONDS
): Promise<string | null> {
  if (!path) return null;

  const cacheKey = `${bucket}:${path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();

  // Return cached URL if still valid (with buffer time)
  if (cached && cached.expiresAt > now + REFRESH_BUFFER_MS) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error(`Error creating signed URL for ${bucket}/${path}:`, error);
      return null;
    }

    if (data?.signedUrl) {
      // Cache the signed URL
      signedUrlCache.set(cacheKey, {
        url: data.signedUrl,
        expiresAt: now + expiresIn * 1000,
      });
      return data.signedUrl;
    }

    return null;
  } catch (err) {
    console.error(`Failed to get signed URL for ${bucket}/${path}:`, err);
    return null;
  }
}

/**
 * Generate signed URLs for multiple files at once
 * 
 * @param bucket - Storage bucket name
 * @param paths - Array of file paths
 * @param expiresIn - Expiration time in seconds
 * @returns Map of path to signed URL
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn: number = DEFAULT_EXPIRY_SECONDS
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const pathsToFetch: string[] = [];
  const now = Date.now();

  // Check cache first
  for (const path of paths) {
    if (!path) continue;
    
    const cacheKey = `${bucket}:${path}`;
    const cached = signedUrlCache.get(cacheKey);
    
    if (cached && cached.expiresAt > now + REFRESH_BUFFER_MS) {
      results.set(path, cached.url);
    } else {
      pathsToFetch.push(path);
    }
  }

  // Fetch uncached URLs in parallel
  if (pathsToFetch.length > 0) {
    const fetchPromises = pathsToFetch.map(async (path) => {
      const url = await getSignedUrl(bucket, path, expiresIn);
      if (url) {
        results.set(path, url);
      }
    });

    await Promise.all(fetchPromises);
  }

  return results;
}

/**
 * Clear the signed URL cache
 * Useful when user logs out or for testing
 */
export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}

/**
 * Remove a specific path from the cache
 * Useful when a file is updated/deleted
 */
export function invalidateSignedUrl(bucket: string, path: string): void {
  const cacheKey = `${bucket}:${path}`;
  signedUrlCache.delete(cacheKey);
}

/**
 * Hook-friendly function to get a signed URL for a document image
 */
export async function getDocumentImageUrl(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null;
  return getSignedUrl('document-images', imagePath);
}

/**
 * Hook-friendly function to get a signed URL for a task image
 */
export async function getTaskImageUrl(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null;
  return getSignedUrl('task-images', imagePath);
}
