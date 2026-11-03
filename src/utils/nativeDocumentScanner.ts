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
 */
export async function installGoogleScannerModule(
  onProgress?: (progressPercent: number, state: GoogleDocumentScannerModuleInstallState) => void
): Promise<boolean> {
  if (!isNativeScannerSupported()) return false;

  return new Promise(async (resolve, reject) => {
    let listenerHandle: any = null;
    try {
      listenerHandle = await DocumentScanner.addListener(
        "googleDocumentScannerModuleInstallProgress",
        (event) => {
          console.log("[NativeScanner] Install progress:", event);
          if (onProgress) {
            onProgress(event.progress ?? 0, event.state);
          }
          if (event.state === GoogleDocumentScannerModuleInstallState.COMPLETED) {
            listenerHandle?.remove?.();
            resolve(true);
          } else if (
            event.state === GoogleDocumentScannerModuleInstallState.FAILED ||
            event.state === GoogleDocumentScannerModuleInstallState.CANCELED
          ) {
            listenerHandle?.remove?.();
            resolve(false);
          }
        }
      );

      await DocumentScanner.installGoogleDocumentScannerModule();
    } catch (err) {
      listenerHandle?.remove?.();
      reject(err);
    }
  });
}

/**
 * Launches the native Google ML Kit Document Scanner on Android.
 * - FULL scanner mode (ML-based cleaning, finger removal, auto-edge detection)
 * - Multi-page scanning up to 25 pages
 * - Returns PDF output for multi-page scans (or single-page PDF) and JPEG for single-image scans
 */
export async function launchNativeDocumentScanner(options?: {
  pageLimit?: number;
  galleryImportAllowed?: boolean;
}): Promise<NativeScanOutput | null> {
  if (!isNativeScannerSupported()) {
    throw new Error("Native document scanner is only available on Android");
  }

  // Pause AppLock so switching activities to Google Play ML Kit Scanner doesn't lock on resume
  pauseAppLock(180000);

  try {
    const result: NativeScanResult = await DocumentScanner.scanDocument({
      scannerMode: "FULL",
      pageLimit: options?.pageLimit ?? 25,
      galleryImportAllowed: options?.galleryImportAllowed ?? true,
      resultFormats: "JPEG_PDF",
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
 * Convert native scan output (URI) to web File/Blob object
 */
export async function processNativeScanResult(
  result: NativeScanResult
): Promise<NativeScanOutput | null> {
  if (!result) return null;

  // Case 1: If PDF was generated and contains multiple pages (or PDF requested)
  if (result.pdf && result.pdf.uri) {
    const pdfUri = result.pdf.uri;
    const pageCount = result.pdf.pageCount || 1;
    const webSrc = Capacitor.convertFileSrc(pdfUri);

    const res = await fetch(webSrc);
    const blob = await res.blob();
    const pdfFile = new File([blob], `scan_${Date.now()}.pdf`, {
      type: "application/pdf",
    });

    // Also get the first page image preview if available
    let previewUrl = "";
    if (result.scannedImages && result.scannedImages.length > 0) {
      const firstImgWebSrc = Capacitor.convertFileSrc(result.scannedImages[0]);
      previewUrl = firstImgWebSrc;
    }

    return {
      type: "pdf",
      file: pdfFile,
      previewUrl: previewUrl || webSrc,
      pageCount,
    };
  }

  // Case 2: Single-page image scan
  if (result.scannedImages && result.scannedImages.length > 0) {
    const firstImgUri = result.scannedImages[0];
    const webSrc = Capacitor.convertFileSrc(firstImgUri);

    const res = await fetch(webSrc);
    const blob = await res.blob();
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
 * If Android OS killed the host app while ML Kit Scanner was running, this ensures the scan
 * result is safely delivered and processed exactly once.
 */
export function registerNativeScannerRestoration(
  onRestoredScan: (output: NativeScanOutput) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let handle: any = null;
  (async () => {
    try {
      handle = await App.addListener("appRestoredResult", async (event) => {
        console.log("[NativeScanner] appRestoredResult event:", event);
        if (
          !restoredResultProcessed &&
          event?.pluginId === "DocumentScanner" &&
          event?.success &&
          event?.data
        ) {
          restoredResultProcessed = true;
          const output = await processNativeScanResult(event.data);
          if (output) {
            onRestoredScan(output);
          }
        }
      });
    } catch (e) {
      console.warn("[NativeScanner] Failed to register appRestoredResult:", e);
    }
  })();

  return () => {
    handle?.remove?.();
  };
}
