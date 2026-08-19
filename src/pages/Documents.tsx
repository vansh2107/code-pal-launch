import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/utils/exportData";
import { getDocumentStatus, hasValidExpiryDate } from "@/utils/documentStatus";
import { SwipeableDocumentCard } from "@/components/document/SwipeableDocumentCard";
import { Skeleton } from "@/components/ui/skeleton";
import { getOfflineDocuments } from "@/utils/offlineStorage";
import governmentIcon from "@/assets/category-icons/government-icon.png";
import financialIcon from "@/assets/category-icons/financial-icon.png";
import personalIcon from "@/assets/category-icons/personal-icon.png";
import educationIcon from "@/assets/category-icons/education-icon.png";
import familyIcon from "@/assets/category-icons/family-icon.png";
import securityIcon from "@/assets/category-icons/security-icon.png";
import otherIcon from "@/assets/category-icons/other-icon.png";

interface Document {
  id: string;
  name: string;
  document_type: string;
  category_detail?: string;
  issuing_authority: string;
  expiry_date: string | null;
  created_at: string;
}

const categories = [
  { id: "government_legal", name: "Government & Legal Renewals", iconSrc: governmentIcon, color: "bg-blue-500/10 text-blue-500", types: ["passport", "passport_renewal", "license", "drivers_license", "permit", "vehicle_registration", "health_card", "work_permit_visa", "permanent_residency", "business_license", "tax_filing", "ticket_fines", "voting_registration"] },
  { id: "financial_utility", name: "Financial & Utility Renewals", iconSrc: financialIcon, color: "bg-green-500/10 text-green-500", types: ["insurance", "credit_card", "insurance_policy", "utility_bills", "loan_payment", "subscription", "bank_card"] },
  { id: "personal_productivity", name: "Personal Life & Productivity", iconSrc: personalIcon, color: "bg-pink-500/10 text-pink-500", types: ["health_checkup", "medication_refill", "pet_vaccination", "fitness_membership", "library_book", "warranty", "home_maintenance"] },
  { id: "work_education", name: "Work & Education", iconSrc: educationIcon, color: "bg-indigo-500/10 text-indigo-500", types: ["certification", "professional_license", "training_certificate", "software_license", "student_visa", "course_registration"] },
  { id: "family_shared", name: "Family & Shared Renewals", iconSrc: familyIcon, color: "bg-primary-soft text-primary", types: ["children_documents", "school_enrollment", "family_insurance", "joint_subscription", "pet_care", "property_lease"] },
  { id: "digital_security", name: "Digital & Security Renewals", iconSrc: securityIcon, color: "bg-purple-500/10 text-purple-500", types: ["domain_name", "web_hosting", "cloud_storage", "device_warranty", "password_security"] },
  { id: "other", name: "Other", iconSrc: otherIcon, color: "bg-gray-500/10 text-gray-500", types: ["other"] },
];

const subCategoryNames: Record<string, string> = {
  passport: "Passport", license: "License", permit: "Permit", insurance: "Insurance",
  certification: "Certification", passport_renewal: "Passport Renewal",
  drivers_license: "Driver's License / ID Card", vehicle_registration: "Vehicle Registration / Insurance",
  health_card: "Health Card Renewal", work_permit_visa: "Work Permit / Visa / Study Permit",
  permanent_residency: "Permanent Residency", business_license: "Business License",
  tax_filing: "Tax Filing", ticket_fines: "Tickets and Fines",
  voting_registration: "Voting Registration", credit_card: "Credit Card",
  insurance_policy: "Insurance Policy", utility_bills: "Utility Bills",
  loan_payment: "Loan / EMI Payment", subscription: "Subscription", bank_card: "Bank Card",
  health_checkup: "Health Checkup", medication_refill: "Medication Refill",
  pet_vaccination: "Pet Vaccination", fitness_membership: "Fitness Membership",
  library_book: "Library Book", warranty: "Warranty", home_maintenance: "Home Maintenance",
  professional_license: "Professional License", training_certificate: "Training Certificate",
  software_license: "Software License", student_visa: "Student Visa",
  course_registration: "Course Registration", children_documents: "Children's Documents",
  school_enrollment: "School Enrollment", family_insurance: "Family Insurance",
  joint_subscription: "Joint Subscription", pet_care: "Pet Care",
  property_lease: "Property Lease", domain_name: "Domain Name",
  web_hosting: "Web Hosting / SSL", cloud_storage: "Cloud Storage",
  device_warranty: "Device Warranty", password_security: "Password Security", other: "Other",
};

export default function Documents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"expiry" | "name" | "recent">("expiry");
  const [filterStatus, setFilterStatus] = useState<"all" | "expired" | "expiring" | "valid">("all");
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const status = searchParams.get('status');
    if (status && ['all', 'valid', 'expiring', 'expired'].includes(status)) {
      setFilterStatus(status as any);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      const channel = supabase
        .channel('documents-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `user_id=eq.${user.id}` }, () => fetchDocuments())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, document_type, category_detail, issuing_authority, expiry_date, created_at')
        .eq('user_id', user?.id)
        .neq('issuing_authority', 'DocVault')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      // Offline / network failure → fall back to IndexedDB cache
      try {
        const cached = await getOfflineDocuments();
        const filtered = cached
          .filter((d) => d.user_id === user?.id && d.issuing_authority !== 'DocVault')
          .map((d) => ({
            id: d.id,
            name: d.name,
            document_type: d.document_type,
            category_detail: d.category_detail || undefined,
            issuing_authority: d.issuing_authority || '',
            expiry_date: d.expiry_date,
            created_at: d.created_at || d.updated_at,
          })) as Document[];
        if (filtered.length > 0) {
          setDocuments(filtered);
        } else {
          toast({ title: "Error", description: error.message || "Failed to fetch documents", variant: "destructive" });
        }
      } catch {
        toast({ title: "Error", description: error.message || "Failed to fetch documents", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  // Memoize filtered documents instead of separate state + useEffect
  const filteredDocuments = useMemo(() => {
    let filtered = [...documents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(doc =>
        doc.name.toLowerCase().includes(q) || doc.issuing_authority?.toLowerCase().includes(q)
      );
    }

    if (filterType !== "all") {
      const category = categories.find(c => c.id === filterType);
      if (category) {
        filtered = filtered.filter(doc => category.types.includes(doc.category_detail || doc.document_type));
      }
    }

    if (filterStatus !== "all") {
      const today = new Date();
      filtered = filtered.filter(doc => {
        // Documents without an expiry date never expire — treat them as valid.
        if (!hasValidExpiryDate(doc.expiry_date)) return filterStatus === "valid";
        const daysUntilExpiry = Math.ceil((new Date(doc.expiry_date as string).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (filterStatus === "expired") return daysUntilExpiry < 0;
        if (filterStatus === "expiring") return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
        if (filterStatus === "valid") return daysUntilExpiry > 30;
        return true;
      });
    }

    if (sortBy === "expiry") filtered.sort((a, b) => {
      // No-expiry documents sort last instead of being pinned at the epoch.
      const av = hasValidExpiryDate(a.expiry_date) ? new Date(a.expiry_date as string).getTime() : Number.POSITIVE_INFINITY;
      const bv = hasValidExpiryDate(b.expiry_date) ? new Date(b.expiry_date as string).getTime() : Number.POSITIVE_INFINITY;
      return av - bv;
    });
    else if (sortBy === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "recent") filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return filtered;
  }, [documents, filterType, searchQuery, sortBy, filterStatus]);

  const handleExport = () => {
    exportToCSV(documents);
    toast({ title: "Export Successful", description: "Your documents have been exported to CSV." });
  };

  const getSubCategoryName = useCallback((subTypeId: string) => subCategoryNames[subTypeId] || subTypeId, []);

  const getCategoryCount = useCallback((categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return 0;
    return documents.filter(doc => category.types.includes(doc.category_detail || doc.document_type)).length;
  }, [documents]);

  const handleCategoryClick = (categoryId: string) => {
    setFilterType(prev => prev === categoryId ? "all" : categoryId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // OPTIMISTIC DELETE: Remove from UI immediately, then delete on server
  const handleDeleteDocument = useCallback(async (documentId: string) => {
    // Optimistic: remove from local state instantly
    setDocuments(prev => prev.filter(d => d.id !== documentId));
    
    toast({ title: "Document deleted", description: "Document removed successfully." });

    try {
      const { error } = await supabase.from('documents').delete().eq('id', documentId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting document:', error);
      // Rollback: re-fetch on error
      fetchDocuments();
      toast({ title: "Error", description: "Failed to delete document. Restored.", variant: "destructive" });
    }
  }, [toast]);

  const showCategories = !searchQuery && filterStatus === "all" && sortBy === "expiry" && filterType === "all";
  const showFilteredList = filterType !== "all" || searchQuery || filterStatus !== "all" || sortBy !== "expiry";

  const addAction = (
    <Link to="/scan">
      <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Document</Button>
    </Link>
  );

  if (loading) {
    return (
      <AppShell>
        <PageHeader
          title={<Skeleton className="h-8 w-40" />}
          variant="sticky"
        />
        <div className="space-y-4 pb-6">
          <Skeleton className="h-10 rounded-[12px]" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-10 rounded-[12px]" />
            <Skeleton className="h-10 rounded-[12px]" />
          </div>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-[14px]" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentWidth="full">
      <PageHeader
        title="Documents"
        description={`${documents.length} total document${documents.length !== 1 ? 's' : ''}`}
        action={addAction}
        variant="sticky"
      />

      <div className="space-y-6 pb-6 w-full">
        <div className="space-y-4">
          <div className="relative min-w-0 w-full">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0 pointer-events-none" />
            <Input
              placeholder={isMobile ? "Search documents..." : "Search documents by name, type, or authority"}
              aria-label="Search documents by name, type, or authority"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 h-11 rounded-[12px] bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary w-full min-w-0"
            />
            {/* Visually hidden or responsive desktop override via CSS / media query helper */}
            <span className="sr-only">Search documents by name, type, or authority</span>
          </div>

          {/* Status Filter Pills / Tabs (All, Valid, Expiring, Expired) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "All" },
              { id: "valid", label: "Valid" },
              { id: "expiring", label: "Expiring Soon" },
              { id: "expired", label: "Expired" },
            ].map((tab) => {
              const isActive = filterStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id as any)}
                  className={`h-10 px-4 rounded-[12px] text-sm font-medium transition-colors shrink-0 flex items-center justify-center ${
                    isActive
                      ? "bg-primary-soft text-primary font-semibold border border-primary/20"
                      : "bg-secondary text-secondary-foreground hover:bg-muted border border-border/40"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Secondary Filter & Sort Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-11 rounded-[12px] border-border bg-background">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expiry">Sort by Expiry Date</SelectItem>
                <SelectItem value="name">Sort by Name</SelectItem>
                <SelectItem value="recent">Sort by Recently Added</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={(v: string) => setFilterType(v)}>
              <SelectTrigger className="h-11 rounded-[12px] border-border bg-background">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || filterStatus !== "all" || sortBy !== "expiry" || filterType !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(""); setFilterStatus("all"); setSortBy("expiry"); setFilterType("all"); }}
              className="w-full h-11 rounded-[12px]"
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Categories */}
        {documents.length > 0 && showCategories && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Browse by Category</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((category) => {
                const count = getCategoryCount(category.id);
                const isActive = filterType === category.id;
                return (
                  <Card key={category.id} className={`w-full rounded-[16px] cursor-pointer transition-all duration-200 hover:scale-[1.01] ${isActive ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`} onClick={() => handleCategoryClick(category.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <img src={category.iconSrc} alt={category.name} className="w-10 h-10 object-contain shrink-0" loading="lazy" />
                          <h3 className="text-sm font-medium text-foreground truncate">{category.name}</h3>
                        </div>
                        <Badge variant="secondary" className="font-semibold shrink-0 ml-2">{count}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtered Documents */}
        {showFilteredList && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{filteredDocuments.length} Document{filteredDocuments.length !== 1 ? 's' : ''}</h2>
              {documents.length > 0 && <Button variant="outline" size="sm" onClick={handleExport}>Export CSV</Button>}
            </div>
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No matching documents</h3>
                <p className="text-sm text-muted-foreground mt-1">Try a different search or filter</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQuery(""); setFilterStatus("all"); setSortBy("expiry"); setFilterType("all"); }}
                  className="mt-4 rounded-[12px]"
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map(doc => {
                  const statusInfo = getDocumentStatus(doc.expiry_date);
                  return (
                    <SwipeableDocumentCard
                      key={doc.id}
                      doc={doc}
                      statusInfo={statusInfo}
                      onDelete={handleDeleteDocument}
                      getSubCategoryName={getSubCategoryName}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {documents.length === 0 && (
          <div className="text-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No documents yet</h3>
            <p className="text-muted-foreground mb-6">Start by adding your first document</p>
            <Link to="/scan"><Button><Plus className="h-5 w-5 mr-2" />Add Document</Button></Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
