import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/utils/exportData";
import { getDocumentStatus } from "@/utils/documentStatus";
import { SwipeableDocumentCard } from "@/components/document/SwipeableDocumentCard";
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
  document_type: string; // broad enum
  category_detail?: string; // fine-grained type for UI/filters
  issuing_authority: string;
  expiry_date: string;
  created_at: string;
}

const categories = [
  { 
    id: "government_legal", 
    name: "Government & Legal Renewals", 
    iconSrc: governmentIcon, 
    color: "bg-blue-500/10 text-blue-500",
    types: ["passport", "passport_renewal", "license", "drivers_license", "permit", "vehicle_registration", "health_card", "work_permit_visa", "permanent_residency", "business_license", "tax_filing", "ticket_fines", "voting_registration"]
  },
  { 
    id: "financial_utility", 
    name: "Financial & Utility Renewals", 
    iconSrc: financialIcon, 
    color: "bg-green-500/10 text-green-500",
    types: ["insurance", "credit_card", "insurance_policy", "utility_bills", "loan_payment", "subscription", "bank_card"]
  },
  { 
    id: "personal_productivity", 
    name: "Personal Life & Productivity", 
    iconSrc: personalIcon, 
    color: "bg-pink-500/10 text-pink-500",
    types: ["health_checkup", "medication_refill", "pet_vaccination", "fitness_membership", "library_book", "warranty", "home_maintenance"]
  },
  { 
    id: "work_education", 
    name: "Work & Education", 
    iconSrc: educationIcon, 
    color: "bg-indigo-500/10 text-indigo-500",
    types: ["certification", "professional_license", "training_certificate", "software_license", "student_visa", "course_registration"]
  },
  { 
    id: "family_shared", 
    name: "Family & Shared Renewals", 
    iconSrc: familyIcon, 
    color: "bg-amber-500/10 text-amber-500",
    types: ["children_documents", "school_enrollment", "family_insurance", "joint_subscription", "pet_care", "property_lease"]
  },
  { 
    id: "digital_security", 
    name: "Digital & Security Renewals", 
    iconSrc: securityIcon, 
    color: "bg-purple-500/10 text-purple-500",
    types: ["domain_name", "web_hosting", "cloud_storage", "device_warranty", "password_security"]
  },
  { 
    id: "other", 
    name: "Other", 
    iconSrc: otherIcon, 
    color: "bg-gray-500/10 text-gray-500",
    types: ["other"]
  },
];

export default function Documents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"expiry" | "name" | "recent">("expiry");
  const [filterStatus, setFilterStatus] = useState<"all" | "expired" | "expiring" | "valid">("all");


  useEffect(() => {
    if (user) {
      fetchDocuments();
      
      // Real-time subscription for multi-device sync
      const channel = supabase
        .channel('documents-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchDocuments();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [documents, filterType, searchQuery, sortBy, filterStatus]);

  const applyFilters = () => {
    let filtered = [...documents];

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(doc => 
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.issuing_authority?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category filter
    if (filterType !== "all") {
      const category = categories.find(c => c.id === filterType);
      if (category) {
        filtered = filtered.filter(doc => {
          const type = (doc as any).category_detail || doc.document_type;
          return category.types.includes(type);
        });
      }
    }

    // Status filter
    if (filterStatus !== "all") {
      const today = new Date();
      filtered = filtered.filter(doc => {
        const expiry = new Date(doc.expiry_date);
        const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (filterStatus === "expired") return daysUntilExpiry < 0;
        if (filterStatus === "expiring") return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
        if (filterStatus === "valid") return daysUntilExpiry > 30;
        return true;
      });
    }

    // Sort
    if (sortBy === "expiry") {
      filtered.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
    } else if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "recent") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredDocuments(filtered);
  };

  const handleExport = () => {
    exportToCSV(documents);
    toast({
      title: "Export Successful",
      description: "Your documents have been exported to CSV.",
    });
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id)
        .neq('issuing_authority', 'DocVault')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryCount = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return 0;
    return documents.filter(doc => {
      const type = (doc as any).category_detail || doc.document_type;
      return category.types.includes(type);
    }).length;
  };

  const handleCategoryClick = (categoryId: string) => {
    if (filterType === categoryId) {
      setFilterType("all");
    } else {
      setFilterType(categoryId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    return nameMap[subTypeId] || subTypeId;
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document deleted successfully",
      });

      // Refresh the documents list
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="secondary" className="bg-warning text-warning-foreground">Expiring Soon</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-accent text-accent-foreground">Valid</Badge>;
    }
  };

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <Link to="/scan">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </Link>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Filter Options */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expiry">Expiry Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="recent">Recently Added</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={filterType} onValueChange={(value: string) => setFilterType(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(searchQuery || filterStatus !== "all" || sortBy !== "expiry" || filterType !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilterStatus("all");
                setSortBy("expiry");
                setFilterType("all");
              }}
              className="w-full"
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Categories Section */}
        {documents.length > 0 && !searchQuery && filterStatus === "all" && sortBy === "expiry" && filterType === "all" && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Browse by Category</h2>
            <div className="grid grid-cols-1 gap-3">
              {categories.map((category) => {
                const count = getCategoryCount(category.id);
                const isActive = filterType === category.id;
                return (
                  <Card
                    key={category.id}
                    className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                      isActive ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-lg'
                    }`}
                    onClick={() => handleCategoryClick(category.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img 
                            src={category.iconSrc} 
                            alt={category.name}
                            className="w-10 h-10 object-contain"
                          />
                          <h3 className="text-sm font-medium text-foreground">
                            {category.name}
                          </h3>
                        </div>
                        <Badge variant="secondary" className="font-semibold">
                          {count}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtered Documents - Only show when filters are active */}
        {(filterType !== "all" || searchQuery || filterStatus !== "all" || sortBy !== "expiry") && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {filteredDocuments.length} Document{filteredDocuments.length !== 1 ? 's' : ''}
              </h2>
              {documents.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExport}>
                  Export CSV
                </Button>
              )}
            </div>

            {filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No documents match your filters
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your filters or search query
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredDocuments.map((doc) => {
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
      </main>

      <BottomNavigation />
    </div>
  );
}