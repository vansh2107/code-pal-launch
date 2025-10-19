import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2, Camera, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { ScanningEffect } from "@/components/scan/ScanningEffect";

const documentSchema = z.object({
  name: z.string().min(1, "Document name is required"),
  document_type: z.string().min(1, "Document type is required"),
  issuing_authority: z.string().optional(),
  expiry_date: z.string().min(1, "Expiry date is required"),
  renewal_period_days: z.number().min(1, "Renewal period must be at least 1 day").max(365, "Renewal period cannot exceed 365 days"),
  notes: z.string().optional(),
});

export default function Scan() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("Camera error:", err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please use manual entry.",
        variant: "destructive",
      });
      setScanMode("manual");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setCapturedImage(result);
        extractDocumentData(result);
      };
      reader.readAsDataURL(file);
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
        // Validate and map document type to ensure it matches database enum
        const validTypes = ['license', 'passport', 'permit', 'insurance', 'certification', 'other'];
        let documentType = data.data.document_type;
        
        // If AI returned an invalid type, map it to 'other'
        if (!validTypes.includes(documentType)) {
          console.warn(`Invalid document type "${documentType}" returned, mapping to "other"`);
          documentType = 'other';
        }
        
        setFormData(prev => ({
          ...prev,
          ...data.data,
          document_type: documentType,
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

  const retakePhoto = () => {
    setCapturedImage(null);
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
      // Validate notes length
      if (formData.notes && formData.notes.length > 5000) {
        throw new Error('Notes cannot exceed 5000 characters');
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
      
      const validatedData = documentSchema.parse({
        ...formData,
        document_type: mappedType,
      });
      
      // Upload image to storage if available
      let imagePath = null;
      if (capturedImage) {
        const blob = await fetch(capturedImage).then(r => r.blob());
        const fileExt = blob.type.split('/')[1];
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('document-images')
          .upload(fileName, blob);
          
        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          toast({
            title: "Warning",
            description: "Failed to upload document image, but document will be saved.",
            variant: "default",
          });
        } else {
          imagePath = fileName;
        }
      }

      const selectedOrgId = selectedOrg === "personal" ? null : selectedOrg;

      const { data, error } = await supabase
        .from('documents')
        .insert({
          name: validatedData.name,
          document_type: validatedData.document_type as any,
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

      // Create 3 AI-based intelligent reminders based on renewal period
      const renewalDays = validatedData.renewal_period_days;
      let reminderStages: number[] = [];
      
      // AI-based logic: Create smart reminders based on renewal period
      if (renewalDays >= 90) {
        // Long renewal periods: 60, 30, 7 days
        reminderStages = [60, 30, 7];
      } else if (renewalDays >= 30) {
        // Medium renewal periods: 30, 14, 3 days
        reminderStages = [30, 14, 3];
      } else if (renewalDays >= 14) {
        // Short renewal periods: 14, 7, 2 days
        reminderStages = [14, 7, 2];
      } else {
        // Very short: 7, 3, 1 days
        reminderStages = [7, 3, 1];
      }
      
      const reminders = reminderStages.map(days => {
        const reminderDate = new Date(validatedData.expiry_date);
        reminderDate.setDate(reminderDate.getDate() - days);
        return {
          document_id: data.id,
          user_id: user?.id,
          reminder_date: reminderDate.toISOString().split('T')[0],
        };
      });
      
      // Add custom reminder if provided
      if (formData.custom_reminder_date) {
        reminders.push({
          document_id: data.id,
          user_id: user?.id,
          reminder_date: formData.custom_reminder_date,
          is_custom: true,
        } as any);
      }

      await supabase.from('reminders').insert(reminders);

      toast({
        title: "Document added successfully",
        description: "Your document has been saved and reminders are set up.",
      });

      navigate(`/document/${data.id}`);
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
      <header className="bg-card border-b border-border px-4 py-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => {
            stopCamera();
            navigate(-1);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Add Document</h1>
            <p className="text-muted-foreground">
              {scanMode === "camera" ? "Scan or upload" : "Manual entry"}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-4">
        {/* Country Selector for Multi-Country Support */}
        <Card>
          <CardHeader>
            <CardTitle>Document Country</CardTitle>
            <CardDescription>Select the country for country-specific renewal regulations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
              <p className="text-sm text-muted-foreground">
                AI will use this country's specific renewal timelines and regulations
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Organization Selector */}
        {organizations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Organization Context</CardTitle>
              <CardDescription>Choose where to add these documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Add documents to:</Label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger>
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

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={scanMode === "camera" ? "default" : "outline"}
            onClick={() => {
              setScanMode("camera");
              setCapturedImage(null);
            }}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan
          </Button>
          <Button
            variant={scanMode === "manual" ? "default" : "outline"}
            onClick={() => {
              setScanMode("manual");
              stopCamera();
              setCapturedImage(null);
            }}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            Manual
          </Button>
        </div>

        {/* Camera/Upload Section */}
        {scanMode === "camera" && !capturedImage && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  onLoadedMetadata={startCamera}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </CardContent>
          </Card>
        )}

        {/* Captured Image Preview */}
        {capturedImage && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {extracting ? (
                <ScanningEffect imageUrl={capturedImage} />
              ) : (
                <>
                  <img src={capturedImage} alt="Captured document" className="w-full rounded-lg" />
                  <Button variant="outline" onClick={retakePhoto} className="w-full">
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
          <CardHeader>
            <CardTitle>Document Information</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <SelectItem value="license">License (Driver's License, Professional, Business)</SelectItem>
                    <SelectItem value="passport">Passport & Travel Documents</SelectItem>
                    <SelectItem value="permit">Permit (Work, Visa, Vehicle Registration)</SelectItem>
                    <SelectItem value="insurance">Insurance & Health Cards</SelectItem>
                    <SelectItem value="certification">Certification & Training</SelectItem>
                    <SelectItem value="other">Other (Cards, Subscriptions, Bills, etc.)</SelectItem>
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