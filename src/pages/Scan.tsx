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
import { ArrowLeft, Save, Loader2, Camera as CameraIcon, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { ScanningEffect } from "@/components/scan/ScanningEffect";
import { PDFPageSelector } from "@/components/scan/PDFPageSelector";
import { Camera } from "@capacitor/camera";
import { CameraResultType, CameraSource } from "@capacitor/camera";
import { uploadDocumentOriginal, getPDFPageCount } from "@/utils/documentStorage";
import { stopCameraStream, stopMediaStream, setupVideoElement, requestCamera, getCameraConstraints } from "@/utils/cameraCleanup";
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
  const [extracting, setExtracting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("personal");
  
  const [documentCountry, setDocumentCountry] = useState<string>("");
  const [enableCountrySelect, setEnableCountrySelect] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showPdfSelector, setShowPdfSelector] = useState(false);
  
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

  // Cleanup function for camera
  const cleanupCamera = useCallback(() => {
    // Stop all tracks from video element
    if (videoRef.current) {
      stopCameraStream(videoRef.current);
    }
    // Also stop the stream reference
    if (stream) {
      stopMediaStream(stream);
    }
    setStream(null);
  }, [stream]);

  // Start camera automatically when in camera mode
  useEffect(() => {
    if (scanMode === "camera" && !capturedImage) {
      startCamera();
    }
    
    // Cleanup on unmount or when dependencies change
    return () => {
      cleanupCamera();
    };
  }, [scanMode, capturedImage]);

  // Additional cleanup on component unmount
  useEffect(() => {
    return () => {
      // Force cleanup of any remaining camera resources
      if (videoRef.current) {
        stopCameraStream(videoRef.current);
      }
    };
  }, []);

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

  const stopCamera = useCallback(() => {
    // Stop video element stream
    if (videoRef.current) {
      stopCameraStream(videoRef.current);
    }
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
        const imageData = canvas.toDataURL("image/jpeg", 0.8);
        setCapturedImage(imageData);
        stopCamera();
        extractDocumentData(imageData);
      }
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
        setShowPdfSelector(true);
        setExtracting(false);
      } else {
        // Handle image files - store original
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
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

  const handlePDFPageSelect = (pageImageBase64: string) => {
    setShowPdfSelector(false);
    setCapturedImage(pageImageBase64);
    extractDocumentData(pageImageBase64);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
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
          const publicUrl = await uploadDocumentOriginal(pdfFile, user.id);
          if (publicUrl) {
            // Extract path from URL for database storage
            const urlObj = new URL(publicUrl);
            imagePath = urlObj.pathname.split('/storage/v1/object/public/document-images/')[1];
          }
        } else if (capturedImage) {
          // Upload ORIGINAL image - no compression
          const blob = await fetch(capturedImage).then(r => r.blob());
          
          const maxSize = 20 * 1024 * 1024;
          if (blob.size > maxSize) {
            throw new Error("Image file size exceeds 20MB limit");
          }
          
          const fileExt = (blob.type.split('/')[1]) || 'jpg';
          const imageFile = new File([blob], `document.${fileExt}`, { type: blob.type });
          
          const publicUrl = await uploadDocumentOriginal(imageFile, user.id);
          if (publicUrl) {
            const urlObj = new URL(publicUrl);
            imagePath = urlObj.pathname.split('/storage/v1/object/public/document-images/')[1];
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
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-2 sticky top-0 z-10">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
            stopCamera();
            navigate(-1);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {replaceMode ? "Update Document" : "Add Document"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {replaceMode 
                ? "Scanning new version to replace existing" 
                : scanMode === "camera" ? "Scan or upload" : "Manual entry"
              }
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-3 space-y-3 max-w-2xl mx-auto">
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

        {/* Camera Section */}
        {scanMode === "camera" && !capturedImage && (
          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!stream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="text-center space-y-2">
                      <CameraIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Starting camera...</p>
                    </div>
                  </div>
                )}
              </div>
              {stream && (
                <Button onClick={captureImage} className="w-full mt-3">
                  <CameraIcon className="h-4 w-4 mr-2" />
                  Capture Document
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mode Toggle - Three Buttons */}
        <div className="flex gap-1.5 w-full">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-9 text-xs px-1.5 flex-col gap-0.5"
            size="sm"
          >
            <Upload className="h-4 w-4" />
            <span className="text-[10px]">PDF</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-9 text-xs px-1.5 flex-col gap-0.5"
            size="sm"
          >
            <Upload className="h-4 w-4" />
            <span className="text-[10px]">Image</span>
          </Button>
          <Button
            variant={scanMode === "manual" ? "default" : "outline"}
            onClick={() => {
              setScanMode("manual");
              stopCamera();
              setCapturedImage(null);
            }}
            className="flex-1 h-9 text-xs px-1.5 flex-col gap-0.5"
            size="sm"
          >
            <Save className="h-4 w-4" />
            <span className="text-[10px]">Manual</span>
          </Button>
        </div>
        
        {/* Hidden file input for PDF/Image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* PDF Page Selector */}
        {pdfFile && showPdfSelector && (
          <PDFPageSelector
            file={pdfFile}
            onPageSelect={handlePDFPageSelect}
            onCancel={() => {
              setShowPdfSelector(false);
              setPdfFile(null);
              setExtracting(false);
            }}
          />
        )}

        {/* Captured Image Preview */}
        {capturedImage && (
          <Card>
            <CardContent className="p-3 space-y-3 md:p-4 md:space-y-4">
              {extracting ? (
                <ScanningEffect imageUrl={capturedImage} />
              ) : (
                <>
                  <img src={capturedImage} alt="Captured document" className="w-full rounded-lg" />
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
      </main>

      <BottomNavigation />
    </div>
  );
}