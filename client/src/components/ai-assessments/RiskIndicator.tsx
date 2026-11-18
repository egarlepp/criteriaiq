import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  Brain, 
  TrendingUp, 
  ShieldUser, 
  Target, 
  Clock,
  Info,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";

interface RiskData {
  riskScore: string;
  riskLevel?: string;
  lastRiskAnalysis?: string;
  riskPrediction?: {
    overallRiskScore: string;
    riskLevel: string;
    criteriaScores: Record<string, number>;
    analysisResults: {
      summary: string;
      keyRisks: string[];
      mitigationStrategies: string[];
      confidenceFactors: string[];
    };
    confidence: string;
    triggerReasons: string[];
    recommendations: string[];
    createdAt?: string;
  };
}

interface RiskIndicatorProps {
  project: RiskData;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  className?: string;
}

export function RiskIndicator({ 
  project, 
  size = "md", 
  showDetails = false,
  className = "" 
}: RiskIndicatorProps) {
  const [showDialog, setShowDialog] = useState(false);
  
  const riskScore = project.riskPrediction?.overallRiskScore || project.riskScore || "0";
  const numericScore = parseFloat(riskScore);
  const riskLevel = project.riskPrediction?.riskLevel || project.riskLevel || getRiskLevel(numericScore);
  const lastAnalysis = project.riskPrediction?.createdAt || project.lastRiskAnalysis;

  function getRiskLevel(score: number): string {
    if (score > 75) return "critical";
    if (score > 50) return "high";
    if (score > 25) return "medium";
    return "low";
  }

  function getRiskConfig(level: string) {
    switch (level.toLowerCase()) {
      case "critical":
        return {
          color: "destructive",
          bgColor: "bg-red-50 border-red-200",
          textColor: "text-red-800",
          icon: XCircle,
          label: "CRITICAL"
        };
      case "high":
        return {
          color: "destructive",
          bgColor: "bg-orange-50 border-orange-200", 
          textColor: "text-orange-800",
          icon: AlertCircle,
          label: "HIGH"
        };
      case "medium":
        return {
          color: "secondary",
          bgColor: "bg-yellow-50 border-yellow-200",
          textColor: "text-yellow-800", 
          icon: AlertTriangle,
          label: "MEDIUM"
        };
      case "low":
      default:
        return {
          color: "secondary",
          bgColor: "bg-green-50 border-green-200",
          textColor: "text-green-800",
          icon: CheckCircle,
          label: "LOW"
        };
    }
  }

  const config = getRiskConfig(riskLevel);
  const IconComponent = config.icon;

  // No risk data available
  if (!riskScore && !project.riskPrediction) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Brain className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">No risk analysis</span>
      </div>
    );
  }

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm", 
    lg: "text-base"
  };

  if (size === "sm") {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <IconComponent className="w-3 h-3" />
        <Badge variant={config.color as any} className={sizeClasses[size]}>
          {config.label} ({Math.round(numericScore)}%)
        </Badge>
      </div>
    );
  }

  if (!showDetails && !project.riskPrediction) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <IconComponent className="w-4 h-4" />
        <Badge variant={config.color as any} className={sizeClasses[size]}>
          {config.label} ({Math.round(numericScore)}%)
        </Badge>
        {lastAnalysis && (
          <span className="text-xs text-gray-500">
            {new Date(lastAnalysis).toLocaleDateString()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className={`${config.bgColor} ${config.textColor} border hover:opacity-80`}
          >
            <IconComponent className="w-4 h-4 mr-2" />
            Risk: {config.label} ({Math.round(numericScore)}%)
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-blue-600" />
              <span>AI Assessment Analysis</span>
            </DialogTitle>
            <DialogDescription>
              Comprehensive assessment analysis powered by artificial intelligence
            </DialogDescription>
          </DialogHeader>

          {project.riskPrediction ? (
            <div className="space-y-6">
              {/* Overall Risk Score */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Overall Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <IconComponent className={`w-8 h-8 ${config.textColor}`} />
                      <div>
                        <div className="text-2xl font-bold">{Math.round(numericScore)}%</div>
                        <Badge variant={config.color as any} className="mt-1">
                          {config.label} RISK
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <div>Confidence: {Math.round(parseFloat(project.riskPrediction.confidence) * 100)}%</div>
                      {lastAnalysis && (
                        <div>Analyzed: {new Date(lastAnalysis).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                  <Progress value={numericScore} className="h-3" />
                  
                  {project.riskPrediction.analysisResults.summary && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm">{project.riskPrediction.analysisResults.summary}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Criteria Scores */}
              {project.riskPrediction.criteriaScores && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Target className="w-5 h-5" />
                      <span>Assessment Criteria Breakdown</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(project.riskPrediction.criteriaScores).map(([criteria, score]) => (
                        <div key={criteria} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{criteria}</span>
                            <span className={score > 50 ? "text-orange-600 font-semibold" : "text-gray-600"}>
                              {Math.round(score)}%
                            </span>
                          </div>
                          <Progress value={score} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Risks and Mitigation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {project.riskPrediction.analysisResults.keyRisks.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <span>Key Risk Factors</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {project.riskPrediction.analysisResults.keyRisks.map((risk, index) => (
                          <li key={index} className="flex items-start space-x-2 text-sm">
                            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 shrink-0" />
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {project.riskPrediction.analysisResults.mitigationStrategies.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <ShieldUser className="w-5 h-5 text-green-600" />
                        <span>Mitigation Strategies</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {project.riskPrediction.analysisResults.mitigationStrategies.map((strategy, index) => (
                          <li key={index} className="flex items-start space-x-2 text-sm">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0" />
                            <span>{strategy}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Recommendations */}
              {project.riskPrediction.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <span>Recommended Actions</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {project.riskPrediction.recommendations.map((recommendation, index) => (
                        <li key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                          <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                            {index + 1}
                          </div>
                          <span className="text-sm">{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Confidence Factors */}
              {project.riskPrediction.analysisResults.confidenceFactors.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Info className="w-5 h-5 text-gray-600" />
                      <span>Analysis Confidence Factors</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {project.riskPrediction.analysisResults.confidenceFactors.map((factor, index) => (
                        <li key={index} className="flex items-start space-x-2 text-sm text-gray-600">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 shrink-0" />
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No detailed assessment analysis available.</p>
              <p className="text-sm text-gray-500 mt-2">
                Risk score: {Math.round(numericScore)}% ({config.label})
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}