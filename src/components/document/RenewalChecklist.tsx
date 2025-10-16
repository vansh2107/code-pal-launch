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
      'document', 'valid', 'current', 'issued', 'certified', 'proof'
    ];
    const keywords = reqLower
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));
    
    // Find best matching document with improved confidence scoring
    let bestMatch = null;
    let highestScore = 0;
    
    for (const doc of userDocuments) {
      const docName = doc.name.toLowerCase();
      const docType = doc.document_type.toLowerCase();
      const docAuthority = (doc.issuing_authority || '').toLowerCase();
      const combinedText = `${docName} ${docType} ${docAuthority}`;
      let score = 0;
      
      // Enhanced document type matches (highest priority - exact matches)
      const exactMatches = [
        { req: ['passport'], type: 'passport', score: 15 },
        { req: ['driving', 'driver', 'licence', 'license', 'dl'], type: 'license', score: 15 },
        { req: ['pan', 'permanent account'], type: 'other', name: 'pan', score: 15 },
        { req: ['aadhaar', 'aadhar', 'uid'], type: 'other', name: ['aadhaar', 'aadhar'], score: 15 },
        { req: ['voter', 'election'], type: 'other', name: 'voter', score: 14 },
        { req: ['bank statement', 'bank account'], type: 'other', name: 'bank', score: 13 },
        { req: ['utility bill', 'electricity', 'water bill', 'gas bill'], type: 'other', name: ['utility', 'electricity', 'water', 'gas'], score: 12 },
        { req: ['insurance'], type: 'insurance', score: 14 },
        { req: ['birth certificate'], type: 'certification', name: 'birth', score: 15 },
        { req: ['marriage certificate'], type: 'certification', name: 'marriage', score: 15 },
        { req: ['degree', 'diploma', 'certificate'], type: 'certification', score: 13 },
        { req: ['visa', 'work permit'], type: 'permit', score: 14 },
        { req: ['registration', 'vehicle'], type: 'permit', name: ['vehicle', 'registration'], score: 13 },
        { req: ['property', 'deed', 'title'], type: 'other', name: 'property', score: 13 },
        { req: ['tax', 'itr', 'return'], type: 'other', name: 'tax', score: 12 },
        { req: ['salary', 'payslip', 'pay slip'], type: 'other', name: ['salary', 'pay'], score: 12 },
        { req: ['income', 'proof'], type: 'other', name: 'income', score: 11 },
        { req: ['address proof', 'residence'], type: 'other', name: 'address', score: 11 },
        { req: ['id card', 'identity'], type: 'other', name: ['id', 'identity'], score: 12 },
      ];

      // Check for exact matches
      for (const match of exactMatches) {
        const reqMatches = match.req.some(term => reqLower.includes(term));
        const typeMatches = docType === match.type;
        const nameMatches = match.name 
          ? Array.isArray(match.name) 
            ? match.name.some(n => docName.includes(n) || docAuthority.includes(n))
            : docName.includes(match.name) || docAuthority.includes(match.name)
          : true;

        if (reqMatches && typeMatches && nameMatches) {
          score += match.score;
          break; // Only count best match
        } else if (reqMatches && typeMatches) {
          score += match.score * 0.7; // Partial match
        } else if (reqMatches && nameMatches) {
          score += match.score * 0.6; // Name match without type
        }
      }
      
      // Multi-word phrase matching (bonus points)
      const phrases = [
        { phrase: 'bank statement', bonus: 5 },
        { phrase: 'utility bill', bonus: 5 },
        { phrase: 'address proof', bonus: 5 },
        { phrase: 'income proof', bonus: 5 },
        { phrase: 'birth certificate', bonus: 5 },
        { phrase: 'marriage certificate', bonus: 5 },
      ];
      
      for (const { phrase, bonus } of phrases) {
        if (reqLower.includes(phrase) && combinedText.includes(phrase)) {
          score += bonus;
        }
      }
      
      // Keyword matching with improved weighting
      const matchedKeywords = keywords.filter(keyword => {
        // Exact word boundary matching
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(combinedText);
      });
      
      // Progressive scoring: more matches = higher confidence
      if (matchedKeywords.length >= 3) {
        score += matchedKeywords.length * 3;
      } else if (matchedKeywords.length >= 2) {
        score += matchedKeywords.length * 2;
      } else if (matchedKeywords.length === 1) {
        score += 1;
      }
      
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
    
    // Only return match if confidence is high enough (increased threshold)
    console.log(`Best match for "${requirement}": ${bestMatch?.name} (score: ${highestScore})`);
    return highestScore >= 12 ? bestMatch : null;
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
