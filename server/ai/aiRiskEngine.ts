import { aiService } from "./ai-service";
import { storage } from "../storage";
import { PocWithRelations, RiskCriteria, ProjectRiskPrediction, AssessmentRuleset } from "@shared/schema";
import { getDataSourceByKey } from "./assessment-data-sources";
import { getDocContentForAssessment } from "../services/docs-sync-service";
import { isMapItemComplete } from "@shared/map-status";

interface RiskAnalysisResult {
  overallRiskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  criteriaScores: Record<string, number>;
  analysisResults: {
    summary: string;
    keyRisks: string[];
    mitigationStrategies: string[];
    confidenceFactors: string[];
  };
  confidence: number;
  triggerReasons: string[];
  recommendations: string[];
  aiProvider?: string;
  aiModel?: string;
  rawPrompt?: string;
  rawResponse?: string;
}

export class AIRiskEngine {
  
  async initializeDefaultCriteria(): Promise<void> {
    const existingRulesets = await storage.getAllAssessmentRulesets();
    
    if (existingRulesets.length === 0) {
      const riskRuleset = await storage.createAssessmentRuleset({
        name: "Risk Assessment",
        category: "risk",
        description: "Comprehensive risk analysis covering timeline, technical complexity, resources, customer engagement, and historical performance factors",
        isActive: true,
        isDefault: true,
        totalWeight: "1.00",
      });

      const riskCriteriaList = [
        { name: "Timeline Risk", description: "Risk related to project timeline constraints and deadline feasibility", category: "timeline", severity: "high", weightFactor: "0.20" },
        { name: "Technical Complexity Risk", description: "Risk based on technical requirements complexity and solution difficulty", category: "technical", severity: "critical", weightFactor: "0.25" },
        { name: "Resource Availability Risk", description: "Risk related to availability of required engineers and specialists", category: "resource", severity: "high", weightFactor: "0.15" },
        { name: "Customer Engagement Risk", description: "Risk based on customer responsiveness and engagement patterns", category: "customer", severity: "medium", weightFactor: "0.10" },
        { name: "Success Criteria Definition Risk", description: "Risk related to clarity and achievability of defined success criteria", category: "success_criteria", severity: "high", weightFactor: "0.15" },
        { name: "Past Project Performance Risk", description: "Risk assessment based on historical project outcomes and patterns", category: "performance", severity: "medium", weightFactor: "0.15" },
      ];

      for (const c of riskCriteriaList) {
        await storage.createRiskCriteria({ ...c, rulesetId: riskRuleset.id, isActive: true });
      }

      const productRuleset = await storage.createAssessmentRuleset({
        name: "Product Readiness",
        category: "product",
        description: "Evaluate product readiness for deployment including feature completeness, stability, documentation, and integration readiness",
        isActive: true,
        isDefault: true,
        totalWeight: "1.00",
      });

      const productCriteriaList = [
        { name: "Feature Completeness", description: "Assessment of whether all required features are fully implemented and functional", category: "technical", severity: "critical", weightFactor: "0.25" },
        { name: "Solution Stability", description: "Evaluation of solution stability, bug frequency, and reliability under load", category: "technical", severity: "high", weightFactor: "0.20" },
        { name: "Documentation Quality", description: "Completeness and accuracy of technical documentation, user guides, and API references", category: "resource", severity: "medium", weightFactor: "0.15" },
        { name: "Integration Readiness", description: "Readiness of the solution to integrate with customer's existing infrastructure and systems", category: "technical", severity: "high", weightFactor: "0.20" },
        { name: "Performance Benchmarks", description: "Whether the solution meets defined performance benchmarks and SLA requirements", category: "performance", severity: "high", weightFactor: "0.20" },
      ];

      for (const c of productCriteriaList) {
        await storage.createRiskCriteria({ ...c, rulesetId: productRuleset.id, isActive: true });
      }

      const engagementRuleset = await storage.createAssessmentRuleset({
        name: "Engagement Health",
        category: "engagement",
        description: "Monitor and assess customer engagement health including stakeholder involvement, communication quality, and relationship strength",
        isActive: true,
        isDefault: true,
        totalWeight: "1.00",
      });

      const engagementCriteriaList = [
        { name: "Stakeholder Involvement", description: "Level of active participation from key customer stakeholders in validation activities", category: "customer", severity: "high", weightFactor: "0.25" },
        { name: "Communication Responsiveness", description: "Speed and quality of customer responses to inquiries, requests, and action items", category: "customer", severity: "high", weightFactor: "0.20" },
        { name: "Decision Making Velocity", description: "Speed at which the customer makes decisions on technical and business matters", category: "customer", severity: "medium", weightFactor: "0.15" },
        { name: "Resource Commitment", description: "Customer's commitment to providing necessary resources, environments, and access", category: "resource", severity: "high", weightFactor: "0.20" },
        { name: "Executive Sponsorship", description: "Strength and visibility of executive sponsor engagement and support", category: "customer", severity: "critical", weightFactor: "0.20" },
      ];

      for (const c of engagementCriteriaList) {
        await storage.createRiskCriteria({ ...c, rulesetId: engagementRuleset.id, isActive: true });
      }
    }

    const existingCriteria = await storage.getAllRiskCriteria();
    const orphanedCriteria = existingCriteria.filter(c => !c.rulesetId);
    if (orphanedCriteria.length > 0) {
      console.log(`Found ${orphanedCriteria.length} orphaned criteria without a ruleset. Cleaning up...`);
      for (const c of orphanedCriteria) {
        await storage.deleteRiskCriteria(c.id);
      }
    }
  }

  async analyzeProject(project: PocWithRelations, rulesetId?: number): Promise<RiskAnalysisResult> {
    try {
      const rawCriteria = rulesetId 
        ? await storage.getRulesetCriteria(rulesetId)
        : await storage.getActiveRiskCriteria();
      const activeCriteria = rawCriteria.filter(c => c.isActive !== false);
      
      if (activeCriteria.length === 0) {
        throw new Error("No active assessment criteria found. Please initialize assessment criteria first.");
      }

      let ruleset: AssessmentRuleset | undefined;
      if (rulesetId) {
        ruleset = await storage.getAssessmentRuleset(rulesetId);
      }

      const relatedData = await this.fetchRelatedData(project, activeCriteria);

      let docContext = "";
      try {
        const allDocKeys = new Set<string>();
        for (const c of activeCriteria) {
          const sections = (c as any).docSections as string[] | null;
          if (sections && Array.isArray(sections)) {
            sections.forEach(k => allDocKeys.add(k));
          }
        }

        if (allDocKeys.size > 0 && (project as any).solutionId) {
          const docResult = await getDocContentForAssessment(
            (project as any).solutionId,
            Array.from(allDocKeys)
          );
          if (docResult.sections && docResult.sections.length > 0) {
            docContext = docResult.sections
              .map(s => `### ${s.title}\n${s.content}`)
              .join("\n\n---\n\n");
          }
        }
      } catch (err) {
        console.warn("[AI Assessment] Failed to fetch doc context, continuing without:", err);
      }

      const analysisPrompt = this.buildAnalysisPrompt(project, activeCriteria, ruleset, relatedData, docContext);
      const systemMessage = "You are an expert AI system specializing in technical validation project risk analysis. Your role is to assess project risks based on provided criteria and return structured JSON analysis. You MUST respond with valid JSON only — no markdown, no code fences, no extra text.";
      
      const fullPrompt = `## System Message\n\n${systemMessage}\n\n## User Prompt\n\n${analysisPrompt}`;

      const response = await aiService.chat(
        [
          { role: "system", content: systemMessage },
          { role: "user", content: analysisPrompt }
        ],
        {
          temperature: 0.3,
          maxTokens: 4096
        }
      );

      let rawContent = response.content.trim();
      const rawResponseText = rawContent;

      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        rawContent = jsonMatch[1].trim();
      }

      const analysisData = JSON.parse(rawContent);
      
      const result = this.processAnalysisResponse(analysisData, activeCriteria);
      result.aiProvider = response.provider;
      result.aiModel = response.model;
      result.rawPrompt = fullPrompt;
      result.rawResponse = rawResponseText;
      return result;
    } catch (error: any) {
      console.error("AI Assessment Analysis Error:", error);
      throw new Error(`Failed to analyze project risk: ${error.message}`);
    }
  }

  async analyzeMultipleProjects(projects: PocWithRelations[], rulesetId?: number): Promise<{
    success: number;
    failed: number;
    results: Array<{ projectId: number; success: boolean; error?: string }>;
  }> {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const project of projects) {
      try {
        const analysis = await this.analyzeProject(project, rulesetId);
        await this.savePrediction(project.id, analysis, rulesetId);
        results.push({ projectId: project.id, success: true });
        success++;
      } catch (error: any) {
        console.error(`Failed to analyze project ${project.id}:`, error);
        results.push({ 
          projectId: project.id, 
          success: false, 
          error: error.message 
        });
        failed++;
      }
    }

    return { success, failed, results };
  }

  private async savePrediction(projectId: number, analysis: RiskAnalysisResult, rulesetId?: number): Promise<void> {
    const predictionData = {
      projectId,
      rulesetId: rulesetId || null,
      overallRiskScore: analysis.overallRiskScore.toString(),
      riskLevel: analysis.riskLevel,
      criteriaScores: analysis.criteriaScores,
      analysisResults: analysis.analysisResults,
      confidence: analysis.confidence.toString(),
      triggerReasons: analysis.triggerReasons,
      recommendations: analysis.recommendations,
      aiProvider: analysis.aiProvider || null,
      aiModel: analysis.aiModel || null,
      rawPrompt: analysis.rawPrompt || null,
      rawResponse: analysis.rawResponse || null,
      createdAt: new Date()
    };

    const previousPrediction = await storage.getLatestRiskPrediction(projectId);
    const previousScore = previousPrediction ? parseFloat(previousPrediction.overallRiskScore) : null;

    await storage.createRiskPrediction(predictionData);

    await storage.updatePoc(projectId, {
      riskScore: analysis.overallRiskScore.toString(),
      riskPredictionData: {
        riskLevel: analysis.riskLevel,
        criteriaScores: analysis.criteriaScores,
        analysisResults: analysis.analysisResults,
        confidence: analysis.confidence,
        triggerReasons: analysis.triggerReasons,
        recommendations: analysis.recommendations,
        previousScore: previousScore,
        aiProvider: analysis.aiProvider || null,
        aiModel: analysis.aiModel || null,
      },
      lastRiskAnalysis: new Date(),
    });

    if (analysis.riskLevel === "high" || analysis.riskLevel === "critical") {
      await storage.createRiskAlert({
        projectId,
        alertType: analysis.riskLevel === "critical" ? "critical" : "high_risk",
        severity: analysis.riskLevel,
        message: `Project risk level: ${analysis.riskLevel}. ${analysis.analysisResults.summary}`,
      });
    }
  }

  private async fetchRelatedData(project: PocWithRelations, criteria: RiskCriteria[]): Promise<Record<string, any>> {
    const allDataSources = new Set<string>();
    let hasAnyCriteriaWithSources = false;

    for (const c of criteria) {
      const sources = (c as any).dataSources as string[] | null;
      if (sources && Array.isArray(sources) && sources.length > 0) {
        hasAnyCriteriaWithSources = true;
        sources.forEach(s => allDataSources.add(s));
      }
    }

    if (!hasAnyCriteriaWithSources) {
      return {};
    }

    const relatedData: Record<string, any> = {};

    if (allDataSources.has("related.successCriteria")) {
      try {
        const sc = await storage.getSuccessCriteriaByPoc(project.id);
        relatedData.successCriteria = sc.map(item => ({
          productName: item.productName,
          criterion: item.criterion,
          expectedOutcome: item.expectedOutcome,
          actionItem: item.actionItem,
          status: item.status,
          notes: item.notes,
        }));
      } catch { relatedData.successCriteria = []; }
    }

    if (allDataSources.has("related.mapPhases")) {
      try {
        const map = await storage.getProjectMap(project.id);
        relatedData.mapPhases = {
          totalPhases: map.phases.length,
          totalSteps: map.steps.length,
          totalTasks: map.tasks.length,
          completedTasks: map.tasks.filter(t => isMapItemComplete(t.status)).length,
          phases: map.phases.map(p => ({
            name: p.name,
            status: p.status,
            orderIndex: p.orderIndex,
          })),
        };
      } catch { relatedData.mapPhases = null; }
    }

    if (allDataSources.has("related.activityLog")) {
      try {
        const logs = await storage.getActivityLogsByPoc(project.id);
        relatedData.activityLog = logs.slice(0, 20).map(log => ({
          action: log.action,
          details: log.details,
          createdAt: log.createdAt,
          userName: log.user?.firstName ? `${log.user.firstName} ${log.user.lastName}` : "Unknown",
        }));
      } catch { relatedData.activityLog = []; }
    }

    if (allDataSources.has("related.gapAnalysis")) {
      try {
        const { db } = await import("../db");
        const { projectGaps } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const gaps = await db.select().from(projectGaps).where(eq(projectGaps.projectId, project.id));
        relatedData.gapAnalysis = gaps.map((g: any) => ({
          title: g.title,
          description: g.description,
          criticality: g.criticality,
          status: g.status,
          impact: g.impact,
        }));
      } catch { relatedData.gapAnalysis = []; }
    }

    return relatedData;
  }

  private extractProjectField(project: PocWithRelations, key: string): any {
    const fieldMap: Record<string, () => any> = {
      "project.name": () => project.name,
      "project.customerName": () => project.customerName,
      "project.solutionName": () => project.solutionName,
      "project.status": () => project.status,
      "project.customerStatus": () => project.customerStatus,
      "project.industry": () => project.industry,
      "project.environment": () => project.environment,
      "project.type": () => project.type,
      "project.tags": () => project.tags,
      "project.startDate": () => project.startDate,
      "project.endDate": () => project.endDate,
      "project.completedDate": () => project.completedDate,
      "computed.daysRemaining": () => project.endDate ? Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
      "computed.daysSinceStart": () => project.startDate ? Math.ceil((Date.now() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24)) : null,
      "computed.totalDuration": () => project.startDate && project.endDate ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24)) : null,
      "computed.percentTimeElapsed": () => {
        if (!project.startDate || !project.endDate) return null;
        const total = new Date(project.endDate).getTime() - new Date(project.startDate).getTime();
        const elapsed = Date.now() - new Date(project.startDate).getTime();
        return total > 0 ? Math.round((elapsed / total) * 100) : null;
      },
      "project.businessProblem": () => project.businessProblem,
      "project.solutionDescription": () => project.solutionDescription,
      "project.customerObjective": () => project.customerObjective,
      "project.opportunityAcvValue": () => project.opportunityAcvValue,
      "project.salesforceEvaluationLink": () => project.salesforceEvaluationLink,
      "project.salesStage": () => project.salesStage,
      "project.forecastCategory": () => project.forecastCategory,
      "project.primaryEngineer": () => project.primarySe ? `${project.primarySe.firstName} ${project.primarySe.lastName}` : null,
      "project.specialistEngineer": () => project.specialistSe ? `${project.specialistSe.firstName} ${project.specialistSe.lastName}` : null,
      "project.supportingEngineers": () => project.supportingEngineers,
      "project.customerStakeholder": () => project.customerStakeholder,
      "project.additionalSupportingTeam": () => project.additionalSupportingTeam,
      "project.accountRepresentativeId": () => project.accountRepresentative ? `${project.accountRepresentative.firstName} ${project.accountRepresentative.lastName}` : null,
      "project.risk": () => project.risk,
      "project.ranking": () => project.ranking,
      "project.riskScore": () => project.riskScore,
      "project.lastRiskAnalysis": () => project.lastRiskAnalysis,
      "project.policyConsiderations": () => project.policyConsiderations,
      "project.notes": () => project.notes,
      "project.feedbackComments": () => project.feedbackComments,
      "project.mgmtNotes": () => project.mgmtNotes,
      "project.currentSituation": () => project.currentSituation,
      "project.engineerNotes": () => project.engineerNotes,
      "project.tccCommitteeApproval": () => project.tccCommitteeApproval,
      "project.tapTccApproved": () => project.tapTccApproved,
    };

    const getter = fieldMap[key];
    return getter ? getter() : undefined;
  }

  private buildProjectDataFromSources(project: PocWithRelations, dataSources: string[], relatedData: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key of dataSources) {
      if (key.startsWith("related.")) {
        const relKey = key.replace("related.", "");
        if (relatedData[relKey] !== undefined) {
          result[relKey] = relatedData[relKey];
        }
        continue;
      }

      const sourceDef = getDataSourceByKey(key);
      const label = sourceDef?.label || key;
      const value = this.extractProjectField(project, key);
      if (value !== undefined && value !== null) {
        result[label] = value;
      }
    }

    return result;
  }

  private buildAnalysisPrompt(
    project: PocWithRelations,
    criteria: RiskCriteria[],
    ruleset?: AssessmentRuleset,
    relatedData: Record<string, any> = {},
    docContext: string = ""
  ): string {
    const allDataSources = new Set<string>();
    let hasAnyCriteriaWithSources = false;

    for (const c of criteria) {
      const sources = (c as any).dataSources as string[] | null;
      if (sources && Array.isArray(sources) && sources.length > 0) {
        hasAnyCriteriaWithSources = true;
        sources.forEach(s => allDataSources.add(s));
      }
    }

    let projectDataSection: string;

    if (hasAnyCriteriaWithSources) {
      const projectData = this.buildProjectDataFromSources(project, Array.from(allDataSources), relatedData);
      projectDataSection = JSON.stringify(projectData, null, 2);
    } else {
      const legacyProjectInfo = {
        id: project.id,
        customerName: project.customerName,
        solutionName: project.solutionName,
        status: project.status,
        customerStatus: project.customerStatus,
        startDate: project.startDate,
        endDate: project.endDate,
        primaryEngineer: project.primarySe ? `${project.primarySe.firstName} ${project.primarySe.lastName}` : null,
        specialistEngineer: project.specialistSe ? `${project.specialistSe.firstName} ${project.specialistSe.lastName}` : null,
        businessProblem: project.businessProblem,
        successCriteria: project.successCriteria?.length || 0,
        daysRemaining: project.endDate ? Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
        daysSinceStart: project.startDate ? Math.ceil((Date.now() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24)) : null,
      };
      projectDataSection = JSON.stringify(legacyProjectInfo, null, 2);
    }

    const criteriaInfo = criteria.map(c => {
      const info: any = {
        name: c.name,
        description: c.description,
        category: c.category,
        severity: c.severity,
        weight: c.weightFactor,
      };
      const sources = (c as any).dataSources as string[] | null;
      if (sources && Array.isArray(sources) && sources.length > 0) {
        info.evaluateUsing = sources.map(s => {
          const def = getDataSourceByKey(s);
          return def?.label || s;
        });
      }
      return info;
    });

    let additionalInstructionsSection = "";
    if (ruleset?.additionalInstructions) {
      additionalInstructionsSection = `\nADDITIONAL INSTRUCTIONS:\n${ruleset.additionalInstructions}\n`;
    }

    let documentationSection = "";
    if (docContext) {
      documentationSection = `\nPRODUCT DOCUMENTATION CONTEXT:\nThe following is relevant product documentation that should inform your assessment. Use this context to evaluate technical feasibility, product capabilities, and implementation complexity.\n\n${docContext}\n`;
    }

    let outputFormatSection: string;
    if (ruleset?.outputFormatTemplate) {
      outputFormatSection = `Respond with ONLY valid JSON (no markdown, no code fences) using this output format:\n${ruleset.outputFormatTemplate}`;
    } else {
      const criteriaScoresExample = criteria.reduce((acc, c) => {
        acc[c.name] = "number";
        return acc;
      }, {} as Record<string, string>);

      outputFormatSection = `Respond with ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "overallRiskScore": number,
  "riskLevel": "low|medium|high|critical",
  "criteriaScores": ${JSON.stringify(criteriaScoresExample, null, 4)},
  "analysisResults": {
    "summary": "Brief 2-3 sentence risk summary",
    "keyRisks": ["Risk factor 1", "Risk factor 2", "Risk factor 3"],
    "mitigationStrategies": ["Strategy 1", "Strategy 2", "Strategy 3"],
    "confidenceFactors": ["Factor affecting confidence 1", "Factor 2"]
  },
  "confidence": number,
  "triggerReasons": ["Reason 1", "Reason 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`;
    }

    return `
Analyze this technical validation project for risk factors and provide a comprehensive risk assessment.

PROJECT DATA:
${projectDataSection}

RISK ASSESSMENT CRITERIA:
${JSON.stringify(criteriaInfo, null, 2)}
${additionalInstructionsSection}${documentationSection}
ANALYSIS REQUIREMENTS:
1. Evaluate the project against each criterion (0-100 score for each)
2. Calculate overall risk score (weighted average)
3. Determine risk level: low (0-25), medium (26-50), high (51-75), critical (76-100)
4. Identify key risk factors and mitigation strategies
5. Provide actionable recommendations
6. Assess confidence in the analysis (0-1 scale)
${hasAnyCriteriaWithSources ? "\nNote: Each criterion specifies which data fields it should be evaluated against. Focus your analysis for each criterion on the relevant data indicated by its 'evaluateUsing' field.\n" : `
Consider factors such as:
- Timeline pressure and feasibility
- Resource allocation and availability
- Technical complexity and challenges
- Customer engagement and responsiveness
- Success criteria clarity and achievability
- Historical project performance patterns
- Current project status and progress
`}
${outputFormatSection}
`;
  }

  private processAnalysisResponse(data: any, criteria: RiskCriteria[]): RiskAnalysisResult {
    const overallRiskScore = Math.max(0, Math.min(100, data.overallRiskScore || 0));
    
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (overallRiskScore > 75) riskLevel = "critical";
    else if (overallRiskScore > 50) riskLevel = "high";
    else if (overallRiskScore > 25) riskLevel = "medium";

    const criteriaScores: Record<string, number> = {};
    criteria.forEach(criterion => {
      criteriaScores[criterion.name] = Math.max(0, Math.min(100, 
        data.criteriaScores?.[criterion.name] || overallRiskScore
      ));
    });

    return {
      overallRiskScore,
      riskLevel,
      criteriaScores,
      analysisResults: {
        summary: data.analysisResults?.summary || "Risk analysis completed successfully.",
        keyRisks: Array.isArray(data.analysisResults?.keyRisks) ? 
          data.analysisResults.keyRisks.slice(0, 5) : [],
        mitigationStrategies: Array.isArray(data.analysisResults?.mitigationStrategies) ? 
          data.analysisResults.mitigationStrategies.slice(0, 5) : [],
        confidenceFactors: Array.isArray(data.analysisResults?.confidenceFactors) ? 
          data.analysisResults.confidenceFactors.slice(0, 3) : []
      },
      confidence: Math.max(0, Math.min(1, data.confidence || 0.7)),
      triggerReasons: Array.isArray(data.triggerReasons) ? 
        data.triggerReasons.slice(0, 3) : [],
      recommendations: Array.isArray(data.recommendations) ? 
        data.recommendations.slice(0, 5) : []
    };
  }
}

export const aiRiskEngine = new AIRiskEngine();
