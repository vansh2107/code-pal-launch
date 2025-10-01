import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Edit2, Trash2, Calendar, Building, FileText, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { DocumentHistory } from "@/components/document/DocumentHistory";
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
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user && id) {
      fetchDocument();
    }
  }, [user, id]);

  const fetchDocument = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setDocument(data);
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
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({
        title: "Document deleted",
        description: "The document has been permanently deleted.",
      });
      
      navigate('/documents');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document. Please try again.",
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

  const statusInfo = getStatusInfo(document.expiry_date);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{document.name}</h1>
            <p className="text-muted-foreground capitalize">
              {document.document_type.replace('_', ' ')}
            </p>
          </div>
          {statusInfo.badge}
        </div>
        
        <Alert variant={statusInfo.variant}>
          <Calendar className="h-4 w-4" />
          <AlertDescription>{statusInfo.message}</AlertDescription>
        </Alert>
      </header>

      <main className="px-4 py-6 space-y-6">
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
              
              {document.issuing_authority && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Issuing Authority</Label>
                  <p className="text-foreground">{document.issuing_authority}</p>
                </div>
              )}
              
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Expiry Date</Label>
                <p className="text-foreground">{new Date(document.expiry_date).toLocaleDateString()}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Reminder Period</Label>
                <p className="text-foreground">{document.renewal_period_days} days before expiry</p>
              </div>
            </div>

            {document.notes && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                <p className="text-foreground mt-1">{document.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metadata */}
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

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-2" disabled>
              <Edit2 className="h-4 w-4" />
              Edit Document (Coming Soon)
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
                    Are you sure you want to delete "{document.name}"? This action cannot be undone and will also remove all associated reminders.
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

        {/* Document History */}
        <DocumentHistory documentId={id!} />
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