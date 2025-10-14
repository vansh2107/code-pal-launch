import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  matchedDocumentId?: string;
  matchedDocumentName?: string;
}

interface ChecklistCategory {
  category: string;
  items: ChecklistItem[];
}

interface RenewalChecklistProps {
  documentId: string;
  requiredDocuments: Array<{ category: string; items: string[] }>;
}

export function RenewalChecklist({ documentId, requiredDocuments }: RenewalChecklistProps) {
  const { user } = useAuth();
  const [checklistData, setChecklistData] = useState<ChecklistCategory[]>([]);
  const [userDocuments, setUserDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchUserDocuments();
      
      // Real-time subscription for document changes
      const channel = supabase
        .channel('checklist-documents-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchUserDocuments();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  useEffect(() => {
    // Initialize checklist with auto-matching
    initializeChecklist();
  }, [requiredDocuments, userDocuments]);

  const fetchUserDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;
      setUserDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const initializeChecklist = () => {
    // Load saved checklist state from localStorage
    const savedState = localStorage.getItem(`checklist-${documentId}`);
    const savedChecklist = savedState ? JSON.parse(savedState) : null;

    const categories = requiredDocuments.map((category, catIndex) => {
      const items = category.items.map((item, itemIndex) => {
        const itemId = `${catIndex}-${itemIndex}`;
        
        // Check if there's a saved state for this item
        const savedItem = savedChecklist?.find((cat: any) => cat.category === category.category)
          ?.items.find((i: any) => i.id === itemId);

        // Try to auto-match with existing documents (only if not already saved)
        const matchedDoc = !savedItem ? findMatchingDocument(item) : null;
        
        return {
          id: itemId,
          text: item,
          // Use saved state if available, otherwise use auto-match result
          checked: savedItem ? savedItem.checked : !!matchedDoc,
          matchedDocumentId: matchedDoc?.id || savedItem?.matchedDocumentId,
          matchedDocumentName: matchedDoc?.name || savedItem?.matchedDocumentName
        };
      });

      return {
        category: category.category,
        items
      };
    });

    setChecklistData(categories);
  };

  const findMatchingDocument = (requirement: string) => {
    const reqLower = requirement.toLowerCase();
    
    // Extract meaningful keywords (excluding common words)
    const commonWords = ['card', 'original', 'copy', 'self', 'attested', 'not', 'older', 'than', 'months', 'from', 'another', 'different', 'within', 'same'];
    const keywords = reqLower
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word));
    
    // Find best matching document with confidence scoring
    let bestMatch = null;
    let highestScore = 0;
    
    for (const doc of userDocuments) {
      const docName = doc.name.toLowerCase();
      const docType = doc.document_type.toLowerCase();
      let score = 0;
      
      // Specific document type matches (highest priority)
      if (reqLower.includes('passport') && docType === 'passport') score += 10;
      if (reqLower.includes('pan') && (docName.includes('pan') || docType === 'pan')) score += 10;
      if (reqLower.includes('aadhaar') || reqLower.includes('aadhar')) {
        if (docName.includes('aadhaar') || docName.includes('aadhar')) score += 10;
      }
      if (reqLower.includes('license') || reqLower.includes('licence')) {
        if (docType === 'license' || docName.includes('license') || docName.includes('licence')) score += 10;
      }
      if (reqLower.includes('utility bill') || reqLower.includes('electricity') || reqLower.includes('water')) {
        if (docName.includes('utility') || docName.includes('electricity') || docName.includes('water') || docName.includes('bill')) score += 8;
      }
      if (reqLower.includes('bank') && reqLower.includes('statement')) {
        if (docName.includes('bank') && docName.includes('statement')) score += 10;
      }
      if (reqLower.includes('insurance') && docType === 'insurance') score += 10;
      
      // Keyword matching (lower priority)
      const matchedKeywords = keywords.filter(keyword => 
        docName.includes(keyword) || docType.includes(keyword)
      );
      score += matchedKeywords.length * 2;
      
      // Track highest scoring match
      if (score > highestScore) {
        highestScore = score;
        bestMatch = doc;
      }
    }
    
    // Only return match if confidence is high enough (score >= 8)
    return highestScore >= 8 ? bestMatch : null;
  };

  const handleCheckChange = async (categoryIndex: number, itemId: string, checked: boolean) => {
    const updatedChecklist = checklistData.map((cat, catIdx) => {
      if (catIdx === categoryIndex) {
        return {
          ...cat,
          items: cat.items.map(item => 
            item.id === itemId ? { ...item, checked } : item
          )
        };
      }
      return cat;
    });

    setChecklistData(updatedChecklist);
    
    // Save to both localStorage and database
    const checklistState = JSON.stringify(updatedChecklist);
    localStorage.setItem(`checklist-${documentId}`, checklistState);
    
    // Save to database for cross-device persistence
    try {
      await supabase
        .from('documents')
        .update({ 
          notes: checklistState // Store in notes field temporarily
        })
        .eq('id', documentId);
    } catch (error) {
      console.error('Error saving checklist state:', error);
    }
  };

  const calculateProgress = () => {
    const totalItems = checklistData.reduce((sum, cat) => sum + cat.items.length, 0);
    const checkedItems = checklistData.reduce(
      (sum, cat) => sum + cat.items.filter(item => item.checked).length,
      0
    );
    return totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  };

  const progress = calculateProgress();

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Progress</span>
          <Badge variant={progress === 100 ? "default" : "secondary"}>
            {progress}% Complete
          </Badge>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist Categories */}
      <div className="space-y-3">
        <h5 className="font-medium text-sm flex items-center gap-2">
          📋 Required Documents & Items
        </h5>
        {checklistData.map((category, catIndex) => (
          <div key={catIndex} className="p-3 bg-background rounded border">
            <p className="text-sm font-semibold mb-3 text-primary">{category.category}</p>
            <div className="space-y-2.5">
              {category.items.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors group"
                >
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(checked) => 
                      handleCheckChange(catIndex, item.id, checked as boolean)
                    }
                    className="mt-0.5"
                  />
                  <label 
                    htmlFor={item.id}
                    className="flex-1 text-sm cursor-pointer"
                  >
                    <span className={item.checked ? "line-through text-muted-foreground" : ""}>
                      {item.text}
                    </span>
                    {item.matchedDocumentName && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Matched: {item.matchedDocumentName}
                        </Badge>
                      </div>
                    )}
                  </label>
                  {item.checked ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
