/**
 * src/pages/EditDocument.tsx — Firestore document edit page
 * Replaces Supabase with Firestore + Firebase Cloud Functions. UI unchanged.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { AppShell, PageHeader } from '@/components/layout/';
import { sanitizeDocumentNote } from '@/utils/documentNotes';
import { z } from 'zod';
import { getDoc, doc, updateDoc, setDoc, addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { firebaseDb } from '@/integrations/firebase/client';
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '@/integrations/firebase/client';

const documentSchema = z.object({
  name:                z.string().min(1, 'Document name is required'),
  document_type:       z.string().min(1, 'Document type is required'),
  issuing_authority:   z.string().optional(),
  expiry_date:         z.string().optional(),
  renewal_period_days: z.number().optional(),
  notes:               z.string().optional(),
});

const DOC_TYPE_MAP: Record<string, string> = {
  drivers_license:'license',professional_license:'license',software_license:'license',business_license:'license',
  passport:'passport',passport_renewal:'passport',permit:'permit',work_permit_visa:'permit',student_visa:'permit',
  permanent_residency:'permit',vehicle_registration:'permit',insurance:'insurance',insurance_policy:'insurance',
  health_card:'insurance',family_insurance:'insurance',certification:'certification',training_certificate:'certification',
  course_registration:'certification',license:'license',other:'other',credit_card:'other',utility_bills:'other',
  loan_payment:'other',subscription:'other',joint_subscription:'other',bank_card:'other',health_checkup:'other',
  medication_refill:'other',pet_vaccination:'other',pet_care:'other',fitness_membership:'other',library_book:'other',
  warranty:'other',device_warranty:'other',home_maintenance:'other',tax_filing:'other',ticket_fines:'tickets_and_fines',
  voting_registration:'other',children_documents:'other',school_enrollment:'other',property_lease:'other',
  domain_name:'other',web_hosting:'other',cloud_storage:'other',password_security:'other',
};

const DOC_TYPES = ['passport_renewal','drivers_license','vehicle_registration','health_card','work_permit_visa','student_visa','permanent_residency','business_license','professional_license','training_certificate','course_registration','tax_filing','ticket_fines','voting_registration','credit_card','insurance_policy','family_insurance','utility_bills','loan_payment','subscription','joint_subscription','bank_card','health_checkup','medication_refill','pet_vaccination','pet_care','fitness_membership','library_book','warranty','device_warranty','home_maintenance','software_license','children_documents','school_enrollment','property_lease','domain_name','web_hosting','cloud_storage','password_security','other'];
const DOC_TYPE_LABELS: Record<string,string> = { passport_renewal:'Passport Renewal',drivers_license:"Driver's License / ID Card",vehicle_registration:'Vehicle Registration / Insurance',health_card:'Health Card Renewal',work_permit_visa:'Work Permit / Visa',student_visa:'Student Visa / Study Permit',permanent_residency:'Permanent Residency Renewal',business_license:'Business License',professional_license:'Professional License',training_certificate:'Training Certificate',course_registration:'Course Registration',tax_filing:'Tax Filing Reminder',ticket_fines:'Ticket and Fines',voting_registration:'Voting Registration Check',credit_card:'Credit Card Renewal / Expiry',insurance_policy:'Insurance Policy',family_insurance:'Family Insurance',utility_bills:'Utility Bills',loan_payment:'Loan / EMI Payment',subscription:'Subscription Renewal',joint_subscription:'Joint Subscription',bank_card:'Bank Card / Debit Card',health_checkup:'Health Checkup / Dentist Appointment',medication_refill:'Medication Refill',pet_vaccination:'Pet Vaccination / License',pet_care:'Pet Care Renewal',fitness_membership:'Fitness Membership',library_book:'Library Book Return',warranty:'Warranty Expiration',device_warranty:'Device Warranty',home_maintenance:'Home Maintenance',software_license:'Software License',children_documents:"Children's Passport / ID",school_enrollment:'School Enrollment / Fee',property_lease:'Property Lease',domain_name:'Domain Name',web_hosting:'Website Hosting / SSL',cloud_storage:'Cloud Storage',password_security:'Password Change / Security Audit',other:'Other' };

export default function EditDocument() {
  const { id }      = useParams<{ id: string }>();
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [error,     setError]    = useState('');
  const [formData,  setFormData] = useState({
    name:'', document_type:'', issuing_authority:'', expiry_date:'',
    expiry_date_label:'', renewal_period_days:30, notes:'', custom_reminder_date:'',
  });

  useEffect(() => { if (user && id) fetchDocument(); }, [user, id]);

  const fetchDocument = async () => {
    if (!user || !id) return;
    try {
      const snap = await getDoc(doc(firebaseDb, `users/${user.uid}/documents/${id}`));
      if (!snap.exists()) {
        toast({ title: 'Error', description: 'Document not found', variant: 'destructive' });
        navigate('/documents');
        return;
      }
      const data = snap.data();

      // Fetch existing custom reminder
      let customReminderDate = '';
      const remSnap = await getDocs(
        query(collection(firebaseDb, `users/${user.uid}/reminders`), where('documentId','==',id), where('isCustom','==',true)),
      );
      if (!remSnap.empty) customReminderDate = remSnap.docs[0].data().reminderDate as string;

      setFormData({
        name:                (data.name              as string) ?? '',
        document_type:       (data.categoryDetail    as string) ?? (data.documentType as string) ?? '',
        issuing_authority:   (data.issuingAuthority  as string) ?? '',
        expiry_date:         (data.expiryDate        as string) ?? '',
        expiry_date_label:   (data.expiryDateLabel   as string) ?? '',
        renewal_period_days: (data.renewalPeriodDays as number) ?? 30,
        notes:               sanitizeDocumentNote((data.notes as string) ?? ''),
        custom_reminder_date: customReminderDate,
      });
    } catch (err) {
      console.error('[EditDocument] fetchDocument:', err);
      toast({ title: 'Error', description: 'Failed to load document', variant: 'destructive' });
      navigate('/documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    setSaving(true);
    setError('');

    try {
      const isDocVault = formData.issuing_authority === 'DocVault';

      if (!isDocVault) {
        if (!formData.expiry_date) { setError(`${formData.expiry_date_label || 'Expiry date'} is required`); setSaving(false); return; }
        if (!formData.renewal_period_days || formData.renewal_period_days < 1) { setError('Renewal period must be at least 1 day'); setSaving(false); return; }
      }

      const mappedType = DOC_TYPE_MAP[formData.document_type] ?? formData.document_type;
      const validated  = documentSchema.parse({ ...formData, document_type: mappedType });
      const safeNotes  = sanitizeDocumentNote(validated.notes ?? '');
      const now        = new Date().toISOString();

      const updateData: Record<string, unknown> = {
        name:      validated.name,
        notes:     safeNotes,
        updatedAt: now,
      };
      if (!isDocVault) {
        updateData.documentType       = validated.document_type;
        updateData.categoryDetail     = formData.document_type;
        updateData.issuingAuthority   = validated.issuing_authority ?? null;
        updateData.expiryDate         = validated.expiry_date         ?? null;
        updateData.expiryDateLabel    = formData.expiry_date_label    || null;
        updateData.renewalPeriodDays  = validated.renewal_period_days ?? 30;
      }

      await updateDoc(doc(firebaseDb, `users/${user.uid}/documents/${id}`), updateData);

      if (!isDocVault && validated.expiry_date) {
        // Delete all existing reminders for this document
        const remSnap = await getDocs(
          query(collection(firebaseDb, `users/${user.uid}/reminders`), where('documentId','==',id)),
        );
        for (const rd of remSnap.docs) await deleteDoc(rd.ref);

        // Recreate smart reminders
        const renewalDays = validated.renewal_period_days!;
        let stages: number[];
        if (renewalDays >= 90) stages = [60,30,7];
        else if (renewalDays >= 30) stages = [30,14,3];
        else if (renewalDays >= 14) stages = [14,7,2];
        else stages = [7,3,1];

        const expiryMs = new Date(validated.expiry_date!).getTime();
        const reminders = stages
          .map(days => {
            const d = new Date(expiryMs - days * 86400000);
            return d > new Date() ? d.toISOString().slice(0,10) : null;
          })
          .filter(Boolean) as string[];

        if (formData.custom_reminder_date) reminders.push(formData.custom_reminder_date);

        const insertedIds: string[] = [];
        for (const reminderDate of reminders) {
          const ref2 = await addDoc(collection(firebaseDb, `users/${user.uid}/reminders`), {
            documentId: id, userId: user.uid, reminderDate, isSent: false,
            isCustom: reminderDate === formData.custom_reminder_date,
            createdAt: now,
          });
          insertedIds.push(ref2.id);
        }

        // Send immediate reminder emails
        for (const remId of insertedIds) {
          try {
            await httpsCallable(firebaseFunctions, 'sendImmediateReminder')({ reminderId: remId });
          } catch { /* non-critical */ }
        }
      }

      toast({ title: 'Document updated', description: 'Your document has been updated and reminder confirmation emails sent.' });
      navigate(`/documents/${id}`);
    } catch (err: any) {
      if (err instanceof z.ZodError) setError(err.errors[0].message);
      else setError(err?.message ?? 'Failed to update document. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => setFormData(prev => ({ ...prev, [field]: value }));

  const calculateReminderDates = () => {
    if (!formData.expiry_date || !formData.renewal_period_days) return [];
    const r = formData.renewal_period_days;
    const stages = r>=90?[60,30,7]:r>=30?[30,14,3]:r>=14?[14,7,2]:[7,3,1];
    return stages.map(days => {
      const d = new Date(formData.expiry_date);
      d.setDate(d.getDate() - days);
      return { days, date: d.toISOString().split('T')[0], formatted: d.toLocaleDateString() };
    });
  };

  const aiReminders = calculateReminderDates();
  const isDocVault  = formData.issuing_authority === 'DocVault';

  if (loading) return (
    <AppShell contentWidth="narrow">
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </AppShell>
  );

  return (
    <AppShell contentWidth="narrow">
      <PageHeader back={`/documents/${id}`} title="Edit Document" description="Update document information"
        action={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(`/documents/${id}`)}>Cancel</Button>
            <Button type="submit" form="edit-doc-form" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />Save Changes
            </Button>
          </div>
        }
      />
      <Card>
        <CardHeader><CardTitle>Document Information</CardTitle></CardHeader>
        <CardContent>
          <form id="edit-doc-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Document Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="e.g., Driver's License" required />
            </div>

            {!isDocVault && (
              <div className="space-y-2">
                <Label htmlFor="document_type">Document Type *</Label>
                <Select value={formData.document_type} onValueChange={(v) => handleInputChange('document_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                  <SelectContent className="max-h-80 bg-background border border-border z-50">
                    {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t] ?? t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isDocVault && (
              <div className="space-y-2">
                <Label htmlFor="issuing_authority">Issuing Authority</Label>
                <Input id="issuing_authority" value={formData.issuing_authority} onChange={(e) => handleInputChange('issuing_authority', e.target.value)} placeholder="e.g., Department of Motor Vehicles" />
              </div>
            )}

            {!isDocVault && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="expiry_date">{formData.expiry_date_label || 'Expiry Date'} *</Label>
                  <Input id="expiry_date" type="date" value={formData.expiry_date} onChange={(e) => handleInputChange('expiry_date', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="renewal_period_days">Renewal Period (Days) *</Label>
                  <Input id="renewal_period_days" type="number" min="1" max="365" value={formData.renewal_period_days} onChange={(e) => handleInputChange('renewal_period_days', parseInt(e.target.value))} required />
                  <p className="text-sm text-muted-foreground">AI will automatically create smart reminders based on this period</p>
                </div>
              </>
            )}

            {!isDocVault && aiReminders.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">🤖 AI-Powered Automatic Reminders</Label>
                <div className="bg-accent/20 border border-accent rounded-lg p-4 space-y-2">
                  {aiReminders.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">{i+1}</div>
                        <div>
                          <p className="text-sm font-medium">{r.days} days before {(formData.expiry_date_label || 'expiry').toLowerCase()}</p>
                          <p className="text-xs text-muted-foreground">{r.formatted}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">Auto</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => handleInputChange('notes', e.target.value)} placeholder="Additional notes about this document..." rows={3} />
            </div>

            {!isDocVault && (
              <div className="space-y-2">
                <Label htmlFor="custom_reminder_date">➕ Custom Reminder (Optional)</Label>
                <Input id="custom_reminder_date" type="date" value={formData.custom_reminder_date} onChange={(e) => handleInputChange('custom_reminder_date', e.target.value)} />
                <p className="text-sm text-muted-foreground">Add your own reminder date in addition to the automatic ones</p>
              </div>
            )}

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
