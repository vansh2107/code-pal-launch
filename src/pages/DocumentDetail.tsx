import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Edit2, Trash2, Calendar, Building, FileText, Clock, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { PDFPreview } from "@/components/document/PDFPreview";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, PageHeader } from "@/components/layout/";
import { toast } from "@/hooks/use-toast";
import { DocumentHistory } from "@/components/document/DocumentHistory";
import { AIInsights } from "@/components/document/AIInsights";
import { RenewalAdvisor } from "@/components/ai/RenewalAdvisor";
import { DocumentViewer } from "@/components/document/DocumentViewer";
import { RenewalOptionsSheet } from "@/components/document/RenewalOptionsSheet";
import { getDocumentStatus } from "@/utils/documentStatus";
import { sanitizeDocumentNote } from "@/utils/documentNotes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Document {
  id: string;
  name: string;
  document_type: string;
  category_detail?: string;
  issuing_authority: string;
  expiry_date: string | null;
  renewal_period_days: number;
  notes: string;
  created_at: string;
  updated_at: string;
  image_path: string | null;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [renewalAdvice, setRenewalAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [renewalSheetOpen, setRenewalSheetOpen] = useState(false);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [viewOriginal, setViewOriginal] = useState(true);

  useEffect(() => {
    if (user && id) {
      fetchDocument();
    }
  }, [user, id]);

  useEffect(() => {
    if (document && !document.issuing_authority?.includes('DocVault')) {
      fetchRenewalAdvice();
    }
  }, [document]);

  const fetchRenewalAdvice = async () => {
    if (!document) return;
    
    setLoadingAdvice(true);
    try {
      const { data, error } = await supabase.functions.invoke('document-renewal-advisor', {
        body: {
          documentType: document.document_type,
          documentName: document.name,
          expiryDate: document.expiry_date,
        }
      });

      if (!error && data?.advice) {
        setRenewalAdvice(data.advice);
      }
    } catch (error) {
      console.error('Error fetching renewal advice:', error);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const extractRecommendedDays = (adviceText: string): number | null => {
    const match = adviceText.match(/Recommended renewal start:\s*(\d+)\s*days/i);
    return match ? parseInt(match[1]) : null;
  };

  const getSubCategoryName = (subTypeId: string): string => {
    const nameMap: Record<string, string> = {
      passport: "Passport",
      license: "License",
      permit: "Permit",
      insurance: "Insurance",
      certification: "Certification",
      passport_renewal: "Passport Renewal",
      drivers_license: "Driver's License / ID Card",
      vehicle_registration: "Vehicle Registration / Insurance",
      health_card: "Health Card Renewal",
      work_permit_visa: "Work Permit / Visa / Study Permit",
      permanent_residency: "Permanent Residency",
      business_license: "Business License",
      tax_filing: "Tax Filing",
      ticket_fines: "Tickets and Fines",
      voting_registration: "Voting Registration",
      credit_card: "Credit Card",
      insurance_policy: "Insurance Policy",
      utility_bills: "Utility Bills",
      loan_payment: "Loan / EMI Payment",
      subscription: "Subscription",
      bank_card: "Bank Card",
      health_checkup: "Health Checkup",
      medication_refill: "Medication Refill",
      pet_vaccination: "Pet Vaccination",
      fitness_membership: "Fitness Membership",
      library_book: "Library Book",
      warranty: "Warranty",
      home_maintenance: "Home Maintenance",
      professional_license: "Professional License",
      training_certificate: "Training Certificate",
      software_license: "Software License",
      student_visa: "Student Visa",
      course_registration: "Course Registration",
      children_documents: "Children's Documents",
      school_enrollment: "School Enrollment",
      family_insurance: "Family Insurance",
      joint_subscription: "Joint Subscription",
      pet_care: "Pet Care",
      property_lease: "Property Lease",
      domain_name: "Domain Name",
      web_hosting: "Web Hosting / SSL",
      cloud_storage: "Cloud Storage",
      device_warranty: "Device Warranty",
      password_security: "Password Security",
      other: "Other"
    };
    return nameMap[subTypeId] || subTypeId.replace('_', ' ');
  };

  const calculateStartDate = (days: number, expiryDate: string): string => {
    const expiry = new Date(expiryDate);
    const startDate = new Date(expiry);
    startDate.setDate(startDate.getDate() - days);
    return startDate.toLocaleDateString();
  };

  const fetchDocument = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Document not found",
          description: "The requested document could not be found or you don't have permission to view it.",
          variant: "destructive",
        });
        navigate('/documents');
        return;
      }
      
      const normalizedDocument = {
        ...data,
        notes: sanitizeDocumentNote(data.notes || "")
      };

      setDocument(normalizedDocument);
      
      // Fetch signed URL for document image if it exists
      if (data.image_path) {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from('document-images')
          .createSignedUrl(data.image_path, 3600); // 1 hour expiry
        
        if (urlError) {
          console.error('Error getting signed URL:', urlError);
        } else if (signedUrlData) {
          setImageUrl(signedUrlData.signedUrl);
        }

        // Try to fetch signed URL for the companion processed image if it exists
        try {
          const ext = data.image_path.split('.').pop() || 'jpg';
          const basePath = data.image_path.substring(0, data.image_path.lastIndexOf('/'));
          const processedPath = `${basePath}/processed.${ext}`;
          
          const { data: processedUrlData, error: processedUrlError } = await supabase.storage
            .from('document-images')
            .createSignedUrl(processedPath, 3600);
            
          if (!processedUrlError && processedUrlData) {
            setProcessedImageUrl(processedUrlData.signedUrl);
          }
        } catch (err) {
          console.warn("No processed image found:", err);
        }
      }
    } catch (error: any) {
      console.error('Error fetching document:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load document. Please try again.",
        variant: "destructive",
      });
      navigate('/documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete document image from storage if exists
      if (document?.image_path) {
        await supabase.storage
          .from('document-images')
          .remove([document.image_path]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Document deleted",
        description: "The document has been permanently deleted.",
      });
      
      navigate('/documents');
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: "Delete failed",
        description: error?.message || "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusInfo = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return {
        badge: <Badge variant="destructive">Expired</Badge>,
        message: `Expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) !== 1 ? 's' : ''} ago`,
        variant: "destructive" as const
      };
    } else if (daysUntilExpiry <= 30) {
      return {
        badge: <Badge variant="secondary" className="bg-warning text-warning-foreground">Expiring Soon</Badge>,
        message: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
        variant: "default" as const
      };
    } else {
      return {
        badge: <Badge variant="secondary" className="bg-accent text-accent-foreground">Valid</Badge>,
        message: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
        variant: "default" as const
      };
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  if (!document) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Document not found</h2>
            <p className="text-muted-foreground mb-4">The document you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/documents')}>Back to Documents</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const isDocVault = document.issuing_authority === 'DocVault';
  const statusInfo = !isDocVault ? getDocumentStatus(document.expiry_date) : null;
  const recommendedDays = renewalAdvice ? extractRecommendedDays(renewalAdvice) : null;
  
  // Calculate days until expiry to show countdown
  const daysUntilExpiry = document.expiry_date 
    ? Math.ceil((new Date(document.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;
  
  // Use AI recommended days if available, otherwise fall back to document's renewal period
  const daysToStartProcess = recommendedDays || document.renewal_period_days || null;

  const backDest = isDocVault ? '/docvault' : '/documents';
  const deleteDialogId = 'delete-doc-action';

  return (
    <AppShell>
      <PageHeader
        back={backDest}
        title={document.name}
        description={getSubCategoryName(document.category_detail || document.document_type)}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(`/documents/${id}/edit`)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{document.name}"? This action cannot be undone{!isDocVault && ' and will also remove all associated reminders'}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Status Banner with colored background */}
        {!isDocVault && statusInfo && (
          <div className={`rounded-2xl p-5 md:p-6 border-2 ${statusInfo.bgClass || 'bg-card'} ${statusInfo.borderClass || 'border-border'} space-y-4`}>
            <div className="flex justify-center">
              <Badge variant={statusInfo.badgeVariant} className={statusInfo.colorClass}>
                {statusInfo.label}
              </Badge>
            </div>

            <Alert className={`${statusInfo.bgClass} ${statusInfo.borderClass} border-2`}>
              <Calendar className="h-4 w-4" />
              <AlertDescription className={statusInfo.textClass}>
                {statusInfo.status === 'expired' 
                  ? `Expired ${Math.abs(daysUntilExpiry || 0)} day${Math.abs(daysUntilExpiry || 0) !== 1 ? 's' : ''} ago`
                  : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
                }
              </AlertDescription>
            </Alert>
            
            {/* AI Renewal Recommendation */}
            {loadingAdvice ? (
              <Alert className="border-primary/50 bg-primary/5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  <span className="text-sm">Analyzing optimal renewal timeline...</span>
                </AlertDescription>
              </Alert>
            ) : daysToStartProcess && daysUntilExpiry && daysUntilExpiry > daysToStartProcess ? (
              <Alert className="border-primary/50 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <strong>Start the process in {daysUntilExpiry - daysToStartProcess} days</strong>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    ({daysToStartProcess} days before expiry - {recommendedDays ? 'AI recommended' : 'From your settings'})
                  </span>
                </AlertDescription>
              </Alert>
            ) : daysToStartProcess && daysUntilExpiry && daysUntilExpiry <= daysToStartProcess ? (
              <Alert className="border-primary/50 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <strong>Start the renewal process now</strong>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    (Renewal window is open - {daysToStartProcess} days before expiry recommended)
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Renewal Completed Button - Only for expiring/expired documents */}
            {(statusInfo.status === 'expired' || statusInfo.status === 'expiring') && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="btn-glow text-white font-semibold rounded-xl w-full max-w-sm"
                  onClick={() => setRenewalSheetOpen(true)}
                >
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Renewal Completed
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6">
        {/* Document Image/PDF */}
        {document.image_path && imageUrl && (
          <>
            {processedImageUrl && (
              <div className="flex justify-end gap-2 mb-2">
                <Button 
                  variant={viewOriginal ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setViewOriginal(true)}
                  className="h-8 text-xs rounded-lg"
                >
                  Original Document
                </Button>
                <Button 
                  variant={!viewOriginal ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setViewOriginal(false)}
                  className="h-8 text-xs rounded-lg"
                >
                  Cropped & Enhanced
                </Button>
              </div>
            )}
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setViewerOpen(true)}
            >
              <CardContent className="p-4">
                {document.image_path.toLowerCase().endsWith('.pdf') ? (
                  <div className="flex items-center justify-between p-6 bg-muted rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <FileText className="h-10 w-10 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{document.name}</p>
                        <p className="text-sm text-muted-foreground">PDF Document</p>
                      </div>
                    </div>
                    <Button 
                      variant="default" 
                      size="lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewerOpen(true);
                      }}
                    >
                      View PDF
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <img 
                      src={viewOriginal ? imageUrl : (processedImageUrl || imageUrl)}
                      alt={document.name}
                      className="w-full rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
                      Click to view full size
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <DocumentViewer
              fileUrl={viewOriginal ? imageUrl : (processedImageUrl || imageUrl)}
              fileName={document.name}
              open={viewerOpen}
              onClose={() => setViewerOpen(false)}
            />
          </>
        )}

        {/* Document Information */}
        <Card className={`border-2 ${statusInfo?.bgClass || ''} ${statusInfo?.borderClass || 'border-border'}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${statusInfo?.textClass || 'text-foreground'}`}>
              <FileText className="h-5 w-5" />
              Document Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Document Type</Label>
                <p className={statusInfo?.textClass || 'text-foreground'}>
                  {getSubCategoryName(document.category_detail || document.document_type)}
                </p>
              </div>
              
              {document.issuing_authority && !isDocVault && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Issuing Authority</Label>
                  <p className={statusInfo?.textClass || 'text-foreground'}>{document.issuing_authority}</p>
                </div>
              )}
              
              {!isDocVault && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Expiry Date</Label>
                    <p className={statusInfo?.textClass || 'text-foreground'}>
                      {document.expiry_date ? new Date(document.expiry_date).toLocaleDateString() : 'No expiry date'}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Reminder Period</Label>
                    <p className={statusInfo?.textClass || 'text-foreground'}>{document.renewal_period_days} days before expiry</p>
                  </div>
                </>
              )}
            </div>

            {document.notes && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                <p className="text-foreground mt-1">{document.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metadata - Only for non-DocVault documents */}
        {!isDocVault && (
          <Card className={`border-2 ${statusInfo?.bgClass || ''} ${statusInfo?.borderClass || 'border-border'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${statusInfo?.textClass || 'text-foreground'}`}>
                <Clock className="h-5 w-5" />
                Document History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                <p className={statusInfo?.textClass || 'text-foreground'}>{new Date(document.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                <p className={statusInfo?.textClass || 'text-foreground'}>{new Date(document.updated_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Insights and Document History - Only for non-DocVault */}
        {!isDocVault && <DocumentHistory documentId={id!} />}
        {!isDocVault && <AIInsights document={document} statusInfo={statusInfo} />}
        {!isDocVault && (
          <RenewalAdvisor 
            documentId={document.id}
            documentType={document.document_type}
            documentName={document.name}
            expiryDate={document.expiry_date}
            statusInfo={statusInfo}
          />
        )}
        </div>
      </div>

      <RenewalOptionsSheet
        open={renewalSheetOpen}
        onOpenChange={setRenewalSheetOpen}
        documentId={document.id}
        documentName={document.name}
        onSuccess={fetchDocument}
      />
    </AppShell>
  );
}

function Label({ className, children, ...props }: { className?: string; children: React.ReactNode }) {
  return (
    <label className={className} {...props}>
      {children}
    </label>
  );
}