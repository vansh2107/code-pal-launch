/**
 * src/pages/DocumentDetail.tsx — Firestore document detail page
 * Replaces Supabase with Firestore + Firebase Storage. UI unchanged.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Edit2, Trash2, Calendar, FileText, Clock, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { PDFPreview } from '@/components/document/PDFPreview';
import { useAuth } from '@/hooks/useAuth';
import { AppShell, PageHeader } from '@/components/layout/';
import { toast } from '@/hooks/use-toast';
import { DocumentHistory } from '@/components/document/DocumentHistory';
import { AIInsights } from '@/components/document/AIInsights';
import { RenewalAdvisor } from '@/components/ai/RenewalAdvisor';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import { RenewalOptionsSheet } from '@/components/document/RenewalOptionsSheet';
import { getDocumentStatus } from '@/utils/documentStatus';
import { sanitizeDocumentNote } from '@/utils/documentNotes';
import { getDoc, doc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { firebaseDb, firebaseStorage } from '@/integrations/firebase/client';
import { getDocumentSignedUrl } from '@/utils/documentStorage';
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '@/integrations/firebase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Document {
  id: string; name: string; document_type: string; category_detail?: string;
  issuing_authority: string; expiry_date: string | null; expiry_date_label?: string | null;
  renewal_period_days: number | null; notes: string; created_at: string; updated_at: string;
  image_path: string | null;
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <label className={className}>{children}</label>;
}

const subCategoryNames: Record<string,string> = { passport:'Passport',license:'License',permit:'Permit',insurance:'Insurance',certification:'Certification',passport_renewal:'Passport Renewal',drivers_license:"Driver's License / ID Card",vehicle_registration:'Vehicle Registration / Insurance',health_card:'Health Card Renewal',work_permit_visa:'Work Permit / Visa / Study Permit',permanent_residency:'Permanent Residency',business_license:'Business License',tax_filing:'Tax Filing',ticket_fines:'Tickets and Fines',voting_registration:'Voting Registration',credit_card:'Credit Card',insurance_policy:'Insurance Policy',utility_bills:'Utility Bills',loan_payment:'Loan / EMI Payment',subscription:'Subscription',bank_card:'Bank Card',health_checkup:'Health Checkup',medication_refill:'Medication Refill',pet_vaccination:'Pet Vaccination',fitness_membership:'Fitness Membership',library_book:'Library Book',warranty:'Warranty',home_maintenance:'Home Maintenance',professional_license:'Professional License',training_certificate:'Training Certificate',software_license:'Software License',student_visa:'Student Visa',course_registration:'Course Registration',children_documents:"Children's Documents",school_enrollment:'School Enrollment',family_insurance:'Family Insurance',joint_subscription:'Joint Subscription',pet_care:'Pet Care',property_lease:'Property Lease',domain_name:'Domain Name',web_hosting:'Web Hosting / SSL',cloud_storage:'Cloud Storage',device_warranty:'Device Warranty',password_security:'Password Security',other:'Other' };

export default function DocumentDetail() {
  const { id }     = useParams<{ id: string }>();
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [document,    setDocument]    = useState<Document | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(false);
  const [imageUrl,    setImageUrl]    = useState<string | null>(null);
  const [renewalAdvice, setRenewalAdvice] = useState('');
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [viewerOpen,     setViewerOpen]     = useState(false);
  const [renewalSheetOpen, setRenewalSheetOpen] = useState(false);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [viewOriginal,   setViewOriginal]   = useState(true);
  const [notFound,       setNotFound]       = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed,  setPreviewFailed]  = useState(false);

  const loadPreviewUrls = async (imagePath: string) => {
    setPreviewLoading(true);
    setPreviewFailed(false);
    setImageUrl(null);
    setProcessedImageUrl(null);
    try {
      const url = await getDocumentSignedUrl(imagePath);
      if (url) {
        setImageUrl(url);
        // Try companion processed image
        try {
          const basePath    = imagePath.substring(0, imagePath.lastIndexOf('/'));
          const ext         = imagePath.split('.').pop() ?? 'jpg';
          const processedPath = `${basePath}/processed.${ext}`;
          const processedUrl  = await getDocumentSignedUrl(processedPath);
          if (processedUrl) setProcessedImageUrl(processedUrl);
        } catch { /* ok */ }
      } else {
        setPreviewFailed(true);
      }
    } catch { setPreviewFailed(true); }
    finally { setPreviewLoading(false); }
  };

  useEffect(() => { if (user && id) fetchDocument(); }, [user, id]);

  useEffect(() => {
    if (document && !document.issuing_authority?.includes('DocVault')) fetchRenewalAdvice();
  }, [document]);

  const fetchRenewalAdvice = async () => {
    if (!document) return;
    setLoadingAdvice(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'documentRenewalAdvisor');
      const result: any = await fn({ documentId: document.id, question: `What is the renewal timeline for ${document.name}?` });
      if (result.data?.advice) setRenewalAdvice(result.data.advice);
    } catch { /* non-critical */ }
    finally { setLoadingAdvice(false); }
  };

  const extractRecommendedDays = (text: string): number | null => {
    const m = text.match(/Recommended renewal start:\s*(\d+)\s*days/i);
    return m ? parseInt(m[1]) : null;
  };

  const fetchDocument = async () => {
    if (!user || !id) return;
    try {
      const snap = await getDoc(doc(firebaseDb, `users/${user.uid}/documents/${id}`));
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const data = snap.data();
      const d: Document = {
        id:                  snap.id,
        name:                data.name                    as string,
        document_type:       data.documentType            as string,
        category_detail:     (data.categoryDetail         as string | undefined),
        issuing_authority:   (data.issuingAuthority       as string) ?? '',
        expiry_date:         (data.expiryDate             as string | null) ?? null,
        expiry_date_label:   (data.expiryDateLabel        as string | null) ?? null,
        renewal_period_days: (data.renewalPeriodDays      as number | null) ?? null,
        notes:               sanitizeDocumentNote((data.notes as string) ?? ''),
        created_at:          data.createdAt               as string,
        updated_at:          data.updatedAt               as string,
        image_path:          (data.imagePath              as string | null) ?? null,
      };
      setNotFound(false);
      setDocument(d);
      if (d.image_path) loadPreviewUrls(d.image_path);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message ?? 'Failed to load document.', variant: 'destructive' });
      setNotFound(true);
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!user || !id) return;
    setDeleting(true);
    try {
      if (document?.image_path) {
        try { await deleteObject(ref(firebaseStorage, document.image_path)); } catch { /* ok */ }
      }
      // Delete reminders sub-documents
      const remSnap = await getDocs(collection(firebaseDb, `users/${user.uid}/reminders`));
      for (const remDoc of remSnap.docs) {
        if (remDoc.data().documentId === id) {
          await deleteDoc(remDoc.ref);
        }
      }
      await deleteDoc(doc(firebaseDb, `users/${user.uid}/documents/${id}`));
      toast({ title: 'Document deleted', description: 'The document has been permanently deleted.' });
      navigate('/documents');
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Failed to delete document.', variant: 'destructive' });
    } finally { setDeleting(false); }
  };

  const getSubCategoryName = (id: string) => subCategoryNames[id] ?? id.replace('_', ' ');

  if (loading) return (
    <AppShell>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </AppShell>
  );

  if (notFound || !document) return (
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

  const isDocVault   = document.issuing_authority === 'DocVault';
  const statusInfo   = !isDocVault && document.expiry_date ? getDocumentStatus(document.expiry_date) : null;
  const recommendedDays = renewalAdvice ? extractRecommendedDays(renewalAdvice) : null;
  const daysUntilExpiry = document.expiry_date ? Math.ceil((new Date(document.expiry_date).getTime() - new Date().getTime()) / 86400000) : null;
  const daysToStartProcess = recommendedDays ?? document.renewal_period_days ?? null;
  const backDest     = isDocVault ? '/docvault' : '/documents';

  return (
    <AppShell>
      <PageHeader
        back={backDest}
        title={document.name}
        description={getSubCategoryName(document.category_detail ?? document.document_type)}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(`/documents/${id}/edit`)}><Edit2 className="h-4 w-4 mr-2" />Edit</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to delete "{document.name}"? This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="space-y-6">
        {!isDocVault && statusInfo && (
          <div className={`rounded-2xl p-5 md:p-6 border-2 ${statusInfo.bgClass ?? 'bg-card'} ${statusInfo.borderClass ?? 'border-border'} space-y-4`}>
            <div className="flex justify-center">
              <Badge variant={statusInfo.badgeVariant} className={statusInfo.colorClass}>{statusInfo.label}</Badge>
            </div>
            <Alert className={`${statusInfo.bgClass} ${statusInfo.borderClass} border-2`}>
              <Calendar className="h-4 w-4" />
              <AlertDescription className={statusInfo.textClass}>
                {statusInfo.status === 'expired'
                  ? `Expired ${Math.abs(daysUntilExpiry ?? 0)} day${Math.abs(daysUntilExpiry ?? 0) !== 1 ? 's' : ''} ago`
                  : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`}
              </AlertDescription>
            </Alert>
            {loadingAdvice ? (
              <Alert className="border-primary/50 bg-primary/5"><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription><span className="text-sm">Analyzing optimal renewal timeline...</span></AlertDescription></Alert>
            ) : daysToStartProcess && daysUntilExpiry && daysUntilExpiry > daysToStartProcess ? (
              <Alert className="border-primary/50 bg-primary/5"><Sparkles className="h-4 w-4 text-primary" /><AlertDescription><strong>Start the process in {daysUntilExpiry - daysToStartProcess} days</strong><br /><span className="text-sm text-muted-foreground">({daysToStartProcess} days before expiry — {recommendedDays ? 'AI recommended' : 'From your settings'})</span></AlertDescription></Alert>
            ) : daysToStartProcess && daysUntilExpiry && daysUntilExpiry <= daysToStartProcess ? (
              <Alert className="border-primary/50 bg-primary/5"><Sparkles className="h-4 w-4 text-primary" /><AlertDescription><strong>Start the renewal process now</strong><br /><span className="text-sm text-muted-foreground">(Renewal window is open)</span></AlertDescription></Alert>
            ) : null}
            {(statusInfo.status === 'expired' || statusInfo.status === 'expiring') && (
              <div className="flex justify-center">
                <Button size="lg" className="btn-glow text-white font-semibold rounded-xl w-full max-w-sm" onClick={() => setRenewalSheetOpen(true)}>
                  <RefreshCw className="h-5 w-5 mr-2" />Renewal Completed
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6">
          {document.image_path && (
            <>
              {processedImageUrl && imageUrl && (
                <div className="flex justify-end gap-2 mb-2">
                  <Button variant={viewOriginal ? 'default' : 'outline'} size="sm" onClick={() => setViewOriginal(true)} className="h-8 text-xs rounded-lg">Original Document</Button>
                  <Button variant={!viewOriginal ? 'default' : 'outline'} size="sm" onClick={() => setViewOriginal(false)} className="h-8 text-xs rounded-lg">Cropped &amp; Enhanced</Button>
                </div>
              )}
              <Card className={imageUrl ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''} onClick={() => imageUrl && setViewerOpen(true)}>
                <CardContent className="p-4">
                  {previewLoading ? (
                    <div className="space-y-3"><div className="h-48 w-full rounded-lg bg-muted animate-pulse" /><div className="h-4 w-1/3 rounded bg-muted animate-pulse" /></div>
                  ) : !imageUrl || previewFailed ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 bg-muted rounded-lg text-center">
                      <FileText className="h-10 w-10 text-muted-foreground" />
                      <div><p className="font-medium">Preview unavailable</p><p className="text-sm text-muted-foreground">Your document is stored safely. Only the preview could not be loaded.</p></div>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); loadPreviewUrls(document.image_path!); }}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>
                    </div>
                  ) : document.image_path.toLowerCase().endsWith('.pdf') ? (
                    <div className="space-y-4">
                      <PDFPreview pdfUrl={imageUrl} className="w-full rounded-lg" width={800} onClick={() => setViewerOpen(true)} />
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-primary/10 rounded-lg shrink-0"><FileText className="h-6 w-6 text-primary" /></div>
                          <div className="min-w-0"><p className="font-semibold truncate">{document.name}</p><p className="text-sm text-muted-foreground">PDF Document</p></div>
                        </div>
                        <Button variant="default" onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}>View PDF</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={viewOriginal ? imageUrl : (processedImageUrl ?? imageUrl)} alt={document.name} className="w-full rounded-lg" onError={() => setPreviewFailed(true)} />
                      <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm">Click to view full size</div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {imageUrl && <DocumentViewer fileUrl={viewOriginal ? imageUrl : (processedImageUrl ?? imageUrl)} fileName={document.name} open={viewerOpen} onClose={() => setViewerOpen(false)} />}
            </>
          )}

          <Card className={`border-2 ${statusInfo?.bgClass ?? ''} ${statusInfo?.borderClass ?? 'border-border'}`}>
            <CardHeader><CardTitle className={`flex items-center gap-2 ${statusInfo?.textClass ?? 'text-foreground'}`}><FileText className="h-5 w-5" />Document Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Document Type</Label>
                  <p className={statusInfo?.textClass ?? 'text-foreground'}>{getSubCategoryName(document.category_detail ?? document.document_type)}</p>
                </div>
                {document.issuing_authority && !isDocVault && (
                  <div><Label className="text-sm font-medium text-muted-foreground">Issuing Authority</Label><p className={statusInfo?.textClass ?? 'text-foreground'}>{document.issuing_authority}</p></div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">{document.expiry_date_label ?? 'Expiry Date'}</Label>
                  {document.expiry_date
                    ? <p className={statusInfo?.textClass ?? 'text-foreground'}>{new Date(document.expiry_date).toLocaleDateString()}</p>
                    : isDocVault
                      ? <p className="text-muted-foreground">No expiry set for this document</p>
                      : <p className="text-muted-foreground">Not set — date could not be determined</p>}
                </div>
                {!isDocVault && (
                  <div><Label className="text-sm font-medium text-muted-foreground">Reminder Period</Label><p className={statusInfo?.textClass ?? 'text-foreground'}>{document.renewal_period_days ? `${document.renewal_period_days} days before ${(document.expiry_date_label ?? 'expiry').toLowerCase()}` : 'Not set'}</p></div>
                )}
              </div>
              {document.notes && <div><Label className="text-sm font-medium text-muted-foreground">Notes</Label><p className="text-foreground mt-1">{document.notes}</p></div>}
            </CardContent>
          </Card>

          {!isDocVault && (
            <Card className={`border-2 ${statusInfo?.bgClass ?? ''} ${statusInfo?.borderClass ?? 'border-border'}`}>
              <CardHeader><CardTitle className={`flex items-center gap-2 ${statusInfo?.textClass ?? 'text-foreground'}`}><Clock className="h-5 w-5" />Document History</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div><Label className="text-sm font-medium text-muted-foreground">Created</Label><p className={statusInfo?.textClass ?? 'text-foreground'}>{new Date(document.created_at).toLocaleDateString()}</p></div>
                <div><Label className="text-sm font-medium text-muted-foreground">Last Updated</Label><p className={statusInfo?.textClass ?? 'text-foreground'}>{new Date(document.updated_at).toLocaleDateString()}</p></div>
              </CardContent>
            </Card>
          )}

          {!isDocVault && <DocumentHistory documentId={id!} />}
          {!isDocVault && <AIInsights document={document} statusInfo={statusInfo} />}
          {!isDocVault && document.expiry_date && <RenewalAdvisor documentId={document.id} documentType={document.document_type} documentName={document.name} expiryDate={document.expiry_date} statusInfo={statusInfo} />}
        </div>
      </div>

      <RenewalOptionsSheet open={renewalSheetOpen} onOpenChange={setRenewalSheetOpen} documentId={document.id} documentName={document.name} onSuccess={fetchDocument} />
    </AppShell>
  );
}
