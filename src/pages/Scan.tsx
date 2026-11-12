import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, where } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { firebaseDb, firebaseStorage, firebaseAuth, firebaseFunctions } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Upload, Sparkles, DownloadCloud, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, PageHeader } from "@/components/layout/";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { ScanningEffect } from "@/components/scan/ScanningEffect";
import { processAllPages, type ProcessedPdfPage } from "@/utils/pdfPageProcessor";
import { uploadDocumentOriginal, getPDFPageCount, srcToImageBlob } from "@/utils/documentStorage";
// PDF.js imports for Vite: use worker URL provided by bundler
// @ts-ignore - path is provided by pdfjs-dist package
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { sanitizeDocumentNote } from "@/utils/documentNotes";
import { evaluateDocumentDecision, parseAndNormalizeDate, formatToIsoDate } from "@/utils/documentDecisionEngine";
import { ALLOWED_COUNTRIES } from "@/utils/countryMapping";
import { parseCalendarDate, toCalendarDateString, formatCalendarDate } from "@/utils/dateUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  isNativeScannerSupported,
  checkGoogleScannerModule,
  installGoogleScannerModule,
  launchNativeDocumentScanner,
  registerNativeScannerRestoration,
  isScanSessionProcessed,
  markScanSessionProcessed,
  type NativeScanOutput,
} from "@/utils/nativeDocumentScanner";

const documentSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Document name is required")
    .max(200, "Document name cannot exceed 200 characters"),
  document_type: z.string()
    .trim()
    .min(1, "Document type is required"),
  issuing_authority: z.string()
    .trim()
    .max(200, "Issuing authority cannot exceed 200 characters")
    .optional()
    .or(z.literal("")),
  expiry_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional()
    .or(z.literal("")),
  expiry_date_label: z.string()
    .optional()
    .or(z.literal("")),
  renewal_period_days: z.number()
    .min(1, "Renewal period must be at least 1 day")
    .max(365, "Renewal period cannot exceed 365 days"),
  notes: z.string()
    .trim()
    .max(5000, "Notes cannot exceed 5000 characters")
    .optional()
    .or(z.literal("")),
});

/** Downscale a data URL so AI payloads stay within edge-function limits. */
async function shrinkDataUrl(dataUrl: string, maxDim = 1600, quality = 0.85): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1 && dataUrl.length < 4_000_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out && out.length > 100 ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

export default function Scan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const replaceMode = searchParams.get("mode") === "replace";
  const replaceDocId = searchParams.get("docId");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanMode, setScanMode] = useState<"scan" | "manual">("scan");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("personal");
  const mountedRef = useRef(true);
  
  const [documentCountry, setDocumentCountry] = useState<string>("");
  const [enableCountrySelect, setEnableCountrySelect] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfFileRef = useRef<File | null>(null);
  const [pdfPhase, setPdfPhase] = useState<null | "processing" | "analyzing">(null);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [decision, setDecision] = useState<any>(null);
  const [showExpiredConfirm, setShowExpiredConfirm] = useState(false);
  const [expiredConfirmAction, setExpiredConfirmAction] = useState<(() => void) | null>(null);

  // Native Android ML Kit Scanner States
  const [isNativeScannerAvailable, setIsNativeScannerAvailable] = useState(false);
  const [nativeScanning, setNativeScanning] = useState(false);
  const [nativeModuleDownloading, setNativeModuleDownloading] = useState(false);
  const [nativeModuleProgress, setNativeModuleProgress] = useState(0);

  // PDF processing concurrency lock
  const pdfProcessingLock = useRef(false);
  
  const [candidateDates, setCandidateDates] = useState<Array<{ label: string; date: string; type?: string; reason?: string }>>([]);
  const [cachedProcessedPages, setCachedProcessedPages] = useState<ProcessedPdfPage[] | null>(null);
  const [cachedPdfFile, setCachedPdfFile] = useState<File | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    document_type: "",
    issuing_authority: "",
    expiry_date: "",
    expiry_date_label: "",
    renewal_period_days: 30,
    notes: "",
    custom_reminder_date: "",
  });

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user]);

  const fetchOrganizations = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(collection(firebaseDb, "organizations"), where("ownerId", "==", uid))
      );
      setOrganizations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("[Scan] fetchOrganizations:", err);
    }
  };

  // Check Native Scanner availability on Android
  useEffect(() => {
    if (isNativeScannerSupported()) {
      setIsNativeScannerAvailable(true);
    }
  }, []);

  // Handle Android app restoration if OS destroyed activity while ML Kit was open
  useEffect(() => {
    const unregister = registerNativeScannerRestoration((output: NativeScanOutput) => {
      handleNativeScanCompleted(output);
    });
    return () => unregister();
  }, []);

  // Handle completed scan from Native ML Kit Document Scanner
  const handleNativeScanCompleted = async (output: NativeScanOutput) => {
    // Idempotent guard: ensure this scan session is processed only once
    if (isScanSessionProcessed(output.scanSessionId)) {
      console.log(
        "[Scan] handleNativeScanCompleted: scanSessionId already processed, ignoring duplicate invocation:",
        output.scanSessionId
      );
      return;
    }
    markScanSessionProcessed(output.scanSessionId);

    setOriginalFileName(output.file.name);

    if (output.type === "pdf") {
      pdfFileRef.current = output.file;
      setPdfFile(output.file);
      setExtracting(false);
      await handlePdfPipeline(output.file);
    } else {
      // Single-page image output
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setProcessedImage(result);
        setCapturedImage(result);
        extractDocumentData(result);
      };
      reader.readAsDataURL(output.file);
    }
  };

  const handleStartNativeScan = async () => {
    setError("");
    setNativeScanning(true);

    let output: NativeScanOutput | null = null;
    try {
      // 1. Check if Google ML Kit Document Scanner module is available
      const status = await checkGoogleScannerModule();
      if (!status.available) {
        toast({
          title: "Downloading Scanner Module",
          description: "Google Play Services is downloading the document scanner component...",
        });
        setNativeModuleDownloading(true);
        setNativeModuleProgress(0);

        const success = await installGoogleScannerModule((prog) => {
          setNativeModuleProgress(prog);
        });

        setNativeModuleDownloading(false);
        if (!success) {
          toast({
            title: "Download Incomplete",
            description: "Could not download the scanner component. Please use file upload or manual entry.",
            variant: "destructive",
          });
          return;
        }
      }

      // 2. Launch Google ML Kit Document Scanner
      output = await launchNativeDocumentScanner({
        pageLimit: 25,
        galleryImportAllowed: true,
      });

      if (!output) {
        // User cancelled scan; keep screen ready
        toast({
          title: "Scan Cancelled",
          description: "Document scan was cancelled.",
        });
      }
    } catch (err: any) {
      console.error("[Scan] Native scan error:", err);
      toast({
        title: "Scanner Launch Failed",
        description: err?.message || "Failed to start native scanner. You can use file upload or manual entry.",
        variant: "destructive",
      });
    } finally {
      // ALWAYS release nativeScanning when the native scanner activity returns,
      // independently of cloud extraction or PDF rendering.
      setNativeScanning(false);
      setNativeModuleDownloading(false);
    }

    // Process output outside the native scanner activity lock
    if (output) {
      await handleNativeScanCompleted(output);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting the same file fires onChange
    e.target.value = "";

    // 1. Reject files where file.size === 0
    if (file.size === 0) {
      toast({
        title: "Invalid File",
        description: "This file is empty. Choose a valid PDF, JPG, JPEG, or PNG.",
        variant: "destructive",
      });
      return;
    }

    // 2. Validate allowed MIME type and extension together
    const allowedExtensions = /\.(pdf|jpe?g|png)$/i;
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const hasValidExt = allowedExtensions.test(file.name);
    const hasValidMime = allowedMimeTypes.includes(file.type.toLowerCase()) || (!file.type && hasValidExt);

    if (!hasValidExt || !hasValidMime) {
      toast({
        title: "Unsupported File Type",
        description: "Choose a valid PDF, JPG, JPEG, or PNG.",
        variant: "destructive",
      });
      return;
    }

    try {
      setOriginalFileName(file.name);
      // Check if file is a PDF
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Store the ORIGINAL PDF file - NO conversion
        pdfFileRef.current = file;
        setPdfFile(file);
        setExtracting(false);
        await handlePdfPipeline(file);
      } else {
        // Handle image files directly
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setProcessedImage(result);
          setCapturedImage(result);
          extractDocumentData(result);
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setExtracting(false);
      const message = (error as Error)?.message || 'Failed to process the uploaded file. Please try again.';
      toast({
        title: "Upload Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  const autoSaveNoExpiry = async (extractedFields: any, finalCroppedImg: string | null, activePdfFile?: File | null) => {
    if (!user) return;
    setLoading(true);
    try {
      let imagePath = null;
      const targetPdf = activePdfFile || pdfFileRef.current || pdfFile;
      if (targetPdf) {
        imagePath = await uploadDocumentOriginal(targetPdf, user.uid);
      } else {
        const imageSrc = finalCroppedImg || processedImage || capturedImage;
        if (imageSrc) {
          const primaryBlob = await srcToImageBlob(imageSrc);
          const fileExt = primaryBlob.type === 'image/png' ? 'png' : 'jpg';
          const baseName = originalFileName ? originalFileName.replace(/\.[^/.]+$/, "") : "document";
          const imageFile = new File([primaryBlob], `${baseName}.${fileExt}`, { type: primaryBlob.type });
          imagePath = await uploadDocumentOriginal(imageFile, user.uid);
        }
      }

      if (!imagePath) {
        throw new Error("Failed to upload document file. Save aborted.");
      }

      // Map document type
      const documentTypeMap: Record<string, string> = {
        'drivers_license': 'license',
        'passport': 'passport',
        'work_permit_visa': 'permit',
        'insurance_policy': 'insurance',
        'other': 'other'
      };
      const mappedType = documentTypeMap[extractedFields.document_type] || 'other';
      const selectedOrgId = selectedOrg === "personal" ? null : selectedOrg;
      const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
      if (!uid) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      const docRef = await addDoc(collection(firebaseDb, `users/${uid}/documents`), {
        userId: uid,
        name: extractedFields.name || "Unnamed Document",
        documentType: mappedType,
        categoryDetail: extractedFields.document_type,
        issuingAuthority: "DocVault",
        originalAuthority: extractedFields.issuing_authority || null,
        docvaultCategoryId: null,
        expiryDate: null,
        expiryDateLabel: null,
        renewalPeriodDays: extractedFields.renewal_period_days || 30,
        notes: extractedFields.notes || "Saved automatically (no expiry date).",
        imagePath: imagePath,
        organizationId: selectedOrgId,
        createdAt: now,
        updatedAt: now,
      });

      toast({
        title: "Saved to DocVault",
        description: "This document does not have an expiry date, so it has been saved to DocVault.",
      });
      navigate(`/docvault`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Save failed",
        description: "Failed to automatically save document.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const extractDocumentData = async (imageBase64: string) => {
    setExtracting(true);
    setError("");
    
    try {
      // Keep the AI payload small — full-resolution camera data URLs routinely
      // exceed the edge function limit and fail on Android.
      const payloadImage = await shrinkDataUrl(imageBase64, 1600, 0.85);
      console.log("[SCAN DEBUG] extract request", {
        originalChars: imageBase64.length,
        payloadChars: payloadImage.length,
        country: documentCountry || null,
      });

      const scanFn = httpsCallable(firebaseFunctions, "scanDocument");
      const result: any = await scanFn({
        images: [payloadImage],
        country: documentCountry || null,
      });
      const data = result.data;

      if (data.success && data.data) {
        // Run decision engine
        const dec = evaluateDocumentDecision(
          data.data.document_type || "other",
          data.data,
          data.data.confidence || 0.9,
          data.data.fieldStatuses
        );
        setDecision(dec);

        if (dec.decision === 'NO_EXPIRY_AUTO_SAVE') {
          await autoSaveNoExpiry(data.data, imageBase64);
          return;
        }

        // Normalize expiry_date to ISO YYYY-MM-DD if present
        const rawExpiry = data.data.expiry_date;
        const normalizedExpiry = rawExpiry ? (formatToIsoDate(rawExpiry, documentCountry) || rawExpiry) : "";
        
        // Extract and set candidate dates
        if (Array.isArray(data.data.candidate_dates)) {
          setCandidateDates(data.data.candidate_dates);
        } else {
          setCandidateDates([]);
        }

        // Use detailed document type from AI as-is; we'll map it to enum on save
        const sanitizedNote = sanitizeDocumentNote(data.data.notes || "");
        setFormData(prev => ({
          ...prev,
          ...data.data,
          expiry_date: normalizedExpiry,
          notes: sanitizedNote,
          document_type: data.data.document_type,
        }));

        if (dec.decision === 'MISSING_REQUIRED_INFORMATION') {
          setError(dec.explanation);
          toast({
            title: "Missing Required Information",
            description: dec.explanation,
            variant: "destructive",
          });
        } else if (dec.decision === 'CONFLICT_REQUIRES_REVIEW') {
          setError(dec.explanation);
          toast({
            title: "Conflicts Detected",
            description: dec.explanation,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Document Scanned",
            description: "Document information extracted successfully. Please review and save.",
          });
        }
      } else {
        throw new Error(data.error || "Failed to extract document data");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[SCAN DEBUG] Extraction error:", detail, err);
      setError(`Could not read this document automatically (${detail}). Please enter the details manually.`);
      toast({
        title: "Extraction Failed",
        description: detail.slice(0, 160),
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  /**
   * PHASE 2 — document-level extraction, run ONCE on the combined content
   * of every processed page. Never called from inside the page loop.
   */
  const extractDocumentInformation = async (pages: ProcessedPdfPage[], activePdfFile?: File | null) => {
    setExtracting(true);
    setError("");
    setExtractionFailed(false);
    setCachedProcessedPages(pages);
    if (activePdfFile) setCachedPdfFile(activePdfFile);

    // Timeout guard so extraction never hangs indefinitely
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Document extraction timed out. Please try again or enter details manually.")), 45000)
    );

    try {
      const scanFn2 = httpsCallable(firebaseFunctions, "scanDocument");
      const scanPromise = scanFn2({
        pages: pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content })),
        country: documentCountry || null,
      });

      const result2: any = await Promise.race([scanPromise, timeoutPromise]);
      const data = result2.data;

      if (data?.success && data.data) {
        // Run decision engine
        const dec = evaluateDocumentDecision(
          data.data.document_type || "other",
          data.data,
          data.data.confidence || 0.9,
          data.data.fieldStatuses
        );
        setDecision(dec);

        if (dec.decision === 'NO_EXPIRY_AUTO_SAVE') {
          await autoSaveNoExpiry(data.data, null, activePdfFile);
          return;
        }

        // Normalize expiry_date to ISO YYYY-MM-DD if present
        const rawExpiry = data.data.expiry_date;
        const normalizedExpiry = rawExpiry ? (formatToIsoDate(rawExpiry, documentCountry) || rawExpiry) : "";

        // Extract and set candidate dates
        if (Array.isArray(data.data.candidate_dates)) {
          setCandidateDates(data.data.candidate_dates);
        } else {
          setCandidateDates([]);
        }

        const sanitizedNote = sanitizeDocumentNote(data.data.notes || "");
        setFormData((prev) => ({
          ...prev,
          ...data.data,
          expiry_date: normalizedExpiry,
          notes: sanitizedNote,
          document_type: data.data.document_type,
        }));

        if (dec.decision === 'MISSING_REQUIRED_INFORMATION') {
          setError(dec.explanation);
          toast({
            title: "Missing Required Information",
            description: dec.explanation,
            variant: "destructive",
          });
        } else if (dec.decision === 'CONFLICT_REQUIRES_REVIEW') {
          setError(dec.explanation);
          toast({
            title: "Conflicts Detected",
            description: dec.explanation,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Document Analyzed",
            description: `Information extracted from ${pages.length} page${pages.length > 1 ? "s" : ""}. Please review and save.`,
          });
        }
      } else {
        throw new Error(data?.error || "Unable to extract information from this document.");
      }
    } catch (err) {
      console.error("Document extraction error:", err);
      setExtractionFailed(true);
      setError("Upload succeeded, extraction failed. You can retry extraction or enter details manually.");
      toast({
        title: "Upload succeeded, extraction failed",
        description: "The file was successfully received, but AI extraction could not read the text. You can retry or enter details manually.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  /**
   * PHASE 1 then PHASE 2. Page failures are reported as page-processing errors
   * and never surface as extraction errors.
   *
   * Hardened with processing lock and complete try/catch/finally to guarantee
   * all loading, extracting, and phase flags are reset regardless of outcome.
   */
  const handlePdfPipeline = async (file: File) => {
    if (pdfProcessingLock.current) {
      console.warn("[Scan] handlePdfPipeline: already processing a PDF, ignoring concurrent call");
      return;
    }
    pdfProcessingLock.current = true;

    setError("");
    setPdfProgress({ current: 0, total: 0 });
    setPdfPhase("processing");

    try {
      let result;
      try {
        result = await processAllPages(file, (current, total) =>
          setPdfProgress({ current, total })
        );
      } catch (err) {
        console.error("PDF processing error:", err);
        setError("Unable to process this PDF. Please try another file or enter details manually.");
        toast({
          title: "PDF Processing Failed",
          description: "The PDF could not be opened. Please try another file.",
          variant: "destructive",
        });
        return;
      }

      if (result.failedPages.length > 0) {
        toast({
          title: "Some pages could not be processed",
          description: `Unable to process page${result.failedPages.length > 1 ? "s" : ""} ${result.failedPages.join(", ")}. Continuing with the remaining pages.`,
          variant: "destructive",
        });
      }

      if (result.pages.length === 0) {
        setError("None of the PDF pages could be processed.");
        return;
      }

      // Show first page as the document preview
      setCapturedImage(result.pages[0].content);
      setProcessedImage(result.pages[0].content);

      // PHASE 2 begins only after ALL pages are done
      setPdfPhase("analyzing");
      await extractDocumentInformation(result.pages, file);
    } catch (pipelineErr) {
      console.error("[Scan] handlePdfPipeline unhandled error:", pipelineErr);
      setError("An unexpected error occurred while processing the PDF.");
      toast({
        title: "Processing Failed",
        description: "An unexpected error occurred. Please try entering document details manually.",
        variant: "destructive",
      });
    } finally {
      // Guarantee all state flags and locks are cleanly reset
      setPdfPhase(null);
      setExtracting(false);
      pdfProcessingLock.current = false;
    }
  };

  const resetScan = () => {
    setCapturedImage(null);
    setProcessedImage(null);
    setOriginalFileName(null);
    pdfFileRef.current = null;
    setPdfFile(null);
    setCandidateDates([]);
    setCachedProcessedPages(null);
    setCachedPdfFile(null);
    setExtractionFailed(false);
    setFormData({
      name: "",
      document_type: "",
      issuing_authority: "",
      expiry_date: "",
      expiry_date_label: "",
      renewal_period_days: 30,
      notes: "",
      custom_reminder_date: "",
    });
  };

  const proceedWithSave = async () => {
    setLoading(true);
    setError("");

    try {
      const uid2 = firebaseAuth.currentUser?.uid ?? user?.uid;
      if (!uid2) {
        throw new Error("Authentication session expired. Please sign in again.");
      }

      const documentTypeMap: { [key: string]: string } = {
        'drivers_license': 'license',
        'professional_license': 'license',
        'software_license': 'license',
        'business_license': 'license',
        'passport': 'passport',
        'passport_renewal': 'passport',
        'permit': 'permit',
        'work_permit_visa': 'permit',
        'student_visa': 'permit',
        'permanent_residency': 'permit',
        'vehicle_registration': 'permit',
        'insurance': 'insurance',
        'insurance_policy': 'insurance',
        'health_card': 'insurance',
        'family_insurance': 'insurance',
        'certification': 'certification',
        'training_certificate': 'certification',
        'course_registration': 'certification',
        'other': 'other',
        'credit_card': 'other',
        'utility_bills': 'other',
        'loan_payment': 'other',
        'subscription': 'other',
        'joint_subscription': 'other',
        'bank_card': 'other',
        'health_checkup': 'other',
        'medication_refill': 'other',
        'pet_vaccination': 'other',
        'pet_care': 'other',
        'fitness_membership': 'other',
        'library_book': 'other',
        'warranty': 'other',
        'device_warranty': 'other',
        'home_maintenance': 'other',
        'tax_filing': 'other',
        'ticket_fines': 'tickets_and_fines',
        'voting_registration': 'other',
        'children_documents': 'other',
        'school_enrollment': 'other',
        'property_lease': 'other',
        'domain_name': 'other',
        'web_hosting': 'other',
        'cloud_storage': 'other',
        'password_security': 'other',
      };

      const mappedType = documentTypeMap[formData.document_type] || 'other';

      const validationResult = documentSchema.safeParse({
        ...formData,
        document_type: mappedType,
      });

      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => err.message).join(', ');
        throw new Error(errors);
      }

      const validatedData = validationResult.data;
      const safeNotes = sanitizeDocumentNote(validatedData.notes || "");
      
      let imagePath = null;
      
      try {
        if (pdfFile) {
          const maxSize = 20 * 1024 * 1024;
          if (pdfFile.size > maxSize) {
            throw new Error("PDF file size exceeds 20MB limit");
          }
          imagePath = await uploadDocumentOriginal(pdfFile, user.uid);
        } else if (scanMode === "manual" && capturedImage === "manual-placeholder") {
          // Manual entry without attachment: no image upload required
          imagePath = null;
        } else {
          // The final image MUST be the cropped image. NEVER upload the raw uncropped photo.
          const finalCroppedSrc = processedImage || capturedImage;
          if (!finalCroppedSrc) {
            throw new Error("A cropped document is required. Please scan and crop the document before saving.");
          }
          if (finalCroppedSrc && finalCroppedSrc !== "manual-placeholder") {
            const primaryBlob = await srcToImageBlob(finalCroppedSrc);
            const maxSize = 20 * 1024 * 1024;
            if (primaryBlob.size > maxSize) {
              throw new Error("Image file size exceeds 20MB limit");
            }
            const fileExt = primaryBlob.type === 'image/png' ? 'png' : 'jpg';
            const baseName = originalFileName ? originalFileName.replace(/\.[^/.]+$/, "") : "document";
            const imageFile = new File([primaryBlob], `${baseName}.${fileExt}`, { type: primaryBlob.type });
            imagePath = await uploadDocumentOriginal(imageFile, user.uid);
          }
        }
      } catch (uploadErr) {
        console.error('Error uploading document file:', uploadErr);
        toast({
          title: "Warning",
          description: uploadErr instanceof Error ? uploadErr.message : "Failed to upload document file, but document will be saved.",
          variant: "default",
        });
      }

      const selectedOrgId = selectedOrg === "personal" ? null : selectedOrg;

      if (replaceMode && replaceDocId) {
        const existingSnap = await getDoc(doc(firebaseDb, `users/${uid2}/documents/${replaceDocId}`));
        if (!existingSnap.exists()) throw new Error("Document not found");
        const existingImagePath = existingSnap.data()?.imagePath as string | null;

        if (existingImagePath && imagePath) {
          try {
            const { deleteObject: delObj } = await import("firebase/storage");
            await delObj(storageRef(firebaseStorage, existingImagePath));
            // Also clean up any legacy companion raw file if it existed
            try {
              const basePath = existingImagePath.substring(0, existingImagePath.lastIndexOf('/'));
              const ext = existingImagePath.split('.').pop() ?? 'jpg';
              await delObj(storageRef(firebaseStorage, `${basePath}/raw.${ext}`));
            } catch { /* ok if no legacy raw file exists */ }
          } catch { /* ok */ }
        }

        const now2 = new Date().toISOString();
        await updateDoc(doc(firebaseDb, `users/${uid2}/documents/${replaceDocId}`), {
          name:               validatedData.name,
          documentType:       validatedData.document_type,
          categoryDetail:     formData.document_type,
          issuingAuthority:   validatedData.issuing_authority ?? null,
          expiryDate:         validatedData.expiry_date         ?? null,
          expiryDateLabel:    (formData.expiry_date_label as string) || null,
          renewalPeriodDays:  validatedData.renewal_period_days,
          notes:              safeNotes,
          imagePath:          imagePath ?? existingImagePath,
          updatedAt:          now2,
        });

        toast({ title: "Document updated successfully" });
        navigate(`/documents/${replaceDocId}`);
        return;
      }

      const now3 = new Date().toISOString();

      // No expiry date → this is a DocVault document, not a reminder-tracked one.
      if (!validatedData.expiry_date) {
        await addDoc(collection(firebaseDb, `users/${uid2}/documents`), {
          userId:             uid2,
          name:               validatedData.name,
          documentType:       mappedType,
          categoryDetail:     formData.document_type,
          issuingAuthority:   "DocVault",
          originalAuthority:  validatedData.issuing_authority || null,
          docvaultCategoryId: null,
          expiryDate:         null,
          expiryDateLabel:    null,
          renewalPeriodDays:  validatedData.renewal_period_days,
          notes:              safeNotes
            ? `${safeNotes} (No expiry date — stored in DocVault.)`
            : "Saved to DocVault (no expiry date).",
          organizationId:     selectedOrgId,
          imagePath:          imagePath,
          createdAt:          now3,
          updatedAt:          now3,
        });

        toast({
          title: "Saved to DocVault",
          description: "This document does not have an expiry date, so it has been saved to DocVault.",
        });
        navigate(`/docvault`);
        return;
      }

      const newDocRef = await addDoc(collection(firebaseDb, `users/${uid2}/documents`), {
        userId:             uid2,
        name:               validatedData.name,
        documentType:       validatedData.document_type,
        categoryDetail:     formData.document_type,
        issuingAuthority:   validatedData.issuing_authority ?? null,
        expiryDate:         validatedData.expiry_date         ?? null,
        expiryDateLabel:    (formData.expiry_date_label as string) || null,
        renewalPeriodDays:  validatedData.renewal_period_days,
        notes:              safeNotes,
        organizationId:     selectedOrgId,
        imagePath:          imagePath,
        createdAt:          now3,
        updatedAt:          now3,
      });


      if (formData.custom_reminder_date) {
        await addDoc(collection(firebaseDb, `users/${uid2}/reminders`), {
          documentId:   newDocRef.id,
          userId:       uid2,
          reminderDate: formData.custom_reminder_date,
          isSent:       false,
          isCustom:     true,
          createdAt:    now3,
        });
      }

      // Fetch all reminders just created (by onDocumentWrite trigger or manual above)
      // and send confirmation emails
      const remSnap = await getDocs(
        query(collection(firebaseDb, `users/${uid2}/reminders`), where("documentId", "==", newDocRef.id))
      );
      for (const remDoc of remSnap.docs) {
        try {
          await httpsCallable(firebaseFunctions, "sendImmediateReminder")({ reminderId: remDoc.id });
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
        }
      }

      toast({ title: "Document added successfully" });
      navigate(`/documents/${newDocRef.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to save document. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Check if expired and needs confirmation
    const parsedExpiry = parseAndNormalizeDate(formData.expiry_date);
    if (parsedExpiry) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cleanExpiry = new Date(parsedExpiry);
      cleanExpiry.setHours(0, 0, 0, 0);
      
      if (cleanExpiry < today && !showExpiredConfirm) {
        setExpiredConfirmAction(() => () => proceedWithSave());
        setShowExpiredConfirm(true);
        return;
      }
    }

    await proceedWithSave();
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calculate AI-based reminder dates
  const calculateReminderDates = () => {
    if (!formData.expiry_date || !formData.renewal_period_days) return [];
    
    const renewalDays = formData.renewal_period_days;
    let reminderStages: number[] = [];
    
    if (renewalDays >= 90) {
      reminderStages = [60, 30, 7];
    } else if (renewalDays >= 30) {
      reminderStages = [30, 14, 3];
    } else if (renewalDays >= 14) {
      reminderStages = [14, 7, 2];
    } else {
      reminderStages = [7, 3, 1];
    }
    
    const expiryObj = parseCalendarDate(formData.expiry_date);
    if (!expiryObj) return [];

    return reminderStages.map(days => {
      const reminderDate = new Date(expiryObj.getTime() - days * 86400000);
      return {
        days,
        date: toCalendarDateString(reminderDate),
        formatted: formatCalendarDate(reminderDate)
      };
    });
  };

  const aiReminders = calculateReminderDates();

  return (
    <AppShell contentWidth="full">
      <PageHeader
        back={true}
        title={replaceMode ? "Update Document" : "Add Document"}
        description={replaceMode 
          ? "Scanning new version to replace existing" 
          : "Upload document or enter details manually"
        }
        className="max-w-2xl mx-auto"
      />

      <div className="px-4 py-3 space-y-3 max-w-2xl mx-auto">
        {/* Organization Selector */}
        {organizations.length > 0 && (
          <Card>
            <CardHeader className="p-3 space-y-1">
              <CardTitle className="text-base font-semibold">Organization Context</CardTitle>
              <CardDescription className="text-xs leading-tight">Choose where to add these documents</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Add documents to:</Label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal Documents</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scan Landing State & Upload Options */}
        {!capturedImage && !pdfPhase && (
          <div className="space-y-4">
            {/* Stage indicator */}
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-1">
              <span className="text-primary font-semibold">1. Capture / Upload</span>
              <span>→</span>
              <span>2. Process</span>
              <span>→</span>
              <span>3. Extract</span>
              <span>→</span>
              <span>4. Review & Save</span>
            </div>

            {/* Native Android ML Kit Scanner Card (when on Android) */}
            {isNativeScannerAvailable && (
              <div
                onClick={nativeScanning || nativeModuleDownloading ? undefined : handleStartNativeScan}
                className="p-4 rounded-2xl border-2 border-primary bg-primary/10 hover:bg-primary/15 transition-all cursor-pointer flex items-center gap-4 shadow-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md">
                  {nativeScanning || nativeModuleDownloading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Sparkles className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Google Document Scanner</h3>
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">Recommended</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {nativeModuleDownloading
                      ? `Downloading component (${nativeModuleProgress}%)...`
                      : "Multi-page scan, shadow removal & high-resolution PDF"}
                  </p>
                </div>
              </div>
            )}

            {/* Upload File card */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="p-4 rounded-2xl border-2 border-border/60 hover:border-border bg-card transition-all cursor-pointer flex items-center gap-4 shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-foreground">Upload file</h3>
                <p className="text-xs text-muted-foreground">Choose PDF or image document file</p>
              </div>
            </div>

            {/* Manual entry fallback option */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setScanMode("manual");
                  setCapturedImage("manual-placeholder");
                }}
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1.5"
              >
                Prefer manual entry without scanning? Click here
              </button>
            </div>
          </div>
        )}
        
        {/* Hidden file input for PDF/Image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* PDF processing progress (Phase 1) / analysis (Phase 2) */}
        {pdfPhase && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {pdfPhase === "processing" ? "Processing document" : "Analyzing complete document..."}
                  </p>
                  {pdfPhase === "processing" && pdfProgress.total > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Page {pdfProgress.current} of {pdfProgress.total}
                    </p>
                  )}
                </div>
              </div>
              {pdfPhase === "processing" && pdfProgress.total > 0 && (
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Captured Image / Upload Preview */}
        {capturedImage && (
          <Card>
            <CardContent className="p-3 space-y-3 md:p-4 md:space-y-4">
              {extracting ? (
                <ScanningEffect imageUrl={capturedImage} />
              ) : (
                <>
                  {capturedImage !== "manual-placeholder" ? (
                    <img src={capturedImage} alt="Document preview" className="w-full rounded-lg" />
                  ) : (
                    <div className="py-6 text-center border-2 border-dashed border-border rounded-lg bg-muted/20">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">No file attached</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Creating document details via manual entry</p>
                    </div>
                  )}
                  {extractionFailed && cachedProcessedPages && cachedProcessedPages.length > 0 && (
                    <Button
                      type="button"
                      variant="default"
                      className="w-full h-10 gap-2"
                      onClick={() => extractDocumentInformation(cachedProcessedPages, cachedPdfFile)}
                    >
                      <Sparkles className="h-4 w-4" />
                      Retry Extraction
                    </Button>
                  )}
                  <Button variant="outline" onClick={resetScan} className="w-full h-10">
                    {capturedImage === "manual-placeholder" ? "Cancel manual entry" : "Choose different document"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Form Section */}
        {(scanMode === "manual" || capturedImage) && !extracting && (
          <Card>
          <CardHeader className="p-3 space-y-1">
            <CardTitle className="text-base font-semibold">Document Information</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Document Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="e.g., Driver's License"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document_type">Document Type *</Label>
                <Select 
                  value={formData.document_type} 
                  onValueChange={(value) => handleInputChange("document_type", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 bg-background border border-border z-50">
                    <SelectItem value="passport_renewal">Passport Renewal</SelectItem>
                    <SelectItem value="drivers_license">Driver's License / ID Card</SelectItem>
                    <SelectItem value="vehicle_registration">Vehicle Registration / Insurance</SelectItem>
                    <SelectItem value="health_card">Health Card Renewal</SelectItem>
                    <SelectItem value="work_permit_visa">Work Permit / Visa</SelectItem>
                    <SelectItem value="student_visa">Student Visa / Study Permit</SelectItem>
                    <SelectItem value="permanent_residency">Permanent Residency Renewal</SelectItem>
                    <SelectItem value="business_license">Business License</SelectItem>
                    <SelectItem value="professional_license">Professional License</SelectItem>
                    <SelectItem value="training_certificate">Training Certificate</SelectItem>
                    <SelectItem value="course_registration">Course Registration</SelectItem>
                    <SelectItem value="tax_filing">Tax Filing Reminder</SelectItem>
                    <SelectItem value="ticket_fines">Ticket and Fines</SelectItem>
                    <SelectItem value="voting_registration">Voting Registration Check</SelectItem>
                    <SelectItem value="credit_card">Credit Card Renewal / Expiry</SelectItem>
                    <SelectItem value="insurance_policy">Insurance Policy</SelectItem>
                    <SelectItem value="family_insurance">Family Insurance</SelectItem>
                    <SelectItem value="utility_bills">Utility Bills</SelectItem>
                    <SelectItem value="loan_payment">Loan / EMI Payment</SelectItem>
                    <SelectItem value="subscription">Subscription Renewal</SelectItem>
                    <SelectItem value="joint_subscription">Joint Subscription</SelectItem>
                    <SelectItem value="bank_card">Bank Card / Debit Card</SelectItem>
                    <SelectItem value="health_checkup">Health Checkup / Dentist Appointment</SelectItem>
                    <SelectItem value="medication_refill">Medication Refill</SelectItem>
                    <SelectItem value="pet_vaccination">Pet Vaccination / License</SelectItem>
                    <SelectItem value="pet_care">Pet Care Renewal</SelectItem>
                    <SelectItem value="fitness_membership">Fitness Membership</SelectItem>
                    <SelectItem value="library_book">Library Book Return</SelectItem>
                    <SelectItem value="warranty">Warranty Expiration</SelectItem>
                    <SelectItem value="device_warranty">Device Warranty</SelectItem>
                    <SelectItem value="home_maintenance">Home Maintenance</SelectItem>
                    <SelectItem value="software_license">Software License</SelectItem>
                    <SelectItem value="children_documents">Children's Passport / ID</SelectItem>
                    <SelectItem value="school_enrollment">School Enrollment / Fee</SelectItem>
                    <SelectItem value="property_lease">Property Lease</SelectItem>
                    <SelectItem value="domain_name">Domain Name</SelectItem>
                    <SelectItem value="web_hosting">Website Hosting / SSL</SelectItem>
                    <SelectItem value="cloud_storage">Cloud Storage</SelectItem>
                    <SelectItem value="password_security">Password Change / Security Audit</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Category auto-detected by AI during scan, or select manually
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issuing_authority">Issuing Authority</Label>
                <Input
                  id="issuing_authority"
                  value={formData.issuing_authority}
                  onChange={(e) => handleInputChange("issuing_authority", e.target.value)}
                  placeholder="e.g., Department of Motor Vehicles"
                />
              </div>

              {/* Country-Specific Document Toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="country-toggle" className="text-base">
                      Document from another country?
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable country-specific renewal regulations
                    </p>
                  </div>
                  <Switch
                    id="country-toggle"
                    checked={enableCountrySelect}
                    onCheckedChange={(checked) => {
                      setEnableCountrySelect(checked);
                      if (!checked) {
                        setDocumentCountry("");
                      }
                    }}
                  />
                </div>
                
                {enableCountrySelect && (
                  <div className="space-y-2 pl-0">
                    <Label htmlFor="documentCountry">Country *</Label>
                    <Select value={documentCountry} onValueChange={setDocumentCountry}>
                      <SelectTrigger id="documentCountry">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {ALLOWED_COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      AI will use this country's specific renewal timelines
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry_date">{formData.expiry_date_label || "Expiry Date"}</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => handleInputChange("expiry_date", e.target.value)}
                />

                {candidateDates.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Detected Dates (tap to apply):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidateDates.map((cd, idx) => {
                        const iso = formatToIsoDate(cd.date, documentCountry) || cd.date;
                        const isSelected = formData.expiry_date === iso;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                expiry_date: iso,
                                expiry_date_label: cd.label || prev.expiry_date_label
                              }));
                            }}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 hover:bg-muted text-foreground border-border"
                            }`}
                          >
                            <span className="font-semibold">{cd.label || "Date"}:</span>
                            <span>{iso}</span>
                            {cd.type && (
                              <span className={`text-[10px] px-1 rounded ${
                                cd.type === 'expiry_or_due' ? 'bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground'
                              }`}>
                                {cd.type === 'expiry_or_due' ? 'actionable' : cd.type}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="renewal_period_days">
                  Renewal Period (Days) *
                </Label>
                <Input
                  id="renewal_period_days"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.renewal_period_days}
                  onChange={(e) => handleInputChange("renewal_period_days", parseInt(e.target.value))}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  AI will automatically create smart reminders based on this period
                </p>
              </div>

              {/* AI-Based Reminders Preview */}
              {aiReminders.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">🤖 AI-Powered Automatic Reminders</Label>
                  <div className="bg-accent/20 border border-accent rounded-lg p-4 space-y-2">
                    {aiReminders.map((reminder, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {reminder.days} days before {(formData.expiry_date_label || "expiry").toLowerCase()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {reminder.formatted}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">Auto</Badge>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-2">
                      These reminders are automatically optimized based on your renewal period
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  placeholder="Additional notes about this document..."
                  rows={3}
                  maxLength={5000}
                />
                <p className="text-sm text-muted-foreground">
                  {formData.notes?.length || 0}/5000 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom_reminder_date">
                  ➕ Custom Reminder (Optional)
                </Label>
                <Input
                  id="custom_reminder_date"
                  type="date"
                  value={formData.custom_reminder_date}
                  onChange={(e) => handleInputChange("custom_reminder_date", e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  For those who forget easily - add your own reminder date in addition to the 3 automatic ones
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Save Document
              </Button>
            </form>
          </CardContent>
        </Card>
        )}
      </div>

      {showExpiredConfirm && (
        <AlertDialog open={showExpiredConfirm} onOpenChange={setShowExpiredConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Document already expired</AlertDialogTitle>
              <AlertDialogDescription>
                The {formData.expiry_date_label?.toLowerCase() || "expiry date"} on this document is {formData.expiry_date}. This date has already passed.
                Do you still want to continue and save this document to DocVault?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowExpiredConfirm(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowExpiredConfirm(false);
                  if (expiredConfirmAction) expiredConfirmAction();
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppShell>
  );
}