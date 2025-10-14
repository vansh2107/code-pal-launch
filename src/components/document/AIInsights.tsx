import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Loader2, DollarSign, FileCheck, Sparkles } from "lucide-react";
import { RenewalChecklist } from "./RenewalChecklist";

type Document = {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  issuing_authority: string | null;
  notes: string | null;
  renewal_period_days: number | null;
};

export function AIInsights({ document }: { document: Document }) {
  const { toast } = useToast();
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [insights, setInsights] = useState<any>(null);
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user's country
    const fetchUserCountry = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('country')
          .eq('user_id', user.id)
          .single();
        setUserCountry(profile?.country || null);
      }
    };
    fetchUserCountry();
  }, []);

  const analyzeDocument = async (type: 'classify' | 'renewal_prediction' | 'priority_scoring' | 'cost_estimate' | 'compliance_check' | 'full_analysis' | 'renewal_requirements') => {
    setLoadingType(type);
    setInsights(null); // Clear previous insights
    try {
      const daysUntilExpiry = Math.ceil(
        (new Date(document.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          documentData: {
            ...document,
            daysUntilExpiry
          },
          analysisType: type,
          userCountry
        }
      });

      if (error) throw error;

      setInsights({ type, data: data.analysis });
      toast({
        title: "Analysis Complete",
        description: "AI insights generated successfully",
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to generate insights",
        variant: "destructive",
      });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          AI-Powered Insights
        </CardTitle>
        <CardDescription>
          Get smart recommendations and predictions for this document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prominent Renewal Requirements Button */}
        <Button
          variant="default"
          onClick={() => analyzeDocument('renewal_requirements')}
          disabled={loadingType !== null}
          className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
          size="lg"
        >
          {loadingType === 'renewal_requirements' ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <FileCheck className="h-5 w-5 mr-2" />}
          Get Renewal Requirements Checklist
        </Button>

        <Separator />

        <Button
          variant="outline"
          onClick={() => analyzeDocument('full_analysis')}
          disabled={loadingType !== null}
          className="w-full"
          size="lg"
        >
          {loadingType === 'full_analysis' ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
          Complete AI Analysis
        </Button>

        <Separator />

        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            onClick={() => analyzeDocument('classify')}
            disabled={loadingType !== null}
            size="sm"
          >
            {loadingType === 'classify' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lightbulb className="h-4 w-4 mr-2" />}
            Classification
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('renewal_prediction')}
            disabled={loadingType !== null}
            size="sm"
          >
            {loadingType === 'renewal_prediction' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
            Renewal Tips
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('priority_scoring')}
            disabled={loadingType !== null}
            size="sm"
          >
            {loadingType === 'priority_scoring' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
            Priority
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => analyzeDocument('cost_estimate')}
            disabled={loadingType !== null}
            size="sm"
          >
            {loadingType === 'cost_estimate' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
            Cost Estimate
          </Button>
          <Button
            variant="outline"
            onClick={() => analyzeDocument('compliance_check')}
            disabled={loadingType !== null}
            size="sm"
          >
            {loadingType === 'compliance_check' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileCheck className="h-4 w-4 mr-2" />}
            Compliance Check
          </Button>
        </div>

        {insights && (
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-4">
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
                    {Math.round(insights.data.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{insights.data.reasoning}</p>
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
              <div className="space-y-3">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-3 bg-background rounded border">
                    <span className="text-sm font-medium">Optimal Reminder Period:</span>
                    <Badge className="ml-2">{insights.data.suggestedReminderDays} days</Badge>
                  </div>
                  {insights.data.estimatedProcessingTime && (
                    <div className="flex items-center justify-between p-3 bg-background rounded border">
                      <span className="text-sm font-medium">Processing Time:</span>
                      <span className="text-sm">{insights.data.estimatedProcessingTime}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{insights.data.reasoning}</p>
                {insights.data.renewalTips && insights.data.renewalTips.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">Renewal Tips:</p>
                    <ul className="space-y-1">
                      {insights.data.renewalTips.map((tip: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-primary">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'priority_scoring' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Priority Score</span>
                      <span className="text-2xl font-bold text-primary">{insights.data.priorityScore}/100</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
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
                <div className="p-3 bg-background rounded border">
                  <p className="text-sm font-medium mb-1">Recommended Action:</p>
                  <p className="text-sm text-muted-foreground">{insights.data.actionRecommendation}</p>
                </div>
                {insights.data.factors && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">Priority Factors:</p>
                    <div className="space-y-1">
                      {insights.data.factors.map((factor: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">• {factor}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {insights.type === 'cost_estimate' && (
              <div className="space-y-3">
                <div className="grid gap-3">
                  {insights.data.estimatedCost && (
                    <div className="flex items-center justify-between p-3 bg-background rounded border">
                      <span className="text-sm font-medium">Estimated Renewal Cost:</span>
                      <Badge variant="outline" className="ml-2">{insights.data.estimatedCost}</Badge>
                    </div>
                  )}
                  {insights.data.additionalFees && (
                    <div className="p-3 bg-background rounded border">
                      <p className="text-xs font-medium mb-2">Additional Fees:</p>
                      <ul className="space-y-1">
                        {insights.data.additionalFees.map((fee: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground">• {fee}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {insights.data.costSavingTips && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">💡 Money Saving Tips:</p>
                    <ul className="space-y-1">
                      {insights.data.costSavingTips.map((tip: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">• {tip}</li>
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
                  <p className="text-sm text-muted-foreground">{insights.data.complianceDetails}</p>
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
                  <p className="text-sm text-muted-foreground leading-relaxed">{insights.data.summary}</p>
                </div>

                {insights.data.keyInsights && insights.data.keyInsights.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">💡 Key Insights</h5>
                    {insights.data.keyInsights.map((insight: any, i: number) => (
                      <div key={i} className="p-3 bg-background rounded border">
                        <p className="text-sm font-medium mb-1">{insight.title}</p>
                        <p className="text-xs text-muted-foreground">{insight.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {insights.data.actionPlan && insights.data.actionPlan.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">📋 Action Plan</h5>
                    <ol className="space-y-2">
                      {insights.data.actionPlan.map((action: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2">
                          <Badge variant="outline" className="h-5 w-5 flex items-center justify-center p-0 text-xs">
                            {i + 1}
                          </Badge>
                          <span>{action}</span>
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
                    <p className="text-sm text-foreground">{insights.data.whereToApply}</p>
                  </div>
                )}

                {insights.data.processingSteps && insights.data.processingSteps.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <h5 className="font-medium text-sm">🔄 Processing Steps</h5>
                    <ol className="space-y-2">
                      {insights.data.processingSteps.map((step: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2">
                          <Badge variant="outline" className="h-5 w-5 flex items-center justify-center p-0 text-xs shrink-0">
                            {i + 1}
                          </Badge>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {insights.data.estimatedTimeframe && (
                  <div className="p-3 bg-background rounded border">
                    <p className="text-xs font-medium mb-1">⏱️ Estimated Processing Time</p>
                    <p className="text-sm text-muted-foreground">{insights.data.estimatedTimeframe}</p>
                  </div>
                )}

                {insights.data.importantNotes && insights.data.importantNotes.length > 0 && (
                  <div className="pt-3 border-t">
                    <h5 className="font-medium text-sm text-warning mb-2">⚠️ Important Notes</h5>
                    <ul className="space-y-1.5">
                      {insights.data.importantNotes.map((note: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-warning mt-0.5">•</span>
                          <span>{note}</span>
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
