import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Edit2, Trash2, Calendar, Building, FileText, Clock, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { PDFPreview } from "@/components/document/PDFPreview";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { DocumentHistory } from "@/components/document/DocumentHistory";
import { AIInsights } from "@/components/document/AIInsights";
import { RenewalAdvisor } from "@/components/ai/RenewalAdvisor";
import { DocumentViewer } from "@/components/document/DocumentViewer";
import { RenewalOptionsSheet } from "@/components/document/RenewalOptionsSheet";
import { getDocumentStatus } from "@/utils/documentStatus";
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
  expiry_date: string;
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
      
      setDocument(data);
      
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Document not found</h2>
          <p className="text-muted-foreground mb-4">The document you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/documents')}>Back to Documents</Button>
        </div>
      </div>
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

  return (
    <div 
      className="min-h-screen bg-background flex flex-col w-full overflow-x-hidden"
      style={{ 
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
      }}
    >
      <header className={`border-b px-4 py-6 border-2 ${statusInfo?.bgClass || 'bg-card'} ${statusInfo?.borderClass || 'border-border'}`}>
        <div className="w-full flex items-center justify-between mb-4 gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(isDocVault ? '/docvault' : '/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className={`flex-1 text-center text-2xl font-semibold ${statusInfo?.textClass || 'text-foreground'}`}>
            {document.name}
          </h1>
          <div style={{ width: 32 }} />
        </div>
        <p className="text-center text-muted-foreground">
          {getSubCategoryName(document.category_detail || document.document_type)}
        </p>
        {!isDocVault && statusInfo && (
          <div className="flex justify-center mt-3">
            <Badge variant={statusInfo.badgeVariant} className={statusInfo.colorClass}>
              {statusInfo.label}
            </Badge>
          </div>
        )}
        
        {!isDocVault && statusInfo && (
          <>
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
              <Alert className="border-primary/50 bg-primary/5 mt-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  <span className="text-sm">Analyzing optimal renewal timeline...</span>
                </AlertDescription>
              </Alert>
            ) : daysToStartProcess && daysUntilExpiry && daysUntilExpiry > daysToStartProcess ? (
              <Alert className="border-primary/50 bg-primary/5 mt-3">
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
              <Alert className="border-primary/50 bg-primary/5 mt-3">
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
          </>
        )}
        
        {/* Renewal Completed Button - Only for expiring/expired documents */}
        {!isDocVault && (statusInfo?.status === 'expired' || statusInfo?.status === 'expiring') && (
          <div className="mt-4 flex justify-center">
            <Button
              size="lg"
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl shadow-lg w-full max-w-sm"
              onClick={() => setRenewalSheetOpen(true)}
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Renewal Completed
            </Button>
          </div>
        )}
      </header>

      <main className="px-4 py-6 space-y-6">
        {/* Document Image/PDF */}
        {document.image_path && imageUrl && (
          <>
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
                      src={imageUrl}
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
              fileUrl={imageUrl}
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
                    <p className={statusInfo?.textClass || 'text-foreground'}>{new Date(document.expiry_date).toLocaleDateString()}</p>
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

        {/* Actions */}
        <Card className={`border-2 ${statusInfo?.bgClass || ''} ${statusInfo?.borderClass || 'border-border'}`}>
          <CardHeader>
            <CardTitle className={statusInfo?.textClass || 'text-foreground'}>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              className={`w-full justify-start gap-2 ${
                statusInfo?.status === 'expired' 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : statusInfo?.status === 'expiring'
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              onClick={() => navigate(`/documents/${id}/edit`)}
            >
              <Edit2 className="h-4 w-4" />
              Edit Document
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  className={`w-full justify-start gap-2 ${
                    statusInfo?.status === 'expired' 
                      ? 'bg-red-700 hover:bg-red-800 text-white' 
                      : statusInfo?.status === 'expiring'
                      ? 'bg-yellow-700 hover:bg-yellow-800 text-white'
                      : 'bg-green-700 hover:bg-green-800 text-white'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Document
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
          </CardContent>
        </Card>

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
      </main>

      <RenewalOptionsSheet
        open={renewalSheetOpen}
        onOpenChange={setRenewalSheetOpen}
        documentId={document.id}
        documentName={document.name}
        onSuccess={fetchDocument}
      />

      <BottomNavigation />
    </div>
  );
}

function Label({ className, children, ...props }: { className?: string; children: React.ReactNode }) {
  return (
    <label className={className} {...props}>
      {children}
    </label>
  );
}