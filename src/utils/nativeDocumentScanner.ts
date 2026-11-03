import { Capacitor } from "@capacitor/core";
import {
  DocumentScanner,
  GoogleDocumentScannerModuleInstallState,
  type ScanResult as NativeScanResult,
} from "@capacitor-mlkit/document-scanner";
import { App } from "@capacitor/app";
import { pauseAppLock } from "@/lib/appLock";

export interface NativeScannerModuleStatus {
  available: boolean;
  supported: boolean;
  reason?: string;
}

export interface NativeScanOutput {
  type: "pdf" | "image";
  file: File;
  previewUrl: string;
  pageCount?: number;
}

// Track whether restored result has already been processed in current session
let restoredResultProcessed = false;

/**
 * Resets the restoration processing guard when a new native scan is launched.
 */
export function resetRestoredScanGuard(): void {
  restoredResultProcessed = false;
}

/**
 * Checks if native ML Kit document scanning is supported on this platform.
 */
export function isNativeScannerSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Checks if the Google ML Kit Document Scanner Module is available locally on the Android device.
 */
export async function checkGoogleScannerModule(): Promise<NativeScannerModuleStatus> {
  if (!isNativeScannerSupported()) {
    return { available: false, supported: false, reason: "Platform is not Android native" };
  }

  try {
    const res = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
    return { available: res.available, supported: true };
  } catch (err: any) {
    console.warn("[NativeScanner] isGoogleDocumentScannerModuleAvailable error:", err);
    return {
      available: false,
      supported: false,
      reason: err?.message || "Failed to query Google Play Services module",
    };
  }
}

/**
 * Triggers installation of the Google Play services Document Scanner module.
 * Includes a strict 90-second timeout guard.
 */
export async function installGoogleScannerModule(
  onProgress?: (progressPercent: number, state: GoogleDocumentScannerModuleInstallState) => void,
  timeoutMs: number = 90000
): Promise<boolean> {
  if (!isNativeScannerSupported()) return false;

  return new Promise(async (resolve, reject) => {
    let listenerHandle: any = null;
    let settled = false;

    const cleanup = async () => {
      if (listenerHandle) {
        try {
          await listenerHandle.remove();
        } catch {
          /* noop */
        }
        listenerHandle = null;
      }
    };

    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(
        new Error(
          "Installation timed out after 90 seconds. Please check your internet connection or Google Play Services."
        )
      );
    }, timeoutMs);

    try {
      listenerHandle = await DocumentScanner.addListener(
        "googleDocumentScannerModuleInstallProgress",
        async (event) => {
          if (settled) return;
          console.log("[NativeScanner] Install progress:", event);
          if (onProgress) {
            onProgress(event.progress ?? 0, event.state);
          }
          if (event.state === GoogleDocumentScannerModuleInstallState.COMPLETED) {
            settled = true;
            clearTimeout(timer);
            await cleanup();
            resolve(true);
          } else if (
            event.state === GoogleDocumentScannerModuleInstallState.FAILED ||
            event.state === GoogleDocumentScannerModuleInstallState.CANCELED
          ) {
            settled = true;
            clearTimeout(timer);
            await cleanup();
            resolve(false);
          }
        }
      );

      await DocumentScanner.installGoogleDocumentScannerModule();
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        await cleanup();
        reject(err);
      }
    }
  });
}

/**
 * Launches the native Google ML Kit Document Scanner on Android.
 * - FULL scanner mode (ML-based cleaning, finger removal, auto-edge detection)
 * - Multi-page scanning up to 25 pages
 * - Result format is PDF-only to ensure clean document handling and zero rasterization
 */
export async function launchNativeDocumentScanner(options?: {
  pageLimit?: number;
  galleryImportAllowed?: boolean;
}): Promise<NativeScanOutput | null> {
  if (!isNativeScannerSupported()) {
    throw new Error("Native document scanner is only available on Android");
  }

  // Reset restored result guard for this new scan session
  resetRestoredScanGuard();

  // Pause AppLock so switching activities to Google Play ML Kit Scanner doesn't lock on resume
  pauseAppLock(180000);

  try {
    const result: NativeScanResult = await DocumentScanner.scanDocument({
      scannerMode: "FULL",
      pageLimit: options?.pageLimit ?? 25,
      galleryImportAllowed: options?.galleryImportAllowed ?? true,
      resultFormats: "PDF",
    });

    return await processNativeScanResult(result);
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    if (
      msg.includes("canceled") ||
      msg.includes("cancelled") ||
      msg.includes("1001") ||
      err?.code === "1001"
    ) {
      console.log("[NativeScanner] User cancelled document scan");
      return null;
    }
    throw err;
  }
}

/**
 * Convert native scan output (URI) to web File/Blob object.
 * Validates fetch response and safely catches inaccessible or corrupt files.
 */
export async function processNativeScanResult(
  result: NativeScanResult
): Promise<NativeScanOutput | null> {
  if (!result) return null;

  // Case 1: PDF generated by scanner
  if (result.pdf && result.pdf.uri) {
    const pdfUri = result.pdf.uri;
    const pageCount = result.pdf.pageCount || 1;
    const webSrc = Capacitor.convertFileSrc(pdfUri);

    let res: Response;
    try {
      res = await fetch(webSrc);
    } catch (fetchErr: any) {
      console.error("[NativeScanner] Failed to fetch converted PDF URI:", fetchErr);
      throw new Error(
        `Unable to access scanned PDF from device storage (${fetchErr?.message || "fetch failed"}).`
      );
    }

    if (!res.ok) {
      throw new Error(`Failed to read scanned PDF file from device (HTTP status ${res.status}).`);
    }

    let blob: Blob;
    try {
      blob = await res.blob();
    } catch (blobErr: any) {
      console.error("[NativeScanner] Failed to convert PDF response to blob:", blobErr);
      throw new Error(
        `Failed to decode scanned PDF data (${blobErr?.message || "blob conversion error"}).`
      );
    }

    if (!blob || blob.size === 0) {
      throw new Error("Scanned PDF file is empty or unreadable.");
    }

    const pdfFile = new File([blob], `scan_${Date.now()}.pdf`, {
      type: "application/pdf",
    });

    // Extract first page image preview if available
    let previewUrl = "";
    if (result.scannedImages && result.scannedImages.length > 0) {
      try {
        previewUrl = Capacitor.convertFileSrc(result.scannedImages[0]);
      } catch {
        /* fallback to webSrc */
      }
    }

    return {
      type: "pdf",
      file: pdfFile,
      previewUrl: previewUrl || webSrc,
      pageCount,
    };
  }

  // Case 2: Fallback single-page image scan if scanner returned images
  if (result.scannedImages && result.scannedImages.length > 0) {
    const firstImgUri = result.scannedImages[0];
    const webSrc = Capacitor.convertFileSrc(firstImgUri);

    let res: Response;
    try {
      res = await fetch(webSrc);
    } catch (fetchErr: any) {
      console.error("[NativeScanner] Failed to fetch image URI:", fetchErr);
      throw new Error(
        `Unable to access scanned image from device storage (${fetchErr?.message || "fetch failed"}).`
      );
    }

    if (!res.ok) {
      throw new Error(`Failed to read scanned image file from device (HTTP status ${res.status}).`);
    }

    let blob: Blob;
    try {
      blob = await res.blob();
    } catch (blobErr: any) {
      console.error("[NativeScanner] Failed to convert image response to blob:", blobErr);
      throw new Error(
        `Failed to decode scanned image data (${blobErr?.message || "blob conversion error"}).`
      );
    }

    if (!blob || blob.size === 0) {
      throw new Error("Scanned image file is empty or unreadable.");
    }

    const imageFile = new File([blob], `scan_${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    return {
      type: "image",
      file: imageFile,
      previewUrl: webSrc,
      pageCount: 1,
    };
  }

  return null;
}

/**
 * Registers Capacitor App plugin listener for Android activity restoration (`appRestoredResult`).
 * Fixed async registration/cleanup race: ensures cleanup synchronously signals cancellation
 * and removes the listener handle as soon as the promise resolves.
 */
export function registerNativeScannerRestoration(
  onRestoredScan: (output: NativeScanOutput) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let isCleanedUp = false;
  let listenerHandle: any = null;

  App.addListener("appRestoredResult", async (event) => {
    if (isCleanedUp) return;
    console.log("[NativeScanner] appRestoredResult event:", event);

    if (
      !restoredResultProcessed &&
      event?.pluginId === "DocumentScanner" &&
      event?.success &&
      event?.data
    ) {
      restoredResultProcessed = true;
      try {
        const output = await processNativeScanResult(event.data);
        if (output && !isCleanedUp) {
          onRestoredScan(output);
        }
      } catch (err) {
        console.error("[NativeScanner] Error processing restored scan result:", err);
      }
    }
  })
    .then((handle) => {
      if (isCleanedUp) {
        handle.remove();
      } else {
        listenerHandle = handle;
      }
    })
    .catch((e) => {
      console.warn("[NativeScanner] Failed to add appRestoredResult listener:", e);
    });

  return () => {
    isCleanedUp = true;
    if (listenerHandle) {
      listenerHandle.remove();
      listenerHandle = null;
    }
  };
}
