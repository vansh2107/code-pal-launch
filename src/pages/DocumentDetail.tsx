import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Edit2, Trash2, Calendar, Building, FileText, Clock, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { DocumentHistory } from "@/components/document/DocumentHistory";
import { AIInsights } from "@/components/document/AIInsights";
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
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Error",
          description: "Document not found or you don't have permission to view it.",
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
    } catch (error) {
      console.error('Error fetching document:', error);
      toast({
        title: "Error",
        description: "Failed to load document. Please try again.",
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
  const statusInfo = !isDocVault ? getStatusInfo(document.expiry_date) : null;
  const recommendedDays = renewalAdvice ? extractRecommendedDays(renewalAdvice) : null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(isDocVault ? '/docvault' : '/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{document.name}</h1>
            <p className="text-muted-foreground capitalize">
              {document.document_type.replace('_', ' ')}
            </p>
          </div>
          {!isDocVault && statusInfo?.badge}
        </div>
        
        {!isDocVault && statusInfo && (
          <>
            <Alert variant={statusInfo.variant}>
              <Calendar className="h-4 w-4" />
              <AlertDescription>{statusInfo.message}</AlertDescription>
            </Alert>
            
            {/* AI Renewal Recommendation */}
            {loadingAdvice ? (
              <Alert className="border-primary/50 bg-primary/5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  <span className="text-sm">Analyzing optimal renewal timeline...</span>
                </AlertDescription>
              </Alert>
            ) : recommendedDays ? (
              <Alert className="border-primary/50 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <strong>Start the process in {recommendedDays} days</strong>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    (AI recommended - Begin on {calculateStartDate(recommendedDays, document.expiry_date)})
                  </span>
                </AlertDescription>
              </Alert>
            ) : renewalAdvice ? (
              <Alert className="border-muted">
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  <span className="text-sm">AI analysis complete. View full recommendations in AI Insights section below.</span>
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </header>

      <main className="px-4 py-6 space-y-6">
        {/* Document Image */}
        {document.image_path && imageUrl && (
          <Card>
            <CardContent className="p-4">
              <img 
                src={imageUrl}
                alt={document.name}
                className="w-full rounded-lg"
                onError={(e) => {
                  // Hide image on error
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Document Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Document Type</Label>
                <p className="text-foreground capitalize">{document.document_type.replace('_', ' ')}</p>
              </div>
              
              {document.issuing_authority && !isDocVault && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Issuing Authority</Label>
                  <p className="text-foreground">{document.issuing_authority}</p>
                </div>
              )}
              
              {!isDocVault && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Expiry Date</Label>
                    <p className="text-foreground">{new Date(document.expiry_date).toLocaleDateString()}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Reminder Period</Label>
                    <p className="text-foreground">{document.renewal_period_days} days before expiry</p>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Document History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                <p className="text-foreground">{new Date(document.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                <p className="text-foreground">{new Date(document.updated_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              className="w-full justify-start gap-2" 
              onClick={() => navigate(`/document/${id}/edit`)}
            >
              <Edit2 className="h-4 w-4" />
              Edit Document
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start gap-2">
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
        {!isDocVault && <AIInsights document={document} />}
      </main>

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