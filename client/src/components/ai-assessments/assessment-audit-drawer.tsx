import { useState, useEffect, useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Brain,
  AlertTriangle,
  AlertCircle,
  Target,
  BrainCircuit,
  History,
  FileText,
  TrendingUp,
  TrendingDown,
  Clock,
  Cpu,
  ChevronRight,
  ChevronDown,
  Code,
  MessageSquareText,
  Layers,
  Users2,
  UserCheck,
  Settings2,
  Info,
} from "lucide-react";
import type { RiskCriteria, ProjectRiskPrediction } from "@shared/schema";

interface AssessmentAuditDrawerProps {
  projectId: number | null;
  projectName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const criteriaCategoryConfig: Record<string, { icon: ComponentType<any>; color: string; label: string }> = {
  timeline: { icon: Clock, color: "#ef4444", label: "Timeline Risk" },
  scheduling: { icon: Clock, color: "#ef4444", label: "Timeline Risk" },
  technical: { icon: Cpu, color: "#8b5cf6", label: "Technical Complexity" },
  resource: { icon: Users2, color: "#3b82f6", label: "Resource Availability" },
  customer: { icon: UserCheck, color: "#22c55e", label: "Customer Engagement" },
  stakeholder: { icon: UserCheck, color: "#22c55e", label: "Customer Engagement" },
  success_criteria: { icon: Target, color: "#f59e0b", label: "Success Criteria Definition" },
  requirements: { icon: Target, color: "#f59e0b", label: "Success Criteria Definition" },
  performance: { icon: TrendingUp, color: "#06b6d4", label: "Past Performance" },
  historical: { icon: TrendingUp, color: "#06b6d4", label: "Past Performance" },
  custom: { icon: Settings2, color: "#6b7280", label: "Custom Criteria" },
};

const getRiskLevel = (score: number) => {
  if (score > 75) return 'critical';
  if (score > 50) return 'high';
  if (score > 25) return 'medium';
  return 'low';
};

const getRiskLevelColor = (level: string) => {
  switch (level) {
    case 'critical': return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
    case 'high': return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
    case 'medium': return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
    default: return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
  }
};

export function AssessmentAuditDrawer({ projectId, projectName, open, onOpenChange }: AssessmentAuditDrawerProps) {
  const [showRawPrompt, setShowRawPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [expandedHistoryRaw, setExpandedHistoryRaw] = useState<Record<number, 'prompt' | 'response' | null>>({});
  const [historyPage, setHistoryPage] = useState(0);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<number>>(new Set());
  const [selectedReportPredictionId, setSelectedReportPredictionId] = useState<number | null>(null);
  const historyPageSize = 5;

  const { data: rawRiskPredictions = [], isLoading: predictionsLoading } = useQuery<ProjectRiskPrediction[]>({
    queryKey: ['/api/risk/predictions', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/risk/predictions/${projectId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch predictions');
      return response.json();
    },
    enabled: !!projectId && open,
    staleTime: 30 * 1000,
  });

  const { data: rulesets = [] } = useQuery({
    queryKey: ['/api/assessment/rulesets'],
    queryFn: async () => {
      const response = await fetch('/api/assessment/rulesets', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch rulesets');
      return response.json();
    },
    enabled: open,
  });

  const { data: criteria = [] } = useQuery<RiskCriteria[]>({
    queryKey: ['/api/risk/criteria'],
    enabled: open,
  });

  const riskPredictions = useMemo(() => {
    return [...rawRiskPredictions].sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [rawRiskPredictions]);

  useEffect(() => {
    if (riskPredictions.length > 0) {
      const latestId = riskPredictions[0].id;
      setExpandedHistoryIds(new Set([latestId]));
      setSelectedReportPredictionId(latestId);
      setHistoryPage(0);
      setShowRawPrompt(false);
      setShowRawResponse(false);
      setExpandedHistoryRaw({});
    }
  }, [riskPredictions]);

  const selectedReportPrediction = useMemo(() => {
    if (selectedReportPredictionId === null) return null;
    return riskPredictions.find((p: any) => p.id === selectedReportPredictionId) || null;
  }, [selectedReportPredictionId, riskPredictions]);

  const totalHistoryPages = Math.max(1, Math.ceil(riskPredictions.length / historyPageSize));
  const clampedHistoryPage = Math.min(historyPage, totalHistoryPages - 1);

  const paginatedPredictions = useMemo(() => {
    const start = clampedHistoryPage * historyPageSize;
    return riskPredictions.slice(start, start + historyPageSize);
  }, [riskPredictions, clampedHistoryPage]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-blue-600" />
            Assessment Audit Log
          </SheetTitle>
          <SheetDescription>
            {projectName && <span>{projectName}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-600" />
              Analysis History
              {riskPredictions.length > 0 && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  ({riskPredictions.length} run{riskPredictions.length !== 1 ? 's' : ''})
                </span>
              )}
            </h4>
            {predictionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : riskPredictions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No analysis history available.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedPredictions.map((prediction: any) => {
                    const globalIndex = riskPredictions.findIndex((p: any) => p.id === prediction.id);
                    const score = parseFloat(prediction.overallRiskScore);
                    const prevPrediction = riskPredictions[globalIndex + 1];
                    const prevScore = prevPrediction ? parseFloat((prevPrediction as any).overallRiskScore) : null;
                    const delta = prevScore !== null ? score - prevScore : null;
                    const level = getRiskLevel(score);
                    const isExpanded = expandedHistoryIds.has(prediction.id);
                    const isSelectedReport = selectedReportPredictionId === prediction.id;

                    return (
                      <div
                        key={prediction.id}
                        className={`rounded-lg border transition-colors ${
                          isSelectedReport
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setExpandedHistoryIds(prev => {
                              const next = new Set(prev);
                              if (next.has(prediction.id)) {
                                next.delete(prediction.id);
                              } else {
                                next.add(prediction.id);
                              }
                              return next;
                            });
                          }}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          <div className={`w-3 h-3 rounded-full shrink-0 ${
                            level === 'critical' ? 'bg-red-500' :
                            level === 'high' ? 'bg-orange-500' :
                            level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                          <div className="flex-1 min-w-0 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${getRiskLevelColor(level)}`}>
                                {level.toUpperCase()} ({Math.round(score)}%)
                              </Badge>
                              {delta !== null && delta !== 0 && (
                                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                                  delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                }`}>
                                  {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {delta > 0 ? '+' : ''}{Math.round(delta)}
                                </span>
                              )}
                              {globalIndex === 0 && (
                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">Latest</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                Confidence: {prediction.confidence ? `${Math.round(parseFloat(prediction.confidence) * 100)}%` : 'N/A'}
                              </span>
                              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 ml-6 border-t border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2">
                              <Clock className="h-3 w-3" />
                              {prediction.createdAt ? new Date(prediction.createdAt).toLocaleString() : 'Unknown'}
                              {prediction.aiProvider && (
                                <>
                                  <span>·</span>
                                  <Cpu className="h-3 w-3" />
                                  {prediction.aiProvider}{prediction.aiModel ? ` (${prediction.aiModel})` : ''}
                                </>
                              )}
                              {prediction.rulesetId && rulesets && (
                                <>
                                  <span>·</span>
                                  <Layers className="h-3 w-3 text-purple-500" />
                                  <span className="text-purple-600 dark:text-purple-400">
                                    {rulesets.find((r: any) => r.id === prediction.rulesetId)?.name || `Ruleset #${prediction.rulesetId}`}
                                  </span>
                                </>
                              )}
                            </div>
                            {(prediction.analysisResults as any)?.summary && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2">
                                {(prediction.analysisResults as any).summary}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReportPredictionId(prediction.id);
                                  setShowRawPrompt(false);
                                  setShowRawResponse(false);
                                }}
                                className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                  isSelectedReport
                                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <FileText className="h-2.5 w-2.5" />
                                Complete Report
                              </button>
                              {prediction.rawPrompt && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedHistoryRaw(prev => ({
                                      ...prev,
                                      [prediction.id]: prev[prediction.id] === 'prompt' ? null : 'prompt'
                                    }));
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                    expandedHistoryRaw[prediction.id] === 'prompt'
                                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  <MessageSquareText className="h-2.5 w-2.5" />
                                  Prompt
                                </button>
                              )}
                              {prediction.rawResponse && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedHistoryRaw(prev => ({
                                      ...prev,
                                      [prediction.id]: prev[prediction.id] === 'response' ? null : 'response'
                                    }));
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                    expandedHistoryRaw[prediction.id] === 'response'
                                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  <Code className="h-2.5 w-2.5" />
                                  Response
                                </button>
                              )}
                            </div>
                            {expandedHistoryRaw[prediction.id] === 'prompt' && prediction.rawPrompt && (
                              <pre className="mt-1.5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-[200px] overflow-y-auto leading-relaxed">
                                {prediction.rawPrompt}
                              </pre>
                            )}
                            {expandedHistoryRaw[prediction.id] === 'response' && prediction.rawResponse && (
                              <pre className="mt-1.5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-[200px] overflow-y-auto leading-relaxed">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(prediction.rawResponse), null, 2);
                                  } catch {
                                    return prediction.rawResponse;
                                  }
                                })()}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {totalHistoryPages > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                      disabled={historyPage === 0}
                      className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Page {historyPage + 1} of {totalHistoryPages}
                    </span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))}
                      disabled={historyPage >= totalHistoryPages - 1}
                      className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          {(() => {
            const reportPrediction = selectedReportPrediction;
            const reportData = reportPrediction ? {
              overallRiskScore: reportPrediction.overallRiskScore,
              confidence: reportPrediction.confidence,
              createdAt: reportPrediction.createdAt,
              aiProvider: (reportPrediction as any).aiProvider,
              aiModel: (reportPrediction as any).aiModel,
              rulesetId: reportPrediction.rulesetId,
              analysisResults: reportPrediction.analysisResults as any,
              criteriaScores: (reportPrediction as any).criteriaScores || (reportPrediction.analysisResults as any)?.criteriaScores,
              triggerReasons: (reportPrediction as any).triggerReasons || (reportPrediction.analysisResults as any)?.triggerReasons,
              recommendations: (reportPrediction as any).recommendations || (reportPrediction.analysisResults as any)?.recommendations,
              rawPrompt: reportPrediction.rawPrompt,
              rawResponse: reportPrediction.rawResponse,
            } : null;

            if (!reportData) return null;

            const reportScore = parseFloat(reportData.overallRiskScore || '0');
            const reportLevel = getRiskLevel(reportScore);

            return (
              <>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {selectedReportPredictionId === riskPredictions[0]?.id ? 'Current Risk Assessment' : 'Historical Risk Assessment'}
                    </h3>
                    <Badge className={getRiskLevelColor(reportLevel)}>
                      {reportLevel.toUpperCase()} ({Math.round(reportScore)}%)
                    </Badge>
                  </div>
                  <Progress value={reportScore} className="h-3 mb-3" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Confidence:</span>
                      <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                        {reportData.confidence
                          ? `${Math.round(parseFloat(reportData.confidence) * 100)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Analyzed:</span>
                      <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                        {reportData.createdAt
                          ? new Date(reportData.createdAt).toLocaleString()
                          : 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                {reportData.aiProvider && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Analyzed by <span className="font-medium">{reportData.aiProvider}</span>
                      {reportData.aiModel && (
                        <> · <span className="font-medium">{reportData.aiModel}</span></>
                      )}
                    </span>
                  </div>
                )}

                {reportData.rulesetId && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-purple-700 dark:text-purple-300">
                      Ruleset: <span className="font-medium">
                        {rulesets?.find((r: any) => r.id === reportData.rulesetId)?.name || `ID #${reportData.rulesetId}`}
                      </span>
                    </span>
                  </div>
                )}

                {reportData.analysisResults?.summary && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-600" />
                      Analysis Summary
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                      {reportData.analysisResults.summary}
                    </p>
                  </div>
                )}

                {reportData.criteriaScores && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-600" />
                      Criteria Scores
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">Each criterion has a weight factor that determines its influence on the overall risk score. The weight (shown as a decimal, e.g. 0.20) represents the proportion of the total score. Higher weights mean that criterion has more impact on the final risk assessment. All weights sum to 1.0 (100%).</p>
                        </TooltipContent>
                      </Tooltip>
                    </h4>
                    {reportData.rulesetId && rulesets && (
                      <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500 dark:text-gray-400">
                        <Layers className="h-3.5 w-3.5 text-purple-500" />
                        <span>Ruleset:</span>
                        <span className="font-medium text-purple-600 dark:text-purple-400">
                          {rulesets.find((r: any) => r.id === reportData.rulesetId)?.name || `Ruleset #${reportData.rulesetId}`}
                        </span>
                      </div>
                    )}
                    <div className="space-y-3">
                      {Object.entries(reportData.criteriaScores).map(([name, score]: [string, any]) => {
                        const numScore = typeof score === 'number' ? score : parseFloat(score) || 0;
                        const level = getRiskLevel(numScore);
                        const matchingCriteria = criteria?.find((c: RiskCriteria) => c.name === name);
                        const weight = matchingCriteria ? Number(matchingCriteria.weightFactor) : null;
                        const catConfig = matchingCriteria ? (criteriaCategoryConfig[matchingCriteria.category] || criteriaCategoryConfig.custom) : criteriaCategoryConfig.custom;
                        const CatIcon = catConfig.icon;
                        return (
                          <div key={name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <CatIcon className="h-4 w-4 shrink-0" style={{ color: catConfig.color }} />
                                {name}
                                {weight !== null && (
                                  <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-1 py-0.5 rounded">
                                    {weight.toFixed(2)}
                                  </span>
                                )}
                              </span>
                              <Badge className={`text-xs ${getRiskLevelColor(level)}`}>
                                {Math.round(numScore)}%
                              </Badge>
                            </div>
                            <Progress value={numScore} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Separator />

                {reportData.analysisResults?.keyRisks?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      Key Risks
                    </h4>
                    <ul className="space-y-1.5">
                      {reportData.analysisResults.keyRisks.map((risk: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reportData.triggerReasons?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      Trigger Reasons
                    </h4>
                    <ul className="space-y-1.5">
                      {reportData.triggerReasons.map((reason: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reportData.recommendations?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-green-600" />
                      Recommendations
                    </h4>
                    <ul className="space-y-1.5">
                      {reportData.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reportData.analysisResults?.mitigationStrategies?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-600" />
                      Mitigation Strategies
                    </h4>
                    <ul className="space-y-1.5">
                      {reportData.analysisResults.mitigationStrategies.map((strategy: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                          {strategy}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reportData.analysisResults?.confidenceFactors?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      <Info className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      Confidence Factors
                    </h4>
                    <ul className="space-y-1.5">
                      {reportData.analysisResults.confidenceFactors.map((factor: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(reportData.rawPrompt || reportData.rawResponse) && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Code className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      Raw AI Data
                    </h4>

                    {reportData.rawPrompt && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setShowRawPrompt(!showRawPrompt)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                        >
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <MessageSquareText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            Raw Prompt Sent to AI
                          </span>
                          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showRawPrompt ? 'rotate-180' : ''}`} />
                        </button>
                        {showRawPrompt && (
                          <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto leading-relaxed">
                              {reportData.rawPrompt}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {reportData.rawResponse && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setShowRawResponse(!showRawResponse)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                        >
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <Code className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                            Raw AI Response (JSON)
                          </span>
                          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showRawResponse ? 'rotate-180' : ''}`} />
                        </button>
                        {showRawResponse && (
                          <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto leading-relaxed">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(reportData.rawResponse), null, 2);
                                } catch {
                                  return reportData.rawResponse;
                                }
                              })()}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
