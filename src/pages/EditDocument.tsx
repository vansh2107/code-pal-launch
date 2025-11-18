import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

const documentSchema = z.object({
  name: z.string().min(1, "Document name is required"),
  document_type: z.string().min(1, "Document type is required"),
  issuing_authority: z.string().optional(),
  expiry_date: z.string().optional(),
  renewal_period_days: z.number().optional(),
  notes: z.string().optional(),
});

export default function EditDocument() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
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
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Error",
          description: "Document not found",
          variant: "destructive",
        });
        navigate('/documents');
        return;
      }

      // Fetch existing custom reminder only
      const { data: reminderData } = await supabase
        .from('reminders')
        .select('reminder_date')
        .eq('document_id', id)
        .eq('user_id', user?.id)
        .eq('is_custom', true)
        .maybeSingle();

      setFormData({
        name: data.name || "",
        document_type: (data as any).category_detail || data.document_type || "",
        issuing_authority: data.issuing_authority || "",
        expiry_date: data.expiry_date || "",
        renewal_period_days: data.renewal_period_days || 30,
        notes: data.notes || "",
        custom_reminder_date: reminderData?.reminder_date || "",
      });
    } catch (error) {
      console.error('Error fetching document:', error);
      toast({
        title: "Error",
        description: "Failed to load document",
        variant: "destructive",
      });
      navigate('/documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const isDocVault = formData.issuing_authority === 'DocVault';
      
      // Validate required fields based on document type
      if (!isDocVault) {
        if (!formData.expiry_date) {
          setError("Expiry date is required");
          setSaving(false);
          return;
        }
        if (!formData.renewal_period_days || formData.renewal_period_days < 1) {
          setError("Renewal period must be at least 1 day");
          setSaving(false);
          return;
        }
      }

      // Map detailed document types to database enum values
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
        'license': 'license',
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

      const mappedType = documentTypeMap[formData.document_type] || formData.document_type;

      const validatedData = documentSchema.parse({
        ...formData,
        document_type: mappedType as any,
      });

      // Prepare update object - exclude expiry fields for DocVault
      const updateData: any = {
        name: validatedData.name,
        notes: validatedData.notes,
      };

      if (!isDocVault) {
        updateData.document_type = validatedData.document_type as any;
        updateData.category_detail = formData.document_type;
        updateData.issuing_authority = validatedData.issuing_authority;
        updateData.expiry_date = validatedData.expiry_date;
        updateData.renewal_period_days = validatedData.renewal_period_days;
      }

      const { error } = await supabase
        .from('documents')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Only handle reminders for non-DocVault documents
      if (!isDocVault) {
        // Delete all existing reminders for this document
        await supabase
          .from('reminders')
          .delete()
          .eq('document_id', id)
          .eq('user_id', user?.id);

        // Recreate AI-based reminders
        const renewalDays = validatedData.renewal_period_days!;
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
        
        const reminders = reminderStages.map(days => {
          const reminderDate = new Date(validatedData.expiry_date!);
          reminderDate.setDate(reminderDate.getDate() - days);
          return {
            document_id: id,
            user_id: user?.id,
            reminder_date: reminderDate.toISOString().split('T')[0],
            is_sent: false,
          };
        });
        
        // Add custom reminder if provided
        if (formData.custom_reminder_date) {
          reminders.push({
            document_id: id,
            user_id: user?.id,
            reminder_date: formData.custom_reminder_date,
            is_sent: false,
            is_custom: true,
          } as any);
        }

        // Insert all reminders
        if (reminders.length > 0) {
          const { data: insertedReminders, error: reminderError } = await supabase
            .from('reminders')
            .insert(reminders)
            .select();

          if (reminderError) throw reminderError;

          // Send immediate confirmation emails for all reminders
          if (insertedReminders && insertedReminders.length > 0) {
            for (const reminder of insertedReminders) {
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
        }
      }

      toast({
        title: "Document updated",
        description: "Your document has been updated and reminder confirmation emails sent.",
      });

      navigate(`/documents/${id}`);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err?.message || "Failed to update document. Please try again.");
        console.error('Error updating document:', err);
      }
    } finally {
      setSaving(false);
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
  const isDocVault = formData.issuing_authority === 'DocVault';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/documents/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit Document</h1>
            <p className="text-muted-foreground">Update document information</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
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

              {!isDocVault && (
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
                    Category is auto-detected by AI during scan, or you can select manually
                  </p>
                </div>
              )}

              {!isDocVault && (
                <div className="space-y-2">
                  <Label htmlFor="issuing_authority">Issuing Authority</Label>
                  <Input
                    id="issuing_authority"
                    value={formData.issuing_authority}
                    onChange={(e) => handleInputChange("issuing_authority", e.target.value)}
                    placeholder="e.g., Department of Motor Vehicles"
                  />
                </div>
              )}

              {!isDocVault && (
                <>
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
                </>
              )}

              {/* AI-Based Reminders Preview - Only for non-DocVault */}
              {!isDocVault && aiReminders.length > 0 && (
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
                />
              </div>

              {!isDocVault && (
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
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(`/documents/${id}`)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
