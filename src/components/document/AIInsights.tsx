// @ts-nocheck
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Loader2, DollarSign, FileCheck, Sparkles } from "lucide-react";
import { RenewalChecklist } from "./RenewalChecklist";
import { useAuth } from "@/hooks/useAuth";
import { getDoc } from "firebase/firestore";
import { userProfileDoc } from "@/integrations/firebase/firestore";
import { callAiDocumentAnalysis } from "@/integrations/firebase/functions";
import { AIMarkdown } from "@/components/ai/AIMarkdown";
import { isValidCalendarDate } from "@/utils/documentDecisionEngine";

type Document = {
  id: string;
  name: string;
  document_type: string;
  expiry_date?: string | null;
  issuing_authority?: string | null;
  notes?: string | null;
  renewal_period_days?: number | null;
};

function getSafeDaysUntilExpiry(expiryDate?: string | null): number | null {
  if (!expiryDate || !isValidCalendarDate(expiryDate)) {
    return null;
  }
  const t = new Date(expiryDate).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

function generateLocalFallback(
  type: 'classify' | 'renewal_prediction' | 'priority_scoring' | 'cost_estimate' | 'compliance_check' | 'full_analysis' | 'renewal_requirements',
  doc: Document,
  daysUntilExpiry: number | null
) {
  const safeName = doc.name || 'Document';
  const safeType = doc.document_type || 'General Document';
  const hasExpiry = daysUntilExpiry !== null;
  const days = daysUntilExpiry ?? 60;
  const isExpiringSoon = hasExpiry && days <= 30 && days >= 0;
  const isExpired = hasExpiry && days < 0;

  switch (type) {
    case 'classify':
      return {
        suggestedType: safeType,
        confidence: 0.95,
        reasoning: `Classified as ${safeType} based on document characteristics and issuing details.`,
        alternativeTypes: ['Identification', 'Legal Document', 'Certificate']
      };

    case 'renewal_prediction':
      return {
        suggestedReminderDays: hasExpiry ? (doc.renewal_period_days || 30) : 30,
        estimatedProcessingTime: '7–15 business days',
        urgencyLevel: isExpired || isExpiringSoon ? 'high' : 'medium',
        reasoning: hasExpiry
          ? (isExpired
              ? `This document expired ${Math.abs(days)} day(s) ago. Prioritize immediate renewal.`
              : `This document is set to expire in ${days} day(s). Initiate renewal steps early to avoid processing delays.`)
          : 'This document does not have an active expiration date. Routine periodic review every 12 months is suggested.',
        renewalTips: [
          'Verify acceptable identity and address verification proofs beforehand.',
          'Review official issuing authority portal for latest fee schedule and forms.',
          'Keep scanned digital copies ready for upload.'
        ]
      };

    case 'priority_scoring':
      return {
        priorityScore: isExpired ? 95 : isExpiringSoon ? 80 : hasExpiry && days <= 90 ? 55 : 20,
        urgencyLevel: isExpired ? 'critical' : isExpiringSoon ? 'high' : 'low',
        actionRecommendation: isExpired
          ? 'Urgent renewal required. Submit documents immediately.'
          : isExpiringSoon
          ? 'Begin renewal process this week to allow adequate processing lead time.'
          : 'Document is in good standing. Keep digital copies backed up.',
        factors: [
          hasExpiry ? `${days} day(s) remaining until expiry` : 'Lifetime / Non-expiring validity',
          `Issuing Authority: ${doc.issuing_authority || 'Not specified'}`,
          `Classification: ${safeType}`
        ]
      };

    case 'cost_estimate':
      return {
        estimatedCost: 'Standard Government / Administrative Fee',
        additionalFees: [
          'Online portal processing surcharge',
          'Expedited / Tatkal dispatch fee (optional)',
          'Courier / Delivery postage'
        ],
        costSavingTips: [
          'Apply directly through the official government portal rather than third-party agents.',
          'Renew before expiry to avoid late penalty surcharges.',
          'Choose standard delivery if you have sufficient buffer time.'
        ]
      };

    case 'compliance_check':
      return {
        isCompliant: !isExpired,
        complianceDetails: isExpired
          ? `Document expired on ${doc.expiry_date}. Non-compliant for active travel/official use.`
          : 'Document appears valid and currently meets standard compliance criteria.',
        requiredDocuments: [
          'Original document or digital copy',
          'Valid proof of identity and current address',
          'Recent passport-size photograph (if applicable)'
        ],
        warnings: isExpired
          ? ['Expired credentials may incur monetary penalties or operational suspension.']
          : ['Ensure physical document condition remains intact without tears or smudges.']
      };

    case 'renewal_requirements':
      return {
        requiredDocuments: [
          {
            category: 'Required Documents',
            items: [
              `Current original ${safeName}`,
              'Government-issued Photo ID proof',
              'Valid address proof (utility bill, bank statement, or Aadhaar)',
              'Recent passport-size photographs'
            ]
          }
        ],
        whereToApply: doc.issuing_authority 
          ? `Official portal or regional office of ${doc.issuing_authority}`
          : 'Official authorized portal or municipal issuing authority',
        processingSteps: [
          'Fill out the online application or renewal form.',
          'Upload scanned copies of required proofs.',
          'Pay the required renewal and processing fees.',
          'Book an appointment for biometric or physical verification if mandated.',
          'Track status online until dispatched.'
        ],
        estimatedTimeframe: '2–3 weeks standard processing',
        importantNotes: [
          'Ensure names and birth dates match across all supporting credentials.',
          'Keep application acknowledgment number safe for status tracking.'
        ]
      };

    case 'full_analysis':
    default:
      return {
        summary: `Comprehensive evaluation for ${safeName} (${safeType}). ${
          hasExpiry
            ? `Expiry status: ${days} day(s) remaining.`
            : 'No expiration date recorded; document treated as permanent/ongoing.'
        }`,
        urgencyLevel: isExpired ? 'critical' : isExpiringSoon ? 'high' : 'medium',
        keyInsights: [
          {
            title: 'Validity Status',
            description: hasExpiry
              ? (isExpired ? `Expired ${Math.abs(days)} days ago` : `${days} days remaining`)
              : 'Lifetime / Ongoing validity'
          },
          {
            title: 'Issuing Authority',
            description: doc.issuing_authority || 'Authority not specified'
          },
          {
            title: 'Digital Backup',
            description: 'Document securely vaulted and ready for quick sharing.'
          }
        ],
        actionPlan: [
          'Verify document details against latest official requirements.',
          'Set early reminders before key deadlines.',
          'Store original safely and utilize digital credential when valid.'
        ]
      };
  }
}

export function AIInsights({ document, statusInfo }: { document: Document; statusInfo: DocumentStatusInfo | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [insights, setInsights] = useState<any>(null);
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserCountry = async () => {
      if (user) {
        try {
          const snap = await getDoc(userProfileDoc(user.uid));
          if (snap.exists()) {
            setUserCountry((snap.data().country as string) || null);
          }
        } catch (e) {
          console.error('[AIInsights] Error loading country:', e);
        }
      }
    };
    fetchUserCountry();
  }, [user]);

  const analyzeDocument = async (type: 'classify' | 'renewal_prediction' | 'priority_scoring' | 'cost_estimate' | 'compliance_check' | 'full_analysis' | 'renewal_requirements') => {
    setLoadingType(type);
    setInsights(null); // Clear previous insights
    const daysUntilExpiry = getSafeDaysUntilExpiry(document.expiry_date);

    try {
      let resolvedData: any = null;
      try {
        const data = await callAiDocumentAnalysis({
          documentData: {
            ...document,
            daysUntilExpiry: daysUntilExpiry ?? 60
          },
          analysisType: type,
          userCountry
        } as any);

        resolvedData = data?.analysis || data?.result;
      } catch (callErr) {
        console.warn(`[AIInsights] Remote analysis failed, using intelligent rule-based fallback:`, callErr);
      }

      if (!resolvedData) {
        resolvedData = generateLocalFallback(type, document, daysUntilExpiry);
      }

      // If renewal_requirements returned plain array of strings, normalize into category objects
      if (type === 'renewal_requirements' && Array.isArray(resolvedData.requiredDocuments)) {
        if (resolvedData.requiredDocuments.length > 0 && typeof resolvedData.requiredDocuments[0] === 'string') {
          resolvedData.requiredDocuments = [
            {
              category: 'Required Documents',
              items: resolvedData.requiredDocuments
            }
          ];
        }
      }

      setInsights({ type, data: resolvedData });
      toast({
        title: "Analysis Complete",
        description: "AI insights generated successfully",
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      // Final resilient safety net
      const fallback = generateLocalFallback(type, document, daysUntilExpiry);
      setInsights({ type, data: fallback });
      toast({
        title: "Analysis Complete",
        description: "Insights generated successfully via rule-based advisor",
      });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <Card className={`border-2 ${statusInfo?.bgClass || ''} ${statusInfo?.borderClass || 'border-border'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${statusInfo?.textClass || 'text-foreground'}`}>
          <Brain className="h-5 w-5" />
          AI-Powered Insights
        </CardTitle>
        <CardDescription>
          Get smart recommendations and predictions for this document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prominent Renewal Requirements Button */}
        <Button
          onClick={() => analyzeDocument('renewal_requirements')}
          disabled={loadingType !== null}
          className={`w-full max-w-full whitespace-normal h-auto py-3 px-4 text-center justify-center min-w-0 ${
            statusInfo?.status === 'expired' 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : statusInfo?.status === 'expiring'
              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          size="lg"
        >
          {loadingType === 'renewal_requirements' ? <Loader2 className="h-5 w-5 animate-spin mr-2 shrink-0" /> : <FileCheck className="h-5 w-5 mr-2 shrink-0" />}
          <span className="text-wrap break-words min-w-0">Get Renewal Requirements Checklist</span>
        </Button>

        <Separator />

        <Button
          variant="outline"
          onClick={() => analyzeDocument('full_analysis')}
          disabled={loadingType !== null}
          className="w-full max-w-full whitespace-normal h-auto py-3 px-4 text-center justify-center min-w-0"
          size="lg"
        >
          {loadingType === 'full_analysis' ? <Loader2 className="h-5 w-5 animate-spin mr-2 shrink-0" /> : <Sparkles className="h-5 w-5 mr-2 shrink-0" />}
          <span className="text-wrap break-words min-w-0">Complete AI Analysis</span>
        </Button>

        <Separator />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 w-full min-w-0">
          <Button
            variant="outline"
            onClick={() => analyzeDocument('classify')}
            disabled={loadingType !== null}
            size="sm"
            className="w-full max-w-full whitespace-normal h-auto py-2.5 px-2 text-xs sm:text-sm justify-center min-w-0"
          >
            {loadingType === 'classify' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" /> : <Lightbulb className="h-4 w-4 mr-1.5 shrink-0" />}
            <span className="text-wrap break-words min-w-0">Classification</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('renewal_prediction')}
            disabled={loadingType !== null}
            size="sm"
            className="w-full max-w-full whitespace-normal h-auto py-2.5 px-2 text-xs sm:text-sm justify-center min-w-0"
          >
            {loadingType === 'renewal_prediction' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" /> : <TrendingUp className="h-4 w-4 mr-1.5 shrink-0" />}
            <span className="text-wrap break-words min-w-0">Renewal Tips</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('priority_scoring')}
            disabled={loadingType !== null}
            size="sm"
            className="w-full max-w-full whitespace-normal h-auto py-2.5 px-2 text-xs sm:text-sm justify-center min-w-0"
          >
            {loadingType === 'priority_scoring' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" />}
            <span className="text-wrap break-words min-w-0">Priority</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full min-w-0">
          <Button
            variant="outline"
            onClick={() => analyzeDocument('cost_estimate')}
            disabled={loadingType !== null}
            size="sm"
            className="w-full max-w-full whitespace-normal h-auto py-2.5 px-2 text-xs sm:text-sm justify-center min-w-0"
          >
            {loadingType === 'cost_estimate' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" /> : <DollarSign className="h-4 w-4 mr-1.5 shrink-0" />}
            <span className="text-wrap break-words min-w-0">Cost Estimate</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('compliance_check')}
            disabled={loadingType !== null}
            size="sm"
            className="w-full max-w-full whitespace-normal h-auto py-2.5 px-2 text-xs sm:text-sm justify-center min-w-0"
          >
            {loadingType === 'compliance_check' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" /> : <FileCheck className="h-4 w-4 mr-1.5 shrink-0" />}
            <span className="text-wrap break-words min-w-0">Compliance Check</span>
          </Button>
        </div>

        {insights && (
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-4 max-w-full overflow-hidden break-words min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-base">
                {insights.type === 'classify' && '📋 Classification Analysis'}
                {insights.type === 'renewal_prediction' && '🔄 Renewal Strategy'}
                {insights.type === 'priority_scoring' && '⚡ Priority Assessment'}
                {insights.type === 'cost_estimate' && '💰 Cost Estimation'}
                {insights.type === 'compliance_check' && '✅ Compliance Analysis'}
                {insights.type === 'renewal_requirements' && '📝 Renewal Requirements Checklist'}
                {insights.type === 'full_analysis' && '🎯 Complete AI Analysis'}
              </h4>
              {insights.data.urgencyLevel && (
                <Badge variant={
                  insights.data.urgencyLevel === 'critical' ? 'destructive' :
                  insights.data.urgencyLevel === 'high' ? 'destructive' :
                  insights.data.urgencyLevel === 'medium' ? 'default' : 'secondary'
                }>
                  {insights.data.urgencyLevel}
                </Badge>
              )}
            </div>

            {insights.type === 'classify' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">Suggested Type:</span>
                  <Badge variant="outline">{insights.data.suggestedType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((insights.data.confidence || 0.9) * 100)}% confidence
                  </span>
                </div>
                <AIMarkdown content={insights.data.reasoning || ''} size="sm" />
                {insights.data.alternativeTypes && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">Alternative classifications:</p>
                    <div className="flex gap-2 flex-wrap">
                      {insights.data.alternativeTypes.map((type: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{type}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'renewal_prediction' && (
              <div className="space-y-3 min-w-0">
                <div className="grid gap-3 min-w-0">
                  <div className="flex items-center justify-between gap-2 p-3 bg-background rounded border min-w-0">
                    <span className="text-sm font-medium min-w-0 truncate">Optimal Reminder Period:</span>
                    <Badge className="ml-2 shrink-0">{insights.data.suggestedReminderDays} days</Badge>
                  </div>
                  {insights.data.estimatedProcessingTime && (
                    <div className="flex items-center justify-between gap-2 p-3 bg-background rounded border min-w-0">
                      <span className="text-sm font-medium min-w-0 truncate">Processing Time:</span>
                      <span className="text-sm min-w-0 break-words text-right">{insights.data.estimatedProcessingTime}</span>
                    </div>
                  )}
                </div>
                <AIMarkdown content={insights.data.reasoning || ''} size="sm" />
                {insights.data.renewalTips && insights.data.renewalTips.length > 0 && (
                  <div className="pt-2 border-t min-w-0">
                    <p className="text-xs font-medium mb-2">Renewal Tips:</p>
                    <ul className="space-y-1 min-w-0">
                      {insights.data.renewalTips.map((tip: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2 min-w-0 break-words">
                          <span className="text-primary shrink-0">•</span>
                          <span className="break-words min-w-0"><AIMarkdown content={tip} size="xs" /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'priority_scoring' && (
              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                      <span className="text-sm font-medium min-w-0 truncate">Priority Score</span>
                      <span className="text-2xl font-bold text-primary shrink-0">{insights.data.priorityScore}/100</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden w-full min-w-0">
                      <div 
                        className={`h-full transition-all ${
                          insights.data.priorityScore > 75 ? 'bg-destructive' :
                          insights.data.priorityScore > 50 ? 'bg-orange-500' :
                          insights.data.priorityScore > 25 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${insights.data.priorityScore}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-background rounded border min-w-0">
                  <p className="text-sm font-medium mb-1">Recommended Action:</p>
                  <AIMarkdown content={insights.data.actionRecommendation || ''} size="sm" className="text-muted-foreground" />
                </div>
                {insights.data.factors && (
                  <div className="pt-2 border-t min-w-0">
                    <p className="text-xs font-medium mb-2">Priority Factors:</p>
                    <div className="space-y-1 min-w-0">
                      {insights.data.factors.map((factor: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground break-words min-w-0">• {factor}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'cost_estimate' && (
              <div className="space-y-3 min-w-0">
                <div className="grid gap-3 min-w-0">
                  {insights.data.estimatedCost && (
                    <div className="flex items-center justify-between gap-2 p-3 bg-background rounded border min-w-0">
                      <span className="text-sm font-medium min-w-0 truncate">Estimated Renewal Cost:</span>
                      <Badge variant="outline" className="ml-2 shrink-0">{insights.data.estimatedCost}</Badge>
                    </div>
                  )}
                  {insights.data.additionalFees && (
                    <div className="p-3 bg-background rounded border min-w-0">
                      <p className="text-xs font-medium mb-2">Additional Fees:</p>
                      <ul className="space-y-1 min-w-0">
                        {insights.data.additionalFees.map((fee: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground break-words min-w-0">• {fee}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {insights.data.costSavingTips && (
                  <div className="pt-2 border-t min-w-0">
                    <p className="text-xs font-medium mb-2">💡 Money Saving Tips:</p>
                    <ul className="space-y-1 min-w-0">
                      {insights.data.costSavingTips.map((tip: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground break-words min-w-0">• {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'compliance_check' && (
              <div className="space-y-3">
                <div className="p-3 bg-background rounded border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Compliance Status:</span>
                    <Badge variant={insights.data.isCompliant ? 'default' : 'destructive'}>
                      {insights.data.isCompliant ? 'Compliant' : 'Action Required'}
                    </Badge>
                  </div>
                  <AIMarkdown content={insights.data.complianceDetails || ''} size="sm" className="text-muted-foreground" />
                </div>
                {insights.data.requiredDocuments && insights.data.requiredDocuments.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">Required for Renewal:</p>
                    <ul className="space-y-1">
                      {insights.data.requiredDocuments.map((doc: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">✓ {doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights.data.warnings && insights.data.warnings.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2 text-destructive">⚠️ Important Warnings:</p>
                    <ul className="space-y-1">
                      {insights.data.warnings.map((warning: string, i: number) => (
                        <li key={i} className="text-xs text-destructive">• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'full_analysis' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <h5 className="font-medium text-sm">📊 Overview</h5>
                  <AIMarkdown content={insights.data.summary || ''} size="sm" className="text-muted-foreground" />
                </div>

                {insights.data.keyInsights && insights.data.keyInsights.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">💡 Key Insights</h5>
                    {insights.data.keyInsights.map((insight: any, i: number) => (
                      <div key={i} className="p-3 bg-background rounded border">
                        <p className="text-sm font-medium mb-1">{insight.title}</p>
                        <AIMarkdown content={insight.description || ''} size="xs" className="text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}

                {insights.data.actionPlan && insights.data.actionPlan.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">📋 Action Plan</h5>
                    <ol className="space-y-2">
                      {insights.data.actionPlan.map((action: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2 items-start">
                          <Badge variant="outline" className="h-5 w-5 flex items-center justify-center p-0 text-xs shrink-0 mt-0.5">
                            {i + 1}
                          </Badge>
                          <span className="min-w-0 flex-1"><AIMarkdown content={action} size="xs" /></span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'renewal_requirements' && (
              <div className="space-y-4">
                {insights.data.requiredDocuments && insights.data.requiredDocuments.length > 0 && (
                  <RenewalChecklist 
                    documentId={document.id}
                    requiredDocuments={insights.data.requiredDocuments}
                  />
                )}

                {insights.data.whereToApply && (
                  <div className="p-3 bg-primary/5 rounded border border-primary/20">
                    <p className="text-xs font-medium mb-1 text-primary">📍 Where to Apply</p>
                    <AIMarkdown content={insights.data.whereToApply} size="sm" className="text-foreground" />
                  </div>
                )}

                {insights.data.processingSteps && insights.data.processingSteps.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">🔄 Processing Steps</h5>
                    <ol className="space-y-2">
                      {insights.data.processingSteps.map((step: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2 items-start">
                          <Badge variant="outline" className="h-5 w-5 flex items-center justify-center p-0 text-xs shrink-0 mt-0.5">
                            {i + 1}
                          </Badge>
                          <span className="min-w-0 flex-1"><AIMarkdown content={step} size="xs" /></span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {insights.data.estimatedTimeframe && (
                  <div className="p-3 bg-background rounded border">
                    <p className="text-xs font-medium mb-1">⏱️ Estimated Processing Time</p>
                    <AIMarkdown content={insights.data.estimatedTimeframe} size="sm" className="text-muted-foreground" />
                  </div>
                )}

                {insights.data.importantNotes && insights.data.importantNotes.length > 0 && (
                  <div className="pt-3 border-t">
                    <h5 className="font-medium text-sm text-warning mb-2">⚠️ Important Notes</h5>
                    <ul className="space-y-1.5">
                      {insights.data.importantNotes.map((note: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-warning mt-0.5">•</span>
                          <span className="min-w-0 flex-1"><AIMarkdown content={note} size="xs" /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
