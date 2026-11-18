export interface DataSourceField {
  key: string;
  label: string;
  description: string;
  group: string;
  fieldType: "text" | "date" | "number" | "array" | "json" | "boolean" | "relation";
  relatedTable?: string;
}

export interface DataSourceGroup {
  key: string;
  label: string;
  description: string;
  fields: DataSourceField[];
}

export const DATA_SOURCE_GROUPS: DataSourceGroup[] = [
  {
    key: "core",
    label: "Core Project Info",
    description: "Basic project identification and status fields",
    fields: [
      { key: "project.name", label: "Project Name", description: "Auto-generated project identifier", group: "core", fieldType: "text" },
      { key: "project.customerName", label: "Customer Name", description: "Name of the customer organization", group: "core", fieldType: "text" },
      { key: "project.solutionName", label: "Solution Name", description: "Name of the solution being validated", group: "core", fieldType: "text" },
      { key: "project.status", label: "Project Status", description: "Current project status (planning, active, completed, on_hold)", group: "core", fieldType: "text" },
      { key: "project.customerStatus", label: "Customer Status", description: "Customer-facing status (On Time, Delayed, Need Assistance, etc.)", group: "core", fieldType: "text" },
      { key: "project.industry", label: "Industry", description: "Customer's industry vertical", group: "core", fieldType: "text" },
      { key: "project.environment", label: "Environment", description: "Deployment environment context", group: "core", fieldType: "text" },
      { key: "project.type", label: "Project Type", description: "Type classification of the project", group: "core", fieldType: "text" },
      { key: "project.tags", label: "Tags", description: "Project tags and labels", group: "core", fieldType: "array" },
    ]
  },
  {
    key: "timeline",
    label: "Timeline & Dates",
    description: "Project scheduling and timeline information",
    fields: [
      { key: "project.startDate", label: "Start Date", description: "Project start date", group: "timeline", fieldType: "date" },
      { key: "project.endDate", label: "End Date", description: "Project target end date", group: "timeline", fieldType: "date" },
      { key: "project.completedDate", label: "Completed Date", description: "Actual completion date", group: "timeline", fieldType: "date" },
      { key: "computed.daysRemaining", label: "Days Remaining", description: "Calculated days until end date", group: "timeline", fieldType: "number" },
      { key: "computed.daysSinceStart", label: "Days Since Start", description: "Calculated days since start date", group: "timeline", fieldType: "number" },
      { key: "computed.totalDuration", label: "Total Duration (days)", description: "Total planned project duration in days", group: "timeline", fieldType: "number" },
      { key: "computed.percentTimeElapsed", label: "% Time Elapsed", description: "Percentage of timeline consumed", group: "timeline", fieldType: "number" },
    ]
  },
  {
    key: "business",
    label: "Business Context",
    description: "Business justification, opportunity, and financial data",
    fields: [
      { key: "project.businessProblem", label: "Business Problem", description: "Customer's business problem statement", group: "business", fieldType: "text" },
      { key: "project.solutionDescription", label: "Solution Description", description: "Description of the proposed solution", group: "business", fieldType: "text" },
      { key: "project.customerObjective", label: "Customer Objective", description: "Customer's stated objectives", group: "business", fieldType: "text" },
      { key: "project.opportunityAcvValue", label: "Opportunity ACV Value", description: "Annual contract value of the opportunity", group: "business", fieldType: "text" },
      { key: "project.salesforceEvaluationLink", label: "Salesforce Link", description: "Link to Salesforce evaluation record", group: "business", fieldType: "text" },
      { key: "project.salesStage", label: "Sales Stage", description: "Current stage in the sales pipeline (from Salesforce)", group: "business", fieldType: "text" },
      { key: "project.forecastCategory", label: "Forecast Category", description: "Sales forecast category (Pipeline, Best Case, Commit, etc.)", group: "business", fieldType: "text" },
    ]
  },
  {
    key: "team",
    label: "Team & Resources",
    description: "Assigned engineers, stakeholders, and team members",
    fields: [
      { key: "project.primaryEngineer", label: "Primary Engineer", description: "Assigned primary solution engineer (name & details)", group: "team", fieldType: "text" },
      { key: "project.specialistEngineer", label: "Specialist Engineer", description: "Assigned specialist engineer (name & details)", group: "team", fieldType: "text" },
      { key: "project.supportingEngineers", label: "Supporting Engineers", description: "List of supporting engineer IDs", group: "team", fieldType: "array" },
      { key: "project.customerStakeholder", label: "Customer Stakeholder", description: "Primary customer stakeholder contact", group: "team", fieldType: "text" },
      { key: "project.additionalSupportingTeam", label: "Additional Support Team", description: "CX, ProServ, Product, Support team members", group: "team", fieldType: "array" },
      { key: "project.accountRepresentativeId", label: "Account Representative", description: "Opportunity representative user", group: "team", fieldType: "text" },
    ]
  },
  {
    key: "risk_status",
    label: "Risk & Classification",
    description: "Risk levels, rankings, and classification fields",
    fields: [
      { key: "project.risk", label: "Risk Level", description: "Manual risk classification (Red, Yellow, None)", group: "risk_status", fieldType: "text" },
      { key: "project.ranking", label: "Ranking", description: "Opportunity ranking (In Quarter, Upside, Stretch, etc.)", group: "risk_status", fieldType: "text" },
      { key: "project.riskScore", label: "Previous AI Risk Score", description: "Last AI-calculated risk score (0-100)", group: "risk_status", fieldType: "number" },
      { key: "project.lastRiskAnalysis", label: "Last Analysis Date", description: "When AI risk was last analyzed", group: "risk_status", fieldType: "date" },
    ]
  },
  {
    key: "notes",
    label: "Notes & Documentation",
    description: "Free-text notes, plans, and policy considerations",
    fields: [
      { key: "project.policyConsiderations", label: "Policy Considerations", description: "Policy and compliance considerations", group: "notes", fieldType: "text" },
      { key: "project.notes", label: "General Notes", description: "Free-text project notes", group: "notes", fieldType: "text" },
      { key: "project.feedbackComments", label: "Feedback Comments", description: "Customer or internal feedback", group: "notes", fieldType: "text" },
      { key: "project.mgmtNotes", label: "Management Notes", description: "Notes synced with Salesforce", group: "notes", fieldType: "text" },
      { key: "project.currentSituation", label: "Current Situation / Next Steps", description: "Current situation and next steps (Salesforce synced)", group: "notes", fieldType: "text" },
      { key: "project.engineerNotes", label: "Engineer Notes", description: "Technical engineer notes (Salesforce synced)", group: "notes", fieldType: "text" },
    ]
  },
  {
    key: "related",
    label: "Related Data (Tables)",
    description: "Data from related tables like success criteria, MAP tasks, and gap analysis",
    fields: [
      { key: "related.successCriteria", label: "Success Criteria", description: "All success criteria defined for the project (name, status, category, priority)", group: "related", fieldType: "relation", relatedTable: "success_criteria" },
      { key: "related.mapPhases", label: "MAP Phases & Tasks", description: "Mutual Action Plan phases, steps, and task completion status", group: "related", fieldType: "relation", relatedTable: "map_phases" },
      { key: "related.gapAnalysis", label: "Gap Analysis Items", description: "Solution gaps identified with criticality ratings (MoSCoW)", group: "related", fieldType: "relation", relatedTable: "gap_analysis" },
      { key: "related.activityLog", label: "Activity Log", description: "Recent project activity entries (last 20)", group: "related", fieldType: "relation", relatedTable: "activity_log" },
      { key: "related.complianceRegulations", label: "Compliance Regulations", description: "Associated compliance regulations and requirements", group: "related", fieldType: "relation", relatedTable: "compliance_regulations" },
      { key: "related.projectLinks", label: "Project Links", description: "External links and resources attached to the project", group: "related", fieldType: "relation", relatedTable: "project_links" },
      { key: "related.artifacts", label: "Artifacts", description: "Customer-uploaded artifacts and documents (metadata only)", group: "related", fieldType: "relation", relatedTable: "customer_artifacts" },
      { key: "related.infrastructureProfiles", label: "Infrastructure Profiles", description: "Customer infrastructure environment profiles and technical data", group: "related", fieldType: "relation", relatedTable: "infrastructure_profiles" },
    ]
  },
  {
    key: "closure",
    label: "Closure & TCC",
    description: "Technically Cleared to Close (TCC) and closure-related fields",
    fields: [
      { key: "project.tccCommitteeApproval", label: "TCC Committee Approval", description: "Whether TCC committee approval has been granted", group: "closure", fieldType: "boolean" },
      { key: "project.tapTccApproved", label: "TAP TCC Approved", description: "TCC checkbox synced with Salesforce", group: "closure", fieldType: "boolean" },
    ]
  }
];

export function getAllDataSourceKeys(): string[] {
  return DATA_SOURCE_GROUPS.flatMap(g => g.fields.map(f => f.key));
}

export function getDataSourceByKey(key: string): DataSourceField | undefined {
  for (const group of DATA_SOURCE_GROUPS) {
    const field = group.fields.find(f => f.key === key);
    if (field) return field;
  }
  return undefined;
}

export function getRelatedDataSources(keys: string[]): string[] {
  return keys
    .filter(k => k.startsWith("related."))
    .map(k => {
      const field = getDataSourceByKey(k);
      return field?.relatedTable || "";
    })
    .filter(Boolean);
}
