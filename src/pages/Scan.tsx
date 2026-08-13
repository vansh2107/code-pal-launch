import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Camera as CameraIcon, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, PageHeader } from "@/components/layout/";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { ScanningEffect } from "@/components/scan/ScanningEffect";
import { processAllPages, type ProcessedPdfPage } from "@/utils/pdfPageProcessor";
import { DocumentScanPreview } from "@/components/scan/DocumentScanPreview";
import { Camera } from "@capacitor/camera";
import { CameraResultType, CameraSource } from "@capacitor/camera";
import { uploadDocumentOriginal, getPDFPageCount } from "@/utils/documentStorage";
import { stopCamera as stopCameraManager, forceStopAllCameras, getCameraConstraints, setupVideoElement, requestCamera, stopMediaStream } from "@/utils/cameraManager";
// PDF.js imports for Vite: use worker URL provided by bundler
// @ts-ignore - path is provided by pdfjs-dist package
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

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
    .min(1, "Expiry date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  renewal_period_days: z.number()
    .min(1, "Renewal period must be at least 1 day")
    .max(365, "Renewal period cannot exceed 365 days"),
  notes: z.string()
    .trim()
    .max(5000, "Notes cannot exceed 5000 characters")
    .optional()
    .or(z.literal("")),
});

export default function Scan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const replaceMode = searchParams.get("mode") === "replace";
  const replaceDocId = searchParams.get("docId");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("personal");
  const mountedRef = useRef(true);
  
  const [documentCountry, setDocumentCountry] = useState<string>("");
  const [enableCountrySelect, setEnableCountrySelect] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPhase, setPdfPhase] = useState<null | "processing" | "analyzing">(null);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  
  const [formData, setFormData] = useState({
    name: "",
    document_type: "",
    issuing_authority: "",
    expiry_date: "",
    renewal_period_days: 30,
    notes: "",
    custom_reminder_date: "",
  });

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user]);

  // CRITICAL: Force cleanup camera on unmount
  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    console.log('[Scan] Mounting');
    
    return () => {
      cancelled = true;
      mountedRef.current = false;
      console.log('[Scan] Unmounting, cleaning up camera...');
      
      // Stop this page's camera
      stopCameraManager(videoRef.current);
      
      // Force stop all cameras as safety net
      forceStopAllCameras();
    };
  }, []);

  // Cleanup function for camera
  const cleanupCamera = useCallback(() => {
    console.log('[Scan] Cleaning up camera...');
    stopCameraManager(videoRef.current);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setStream(null);
  }, [stream]);

  // Start camera automatically when in camera mode
  useEffect(() => {
    if (scanMode === "camera" && !capturedImage && mountedRef.current) {
      startCamera();
    }
    
    return () => {
      cleanupCamera();
    };
  }, [scanMode, capturedImage]);

  const fetchOrganizations = async () => {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('name');
    
    if (data) {
      setOrganizations(data);
    }
  };

  const startCamera = async () => {
    try {
      // Check if we're on a native platform (Capacitor)
      const isNative = typeof (window as any).Capacitor !== 'undefined' && 
                       (window as any).Capacitor.isNativePlatform?.();
      
      // Only request Capacitor permissions on native platforms
      if (isNative) {
        try {
          const permission = await Camera.requestPermissions();
          if (permission.camera === 'denied') {
            throw new Error('Camera permission denied');
          }
        } catch (permErr) {
          console.warn("Capacitor permission request failed, trying browser API:", permErr);
        }
      }

      // Setup video element for autoplay compatibility (Chrome requirement)
      if (videoRef.current) {
        setupVideoElement(videoRef.current);
      }

      // Use browser's getUserMedia API with proper constraints
      const constraints = getCameraConstraints('environment', false);
      const mediaStream = await requestCamera(constraints);
      
      if (!mediaStream) {
        throw new Error('Failed to access camera');
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Wait for video to be ready then play
        await new Promise<void>((resolve) => {
          if (!videoRef.current) {
            resolve();
            return;
          }
          videoRef.current.onloadedmetadata = () => resolve();
          setTimeout(resolve, 2000); // Timeout fallback
        });
        
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Video play failed:", playErr);
        }
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("Camera error:", err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please grant camera permission or use manual entry.",
        variant: "destructive",
      });
      setScanMode("manual");
    }
  };

  const stopCameraLocal = useCallback(() => {
    // Stop video element stream
    stopCameraManager(videoRef.current);
    // Stop tracked stream
    if (stream) {
      stopMediaStream(stream);
      setStream(null);
    }
  }, [stream]);

  const captureImage = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        // Capture at full quality for scanning
        const imageData = canvas.toDataURL("image/jpeg", 1.0);
        setRawCapturedImage(imageData);
        setShowScanPreview(true);
        stopCameraLocal();
      }
    }
  };

  // Handle scan preview confirmation
  const handleScanConfirm = (scannedImage: string) => {
    setProcessedImage(scannedImage);
    setCapturedImage(scannedImage);
    setShowScanPreview(false);
    extractDocumentData(scannedImage);
  };

  // Handle scan preview retake
  const handleScanRetake = () => {
    setRawCapturedImage(null);
    setProcessedImage(null);
    setCapturedImage(null);
    setShowScanPreview(false);
    if (scanMode === "camera") {
      startCamera();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Check if file is a PDF
      if (file.type === 'application/pdf') {
        // Store the ORIGINAL PDF file - NO conversion
        setPdfFile(file);
        setExtracting(false);
        await handlePdfPipeline(file);
      } else {
        // Handle image files - show scan preview
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setRawCapturedImage(result);
          setShowScanPreview(true);
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

  const extractDocumentData = async (imageBase64: string) => {
    setExtracting(true);
    setError("");
    
    try {
      const { data, error } = await supabase.functions.invoke("scan-document", {
        body: { 
          imageBase64,
          country: documentCountry || null
        },
      });

      if (error) throw error;

      if (data.success && data.data) {
        // Use detailed document type from AI as-is; we'll map it to enum on save
        setFormData(prev => ({
          ...prev,
          ...data.data,
          document_type: data.data.document_type,
        }));
        toast({
          title: "Document Scanned",
          description: "Document information extracted successfully. Please review and save.",
        });
      } else {
        throw new Error(data.error || "Failed to extract document data");
      }
    } catch (err) {
      console.error("Extraction error:", err);
      setError("Failed to extract document data. Please enter manually.");
      toast({
        title: "Extraction Failed",
        description: "Please enter document details manually.",
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
  const extractDocumentInformation = async (pages: ProcessedPdfPage[]) => {
    setExtracting(true);
    setError("");

    try {
      const { data, error } = await supabase.functions.invoke("scan-document", {
        body: {
          pages: pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content })),
          country: documentCountry || null,
        },
      });

      if (error) throw error;

      if (data?.success && data.data) {
        setFormData((prev) => ({
          ...prev,
          ...data.data,
          document_type: data.data.document_type,
        }));
        toast({
          title: "Document Analyzed",
          description: `Information extracted from ${pages.length} page${pages.length > 1 ? "s" : ""}. Please review and save.`,
        });
      } else {
        throw new Error(data?.error || "Unable to extract information from this document.");
      }
    } catch (err) {
      console.error("Document extraction error:", err);
      setError("Unable to extract information from this document. Please enter details manually.");
      toast({
        title: "Unable to extract information",
        description: "All pages were processed, but the document details could not be read. Please enter them manually.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  /**
   * PHASE 1 then PHASE 2. Page failures are reported as page-processing errors
   * and never surface as extraction errors.
   */
  const handlePdfPipeline = async (file: File) => {
    setError("");
    setPdfProgress({ current: 0, total: 0 });
    setPdfPhase("processing");

    let result;
    try {
      result = await processAllPages(file, (current, total) =>
        setPdfProgress({ current, total })
      );
    } catch (err) {
      console.error("PDF processing error:", err);
      setPdfPhase(null);
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
      setPdfPhase(null);
      setError("None of the PDF pages could be processed.");
      return;
    }

    // Show first page as the document preview
    setCapturedImage(result.pages[0].content);
    setProcessedImage(result.pages[0].content);

    // PHASE 2 begins only after ALL pages are done
    setPdfPhase("analyzing");
    await extractDocumentInformation(result.pages);
    setPdfPhase(null);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setRawCapturedImage(null);
    setProcessedImage(null);
    setShowScanPreview(false);
    setPdfFile(null);
    setFormData({
      name: "",
      document_type: "",
      issuing_authority: "",
      expiry_date: "",
      renewal_period_days: 30,
      notes: "",
      custom_reminder_date: "",
    });
    if (scanMode === "camera") {
      startCamera();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      // Ensure session is valid before inserting
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Authentication session expired. Please sign in again.");
      }
      // Map specific document types to database enum types
      const documentTypeMap: { [key: string]: string } = {
        // License types
        'drivers_license': 'license',
        'professional_license': 'license',
        'software_license': 'license',
        'business_license': 'license',
        
        // Passport types
        'passport': 'passport',
        'passport_renewal': 'passport',
        
        // Permit types
        'permit': 'permit',
        'work_permit_visa': 'permit',
        'student_visa': 'permit',
        'permanent_residency': 'permit',
        'vehicle_registration': 'permit',
        
        // Insurance types
        'insurance': 'insurance',
        'insurance_policy': 'insurance',
        'health_card': 'insurance',
        'family_insurance': 'insurance',
        
        // Certification types
        'certification': 'certification',
        'training_certificate': 'certification',
        'course_registration': 'certification',
        
        // Other catch-all
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

      // Map the document type to valid enum
      const mappedType = documentTypeMap[formData.document_type] || 'other';
      console.log(`Mapping document type: ${formData.document_type} -> ${mappedType}`);
      
      // Validate all input data with zod schema
      const validationResult = documentSchema.safeParse({
        ...formData,
        document_type: mappedType,
      });

      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => err.message).join(', ');
        throw new Error(errors);
      }

      const validatedData = validationResult.data;
      
      // Upload ORIGINAL file with NO compression
      let imagePath = null;
      
      try {
        if (pdfFile) {
          // Validate PDF file size (max 20MB)
          const maxSize = 20 * 1024 * 1024;
          if (pdfFile.size > maxSize) {
            throw new Error("PDF file size exceeds 20MB limit");
          }
          
          // Upload ORIGINAL PDF - no conversion, no compression
          // uploadDocumentOriginal now returns the file path directly
          imagePath = await uploadDocumentOriginal(pdfFile, user.id);
        } else if (capturedImage) {
          // Upload ORIGINAL image - no compression
          const blob = await fetch(capturedImage).then(r => r.blob());
          
          const maxSize = 20 * 1024 * 1024;
          if (blob.size > maxSize) {
            throw new Error("Image file size exceeds 20MB limit");
          }
          
          const fileExt = (blob.type.split('/')[1]) || 'jpg';
          const imageFile = new File([blob], `document.${fileExt}`, { type: blob.type });
          
          // uploadDocumentOriginal now returns the file path directly
          imagePath = await uploadDocumentOriginal(imageFile, user.id);
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

      // Check if we're in replace mode
      if (replaceMode && replaceDocId) {
        // Get existing document to delete old image if needed
        const { data: existingDoc, error: fetchError } = await supabase
          .from('documents')
          .select('image_path')
          .eq('id', replaceDocId)
          .single();

        if (fetchError) throw fetchError;

        // Delete old image if exists and we have a new one
        if (existingDoc?.image_path && imagePath) {
          await supabase.storage
            .from('document-images')
            .remove([existingDoc.image_path]);
        }

        // Update existing document
        const { data, error } = await supabase
          .from('documents')
          .update({
            name: validatedData.name,
            document_type: validatedData.document_type as any,
            category_detail: formData.document_type,
            issuing_authority: validatedData.issuing_authority,
            expiry_date: validatedData.expiry_date,
            renewal_period_days: validatedData.renewal_period_days,
            notes: validatedData.notes,
            image_path: imagePath || existingDoc?.image_path,
            updated_at: new Date().toISOString(),
          })
          .eq('id', replaceDocId)
          .select()
          .single();

        if (error) throw error;

        // Show GenZ toast
        const genZMessages = [
          "W bro 😎🔥 renewal god!",
          "No cap, you're actually adulting 💼😂",
          "Sigma move right there 🗿🔥",
          "Your future self just said thanks 🤝",
          "Good job bro… your documents cleaner than your room 💀",
          "You're cooking fr 🧑‍🍳🔥",
          "Huge W, keep grinding ⚡",
          "Okay productivity KING 🤌🔥"
        ];
        
        toast({
          title: genZMessages[Math.floor(Math.random() * genZMessages.length)],
          duration: 3000,
        });

        navigate(`/documents/${data.id}`);
        return;
      }

      // Create new document (original flow)
      const { data, error } = await supabase
        .from('documents')
        .insert({
          name: validatedData.name,
          document_type: validatedData.document_type as any,
          category_detail: formData.document_type,
          issuing_authority: validatedData.issuing_authority,
          expiry_date: validatedData.expiry_date,
          renewal_period_days: validatedData.renewal_period_days,
          notes: validatedData.notes,
          user_id: user.id,
          organization_id: selectedOrgId,
          image_path: imagePath,
        })
        .select()
        .single();

      if (error) throw error;

      // Database trigger automatically creates reminders based on renewal_period_days
      // Only add custom reminder if user provided one
      if (formData.custom_reminder_date) {
        const { error: customReminderError } = await supabase
          .from('reminders')
          .insert({
            document_id: data.id,
            user_id: user.id,
            reminder_date: formData.custom_reminder_date,
            is_custom: true,
          });

        if (customReminderError) {
          console.error('Error creating custom reminder:', customReminderError);
          // Don't fail the whole operation if custom reminder fails
        }
      }

      // Fetch all reminders for this document (auto-created by trigger + custom)
      const { data: allReminders } = await supabase
        .from('reminders')
        .select('*')
        .eq('document_id', data.id);

      // Send immediate confirmation emails for all reminders
      if (allReminders && allReminders.length > 0) {
        for (const reminder of allReminders) {
          try {
            await supabase.functions.invoke('send-immediate-reminder', {
              body: { reminder_id: reminder.id }
            });
          } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
            // Don't fail the whole operation if email fails
          }
        }
      }

      toast({
        title: "Document added successfully",
        description: "Your document has been saved and reminder confirmation emails sent.",
      });

      navigate(`/documents/${data.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("Failed to save document. Please try again.");
        console.error('Error saving document:', err);
      }
    } finally {
      setLoading(false);
    }
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
    
    return reminderStages.map(days => {
      const reminderDate = new Date(formData.expiry_date);
      reminderDate.setDate(reminderDate.getDate() - days);
      return {
        days,
        date: reminderDate.toISOString().split('T')[0],
        formatted: reminderDate.toLocaleDateString()
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
          : scanMode === "camera" ? "Scan or upload" : "Manual entry"
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
        {!capturedImage && !showScanPreview && !pdfPhase && (
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

            {/* Mode selection cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div 
                onClick={() => {
                  setScanMode("camera");
                  startCamera();
                }}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                  scanMode === "camera" 
                    ? "border-primary bg-primary/5 shadow-sm" 
                    : "border-border/60 hover:border-border bg-card"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CameraIcon className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-foreground">Scan document</h3>
                  <p className="text-xs text-muted-foreground">Use your camera with auto-edge detection</p>
                </div>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-2xl border-2 border-border/60 hover:border-border bg-card transition-all cursor-pointer flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-foreground">Upload file</h3>
                  <p className="text-xs text-muted-foreground">Choose PDF or image document file</p>
                </div>
              </div>
            </div>

            {/* Manual entry fallback option */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setScanMode("manual");
                  stopCameraLocal();
                  setCapturedImage("manual-placeholder");
                }}
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1.5"
              >
                Prefer manual entry without scanning? Click here
              </button>
            </div>
          </div>
        )}

        {/* Camera Section */}
        {scanMode === "camera" && !capturedImage && !showScanPreview && !pdfPhase && (
          <Card className="border-border/60 shadow-md overflow-hidden rounded-2xl">
            <CardContent className="p-0">
              <div className="p-3 bg-muted/40 border-b border-border/50 text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  Place the document inside the frame. Keep the document flat and well lit.
                </p>
              </div>
              <div className="relative aspect-[4/3] bg-black overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!stream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground font-medium">Starting camera...</p>
                    </div>
                  </div>
                )}
                {/* Corner guide brackets */}
                <div className="absolute top-6 left-6 w-10 h-10 border-t-2 border-l-2 border-primary/80 rounded-tl-lg pointer-events-none" />
                <div className="absolute top-6 right-6 w-10 h-10 border-t-2 border-r-2 border-primary/80 rounded-tr-lg pointer-events-none" />
                <div className="absolute bottom-6 left-6 w-10 h-10 border-b-2 border-l-2 border-primary/80 rounded-bl-lg pointer-events-none" />
                <div className="absolute bottom-6 right-6 w-10 h-10 border-b-2 border-r-2 border-primary/80 rounded-br-lg pointer-events-none" />
              </div>
              {stream && (
                <div className="p-4 bg-card flex justify-center items-center">
                  <Button 
                    onClick={captureImage} 
                    className="h-14 px-8 rounded-full text-base font-semibold shadow-lg hover:shadow-xl transition-all"
                    size="lg"
                  >
                    <CameraIcon className="h-5 w-5 mr-2" />
                    Capture Document
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
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

        {/* Document Scan Preview - CamScanner-style processing */}
        {showScanPreview && rawCapturedImage && (
          <DocumentScanPreview
            imageSource={rawCapturedImage}
            onConfirm={handleScanConfirm}
            onRetake={handleScanRetake}
          />
        )}

        {/* Captured Image Preview (after scan processing) */}
        {capturedImage && !showScanPreview && (
          <Card>
            <CardContent className="p-3 space-y-3 md:p-4 md:space-y-4">
              {extracting ? (
                <ScanningEffect imageUrl={capturedImage} />
              ) : (
                <>
                  <img src={capturedImage} alt="Scanned document" className="w-full rounded-lg" />
                  <Button variant="outline" onClick={retakePhoto} className="w-full h-10">
                    Retake Photo
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
                        <SelectItem value="India">India</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="United States">United States</SelectItem>
                        <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                        <SelectItem value="Australia">Australia</SelectItem>
                        <SelectItem value="Germany">Germany</SelectItem>
                        <SelectItem value="France">France</SelectItem>
                        <SelectItem value="Japan">Japan</SelectItem>
                        <SelectItem value="China">China</SelectItem>
                        <SelectItem value="Brazil">Brazil</SelectItem>
                        <SelectItem value="Mexico">Mexico</SelectItem>
                        <SelectItem value="South Africa">South Africa</SelectItem>
                        <SelectItem value="Singapore">Singapore</SelectItem>
                        <SelectItem value="UAE">UAE</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      AI will use this country's specific renewal timelines
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry Date *</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => handleInputChange("expiry_date", e.target.value)}
                  required
                />
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
                              {reminder.days} days before expiry
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
    </AppShell>
  );
}