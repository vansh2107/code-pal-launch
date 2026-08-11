import { useCallback, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";

export const MAX_PDF_SIZE = 20 * 1024 * 1024;

export interface PickedPdf {
  file: File;
  name: string;
  size: number;
}

export type PdfPickError =
  | { kind: "cancelled" }
  | { kind: "invalid-type" }
  | { kind: "too-large"; size: number }
  | { kind: "error"; message: string };

function isPdf(name: string, mimeType?: string | null) {
  if (mimeType && mimeType.toLowerCase() === "application/pdf") return true;
  return name.toLowerCase().endsWith(".pdf");
}

/**
 * Picks a single PDF using the Android/iOS native system document picker
 * (Capacitor) or a plain <input type="file"> on the web.
 * Never touches the camera or photo gallery.
 */
export function usePdfPicker() {
  const [isPicking, setIsPicking] = useState(false);
  const webInputRef = useRef<HTMLInputElement | null>(null);

  const pickFromWeb = useCallback((): Promise<PickedPdf | PdfPickError> => {
    return new Promise((resolve) => {
      let input = webInputRef.current;
      if (!input) {
        input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf,.pdf";
        input.style.display = "none";
        document.body.appendChild(input);
        webInputRef.current = input;
      }
      input.value = "";

      const cleanup = () => {
        input?.removeEventListener("change", onChange);
        window.removeEventListener("focus", onFocus);
      };

      const onChange = () => {
        cleanup();
        const file = input?.files?.[0];
        if (!file) return resolve({ kind: "cancelled" });
        if (!isPdf(file.name, file.type)) return resolve({ kind: "invalid-type" });
        resolve({ file, name: file.name, size: file.size });
      };

      // Detect dismissal of the OS dialog (no change event fires on cancel).
      const onFocus = () => {
        setTimeout(() => {
          if (!input?.files?.length) {
            cleanup();
            resolve({ kind: "cancelled" });
          }
        }, 500);
      };

      input.addEventListener("change", onChange, { once: true });
      window.addEventListener("focus", onFocus, { once: true });
      input.click();
    });
  }, []);

  const pickPdf = useCallback(async (): Promise<PickedPdf | PdfPickError> => {
    setIsPicking(true);
    try {
      let picked: PickedPdf | PdfPickError;

      if (Capacitor.isNativePlatform()) {
        try {
          const result = await FilePicker.pickFiles({
            types: ["application/pdf"],
            limit: 1,
            // keep the blob handle instead of reading the whole file into base64
            readData: false,
          });

          const picked0 = result.files?.[0];
          if (!picked0) {
            picked = { kind: "cancelled" };
          } else if (!isPdf(picked0.name, picked0.mimeType)) {
            picked = { kind: "invalid-type" };
          } else {
            let file: File | null = picked0.blob
              ? new File([picked0.blob], picked0.name, { type: "application/pdf" })
              : null;

            if (!file && picked0.path) {
              const src = Capacitor.convertFileSrc(picked0.path);
              const blob = await (await fetch(src)).blob();
              file = new File([blob], picked0.name, { type: "application/pdf" });
            }

            picked = file
              ? { file, name: file.name, size: file.size }
              : { kind: "error", message: "Could not read the selected file." };
          }
        } catch (err: any) {
          const msg = String(err?.message ?? err ?? "");
          picked = /cancel/i.test(msg)
            ? { kind: "cancelled" }
            : { kind: "error", message: msg || "File picker failed." };
        }
      } else {
        picked = await pickFromWeb();
      }

      if ("file" in picked && picked.size > MAX_PDF_SIZE) {
        return { kind: "too-large", size: picked.size };
      }
      return picked;
    } finally {
      setIsPicking(false);
    }
  }, [pickFromWeb]);

  return { pickPdf, isPicking };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}