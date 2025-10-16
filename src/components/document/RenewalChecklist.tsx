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
    
    // Extract meaningful keywords (excluding common filler words)
    const commonWords = [
      'card', 'original', 'copy', 'self', 'attested', 'not', 'older', 'than', 
      'months', 'from', 'another', 'different', 'within', 'same', 'recent',
      'document', 'valid', 'current', 'issued', 'certified', 'proof', 'and',
      'with', 'the', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'a', 'an'
    ];
    const keywords = reqLower
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word));
    
    // Find best matching document with strict confidence scoring
    let bestMatch = null;
    let highestScore = 0;
    
    for (const doc of userDocuments) {
      const docName = doc.name.toLowerCase();
      const docType = doc.document_type.toLowerCase();
      const docAuthority = (doc.issuing_authority || '').toLowerCase();
      const combinedText = `${docName} ${docType} ${docAuthority}`;
      let score = 0;
      
      // Enhanced document type matches (highest priority - exact matches only)
      const exactMatches = [
        { req: ['passport'], type: 'passport', score: 20, requireBoth: true },
        { req: ['driving', 'driver', 'licence', 'license'], type: 'license', score: 20, requireBoth: true },
        { req: ['pan', 'permanent account number'], type: 'other', name: 'pan', score: 20, requireBoth: true },
        { req: ['aadhaar', 'aadhar'], type: 'other', name: ['aadhaar', 'aadhar'], score: 20, requireBoth: true },
        { req: ['voter'], type: 'other', name: 'voter', score: 18, requireBoth: true },
        { req: ['bank statement'], type: 'other', name: 'bank', score: 18, requireBoth: true },
        { req: ['utility bill', 'electricity bill', 'water bill'], type: 'other', name: ['utility', 'electricity', 'water'], score: 18, requireBoth: true },
        { req: ['insurance'], type: 'insurance', score: 18, requireBoth: true },
        { req: ['birth certificate'], type: 'certification', name: 'birth', score: 20, requireBoth: true },
        { req: ['marriage certificate'], type: 'certification', name: 'marriage', score: 20, requireBoth: true },
        { req: ['visa'], type: 'permit', name: 'visa', score: 20, requireBoth: true },
        { req: ['work permit'], type: 'permit', name: 'work', score: 18, requireBoth: true },
      ];

      // Check for exact matches - VERY STRICT
      for (const match of exactMatches) {
        const reqMatches = match.req.some(term => reqLower.includes(term));
        const typeMatches = docType === match.type;
        const nameMatches = match.name 
          ? Array.isArray(match.name) 
            ? match.name.some(n => docName.includes(n) || docAuthority.includes(n))
            : docName.includes(match.name) || docAuthority.includes(match.name)
          : true;

        // ONLY match if BOTH type AND name match, or if no name is required
        if (reqMatches && typeMatches && nameMatches) {
          score += match.score;
          break; // Only count best match
        }
      }
      
      // Don't use keyword matching - it's too unreliable
      // Only rely on exact document type and name matches above
      
      // Penalty for documents from DocVault (they shouldn't match checklists)
      if (doc.issuing_authority === 'DocVault') {
        score = 0;
      }
      
      // Track highest scoring match
      if (score > highestScore) {
        highestScore = score;
        bestMatch = doc;
      }
    }
    
    // Only return match if confidence is very high (strict threshold)
    console.log(`Best match for "${requirement}": ${bestMatch?.name} (score: ${highestScore})`);
    return highestScore >= 18 ? bestMatch : null;
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
