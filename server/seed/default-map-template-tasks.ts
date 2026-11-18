// AUTO-GENERATED snapshot of the 29 tasks under the default MAP template.

  export interface DefaultMapTemplateTaskSeed {
    phase_local_key: string;
    step_local_key: string;
    name: string;
    description: string;
    order_index: number;
    default_status: string;
    expected_hours: string;
    default_due_offset_days: number;
    default_start_offset_days: number;
    send_external_emails: boolean;
    team_owned: string;
  }

  export const DEFAULT_MAP_TEMPLATE_TASK_SEEDS: ReadonlyArray<DefaultMapTemplateTaskSeed> = [
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_scope",
    "name": "Define objectives, outcomes, and scope",
    "description": "Document the business problem, desired outcomes, in/out-of-scope items, constraints, and success metrics to align stakeholders.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "1.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "Engineering"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_scope",
    "name": "Identify critical requirements, use cases, and success criteria; prioritize them",
    "description": "Elicit key functional and non-functional requirements; list target use cases; assign priorities and measurable acceptance criteria.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "1.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_scope",
    "name": "Choose the appropriate solutions and architecture",
    "description": "Select the products, integrations, and reference architecture that best map to the prioritized use cases and constraints.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.50",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_scope",
    "name": "Define what success looks like",
    "description": "Translate outcomes into KPIs/OKRs, baseline current state, and agree on how success will be measured and reported.",
    "order_index": 3,
    "default_status": "not_started",
    "expected_hours": "1.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_kickoff",
    "name": "Assemble the project team and assign roles",
    "description": "Identify executive sponsor, product owner, SE/architects, SMEs, and pilot users; clarify RACI and decision rights.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.50",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_kickoff",
    "name": "Review scheduling, artifacts, and architecture",
    "description": "Confirm the project timeline, environments, prerequisites, and any existing diagrams, data flows, and security requirements.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.50",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_kickoff",
    "name": "Define communication cadence",
    "description": "Set stand-ups, weekly status, and executive checkpoints; choose tools/channels; agree on reporting format.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.50",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "planning",
    "step_local_key": "planning_kickoff",
    "name": "Align stakeholders; Signoff",
    "description": "Run a kickoff meeting to confirm scope, deliverables, and risks; capture decisions and obtain written go-ahead.",
    "order_index": 3,
    "default_status": "not_started",
    "expected_hours": "0.50",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "implementation",
    "step_local_key": "implementation_install",
    "name": "Create the agreed design and architecture",
    "description": "Produce a lightweight design spec covering components, integrations, roles, data flows, and controls aligned to the Project scope.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "implementation",
    "step_local_key": "implementation_install",
    "name": "Review and install solution(s)",
    "description": "Validate prerequisites and security approvals; deploy software/appliances/agents; connect required data sources and identity providers.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "implementation",
    "step_local_key": "implementation_configure",
    "name": "Build core features necessary to validate concepts and use cases",
    "description": "Configure policies, detectors, playbooks, and workflows that directly support the prioritized use cases.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "implementation",
    "step_local_key": "implementation_configure",
    "name": "Document the technical validation process and decisions made",
    "description": "Record steps, config choices, test data, and any deviations so results are reproducible and auditable.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "implementation",
    "step_local_key": "implementation_configure",
    "name": "Identify and document product gaps and feature enhancements",
    "description": "Capture limitations, workarounds, and enhancement requests with impact assessment for roadmap review.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "validation",
    "step_local_key": "validation_testing",
    "name": "Thoroughly test use cases to identify and address issues",
    "description": "Execute end-to-end and negative tests; validate integrations, data quality, and security controls; log defects.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "validation",
    "step_local_key": "validation_testing",
    "name": "Conduct validation tests to ensure expected behavior",
    "description": "Run acceptance tests against defined success criteria; measure outcomes versus baselines.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "validation",
    "step_local_key": "validation_evaluate",
    "name": "Evaluate results and Document testing results and findings",
    "description": "Summarize evidence, screenshots, logs, and metrics; track pass/fail status and remediation actions.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "validation",
    "step_local_key": "validation_feedback",
    "name": "Gather stakeholder feedback",
    "description": "Facilitate demos and debriefs; collect qualitative feedback from pilot users, SMEs, and security/compliance teams.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "validation",
    "step_local_key": "validation_feedback",
    "name": "Evaluate the Projects performance and alignment with objectives",
    "description": "Synthesize test results and feedback to assess business value, risk, and fit; recommend go/iterate/no-go options.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "confirmation",
    "step_local_key": "confirmation_documentation",
    "name": "Create the Project report (findings, value, and recommendations)",
    "description": "Compile outcomes, KPIs, TCO/ROI indicators, risks, gaps, and proposed next steps; include lessons learned.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "confirmation",
    "step_local_key": "confirmation_documentation",
    "name": "Executive review and decision",
    "description": "Present the report to sponsors; confirm decision, budget alignment, and ownership of follow-up actions.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "confirmation",
    "step_local_key": "confirmation_transition",
    "name": "Plan the transition to production or pilot",
    "description": "Draft a high-level implementation plan with timelines, owners, environments, data migration, and change management.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "confirmation",
    "step_local_key": "confirmation_transition",
    "name": "Warm handoff with PSO/CSM",
    "description": "Introduce delivery and customer success teams; transfer context, artifacts, and decisions; confirm engagement scope.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "confirmation",
    "step_local_key": "confirmation_transition",
    "name": "Procurement and SOW readiness",
    "description": "Finalize bill of materials, licensing, and services scope; align SOW, assumptions, and acceptance criteria with legal/procurement.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_support",
    "name": "Establish support model and SLAs",
    "description": "Define support tiers, escalation paths, response targets, and maintenance windows; set up ticketing and monitoring.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_support",
    "name": "Knowledge transfer and runbooks",
    "description": "Provide admin training and runbooks for common tasks, troubleshooting, and incident response procedures.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_support",
    "name": "Adoption and enablement plan",
    "description": "Schedule enablement sessions, create quick-start guides, and plan communications for user adoption.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_closure",
    "name": "Formal closeout and acceptance",
    "description": "Obtain written acceptance, confirm deliverables complete, and transition to steady‑state ownership.",
    "order_index": 0,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_closure",
    "name": "Archive artifacts and decommission Project assets",
    "description": "Store designs, configs, and evidence in the system of record; remove temporary data, licenses, and test accounts.",
    "order_index": 1,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  },
  {
    "phase_local_key": "onboarding",
    "step_local_key": "onboarding_closure",
    "name": "Retrospective and next 90day roadmap",
    "description": "Run a retro to capture wins and improvements; publish the next 90-day plan with milestones and risks.",
    "order_index": 2,
    "default_status": "not_started",
    "expected_hours": "0.00",
    "default_due_offset_days": 7,
    "default_start_offset_days": 0,
    "send_external_emails": true,
    "team_owned": "N/A"
  }
];

export const DEFAULT_MAP_TEMPLATE_EXPECTED_TASK_COUNT = 29;

// ---------------------------------------------------------------------------
// Phase + step shape under the same default template.
//
// These structures are hand-maintained (rather than dumped from the dev
// workspace) because the names + descriptions are part of the visible
// product UX and we want them reviewed in code review just like any other
// user-facing copy. The `localKey` columns must be STABLE SLUGS — never
// the `phase_<id>` / `step_<id>` form Postgres auto-defaults to — because
// `step.phase_local_key` and `task.{phase,step}_local_key` join back to
// these slugs across every install.

export interface DefaultMapTemplatePhaseSeed {
  localKey: string;
  name: string;
  description: string;
  orderIndex: number;
}

export interface DefaultMapTemplateStepSeed {
  phaseLocalKey: string;
  localKey: string;
  name: string;
  description: string;
  orderIndex: number;
}

export const DEFAULT_MAP_TEMPLATE_PHASE_DATA: ReadonlyArray<DefaultMapTemplatePhaseSeed> = [
  {
    localKey: "planning",
    name: "Planning",
    description: "Initial project planning and requirements definition",
    orderIndex: 0,
  },
  {
    localKey: "implementation",
    name: "Implementation",
    description: "Solution setup and configuration",
    orderIndex: 1,
  },
  {
    localKey: "validation",
    name: "Validation",
    description: "Testing and validation of the implemented solution",
    orderIndex: 2,
  },
  {
    localKey: "confirmation",
    name: "Confirmation",
    description: "Final acceptance and sign-off",
    orderIndex: 3,
  },
  {
    localKey: "onboarding",
    name: "Onboarding",
    description: "Knowledge transfer and project closure",
    orderIndex: 4,
  },
];

export const DEFAULT_MAP_TEMPLATE_STEP_DATA: ReadonlyArray<DefaultMapTemplateStepSeed> = [
  // Planning
  {
    phaseLocalKey: "planning",
    localKey: "planning_scope",
    name: "Scope",
    description:
      "Align on problem statement, in-scope systems, and measurable success criteria. Identify stakeholders, constraints, risks, and timelines.",
    orderIndex: 0,
  },
  {
    phaseLocalKey: "planning",
    localKey: "planning_kickoff",
    name: "Kickoff",
    description:
      "Formal launch to confirm scope, roles, milestones, and comms cadence. Share day-one tasks and access needs so execution starts immediately.",
    orderIndex: 1,
  },
  // Implementation
  {
    phaseLocalKey: "implementation",
    localKey: "implementation_install",
    name: "Install",
    description:
      "Deploy the product/agents/connectors into the target environment under least-privilege and change control. Validate prerequisites, network paths, and logging. Record versions and environment notes for reproducibility.",
    orderIndex: 0,
  },
  {
    phaseLocalKey: "implementation",
    localKey: "implementation_configure",
    name: "Configure",
    description:
      "Map use cases to features, policies, and integrations (directories, clouds, SIEM, ticketing). Set RBAC, alerting, data sources, and safe defaults. Document any non-standard settings and rationale.",
    orderIndex: 1,
  },
  // Validation
  {
    phaseLocalKey: "validation",
    localKey: "validation_testing",
    name: "Testing",
    description:
      "Execute agreed test cases to prove success criteria and capture metrics (coverage, fidelity, performance). Simulate key events where needed and compare expected vs. actual outcomes. Track defects and remediation actions.",
    orderIndex: 0,
  },
  {
    phaseLocalKey: "validation",
    localKey: "validation_evaluate",
    name: "Evaluate",
    description:
      "Assess validation results against technical requirements and business objectives. Determine readiness for next phase and identify any gaps requiring remediation.",
    orderIndex: 1,
  },
  {
    phaseLocalKey: "validation",
    localKey: "validation_feedback",
    name: "Feedback",
    description:
      'Review the results with stakeholders to identify what worked, what needs tuning, and any unexpected outcomes. Prioritize adjustments and lock the path to "meets/exceeds" on each success measure.',
    orderIndex: 2,
  },
  // Confirmation
  {
    phaseLocalKey: "confirmation",
    localKey: "confirmation_documentation",
    name: "Documentation",
    description:
      "Produce the BVA: architecture diagram, config snapshot, test evidence, and runbook. Capture assumptions, known issues, and operational considerations to de-risk next steps.",
    orderIndex: 0,
  },
  {
    phaseLocalKey: "confirmation",
    localKey: "confirmation_transition",
    name: "Transition",
    description:
      "Hand off learnings to production/next-phase owners via enablement and artifacts. Agree on ownership, timelines, and any pre-prod hardening or gaps to close.",
    orderIndex: 1,
  },
  // Onboarding
  {
    phaseLocalKey: "onboarding",
    localKey: "onboarding_support",
    name: "Support",
    description:
      "Establish the support model: SLAs, contacts, escalation path, and monitoring dashboards. Enable ticket flows and knowledge base entries so ops isn't flying blind.",
    orderIndex: 0,
  },
  {
    phaseLocalKey: "onboarding",
    localKey: "onboarding_closure",
    name: "Closure",
    description:
      "Confirm objectives met against success criteria and summarize ROI/business impact. Decommission project assets or promote configurations per the go/no-go decision and communicate outcomes to all stakeholders.",
    orderIndex: 1,
  },
];

// ---------------------------------------------------------------------------
// Default roles seed payload (Task #680).
//
// The 11 baseline roles every install ships with. Names are the
// stable identity column (`roles.name UNIQUE`) — the rest are
// admin-tunable. `displayName` is what the UI labels render
// (note: ProServ's display label is "Services").

export interface DefaultRoleSeed {
  name: string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
}

export const DEFAULT_ROLE_SEEDS: ReadonlyArray<DefaultRoleSeed> = [
  { name: "Admin", displayName: "Admin", description: "Full system administrator access", color: "#dc2626", icon: "UserStar" },
  { name: "CX", displayName: "CX", description: "Customer Experience and Customer Success team access.", color: "#be185d", icon: "UserCheck" },
  { name: "Customer", displayName: "Customer", description: "External customer access to assigned projects.", color: "#059669", icon: "User" },
  { name: "Engineer", displayName: "Engineer", description: "Solution Engineer with project management access", color: "#2563eb", icon: "UserCog" },
  { name: "Guest", displayName: "Guest", description: "Limited read-only access", color: "#6b7280", icon: "UserPlus" },
  { name: "Leader", displayName: "Leader", description: "Engineering Leader", color: "#003785", icon: "Crown" },
  { name: "Partner", displayName: "Partner", description: "Partner organization access", color: "#ca8a04", icon: "Users" },
  { name: "ProServ", displayName: "Services", description: "Professional Services team access", color: "#ea580c", icon: "UserSearch" },
  { name: "Product", displayName: "Product", description: "Product team access to analytics and feedback", color: "#16d05a", icon: "UserLock" },
  { name: "Sales", displayName: "Sales", description: "Sales team access to projects and analytics", color: "#7c3aed", icon: "UserPen" },
  { name: "Support", displayName: "Support", description: "Customer Support team access", color: "#0891b2", icon: "PhoneCall" },
];
  