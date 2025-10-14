import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Search, Filter, Building2, Scale, Plane, Award, Shield, Receipt, Heart, GraduationCap, AlertTriangle, Users, FolderOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/utils/exportData";

interface Document {
  id: string;
  name: string;
  document_type: string;
  issuing_authority: string;
  expiry_date: string;
  created_at: string;
}

const categories = [
  { id: "government_documents", name: "Government Documents", icon: Building2, color: "bg-blue-500/10 text-blue-500" },
  { id: "legal_documents", name: "Legal Documents", icon: Scale, color: "bg-purple-500/10 text-purple-500" },
  { id: "immigration_documents", name: "Immigration Documents", icon: Plane, color: "bg-green-500/10 text-green-500" },
  { id: "license_certification", name: "License & Certification", icon: Award, color: "bg-amber-500/10 text-amber-500" },
  { id: "insurance_policies", name: "Insurance Policies", icon: Shield, color: "bg-red-500/10 text-red-500" },
  { id: "billing_payments", name: "Billing & Payments", icon: Receipt, color: "bg-cyan-500/10 text-cyan-500" },
  { id: "medical_documents", name: "Medical Documents", icon: Heart, color: "bg-pink-500/10 text-pink-500" },
  { id: "education", name: "Education", icon: GraduationCap, color: "bg-indigo-500/10 text-indigo-500" },
  { id: "tickets_fines", name: "Tickets & Fines", icon: AlertTriangle, color: "bg-orange-500/10 text-orange-500" },
  { id: "memberships_subscriptions", name: "Memberships", icon: Users, color: "bg-teal-500/10 text-teal-500" },
  { id: "other", name: "Others", icon: FolderOpen, color: "bg-gray-500/10 text-gray-500" },
];

export default function Documents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCategories, setShowCategories] = useState(true);

  // Set filter from URL params
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && ['all', 'valid', 'expiring', 'expired'].includes(statusParam)) {
      setFilterStatus(statusParam);
    }
  }, [searchParams]);

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
  }, [documents, searchQuery, filterType, filterStatus, sortBy]);

  const applyFilters = () => {
    let filtered = [...documents];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.issuing_authority?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter(doc => doc.document_type === filterType);
    }

    // Status filter
    if (filterStatus !== "all") {
      const today = new Date();
      filtered = filtered.filter(doc => {
        const expiryDate = new Date(doc.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (filterStatus === "expired") return daysUntilExpiry < 0;
        if (filterStatus === "expiring") return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
        if (filterStatus === "valid") return daysUntilExpiry > 30;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "expiry_date":
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        case "document_type":
          return a.document_type.localeCompare(b.document_type);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

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
    return documents.filter(doc => doc.document_type === categoryId).length;
  };

  const handleCategoryClick = (categoryId: string) => {
    setFilterType(categoryId);
    setShowCategories(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <Link to="/scan">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </Link>
        </div>
        
        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-3">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date Added</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="expiry_date">Expiry Date</SelectItem>
                <SelectItem value="document_type">Type</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filterType} onValueChange={(value) => {
              setFilterType(value);
              if (value === "all") setShowCategories(true);
            }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="government_documents">Government Documents</SelectItem>
                <SelectItem value="legal_documents">Legal Documents</SelectItem>
                <SelectItem value="immigration_documents">Immigration Documents</SelectItem>
                <SelectItem value="license_certification">License & Certification</SelectItem>
                <SelectItem value="insurance_policies">Insurance Policies</SelectItem>
                <SelectItem value="billing_payments">Billing & Payments</SelectItem>
                <SelectItem value="medical_documents">Medical Documents</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="tickets_fines">Tickets & Fines</SelectItem>
                <SelectItem value="memberships_subscriptions">Memberships</SelectItem>
                <SelectItem value="other">Others</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button onClick={handleExport} variant="outline" className="w-full">
            Export to CSV
          </Button>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Categories Section */}
        {showCategories && filterType === "all" && documents.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Browse by Category</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCategories(!showCategories)}
              >
                {showCategories ? "Hide" : "Show"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((category) => {
                const count = getCategoryCount(category.id);
                const Icon = category.icon;
                return (
                  <Card
                    key={category.id}
                    className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
                    onClick={() => handleCategoryClick(category.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${category.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="secondary" className="font-semibold">
                          {count}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-medium text-foreground leading-tight">
                        {category.name}
                      </h3>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Category Header */}
        {filterType !== "all" && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {categories.find(c => c.id === filterType)?.name || "Documents"}
              </h2>
              <Badge variant="secondary">{filteredDocuments.length}</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterType("all");
                setShowCategories(true);
              }}
            >
              View All
            </Button>
          </div>
        )}

        {filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
            <h2 className="text-xl font-semibold mb-2">
              {documents.length === 0 ? "No documents yet" : "No documents match your search"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {documents.length === 0 
                ? "Add your first document to get started with secure reminders"
                : "Try adjusting your search or filter criteria"
              }
            </p>
            {documents.length === 0 && (
              <Link to="/scan">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Document
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDocuments.map((doc) => (
              <Link key={doc.id} to={`/document/${doc.id}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1">{doc.name}</h3>
                        <p className="text-sm text-muted-foreground capitalize mb-2">
                          {doc.document_type.replace('_', ' ')}
                          {doc.issuing_authority && ` • ${doc.issuing_authority}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="ml-4">
                        {getStatusBadge(doc.expiry_date)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}