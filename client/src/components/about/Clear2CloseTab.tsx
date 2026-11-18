import { useState, type ReactNode, type ComponentType } from "react";
import { Link as RouterLink } from "wouter";
import { Stage5AFramework } from "@/components/about/Stage5AFramework";
import { fillRecordName, useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Atom,
  Workflow,
  Plus,
  Target,
  CheckCircle,
  Users,
  BarChart3,
  Brain,
  BrainCircuit,
  Rocket,
  CheckCircle2,
  Mail,
  Settings,
  BookOpen,
  SquareTerminal,
  Info,
  ClipboardPenLine,
  Boxes,
  PackageCheck,
  Clock,
  AlertTriangle,
  CircleX,
  Waypoints,
  ChevronRight,
  ChevronDown,
  MapPinCheck,
  ListChecks,
  Send,
  Handshake,
  FolderOpen,
  NotebookTabs,
  FolderTree,
  ImagePlus,
  SlidersHorizontal,
  Toolbox,
  DoorOpen,
  DoorClosed,
  FileText,
  Siren,
  Lightbulb,
  ArrowRightCircle,
  TrendingUp,
  ShieldAlert,
  Calendar,
  LayoutDashboard,
  Globe,
  Building,
  SquareKanban,
  AlignVerticalSpaceAround,
  FolderCode,
  FolderOpenDot,
  Blocks,
  ChartNetwork,
  Package,
  HandHeart,
  LayoutList,
  Activity,
  Cloud,
  BookMarked,
  Link2,
  UserCheck,
  OctagonX,
  Dna,
} from "lucide-react";

// --- Types ---
type AppLink = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href: string;
  external?: boolean;
};
type ActionData = {
  text: string;
  details: string[];
  links?: AppLink[];
};
type ArtifactLink = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  external?: boolean;
};
type CriterionData = {
  text: string;
  links?: AppLink[];
};

// Returns true for any href that should open outside the SPA router
const isExternalHref = (href: string, explicit?: boolean) =>
  explicit === true ||
  href.startsWith("http://") ||
  href.startsWith("https://");

// --- Helper Components ---
const CollapsibleNavItem = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="space-y-2">
        <CollapsibleTrigger className="w-full group">
          <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md p-1 -ml-1 transition-colors">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Icon className="h-4 w-4 text-gray-500 group-hover:text-blue-500 transition-colors" />
              {title}
            </h3>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </div>
        </CollapsibleTrigger>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </div>
      <CollapsibleContent className="ml-6 mt-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4 animate-in fade-in slide-in-from-top-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

const ActionItem = ({
  action,
  dotClass,
}: {
  action: ActionData;
  dotClass: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const hasDetails = action.details && action.details.length > 0;
  const hasLinks = action.links && action.links.length > 0;

  return (
    <div className="bg-card p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
      <div
        className={`flex items-start gap-3 ${hasDetails ? "cursor-pointer group" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div
          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-transform ${hasDetails && expanded ? "scale-125" : ""} ${dotClass}`}
        />
        <div className="flex-1">
          <span
            className={`text-sm font-medium leading-snug transition-colors ${hasDetails ? "group-hover:text-blue-600 dark:group-hover:text-blue-400" : "text-foreground"}`}
          >
            {fillRecordName(action.text, record)}
          </span>
          {hasDetails && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-medium">
              <span className="text-blue-500/70">
                {expanded ? "Hide Details" : "View Details"}
              </span>
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </div>
          )}
        </div>
      </div>

      {hasDetails && expanded && (
        <ul className="ml-5 mt-2 space-y-1 animate-in fade-in slide-in-from-top-1 border-l-2 border-muted pl-3">
          {action.details.map((detail: string, i: number) => (
            <li
              key={i}
              className="text-xs text-muted-foreground flex items-start gap-1.5"
            >
              <span className="text-[10px] mt-0.5 opacity-50">■</span> {detail}
            </li>
          ))}
        </ul>
      )}

      {hasLinks && (
        <div className="mt-2.5 pt-2 border-t border-muted/60 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide font-semibold mr-0.5">
            Open:
          </span>
          {action.links!.map((link: AppLink, i: number) => {
            const LinkIcon = link.icon;
            const ext = isExternalHref(link.href, link.external);
            const triggerEl = ext ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary border border-border/60 transition-colors"
              >
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ) : (
              <RouterLink
                href={link.href}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary border border-border/60 transition-colors"
              >
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </RouterLink>
            );
            return (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>{triggerEl}</TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p>
                      {ext ? "Open outside app" : "Open in app"} · {link.label}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Main Tab Component ---
export const Clear2CloseTab = () => {
  const [activePhase, setActivePhase] = useState(0);
  const [criteriaView, setCriteriaView] = useState<"entrance" | "exit">(
    "entrance",
  );
  const [activeExtraTopic, setActiveExtraTopic] = useState(0);
  const [extraTopicsOpen, setExtraTopicsOpen] = useState(false);

  // Consolidated Validation Data
  const validationStages: {
    title: string;
    phaseIcon: ComponentType<{ className?: string }>;
    bgClass: string;
    borderClass: string;
    titleClass: string;
    textClass: string;
    dotClass: string;
    iconColor: string;
    purpose: string;
    owners: { primary: string; supporting: string[] };
    entranceCriteria: CriterionData[];
    exitCriteria: CriterionData[];
    requiredArtifacts: ArtifactLink[];
    escalationRules: string[];
    actions: ActionData[];
    responsibilities: { role: string; desc: string }[];
  }[] = [
    {
      title: "Define the Proof and Attach",
      phaseIcon: SlidersHorizontal,
      bgClass: "bg-blue-50 dark:bg-blue-950/30",
      borderClass: "border-blue-200 dark:border-blue-900",
      titleClass: "text-blue-900 dark:text-blue-100",
      textClass: "text-blue-800 dark:text-blue-200",
      dotClass: "bg-blue-500",
      iconColor: "text-blue-500",
      purpose:
        "Align and prove the business problem, technical use cases, validation scope, stakeholders, and success criteria.",
      owners: {
        primary: "Project Engineer",
        supporting: [
          "Opportunity Owner",
          "Account Technical Champion",
          "Specialist Engineer (as needed)",
        ],
      },
      entranceCriteria: [
        {
          text: "Opportunity is formally qualified using MEDDPICC",
          links: [{ icon: Plus, label: "Create Project", href: "/create" }],
        },
        { text: "Initial discovery and alignment are complete" },
        {
          text: "Opportunity moved to Align in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
        { text: "NDA is signed (if required)" },
        { text: "Customer has agreed to evaluate a technical solution" },
        {
          text: "Attached To Opportunity in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
        {
          text: "{{record}} and TAP are created in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
      ],
      exitCriteria: [
        {
          text: "Project is created in CriteriaIQ",
          links: [{ icon: Plus, label: "Create Project", href: "/create" }],
        },
        {
          text: "Validation use cases are defined",
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Stakeholders are identified",
          links: [
            {
              icon: Users,
              label: "Account Users",
              href: "/project?tab=customers&subtab=team-users",
            },
          ],
        },
        {
          text: "Success criteria are agreed upon",
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
            {
              icon: Blocks,
              label: "Criteria Builder",
              href: "/templates?tab=criteria-builder",
            },
          ],
        },
        {
          text: "Assumptions are validated and communicated",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
        {
          text: "Dependencies are defined",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Defined the plan: a Quick plan or a full MAP template",
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        { text: "Validation scope is bounded" },
        {
          text: "Validation calendar is blocked",
          links: [
            {
              icon: Calendar,
              label: "Project Calendar",
              href: "/project?tab=validation&subtab=calendar",
            },
          ],
        },
      ],
      requiredArtifacts: [
        {
          label: "Mutual Action Plan (MAP)",
          icon: Waypoints,
          href: "/project?tab=validation&subtab=map",
        },
        {
          label: "Validation Criteria",
          icon: LayoutList,
          href: "/success-criteria?tab=criteria",
        },
        {
          label: "Validation Criteria Templates",
          icon: Blocks,
          href: "/templates?tab=criteria-builder",
        },
        {
          label: "High-level Architecture Notes",
          icon: FileText,
          href: "/project?tab=artifacts&subtab=documents",
        },
      ],
      escalationRules: [
        "Misaligned success criteria → Escalate to Opportunity Owner/Sales Leadership",
        "Stalled internal approvals → Escalate to Customer Economic Buyer",
      ],
      actions: [
        {
          text: "Identify the full stakeholder map",
          details: [
            "Economic buyer",
            "Technical buyer",
            "Admin/operator",
            "Security/compliance owner",
            "Data owner",
            "Identity owner",
            "Endpoint/email/cloud owner",
            "Project sponsor",
          ],
          links: [
            {
              icon: Users,
              label: "Account Users",
              href: "/project?tab=customers&subtab=team-users",
            },
            {
              icon: Building,
              label: "Account Directory",
              href: "/project?tab=customers&subtab=accounts",
            },
          ],
        },
        {
          text: "Clarify why the customer is evaluating now",
          details: [
            "Pain points",
            "Triggering event",
            "Risk event",
            "Operational inefficiency",
            "Compliance pressure",
            "Competitive displacement",
          ],
          links: [{ icon: Plus, label: "Create Project", href: "/create" }],
        },
        {
          text: "Validate project assumptions and investigate dependencies",
          details: [],
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },        
        {
          text: "Define in-scope outcomes and out-of-scope expectations",
          details: [],
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Break down success criteria",
          details: ["Must-have", "Should-have", "Nice-to-have"],
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
            {
              icon: Blocks,
              label: "Criteria Builder",
              href: "/templates?tab=criteria-builder",
            },
          ],
        },
        {
          text: "Define what counts as acceptable evidence",
          details: [
            "Alert fired",
            "Policy matched",
            "Sensitive data found",
            "Privileged activity discovered",
            "Workflow executed",
            "Report generated",
            "Integration proven",
            "Admin task reduced",
          ],
          links: [
            {
              icon: CheckCircle,
              label: "Expected Outcomes",
              href: "/success-criteria?tab=outcomes",
            },
          ],
        },
        {
          text: "Build the validation hypothesis",
          details: [
            '"If we connect X and configure Y, we should prove Z business value."',
            "Map technical capabilities to business outcomes using value mapping",
            "Confirm who approves technical success / TCC-style clearance",
          ],
          links: [
            {
              icon: HandHeart,
              label: "Value Mapping",
              href: "/success-criteria?tab=value-mapping",
            },
          ],
        },
        {
          text: "Build the initial project governance model",
          details: [
            "Meeting cadence",
            "Working session cadence",
            "Escalation path",
            "Decision owners",
          ],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
        {
          text: "Document risks, assumptions, dependencies, and known blockers",
          details: [],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Set the first project milestones and owners",
          details: [],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
      ],
      responsibilities: [
        {
          role: "Project/Specialist Engineer",
          desc: "Owns solution fit hypothesis, success criteria definition, stakeholder alignment, business-to-technical translation, overall validation strategy, technical feasibility input, prerequisite identification, environment constraints, and implementation considerations.",
        },
        {
          role: "Customer",
          desc: "Owns stakeholder availability, access sponsorship, internal coordination, and business signoff on outcomes.",
        },
        {
          role: "Opportunity Owner",
          desc: "Owns commercial context, close plan alignment, political map, timeline pressure, and executive coordination.",
        },
      ],
    },
    {
      title: "Assess the Validation",
      phaseIcon: Toolbox,
      bgClass: "bg-amber-50 dark:bg-amber-950/30",
      borderClass: "border-amber-200 dark:border-amber-900",
      titleClass: "text-amber-900 dark:text-amber-100",
      textClass: "text-amber-800 dark:text-amber-200",
      dotClass: "bg-amber-500",
      iconColor: "text-amber-500",
      purpose:
        "Turn the agreed validation design into a runnable environment and set operational readiness.",
      owners: {
        primary: "Project Engineer or Specialist Engineer",
        supporting: [
          "Opportunity Owner",
          "Customer Admin",
          "Customer Security/Network Team",
          "Supporting Engineers (as needed)",
        ],
      },
      entranceCriteria: [
        {
          text: "Validation scope signed off by customer",
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "Opportunity moved to Scope in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
        { text: "Technical prerequisites shared with customer" },
        {
          text: "Define the plan: a Quick plan or a full MAP template",
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Validation dates confirmed",
          links: [
            {
              icon: Calendar,
              label: "Project Calendar",
              href: "/project?tab=validation&subtab=calendar",
            },
          ],
        },
        {
          text: "Key technical dependencies are tracked in the registry",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Assumptions that affect environment setup are confirmed or flagged before work begins",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
      ],
      exitCriteria: [
        {
          text: "Connectivity verified",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        { text: "Permissions are sufficient" },
        { text: "Required sources are onboarded" },
        {
          text: "Kickoff is complete",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "MAP is loaded with actions",
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
        {
          text: "MAP is loaded with owners/dates",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "First measurable use case can be executed",
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "All environment-level dependencies are resolved",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Any Stage 1 assumptions that proved false during setup are updated and re-communicated",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
      ],
      requiredArtifacts: [
        {
          label: "Environment Prerequisites Checklist",
          icon: FileText,
          href: "/project?tab=artifacts&subtab=documents",
        },
        {
          label: "Service Account Specifications",
          icon: FolderCode,
          href: "/project?tab=artifacts&subtab=code-scripts",
        },
        {
          label: "Configured AI Assessment Context",
          icon: Brain,
          href: "/ai-risk-management?tab=docs",
        },
        {
          label: "Mutual Action Plan (MAP)",
          icon: Waypoints,
          href: "/project?tab=validation&subtab=map",
        },
        {
          label: "Validation Criteria",
          icon: LayoutList,
          href: "/success-criteria?tab=criteria",
        },
        {
          label: "Validation Criteria Templates",
          icon: Blocks,
          href: "/templates?tab=criteria-builder",
        },
        {
          label: "Assumptions Register",
          icon: BookMarked,
          href: "/project?tab=validation&subtab=assumptions",
        },
        {
          label: "Dependencies Register",
          icon: Link2,
          href: "/project?tab=validation&subtab=dependencies",
        },
      ],
      escalationRules: [
        "Port/Firewall blocks → Network Admin (NOC) & Customer Champion",
        "Missing required licenses →  Project/Specialist Engineer & Opportunity Owner",
      ],
      actions: [
        {
          text: "Create the project/account structure",
          details: [],
          links: [
            { icon: Plus, label: "Create Project", href: "/create" },
            {
              icon: Building,
              label: "Account Directory",
              href: "/project?tab=customers&subtab=accounts",
            },
          ],
        },
        {
          text: "Configure internal and external participants & Role-based Access",
          details: [],
          links: [
            {
              icon: Users,
              label: "Account Users",
              href: "/project?tab=customers&subtab=team-users",
            },
            {
              icon: Settings,
              label: "Configuration",
              href: "/admin?tab=configuration",
            },
          ],
        },
        {
          text: "Prepare customer-facing portal visibility",
          details: [],
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "Gather all technical prerequisites",
          details: [
            "Access methods",
            "Service accounts",
            "API keys",
            "Certificates",
            "Endpoints",
            "Firewall exceptions",
            "Authentication requirements",
            "Retention/logging settings",
          ],
          links: [
            {
              icon: FileText,
              label: "Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
          ],
        },
        {
          text: "Validate environment prerequisites",
          details: [
            "Directory services",
            "Entra/Azure AD / AD",
            "M365 / email sources",
            "Endpoints / agents",
            "Cloud sources",
            "PAM targets",
            "Data repositories",
            "Ticketing/SIEM/webhook targets",
          ],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
        {
          text: "Identify and register any new assumptions or dependencies discovered during environment assessment",
          details: [
            "Connectivity constraints not known at scoping",
            "License or entitlement requirements",
            "Data availability or retention dependencies",
            "Customer access timeline assumptions",
          ],
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Define installation/configuration sequence in the MAP",
          details: [],
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Prepare test resources for proof",
          details: [
            "Test identities",
            "Data sets",
            "Sample files",
            "Risky users",
            "Privileged accounts",
            "Policy examples",
          ],
          links: [
            {
              icon: FolderCode,
              label: "Code & Scripts",
              href: "/project?tab=artifacts&subtab=code-scripts",
            },
            {
              icon: FileText,
              label: "Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
          ],
        },
        {
          text: "Configure or import documentation, artifacts, scripts, and reference material",
          details: [],
          links: [
            {
              icon: FileText,
              label: "Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
            {
              icon: FolderOpen,
              label: "Links",
              href: "/project?tab=artifacts&subtab=links",
            },
            {
              icon: FolderCode,
              label: "Code & Scripts",
              href: "/project?tab=artifacts&subtab=code-scripts",
            },
          ],
        },
        {
          text: "Load the MAP with Phases, Steps, tasks. Assign dates, owners, dependencies, and milestones",
          details: [],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
        {
          text: "Load the MAP with actions, tasks, dates, owners, and dependencies",
          details: [],
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
        {
          text: "Set up communication cadence & automation",
          details: [
            "Kickoff",
            "Weekly working sessions",
            "Steering readout",
            "Escalation points",
            "Email/workflow automations",
            "AI assessments config",
          ],
          links: [
            {
              icon: Mail,
              label: "Communications",
              href: "/admin?tab=email-logs",
            },
            {
              icon: Brain,
              label: "AI Assessments",
              href: "/ai-risk-management?tab=projects",
            },
          ],
        },
        {
          text: "Run a dry check before customer-facing proof sessions",
          details: [],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
          ],
        },
      ],
      responsibilities: [
        {
          role: "Project/Specialist Engineer",
          desc: "Owns readiness against validation objectives, kickoff quality, making sure setup supports the proof, connector readiness, installation sequencing, tech troubleshooting, and dependency checks.",
        },
        {
          role: "Customer Team",
          desc: "Owns access provisioning, internal approvals, network/security changes, and availability of admins/test resources.",
        },
        {
          role: "Opportunity Owner",
          desc: "Owns commercial context, removing barriers to close, building executive buyin, driving timeline pressure, and executive coordination.",
        },
      ],
    },
    {
      title: "Affect the Validation",
      phaseIcon: Rocket,
      bgClass: "bg-green-50 dark:bg-green-950/30",
      borderClass: "border-green-200 dark:border-green-900",
      titleClass: "text-green-900 dark:text-green-100",
      textClass: "text-green-800 dark:text-green-200",
      dotClass: "bg-green-500",
      iconColor: "text-green-500",
      purpose:
        "Execute the proof, tune the solution, document evidence, and manage risk to Technical clearance to close (TCC).",
      owners: {
        primary: "Project Engineer or Specialist Engineer",
        supporting: [
          "Customer Operators/Admins",
          "Customer Technical Champion",
          "Opportunity Owner",
          "Supporting Engineers (as needed)",
          "Professional Services",
        ],
      },
      entranceCriteria: [
        {
          text: "Kickoff meeting concluded",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "MAP is loaded",
          links: [
            {
              icon: ChartNetwork,
              label: "MAP Library",
              href: "/templates?tab=map-library",
            },
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Opportunity moved to Validate in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
        { text: "Environment connectivity verified" },
        { text: "Initial data ingest / baseline established" },
        {
          text: "All critical assumptions affecting proof execution are confirmed or acknowledged as known risks",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
        {
          text: "Blocking dependencies are resolved or have an approved workaround before proof sessions begin",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
      ],
      exitCriteria: [
        {
          text: "Success Criteria achieved, waived, or marked unmet",
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Gaps documented with impact & workarounds",
          links: [
            {
              icon: AlignVerticalSpaceAround,
              label: "Gap Analysis",
              href: "/project?tab=validation&subtab=gap-analysis",
            },
          ],
        },
        {
          text: "Technical risk is fully understood",
          links: [
            {
              icon: Brain,
              label: "AI Assessments",
              href: "/ai-risk-management?tab=projects",
            },
          ],
        },
        { text: "Stakeholders know the recommendation" },
        {
          text: "Deal team has a defensible tech close position",
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
        {
          text: "All open assumptions are documented as Confirmed, Violated, or Accepted-at-risk",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
        {
          text: "All dependencies are in a terminal state: Resolved, Fail, Blocked, or Inconclusive",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
      ],
      requiredArtifacts: [
        {
          label: "Weekly Status Reports",
          icon: BarChart3,
          href: "/reports",
        },
        {
          label: "Evidence Log (Screenshots/Exports)",
          icon: FileText,
          href: "/project?tab=artifacts&subtab=documents",
        },
        {
          label: "Gap Analysis Tracker",
          icon: AlignVerticalSpaceAround,
          href: "/project?tab=validation&subtab=gap-analysis",
        },
        {
          label: "Assumptions Register",
          icon: BookMarked,
          href: "/project?tab=validation&subtab=assumptions",
        },
        {
          label: "Dependencies Register",
          icon: Link2,
          href: "/project?tab=validation&subtab=dependencies",
        },
      ],
      escalationRules: [
        "Critical product bug/gap → Product Management & Dev/Eng",
        "Customer disengagement/no-shows → Customer Champion & Opportunity Owner",
      ],
      actions: [
        {
          text: "Execute the validation plan use case by use case",
          details: [
            "Run structured technical workshops, not random feature tours",
          ],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Demonstrate outcomes in customer language",
          details: [
            "Detect",
            "Discover",
            "Classify",
            "Control",
            "Alert",
            "Investigate",
            "Prove policy effectiveness",
            "Reduce manual effort",
          ],
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "Tune the solution",
          details: [
            "Policies",
            "Thresholds",
            "Collectors",
            "Workflows",
            "Targeting",
          ],
          links: [
            {
              icon: Activity,
              label: "Actions Taken",
              href: "/success-criteria?tab=actions",
            },
          ],
        },
        {
          text: "Compare actual findings/results to the agreed success criteria",
          details: [],
          links: [
            {
              icon: CheckCircle,
              label: "Expected Outcomes",
              href: "/success-criteria?tab=outcomes",
            },
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Document evidence continuously",
          details: [
            "Screenshots",
            "Logs",
            "Reports",
            "Artifacts",
            "Customer acknowledgements",
          ],
          links: [
            {
              icon: FileText,
              label: "Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
            {
              icon: Activity,
              label: "Actions Taken",
              href: "/success-criteria?tab=actions",
            },
          ],
        },
        {
          text: "Keep MAP status current",
          details: [
            "Tasks complete/incomplete",
            "Blockers",
            "Dates at risk",
            "Owners",
            "Overall project health",
          ],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Track and update the Assumptions & Dependencies register as the proof progresses",
          details: [
            "Update dependency status as each resolves or blocks",
            "Flag any assumption violations immediately with impact on success criteria",
            "Escalate unresolved blocking dependencies before they delay proof sessions",
            "Link dependency resolution to affected validation criteria",
          ],
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Track gaps honestly",
          details: [
            "Feature gaps",
            "Integration gaps",
            "Scale/performance concerns",
            "Documentation gaps",
            "Workaround viability",
          ],
          links: [
            {
              icon: AlignVerticalSpaceAround,
              label: "Gap Analysis",
              href: "/project?tab=validation&subtab=gap-analysis",
            },
          ],
        },
        {
          text: "Escalate early & hold readouts",
          details: [
            "Product / Support escalations",
            "Management / Partner visibility",
            "Weekly technical readouts",
            "Periodic exec summaries",
          ],
          links: [
            {
              icon: Mail,
              label: "Communications",
              href: "/admin?tab=email-logs",
            },
            {
              icon: Brain,
              label: "AI Project Analysis",
              href: "/ai-risk-management?tab=projects",
            },
          ],
        },
        {
          text: "Reconfirm status periodically",
          details: [
            "What has been proven",
            "What remains unproven",
            "What requires customer action",
            "Acceptable workarounds vs blockers",
          ],
          links: [
            { icon: LayoutDashboard, label: "Dashboard", href: "/" },
            {
              icon: Brain,
              label: "AI Project Analysis",
              href: "/ai-risk-management?tab=projects",
            },
          ],
        },
        {
          text: "Prepare the technical recommendation",
          details: ["Pass", "Conditional Pass", "Fail", "Defer"],
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
      ],
      responsibilities: [
        {
          role: "Project/Specialist Engineer",
          desc: "Owns proof of value, use-case execution leadership, technical storytelling, stakeholder confidence, decision framing, operational tuning, issue isolation, integration troubleshooting, and reproducibility of outcomes.",
        },
        {
          role: "Customer Team",
          desc: "Owns validation of results, participation in testing/UAT, confirming operational fit, and providing real-world scenarios and data.",
        },
        {
          role: "Opportunity Owner",
          desc: "Keeps commercial motion synchronized with technical reality; avoids 'forecast by optimism, not by evidence' syndrome; work in parallel on negotiation and close.",
        },
        {
          role: "Services",
          desc: "Communicates operationalization of handoff and onboarding, owns conversion of business problems and success criteria into SOW, and ongoing success motion.",
        },
      ],
    },
    {
      title: "Align, Acquaint, & Expand",
      phaseIcon: Handshake,
      bgClass: "bg-purple-50 dark:bg-purple-950/30",
      borderClass: "border-purple-200 dark:border-purple-900",
      titleClass: "text-purple-900 dark:text-purple-100",
      textClass: "text-purple-800 dark:text-purple-200",
      dotClass: "bg-purple-500",
      iconColor: "text-purple-500",
      purpose:
        "Convert validation work into a technical clearance for closure, production path, and next-step momentum.",
      owners: {
        primary: "Project Engineer or Specialist Engineer",
        supporting: [
          "Opportunity Owner",
          "Customer Success",
          "Professional Services",
          "Supporting Engineers (as needed)",
        ],
      },
      entranceCriteria: [
        {
          text: "All success criteria evaluated",
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
          ],
        },
        {
          text: "Final working sessions concluded",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Customer has reviewed evidence",
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "All assumptions have been confirmed, violated, or formally accepted with documented rationale",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
        {
          text: "All dependencies are in a final state; no open or in-review items remain",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
      ],
      exitCriteria: [
        {
          text: "Align to Technical Clearance to Closure (TCC), outcome is recorded",
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
        {
          text: "Opportunity moved to Negotiate in SalesForce",
          links: [
            {
              icon: Cloud,
              label: "Open SalesForce",
              href: "https://nwxcorp.lightning.force.com/lightning/page/home",
              external: true,
            },
          ],
        },
        {
          text: "Customer/field knows next step",
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "Handoff packet exists",
          links: [
            {
              icon: FileText,
              label: "Project Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
          ],
        },
        {
          text: "Open gaps are classified",
          links: [
            {
              icon: AlignVerticalSpaceAround,
              label: "Gap Analysis",
              href: "/project?tab=validation&subtab=gap-analysis",
            },
          ],
        },
        {
          text: "Production/next-phase path is clear",
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Expansion signals are captured",
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
        {
          text: "Assumptions register is finalized and included in the handoff",
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
          ],
        },
        {
          text: "Failing or blocked dependencies are clearly documented for CS/Services awareness",
          links: [
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
      ],
      requiredArtifacts: [
        {
          label: "Executive Readout Deck",
          icon: BarChart3,
          href: "/reports",
        },
        {
          label: "Technical Closure Intelligence Log",
          icon: BrainCircuit,
          href: "/project?tab=validation&subtab=outcome-intelligence",
        },
        {
          label: "Architecture & Configuration Baseline for Handoff",
          icon: FileText,
          href: "/project?tab=artifacts&subtab=documents",
        },
        {
          label: "Assumptions Register",
          icon: BookMarked,
          href: "/project?tab=validation&subtab=assumptions",
        },
        {
          label: "Dependencies Register",
          icon: Link2,
          href: "/project?tab=validation&subtab=dependencies",
        },
      ],
      escalationRules: [
        "Stalled technical clearance → Economic Buyer via Opportunity Owner",
        "High-risk deployment flags → Services / CS Leadership",
      ],
      actions: [
        {
          text: "Deliver final validation readout",
          details: [
            "What was validated",
            "What was not",
            "Evidence summary",
            "Risk summary",
            "Recommended next step",
          ],
          links: [
            {
              icon: BarChart3,
              label: "Reports",
              href: "/reports",
            },
            {
              icon: Mail,
              label: "Communications",
              href: "/admin?tab=email-logs",
            },
          ],
        },
        {
          text: "Record final outcome against success criteria and value mapping",
          details: [],
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
            {
              icon: CheckCircle,
              label: "Expected Outcomes",
              href: "/success-criteria?tab=outcomes",
            },
          ],
        },
        {
          text: "Capture closure intelligence",
          details: [
            "Technical fit",
            "Organizational fit",
            "Pain rating",
            "Reason codes",
            "Competitor context",
            "Blockers",
            "Expansion opportunities",
          ],
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
        {
          text: "Finalize all gaps and workaround positions",
          details: [],
          links: [
            {
              icon: AlignVerticalSpaceAround,
              label: "Gap Analysis",
              href: "/project?tab=validation&subtab=gap-analysis",
            },
          ],
        },
        {
          text: "Produce handoff materials",
          details: [
            "Architecture notes",
            "Configuration baseline",
            "Scripts",
            "Integration notes",
            "Known limitations",
            "Admin guidance",
            "Production prerequisites",
          ],
          links: [
            {
              icon: FileText,
              label: "Documents",
              href: "/project?tab=artifacts&subtab=documents",
            },
            {
              icon: FolderCode,
              label: "Code & Scripts",
              href: "/project?tab=artifacts&subtab=code-scripts",
            },
          ],
        },
        {
          text: "Confirm production path",
          details: [
            "Pilot to production",
            "Phased rollout",
            "Region/business unit expansion",
            "Owner transitions",
          ],
          links: [
            {
              icon: Waypoints,
              label: "MAP Management",
              href: "/project?tab=validation&subtab=map",
            },
          ],
        },
        {
          text: "Confirm what customer-facing deliverables stay visible in the portal",
          details: [],
          links: [{ icon: Globe, label: "Account Portal", href: "/account" }],
        },
        {
          text: "Support TCC / technical approval workflow",
          details: [],
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
          ],
        },
        {
          text: "Identify next modules/use cases",
          details: [
            "Adjacent controls",
            "Additional data sources",
            "Additional populations",
            "Advanced policy use",
            "Expansion by BU/geography",
          ],
          links: [
            {
              icon: LayoutList,
              label: "Validation Criteria",
              href: "/success-criteria?tab=criteria",
            },
            {
              icon: FolderOpenDot,
              label: "Project Templates",
              href: "/templates?tab=project-templates",
            },
          ],
        },
        {
          text: "Close out the Assumptions and Dependencies register; summarize findings in the executive readout",
          details: [
            "Mark all assumptions as Confirmed, Violated, or Accepted",
            "Confirm all dependencies are in a terminal state",
            "Document any open items as known production risks",
            "Include A&D summary in handoff materials",
          ],
          links: [
            {
              icon: BookMarked,
              label: "Assumptions",
              href: "/project?tab=validation&subtab=assumptions",
            },
            {
              icon: Link2,
              label: "Dependencies",
              href: "/project?tab=validation&subtab=dependencies",
            },
          ],
        },
        {
          text: "Capture and acquaint with internal lessons learned for repeatability",
          details: [],
          links: [
            {
              icon: BrainCircuit,
              label: "Outcome Intelligence",
              href: "/project?tab=validation&subtab=outcome-intelligence",
            },
            {
              icon: FolderOpenDot,
              label: "Project Templates",
              href: "/templates?tab=project-templates",
            },
          ],
        },
      ],
      responsibilities: [
        {
          role: "Project/Specialist Engineer",
          desc: "Owns final technical recommendation, final outcome narrative, handoff quality, expansion signal capture, deployment/handoff technical completeness, repeatable implementation notes, and open issue inventory.",
        },
        {
          role: "CS / Services",
          desc: "Owns adoption and operationalization after acceptance, enablement, and ongoing success motion.",
        },
        {
          role: "Account Exec",
          desc: "Owns commercial close, expansion plan, and renewal/land strategy alignment.",
        },
      ],
    },
  ];

  const extraTopics = [
    {
      title: "Gap Handling Process",
      icon: ShieldAlert,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            For enterprise validations, gaps are normal (product, integration,
            scale, process, or customer readiness gaps). Make gap handling part
            of the process, not an exception.
          </p>
          <p className="text-sm font-semibold text-foreground">
            Classify every gap with:
          </p>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            <li className="bg-muted p-2.5 rounded-md border border-border/50">
              <span className="font-semibold text-primary">Severity:</span> How
              critical is this to the core use case?
            </li>
            <li className="bg-muted p-2.5 rounded-md border border-border/50">
              <span className="font-semibold text-primary">Workaround:</span>{" "}
              What is the operational alternative?
            </li>
            <li className="bg-muted p-2.5 rounded-md border border-border/50">
              <span className="font-semibold text-primary">Owner:</span> Who is
              driving the fix or workaround?
            </li>
            <li className="bg-muted p-2.5 rounded-md border border-border/50">
              <span className="font-semibold text-primary">Deal Impact:</span>{" "}
              Does this block the commercial close?
            </li>
            <li className="col-span-2 bg-muted p-2.5 rounded-md border border-border/50">
              <span className="font-semibold text-primary">
                Production Impact:
              </span>{" "}
              Will this delay full deployment post-sale?
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "Technical Intelligence at Closeout",
      icon: Lightbulb,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            The PCOS-style closeout intelligence is gold and should not be
            optional. This is where you harvest critical telemetry for the SE
            org and Product teams.
          </p>
          <p className="text-sm font-semibold text-foreground">
            Always capture:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4 text-purple-500" /> Why this
              deal moved (The true technical trigger)
            </li>
            <li className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4 text-purple-500" /> Why it
              stalled (Friction points in our product or process)
            </li>
            <li className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4 text-purple-500" /> What
              competitor showed up (And what their technical angle was)
            </li>
            <li className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4 text-purple-500" /> What the
              Product team needs to know (Unfiltered reality from the field)
            </li>
            <li className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4 text-purple-500" /> What
              repeat pattern your SE org should recognize
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "Leading Indicators vs. Outcomes",
      icon: TrendingUp,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Don't just track the final outcome. Track leading indicators to
            predict delivery risk or success early in the cycle.
          </p>
          <p className="text-sm font-semibold text-foreground">
            Key metrics to monitor:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Time to
              kickoff
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Number of
              gaps by type
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Time to
              first successful data ingest
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />{" "}
              Stakeholder engagement level
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Time to
              first proven use case
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Technical
              fit trend
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Number of
              blocked tasks
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />{" "}
              Probability of TCC
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header - "Floating Rail" with Global Gradient */}
      <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
        <div
          className="dark:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(59,130,246,0.15) 60%, rgba(59,130,246,0.25) 100%)",
          }}
        />
        <div
          className="hidden dark:block absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(31,41,55,1) 0%, rgba(30,58,138,0.4) 70%, rgba(30,58,138,0.6) 100%)",
          }}
        />

        <div className="flex items-stretch h-24 relative z-10">
          <div className="flex-1 flex flex-col justify-center px-4">
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Atom data-title-icon className="h-6 w-6" />
                Clear2Close - Driving Success in Validation Projects
              </CardTitle>
              <CardDescription>
                Welcome to the CriteriaIQ Clear2Close guide for internal
                stakeholders! This comprehensive guide will help you effectively
                uncover project value while using the Technical Validation
                Workspace to set up customers, add users, initiate projects, and
                track progress through successful completion.
              </CardDescription>
            </CardHeader>
            <Atom
              className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
              style={{ transform: "translateY(-50%) rotate(-12deg)" }}
            />
          </div>

          <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <SquareTerminal className="h-8 w-8 text-blue-100" />
          </div>
        </div>
      </Card>

      {/* ── Your Validation Journey ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              <div className="flex items-center gap-2">
              <Atom className="h-5 w-5 text-blue-500" />
              Clear2Close: From Proof To Production
              </div>  
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your operational role and responsibilities across the 4-stage
              validation lifecycle.
            </p>
          </div>

          <div className="mt-4 p-2 bg-green-50 dark:bg-green-950 rounded-lg border border-green-100 dark:border-green-800">
            <div className="flex items-center gap-2">
            <Dna className="h-4 w-4 text-green-800" />
            <h4 className="font-semibold text-green-900 dark:text-green-100">Project Success: DNA Formula</h4>
            </div>
            <p className="text-sm text-green-800 dark:text-green-200">
              Effective Planning + Clear Communication + Regular Updates/Hygiene + Data-Driven Decisions = Successful Project Completion!
            </p>
          </div>

          {/* Phase selector - 4 Stages with Hover Animations */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {validationStages.map((phase, idx) => {
              const PhaseIcon = phase.phaseIcon;
              const bgIconColor =
                idx === 0
                  ? "text-blue-500"
                  : idx === 1
                    ? "text-amber-500"
                    : idx === 2
                      ? "text-green-500"
                      : "text-purple-500";
              const bgColorHex =
                idx === 0
                  ? "#3b82f6"
                  : idx === 1
                    ? "#f59e0b"
                    : idx === 2
                      ? "#22c55e"
                      : "#a855f7";

              return (
                <TooltipProvider key={phase.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setActivePhase(idx);
                          setCriteriaView("entrance");
                        }}
                        className={`group relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring hover:-translate-y-1.5 hover:shadow-lg ${phase.borderClass} ${activePhase === idx ? `${phase.bgClass} shadow-md ring-1 ring-inset ring-current/20` : "bg-card hover:bg-muted/40"}`}
                      >
                        {/* Animated background watermark icon */}
                        <PhaseIcon
                          className={`absolute -right-2 -bottom-2 h-20 w-20 opacity-[0.06] pointer-events-none transition-transform duration-500 group-hover:scale-125 group-hover:-rotate-12 ${activePhase === idx ? "scale-110 -rotate-6" : "-skew-x-6"} ${bgIconColor}`}
                        />

                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 text-sm font-bold text-white shadow-sm transition-transform duration-300 group-hover:scale-110`}
                          style={{ backgroundColor: bgColorHex }}
                        >
                          {idx + 1}
                        </div>
                        <p
                          className={`font-bold text-sm flex items-center gap-2 ${activePhase === idx ? phase.titleClass : "text-foreground"}`}
                        >
                          {phase.title}
                        </p>
                        <p
                          className={`text-xs mt-1.5 font-medium ${activePhase === idx ? phase.textClass : "text-muted-foreground"}`}
                        >
                          {phase.actions.length} core actions
                        </p>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="text-sm">{phase.purpose}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>

          {/* Detail Panel - Progressive Disclosure UI */}
          {activePhase >= 0 && activePhase < validationStages.length && (
            <div
              className={`rounded-xl border bg-card shadow-sm overflow-hidden animate-in fade-in duration-300`}
            >
              {/* Banner */}
              <div
                className={`p-5 md:p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${validationStages[activePhase].bgClass} ${validationStages[activePhase].borderClass}`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`p-2 rounded-lg bg-background/50 shadow-sm border ${validationStages[activePhase].borderClass}`}
                    >
                      {(() => {
                        const ActiveIcon =
                          validationStages[activePhase].phaseIcon;
                        return (
                          <ActiveIcon
                            className={`h-5 w-5 ${validationStages[activePhase].textClass}`}
                          />
                        );
                      })()}
                    </div>
                    <h3
                      className={`text-xl font-bold ${validationStages[activePhase].titleClass}`}
                    >
                      Stage {activePhase + 1}:{" "}
                      {validationStages[activePhase].title}
                    </h3>
                  </div>
                  <p
                    className={`text-sm md:text-base font-medium mt-3 ${validationStages[activePhase].textClass}`}
                  >
                    {validationStages[activePhase].purpose}
                  </p>
                </div>

                {/* Entrance / Exit Criteria Toggle */}
                <div className="flex bg-background/60 p-1 rounded-lg border shadow-sm shrink-0">
                  <button
                    onClick={() => setCriteriaView("entrance")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${criteriaView === "entrance" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <DoorOpen className="h-4 w-4" /> Entrance
                  </button>
                  <button
                    onClick={() => setCriteriaView("exit")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${criteriaView === "exit" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <DoorClosed className="h-4 w-4" /> Exit
                  </button>
                </div>
              </div>

              <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column (Meta, Criteria, Artifacts) */}
                <div className="lg:col-span-4 space-y-7">
                  {/* Owners */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Users className="h-4 w-4" /> Ownership
                    </h4>
                    <div className="space-y-3 bg-muted/30 rounded-lg p-3 border border-border/50">
                      <div>
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">
                          Primary Owner
                        </span>
                        <p className="text-sm font-bold text-foreground mt-0.5">
                          {validationStages[activePhase].owners.primary}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-border/50">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">
                          Supporting Roles
                        </span>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {validationStages[activePhase].owners.supporting.join(
                            ", ",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Criteria (Entrance or Exit) */}
                  <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <ListChecks className="h-4 w-4" />{" "}
                      {criteriaView === "entrance"
                        ? "Stage Entrance Criteria"
                        : "Stage Exit Criteria"}
                    </h4>
                    <ul className="space-y-2.5">
                      {(criteriaView === "entrance"
                        ? validationStages[activePhase].entranceCriteria
                        : validationStages[activePhase].exitCriteria
                      ).map((crit, i) => {
                        const hasLinks = crit.links && crit.links.length > 0;
                        const isEntrance = criteriaView === "entrance";
                        const btnBase = isEntrance
                          ? "bg-blue-100/60 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/50 border-blue-200 dark:border-blue-800"
                          : "bg-green-100/60 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/50 border-green-200 dark:border-green-800";
                        const iconColor = isEntrance
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-green-600 dark:text-green-400";
                        return (
                          <li
                            key={i}
                            className={`flex items-start gap-2.5 p-2.5 rounded-md border ${isEntrance ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/50" : "bg-green-50/50 dark:bg-green-950/20 border-green-100 dark:border-green-900/50"}`}
                          >
                            {isEntrance ? (
                              <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-500 mt-0.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                            )}
                            <span
                              className={`text-sm font-medium leading-snug flex-1 ${isEntrance ? "text-blue-900 dark:text-blue-200" : "text-green-900 dark:text-green-200"}`}
                            >
                              {crit.text}
                            </span>
                            {hasLinks && (
                              <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                                {crit.links!.map((link, li) => {
                                  const CritLinkIcon = link.icon;
                                  const ext = isExternalHref(
                                    link.href,
                                    link.external,
                                  );
                                  const triggerEl = ext ? (
                                    <a
                                      href={link.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${btnBase}`}
                                    >
                                      <CritLinkIcon
                                        className={`h-3 w-3 ${iconColor}`}
                                      />
                                    </a>
                                  ) : (
                                    <RouterLink
                                      href={link.href}
                                      className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${btnBase}`}
                                    >
                                      <CritLinkIcon
                                        className={`h-3 w-3 ${iconColor}`}
                                      />
                                    </RouterLink>
                                  );
                                  return (
                                    <TooltipProvider key={li}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {triggerEl}
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="left"
                                          className="text-xs"
                                        >
                                          <p>
                                            {ext
                                              ? "Open outside app"
                                              : "Open in app"}{" "}
                                            · {link.label}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Artifacts & Escalations */}
                  <div className="space-y-4 pt-2">
                    <div>
                      <h4 className="text-[11px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Required Artifacts
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {validationStages[activePhase].requiredArtifacts.map(
                          (art, i) => {
                            const ArtIcon = art.icon;
                            if (art.href) {
                              const artExt = isExternalHref(
                                art.href,
                                art.external,
                              );
                              const artEl = artExt ? (
                                <a
                                  href={art.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-muted hover:bg-primary/10 hover:border-primary/40 rounded-full text-foreground border border-border/50 shadow-sm transition-colors cursor-pointer"
                                >
                                  {ArtIcon && (
                                    <ArtIcon className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {art.label}
                                </a>
                              ) : (
                                <RouterLink
                                  href={art.href}
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-muted hover:bg-primary/10 hover:border-primary/40 rounded-full text-foreground border border-border/50 shadow-sm transition-colors cursor-pointer"
                                >
                                  {ArtIcon && (
                                    <ArtIcon className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {art.label}
                                </RouterLink>
                              );
                              return (
                                <TooltipProvider key={i}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {artEl}
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs"
                                    >
                                      <p>
                                        {artExt
                                          ? "Open outside app"
                                          : "Open in app"}{" "}
                                        · {art.label}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                            return (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-muted rounded-full text-foreground border border-border/50 shadow-sm"
                              >
                                {ArtIcon && (
                                  <ArtIcon className="h-3 w-3 text-muted-foreground" />
                                )}
                                {art.label}
                              </span>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Siren className="h-3.5 w-3.5 text-red-400" />{" "}
                        Escalation Rules
                      </h4>
                      <ul className="space-y-1">
                        {validationStages[activePhase].escalationRules.map(
                          (esc, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground border-l-2 border-red-400/50 pl-2 py-0.5"
                            >
                              {esc}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right Column (Actions & Responsibilities) */}
                <div className="lg:col-span-8 space-y-7">
                  {/* Key Actions */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Target className="h-4 w-4" /> Project and Specialist Engineer Actions
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {validationStages[activePhase].actions.map(
                        (action, i) => (
                          <ActionItem
                            key={i}
                            action={action}
                            dotClass={validationStages[activePhase].dotClass}
                          />
                        ),
                      )}
                    </div>
                  </div>

                  {/* Deep Dive Responsibilities + 5A Framework — grouped tightly */}
                  <div className="space-y-5">
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 bg-muted/40 hover:bg-muted rounded-xl border border-border transition-colors group">
                        <div className="flex items-center gap-2">
                          <BrainCircuit className={`h-5 w-5 ${validationStages[activePhase].iconColor} transition-colors`} />
                          <span className="text-sm font-bold text-foreground">
                            View Detailed Team Responsibilities
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform duration-200" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-2.5 animate-in slide-in-from-top-2">
                        {validationStages[activePhase].responsibilities.map(
                          (resp, i) => (
                            <div
                              key={i}
                              className="p-3.5 bg-card border border-border/60 rounded-lg flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 shadow-sm"
                            >
                              <span className="text-sm font-bold text-foreground sm:w-1/4 shrink-0 px-2 py-1 bg-muted rounded-md inline-block w-fit">
                                {resp.role}
                              </span>
                              <span className="text-sm text-muted-foreground sm:pt-1">
                                {resp.desc}
                              </span>
                            </div>
                          ),
                        )}
                      </CollapsibleContent>
                    </Collapsible>

                    <Stage5AFramework
                      stageIndex={activePhase}
                      iconColor={validationStages[activePhase].iconColor}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New Module: What Else To Think About */}
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => setExtraTopicsOpen((o) => !o)}
              aria-expanded={extraTopicsOpen}
              className="w-full text-left flex items-center gap-2 mb-0 group"
            >
              <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
              <h3 className="text-lg font-bold text-foreground flex-1">
                What Else Should You Think About?
              </h3>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${extraTopicsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {extraTopicsOpen && (
              <div className="mt-4 flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Sidebar Menu */}
                <div className="w-full md:w-1/3 space-y-2">
                  {extraTopics.map((topic, idx) => {
                    const TopicIcon = topic.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveExtraTopic(idx)}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-all group/btn ${activeExtraTopic === idx ? "bg-orange-50/70 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/50 shadow-sm" : "bg-transparent border-transparent hover:bg-orange-50/30 dark:hover:bg-orange-950/10"}`}
                      >
                        <TopicIcon
                          className={`h-4 w-4 transition-colors duration-200 ${activeExtraTopic === idx ? "text-orange-500" : "text-muted-foreground group-hover/btn:text-orange-500"}`}
                        />
                        <span
                          className={`text-sm font-semibold ${activeExtraTopic === idx ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {topic.title}
                        </span>
                        {activeExtraTopic === idx && (
                          <ChevronRight className="h-4 w-4 ml-auto text-orange-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Content Panel */}
                <div className="w-full md:w-2/3">
                  <div className="bg-card border rounded-xl p-5 md:p-6 shadow-sm min-h-[200px] animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                      {(() => {
                        const ActiveExtraIcon =
                          extraTopics[activeExtraTopic].icon;
                        return (
                          <div className="p-2 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                            <ActiveExtraIcon className="h-5 w-5 text-orange-500" />
                          </div>
                        );
                      })()}
                      <h4 className="text-lg font-bold text-foreground">
                        {extraTopics[activeExtraTopic].title}
                      </h4>
                    </div>
                    {extraTopics[activeExtraTopic].content}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5A Framework Card */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <MapPinCheck data-title-icon className="h-5 w-5 text-blue-500" />
            5A Framework: Blueprint for Influencing Revenue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-4">
            <p>
              The 5A Framework (Attach, Assess, Affect, Align, Acquaint)
              provides a structured lifecycle for Solution Engineers to manage
              opportunities from initial engagement to post-sale growth. Instead
              of treating technical sales as a series of reactive tasks, this
              model enforces specific deliverables at every stage: formalizing
              ownership in Salesforce (Attach), building a dynamic Technical
              Account Plan (Assess), executing value-based validation with
              Projects (Affect), securing the Technical Clearance to Closure
              (Align), and nurturing the post-sale relationship (Acquaint).
            </p>
            <p>
              This framework aligns directly with CriteriaIQ's robust technical
              validation system by establishing the Assess and Affect stages as
              critical checkpoints for defining and testing success criteria. In
              the Assess phase, the SE documents specific technical requirements
              and risks in the project's Mutual Action Plan (MAP),
              effectively capturing the criteria necessary for validation. The
              Affect phase then drives the process, using demos and projects to
              satisfy those criteria, ensuring that the final Align stage
              represents a verified "Technical Clearance" rather than just a
              best-effort guess.
            </p>
          </div>
          <div className="mt-2">
            <img
              src="/attached_assets/5a_steps/5A_Framework_1770307825492.png"
              alt="5A Framework Infographic - Strategic Impact and KPIs"
              className="w-3/4 mx-auto rounded-lg border border-gray-200 dark:border-gray-700"
            />
          </div>
        </CardContent>
      </Card>

      {/* Left Menu Navigation Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Workflow data-title-icon className="h-5 w-5" />
            Navigation Menu Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {/* ── Dashboard ────────────────────────────────────── */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Your central command center showing real-time KPIs including
                  active projects, projects cleared to close, customer count,
                  and success rates, plus pipeline health, project status
                  summaries and the Flight Deck banner. Use the filtering
                  options to focus on specific time periods, statuses, or
                  customers.
                </p>
              </div>

              {/* ── Account Portal ───────────────────────────────── */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Account Portal
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Customer-facing portal for stakeholder engagement. Customers
                  access their project status, success criteria progress, and
                  shared resources without needing internal system access. SE
                  teams manage portal visibility and content from Account
                  Management in the sidebar.
                </p>
              </div>

              {/* ── Create Project ───────────────────────────────── */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Project
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Start new technical validation projects with the Guided
                  Project Form — an accordion-style layout with 8 numbered
                  sections, color-coded steps, and section completion tracking.
                  Use QuickJumpDropdown navigation to jump between sections.
                  Apply artifacts to pre-populate project structure and
                  accelerate setup.
                </p>
              </div>

              {/* ── Project Workspace ───────────────────────────── */}
              <CollapsibleNavItem
                icon={Target}
                title="Project Workspace"
                description="Centralized hub for all validation project activity. Filter by status, customer, or search terms. Access detailed project views with the GuidedOverviewBanner showing live metadata, inline editable fields, and the Project Navigator Drawer for browsing projects without leaving the page."
              >
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Target className="h-3.5 w-3.5" />
                    Project Management
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Projects
                        </span>{" "}
                        — Full project list with status, filters, and
                        quick-access actions
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Project Board
                        </span>{" "}
                        — Kanban-style view for visualizing project pipeline
                        stages
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Project Schedules
                        </span>{" "}
                        — Calendar view of project timelines and milestones
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          MAP Management
                        </span>{" "}
                        — Mutual Action Plan tracking with phase and step
                        progress
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Assumptions
                        </span>{" "}
                        — Capture and track project assumptions by category,
                        status, owner, and due date to surface hidden risk
                        before it becomes a blocker
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Dependencies Registry
                        </span>{" "}
                        — Log internal and external project dependencies with
                        owner, status, and due date tracking to keep the
                        evaluation on schedule
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Gap Analysis
                        </span>{" "}
                        — Track solution limitations (Feature, Integration,
                        Performance, Scalability, Documentation) with MoSCoW
                        criticality ratings and cross-project linking
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Competitor Intelligence
                        </span>{" "}
                        — Log and track competing vendors engaged in the
                        evaluation
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Outcome Intelligence
                        </span>{" "}
                        — Moneyball closure metrics (Technical Fit, Political
                        Alignment, Pain Rating) with Quadrant Analysis, Reason
                        Codes, and outcome dashboards
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Account Management
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Account Directory
                        </span>{" "}
                        — Customer profiles with industry, contacts, logos, and
                        portal access
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Account Users
                        </span>{" "}
                        — Internal and customer user assignments per account
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Artifacts
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Documents
                        </span>{" "}
                        — Shared files and deliverables attached to projects
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Links
                        </span>{" "}
                        — External resource links organized by project
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Code & Scripts
                        </span>{" "}
                        — Code snippets, scripts, and technical resources
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Template Management ──────────────────────────── */}
              <CollapsibleNavItem
                icon={FolderTree}
                title="Template Management"
                description="Library of reusable resources for standardizing and accelerating project setup. Manage project templates, the validation criteria builder, and the MAP template library."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Pages
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Project Templates
                        </span>{" "}
                        — Pre-built project structures with criteria, teams, and
                        timelines ready to apply at creation
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Validation Criteria Builder
                        </span>{" "}
                        — Tool for constructing and managing reusable criteria
                        sets across solutions and products
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          MAP Library
                        </span>{" "}
                        — Mutual Action Plan templates organized by engagement
                        type and solution
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Validation Criteria ──────────────────────────── */}
              <CollapsibleNavItem
                icon={CheckCircle}
                title="Validation Criteria"
                description="Define and manage the full hierarchy of validation criteria: Solutions → Components → Criteria → Expected Outcomes → Actions Taken. Features searchable dropdowns, Show Hidden controls for N/A entities, and solution-scoped filtering. Track progress against defined objectives and update status as validation proceeds."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Pages
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Solutions
                        </span>{" "}
                        — Top-level product solutions being validated
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Components
                        </span>{" "}
                        — Feature areas and modules within each solution
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Value Mapping
                        </span>{" "}
                        — Align solution capabilities to customer business
                        outcomes
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Criteria
                        </span>{" "}
                        — Specific test cases and evaluation points assigned to
                        components
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Expected Outcomes
                        </span>{" "}
                        — Defined success benchmarks for each criterion
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Actions Taken
                        </span>{" "}
                        — Log of steps performed and evidence captured during
                        validation
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>
            </div>

            <div className="space-y-4">
              {/* ── AI Assessments ───────────────────────────────── */}
              <CollapsibleNavItem
                icon={Brain}
                title="AI Assessments"
                description="AI-powered project assessment analysis with configurable criteria, intelligent scoring, and actionable recommendations. Receive predictive insights for proactive risk identification and mitigation throughout the validation lifecycle."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Pages
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Project Analysis
                        </span>{" "}
                        — Run and review AI assessments against active projects
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Assessment Criteria
                        </span>{" "}
                        — Configure scoring dimensions and weighting for AI
                        evaluations
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Documentation Sources
                        </span>{" "}
                        — Manage knowledge base documents used to inform AI
                        analysis
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Communications ───────────────────────────────── */}
              <CollapsibleNavItem
                icon={Mail}
                title="Communications"
                description="Email management hub for tracking outbound messages and designing email content. Send logs, templates, and custom email designs are managed here. System announcements, Flight Deck and webhooks also live here; automation rules are under Configuration > Workflow Automation."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Pages
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Email Logs
                        </span>{" "}
                        — History of all system-sent emails with delivery status
                        and recipient details
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Email Templates
                        </span>{" "}
                        — Reusable message templates for common project
                        notifications and updates
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Email Designs
                        </span>{" "}
                        — Visual email builder with dual-mode editor (rich and
                        code) for custom layouts
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Analytics ────────────────────────────────────── */}
              <CollapsibleNavItem
                icon={BarChart3}
                title="Analytics"
                description="Comprehensive reporting and analytics with visual dashboards showing project trends, completion rates, and performance metrics over time. Supports role-based access, saved favorites, and flexible data visualization."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Pages
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Reports
                        </span>{" "}
                        — Pre-built KPI reports with charts for win rates,
                        success metrics, and pipeline trends
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Calendar
                        </span>{" "}
                        — Timeline view of project milestones, deadlines, and
                        scheduled activities
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Report Builder
                        </span>{" "}
                        — Custom report creator with field selection, filters,
                        and live preview (General, Fields, Filters, Preview)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Dashboard Builder
                        </span>{" "}
                        — Drag-and-drop dashboard composer for custom KPI
                        layouts
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Metric Builder
                        </span>{" "}
                        — Define custom calculated metrics for use across
                        dashboards and reports
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Configuration ────────────────────────────────── */}
              <CollapsibleNavItem
                icon={Settings}
                title="Configuration"
                description="System administration hub for all platform settings, user management, compliance, and integrations. Admin-only access for most sub-sections."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Sub-sections
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Field Settings
                        </span>{" "}
                        — Customize project field labels, options, icons, and
                        color coding
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          System Settings
                        </span>{" "}
                        — Fiscal calendar, email configuration, database backup
                        destinations, and database connections
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Compliance
                        </span>{" "}
                        — Import/export compliance regulations and map them to
                        validation requirements
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          User Management
                        </span>{" "}
                        — Users, Roles, and Login Management
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Workflow Automation
                        </span>{" "}
                        — Automation Feed, Rules, Schedules, Trigger Origins,
                        Diagnostics, and MAP Automation
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Integrations
                        </span>{" "}
                        — Email Configuration, Salesforce bidirectional sync (Credentials, Field
                        Mappings, Sync Policies, Sync History) and AI Providers
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Archives
                        </span>{" "}
                        — Restore archived Activity Logs, Users, Projects, and
                        Customers
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Monitoring &amp; Audit
                        </span>{" "}
                        — Monitor Database, Data Sync, Email, Integrations,
                        Security, Services, Storage, Performance, and Archive
                        health, and review Login History
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>

              {/* ── Guide ──────────────────────────────────────── */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Guide
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Onboarding guide and quick-start resources to get up and
                  running with CriteriaIQ. Walks through project creation, team
                  setup, and core workflow steps with field-level guidance and
                  hover-expand detail cards.
                </p>
              </div>

              {/* ── About ────────────────────────────────────────── */}
              <CollapsibleNavItem
                icon={SquareTerminal}
                title="About"
                description="System information, documentation hub, and support resources for CriteriaIQ. Access the full feature guide, submit support requests, and manage personal preferences."
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Tabs
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Introduction
                        </span>{" "}
                        — Platform overview: user roles, technology stack, and
                        getting help
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Clear2Close
                        </span>{" "}
                        — Internal SE guide covering the 5A Framework,
                        validation journey, navigation reference, and best
                        practices
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Documentation
                        </span>{" "}
                        — Feature documentation and release notes with version
                        history
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Support & Features
                        </span>{" "}
                        — Submit support requests and (Admin) view the Error
                        Audit Log
                      </span>
                    </li>
                  </ul>
                </div>
              </CollapsibleNavItem>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Failure Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <AlertTriangle data-title-icon className="h-5 w-5 text-amber-500" />
            Validation Failure Patterns to Avoid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These are the most common ways a cybersecurity SE validation drifts, stalls, or produces a technically indefensible TCC. Recognizing them early is the difference between a clean close and a re-scope.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Jumping stages without meeting exit criteria</p>
              <p className="text-xs text-muted-foreground">Starting environment setup before scope is formally bounded creates rework and misaligned expectations. Stage exits exist for a reason — enforce them.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Running feature tours instead of use-case workshops</p>
              <p className="text-xs text-muted-foreground">Showing what the product can do vs. proving the agreed success criteria are two very different sessions. One builds enthusiasm; only the other produces a defensible TCC.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Forecasting TCC before evidence is documented</p>
              <p className="text-xs text-muted-foreground">"We're clear to close" told to the Opportunity Owner before evidence is captured in CriteriaIQ is forecasting by optimism. If it doesn't survive a deal desk review, it wasn't TCC.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Skipping or under-loading the MAP</p>
              <p className="text-xs text-muted-foreground">A MAP without owners and dates is just a list. When timelines slip, an empty MAP means no accountability trail and no escalation path. Load it in Stage 2 and keep it current.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Ignoring assumption violations when they surface</p>
              <p className="text-xs text-muted-foreground">An assumption that proves false in Stage 3 can quietly invalidate multiple criteria. Flag violations immediately, update the register, and communicate impact — don't absorb them silently.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Engaging Specialist Engineers too late</p>
              <p className="text-xs text-muted-foreground">Pulling in a Specialist at Stage 3 instead of Stage 1 means prerequisites were never surfaced, scope may be wrong, and the SE is solving problems that should have been identified at scoping.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Treating attendance as acceptance</p>
              <p className="text-xs text-muted-foreground">A customer who attended every session has not necessarily accepted the results. Explicit acknowledgment — portal update, email confirmation, or MAP milestone sign-off — is what creates the record.</p>
            </div>
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-semibold text-foreground">Leaving product gaps undocumented</p>
              <p className="text-xs text-muted-foreground">Gaps that feel uncomfortable to log are exactly the ones that surface at deal desk or post-sale. Document them with severity, workaround, and deal impact — an honest TCC is stronger than a fragile one.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips for Successful Validations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Target data-title-icon className="h-5 w-5" />
            Tips for Successful Validations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Practical guidance that the 4-stage lifecycle doesn't cover — field-tested habits that separate clean closes from prolonged, drifting evaluations.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" /> Before You Start
              </h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Frame the production path in Stage 1, not Stage 4.</span> Starting the handoff and deployment conversation during scoping shapes what you need to prove and surfaces customer-side constraints before they become blockers.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Identify your minimum viable proof early.</span> Find the 2–3 criteria that, if proven, constitute an undeniable technical win. Anchor every session to those first — velocity and confidence follow.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Never surprise the Opportunity Owner with the technical recommendation.</span> Brief them before the customer readout — every time. The first time they hear your TCC position should never be live in front of the customer.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Set explicit scope-out boundaries at kickoff.</span> Agreeing on what you're <em>not</em> proving is as important as what you are. Undocumented out-of-scope items become escalation fodder in Stage 4.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Rocket className="h-4 w-4 text-green-500" /> During Execution
              </h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Review the A&D register before every working session.</span> One unresolved dependency can silently block multiple criteria. Surface it before the session — not during. It's a two-minute check that prevents a three-week delay.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Log every verbal customer commitment in writing.</span> "I think that would work for us" needs to become an explicit acknowledgment in the portal, a follow-up email, or an updated MAP milestone. Verbal agreements evaporate under commercial pressure.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">Treat the customer's admin team engagement as a deal signal.</span> Enthusiastic, available admins indicate high technical fit and internal sponsorship. Reluctant or absent admins are a political problem — escalate before it becomes a Stage 4 surprise.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ChevronRight className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground"><span className="font-semibold text-foreground">If the MAP slips by more than one week without documented escalation, escalate proactively.</span> A drifting MAP is a drifting deal. Don't wait for the Opportunity Owner to ask why timelines moved — own the communication first.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800/50">
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1 flex items-center gap-2">
              <Info className="h-4 w-4" /> On TCC Quality
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              A <span className="font-semibold">Conditional Pass</span> with documented evidence, clear conditions, and an agreed remediation path is a stronger TCC position than an unconditional <span className="font-semibold">Pass</span> with thin evidence. Defensibility matters more than optics.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Assumptions & Dependencies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <BookMarked data-title-icon className="h-5 w-5 text-violet-500" />
            Assumptions &amp; Dependencies
          </CardTitle>
          <CardDescription>
            The "physics settings" of a POC — what must be true, available, or permitted for a test to be valid. Most validations don't fail because the product is bad; they fail because reality didn't ship the right logs, access, scope, or time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Section 1: Intro callout banner */}
          <div className="relative overflow-hidden rounded-xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/20 p-4">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-violet-200/30 dark:bg-violet-700/10 pointer-events-none" />
            <div className="absolute right-12 bottom-0 h-16 w-16 rounded-full bg-indigo-200/20 dark:bg-indigo-700/10 pointer-events-none" />
            <div className="flex items-start gap-3 relative z-10">
              <span className="text-4xl leading-none text-violet-300 dark:text-violet-600 font-serif select-none mt-0.5">"</span>
              <div>
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-200 leading-relaxed">
                  Assumptions and dependencies are the <span className="italic">physics settings</span> of the POC.
                  They answer: <span className="font-bold">What must be true, available, or permitted for this test to be valid?</span>
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-400 mt-1.5">
                  Most POCs don't fail because the product is bad — they fail because reality didn't ship the right logs, access, scope, or time.
                  Document them early. Own them together.
                </p>
              </div>
              <span className="text-4xl leading-none text-violet-300 dark:text-violet-600 font-serif select-none self-end mb-0.5">"</span>
            </div>
          </div>

          {/* Section 2: Assumptions vs Dependencies side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Assumptions panel */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                  <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="font-bold text-blue-900 dark:text-blue-200 text-med uppercase tracking-wide">Assumptions</h4>
              </div>
              <p className="text-med text-blue-700 dark:text-blue-300 mb-3 font-medium">
                Statements you're treating as true for the POC to be meaningful.
              </p>
              <ul className="space-y-1.5">
                {[
                  "Test users represent real user behavior",
                  "Target environment matches production enough to generalize",
                  "We have authority to create test events / change policies",
                  "Latency in lab network is comparable to production",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-300">
                    <span className="text-blue-400 mt-0.5 shrink-0">"</span>
                    <span className="italic">{item}"</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Dependencies panel */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                  <Link2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <h4 className="font-bold text-amber-900 dark:text-amber-200 text-med uppercase tracking-wide">Dependencies</h4>
              </div>
              <p className="text-med text-amber-700 dark:text-amber-300 mb-3 font-medium">
                Concrete prerequisites you need from the customer, environment, or tools.
              </p>
              <ul className="space-y-1.5">
                {[
                  "Domain Admin (or delegated) rights to read security logs",
                  "EDR / Windows Event Forwarding enabled with correct event IDs",
                  "Service account created with specific permissions",
                  "SIEM access for validation + a test index/source",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section 2: Outcome Classification */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <ListChecks className="h-4 w-4" /> Why This Matters — Outcome Classification
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              {[
                {
                  label: "In Review",
                  desc: "Assessing validation of dependency",
                  icon: Clock,
                  bg: "bg-amber-50 dark:bg-amber-950/25",
                  border: "border-amber-200 dark:border-amber-800/60",
                  iconColor: "text-amber-600 dark:text-amber-400",
                  textColor: "text-amber-800 dark:text-amber-200",
                  descColor: "text-amber-600 dark:text-amber-400",
                },
                {
                  label: "Resolved",
                  desc: "Success thresholds met",
                  icon: CheckCircle2,
                  bg: "bg-green-50 dark:bg-green-950/25",
                  border: "border-green-200 dark:border-green-800/60",
                  iconColor: "text-green-600 dark:text-green-400",
                  textColor: "text-green-800 dark:text-green-200",
                  descColor: "text-green-600 dark:text-green-400",
                },
                {
                  label: "Fail",
                  desc: "Thresholds not met despite prerequisites being satisfied",
                  icon: Siren,
                  bg: "bg-red-50 dark:bg-red-950/25",
                  border: "border-red-200 dark:border-red-800/60",
                  iconColor: "text-red-600 dark:text-red-400",
                  textColor: "text-red-800 dark:text-red-200",
                  descColor: "text-red-600 dark:text-red-400",
                },
                {
                  label: "Blocked",
                  desc: "Couldn't run the test — missing dependencies",
                  icon: OctagonX,
                  bg: "bg-orange-50 dark:bg-orange-950/25",
                  border: "border-orange-300 dark:border-orange-700",
                  iconColor: "text-orange-600 dark:text-orange-400",
                  textColor: "text-orange-800 dark:text-orange-200",
                  descColor: "text-orange-600 dark:text-orange-400",
                },
                {
                  label: "Inconclusive",
                  desc: "Ran it, but assumptions were violated",
                  icon: Info,
                  bg: "bg-gray-50 dark:bg-gray-900/40",
                  border: "border-gray-200 dark:border-gray-700",
                  iconColor: "text-gray-500 dark:text-gray-400",
                  textColor: "text-gray-700 dark:text-gray-300",
                  descColor: "text-gray-500 dark:text-gray-400",
                },
              ].map(({ label, desc, icon: Icon, bg, border, iconColor, textColor, descColor }) => (
                <div key={label} className={`rounded-lg border p-3 flex flex-col gap-1.5 ${bg} ${border}`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                    <span className={`text-sm font-bold ${textColor}`}>{label}</span>
                  </div>
                  <p className={`text-[11px] leading-snug ${descColor}`}>{desc}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-black-800 dark:text-black-300">
                <span className="font-bold">The "Blocked ≠ Fail" Distinction Saves Deals and Sanity.</span>{" "}
                A result of Blocked means you couldn't even run the test — that's a missing dependency, not a product deficiency. Always document which outcome category applies.
              </p>
            </div>
          </div>

          {/* Section 3: Solution-level vs Criterion-level */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <AlignVerticalSpaceAround className="h-4 w-4" /> When to Capture — Two Levels of Granularity
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-violet-200 dark:border-violet-800/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
                    <Boxes className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-med font-bold text-violet-900 dark:text-violet-200">Solution Level</span>
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">≥ 60–70% of criteria</span>
                </div>
                <p className="text-sm text-violet-700 dark:text-violet-300 mb-2">Think "foundations" — shared operating conditions for the whole POC:</p>
                <ul className="space-y-1">
                  {[
                    "Environment scope (prod-like? lab? hybrid?)",
                    "Identity sources & integrations (AD/Entra/Okta)",
                    "Logging/telemetry baseline (audit policies, forwarding)",
                    "Network requirements (proxy, allowlists, TLS)",
                    "Access & roles (admin/delegated access level)",
                    "Operational constraints (change windows, rollback)",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-violet-800 dark:text-violet-300">
                      <span className="text-violet-400 mt-0.5 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 italic">"If these aren't true, the POC is at risk globally."</p>
              </div>

              <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0">
                    <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <span className="text-med font-bold text-teal-900 dark:text-teal-200">Criterion Level</span>
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">unique / fragile / high-risk</span>
                </div>
                <p className="text-sm text-teal-700 dark:text-teal-300 mb-2">Think "special sauce" — test-specific prerequisites that cause silent failures:</p>
                <ul className="space-y-1">
                  {[
                    "Specific event IDs/log sources for that scenario",
                    "Permissions beyond baseline (mailbox access, GCP roles)",
                    "Data prerequisites (test accounts in OU, labeled data)",
                    "Latency/volume expectations (24h baseline, 10k events/day)",
                    "Constraints/workarounds (customer runs change; SE observes)",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-teal-800 dark:text-teal-300">
                      <span className="text-teal-400 mt-0.5 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 italic">"This is where you prevent Fail when the truth is Blocked."</p>
              </div>
            </div>
          </div>

          {/* Section 4: Common dependency categories */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Workflow className="h-4 w-4" /> Common Dependency Categories
            </h4>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Access & Permissions", sub: "Admin/delegated, service accounts, API keys, RBAC", icon: ShieldAlert, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/25", border: "border-rose-200 dark:border-rose-800/50" },
                { label: "Telemetry / Logging", sub: "Event IDs, audit policy, EDR feeds, cloud audit logs", icon: Activity, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/25", border: "border-blue-200 dark:border-blue-800/50" },
                { label: "Integrations", sub: "SIEM/SOAR, ticketing, identity providers, cloud platforms", icon: Workflow, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/25", border: "border-violet-200 dark:border-violet-800/50" },
                { label: "Network", sub: "DNS, proxies, outbound allowlists, TLS inspection", icon: Globe, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/25", border: "border-cyan-200 dark:border-cyan-800/50" },
                { label: "Data & Scope", sub: "Test users/groups, representative data, golden-path workflows", icon: LayoutList, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/25", border: "border-green-200 dark:border-green-800/50" },
                { label: "Operations", sub: "Change windows, rollback plan, customer SME availability", icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/25", border: "border-amber-200 dark:border-amber-800/50" },
                { label: "Environment", sub: "On-prem vs cloud, hybrid topology, time sync, regional constraints", icon: Blocks, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/40", border: "border-gray-200 dark:border-gray-700" },
              ].map(({ label, sub, icon: Icon, color, bg, border }) => (
                <div key={label} className={`flex items-start gap-2 p-2.5 rounded-lg border ${bg} ${border} min-w-[180px] flex-1`}>
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
                  <div>
                    <p className={`text-xs font-semibold ${color}`}>{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Ownership callout */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h4 className="text-med font-bold text-indigo-900 dark:text-indigo-200">Ownership — The Underrated POC Superpower</h4>
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
              Put an <span className="font-bold">Owner</span> and <span className="font-bold">Due Date</span> beside every dependency. Without them it becomes a vague wish.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { role: "Customer IT", task: "Enable audit policy on DCs by Wed" },
                { role: "Customer SecOps", task: "Provide SIEM access + test dashboard" },
                { role: "Vendor / SE", task: "Provide integration guide + validation queries" },
                { role: "Both", task: "Schedule change window" },
              ].map(({ role, task }) => (
                <div key={role} className="flex items-start gap-2 p-2 rounded-md bg-background/70 border border-indigo-100 dark:border-indigo-800/30">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">{role}</span>
                  <span className="text-xs text-indigo-800 dark:text-indigo-300 italic">"{task}"</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium border-t border-indigo-100 dark:border-indigo-800/30 pt-2.5">
              Assumptions/dependencies are your POC's <span className="font-bold">chain of custody</span>. They keep results defensible, reproducible, and politically survivable.
            </p>
          </div>

        </CardContent>
      </Card>

      {/* Mutual Action Plan (MAP) for Engineers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Waypoints data-title-icon className="h-5 w-5" />
            Mutual Action Plan (MAP) System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* What is a MAP? */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              What is a MAP?
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              A Mutual Action Plan (MAP) is a shared roadmap between a sales
              team and a buyer that outlines key steps, responsibilities, and
              deadlines to close a deal. It helps both sides stay aligned,
              improves communication, and ensures smoother progress toward a
              successful purchase. MAPs facilitate intricate purchasing
              processes in technology, ensuring that sellers and buyers are
              harmonized to attain mutual success.
            </p>
          </div>

          {/* Quick plan vs full MAP */}
          <div>
            <div className="flex items-center gap-1">
              <NotebookTabs className="h-5 w-5" />
              <h3 className="text-xl font-semibold text-foreground mb-1">
                Quick Plan vs. Full MAP
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Every project's plan is a MAP. Small projects start a Quick plan,
              a one-phase checklist, from the project's MAP drawer; larger ones
              start from a MAP template. A Quick plan can grow into a full MAP
              at any time by adding phases, steps, and tasks.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Quick plan card */}
              <div className="p-5 rounded-2xl border bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                    <ListChecks className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-foreground">
                    Quick Plan
                  </h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A one-phase MAP: a checklist of steps with no template, no
                  dates, and customer emails off. It is tracked like any MAP
                  and can gain phases, steps, tasks, and due dates later.
                </p>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    Best suited when:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Typically 50K ACV or less</li>
                    <li>• The scope and requirements are minimal in focus</li>
                    <li>
                      • The validation is focused or straightforward in nature
                    </li>
                    <li>• A smaller number of stakeholders are involved</li>
                    <li>• A lighter coordination overhead is preferred</li>
                  </ul>
                </div>
              </div>

              {/* MAP card */}
              <div className="p-5 rounded-2xl border bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <Waypoints className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-foreground">
                    Full MAP (from a template)
                  </h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  An interactive, shared roadmapwith structured phases, steps,
                  and tasks that gives both your team and the internal team
                  real-time visibility into progress, ownership, and deadlines
                  at every level.
                </p>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    Best suited when:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Required: Greater than 100K ACV</li>
                    <li>
                      • The project involves multiple internal or external
                      stakeholders
                    </li>
                    <li>
                      • Complex or multi-phase technical validation is required
                    </li>
                    <li>
                      • Account/Customer organization requires a formal,
                      trackable process
                    </li>
                    <li>
                      • Cross-functional coordination across teams is needed
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Decision factors */}
            <div className="mt-4 p-4 rounded-xl border bg-muted/40 space-y-2">
              <p className="text-xs font-medium text-foreground">
                How is the decision made?
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Evaluate the overall complexity of the project, the technical
                validation process the account/customer organization requires,
                the number of stakeholders participating from both sides, and
                the timeline and coordination needs — then select the approach
                that gives the customer the clearest path to a successful
                outcome while minimizing scope creep and ensuring alignment.
              </p>
            </div>
          </div>

          {/* Key Components */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              MAP Architecture
            </h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <ClipboardPenLine className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h5 className="font-semibold text-sm text-purple-900 dark:text-purple-100">
                    Phases
                  </h5>
                </div>
                <p className="text-xs text-purple-800 dark:text-purple-200">
                  Top-level milestones with status tracking, date ranges, and
                  team assignments. Examples: Discovery, Configuration, Testing,
                  Go-Live.
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Boxes className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h5 className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                    Steps
                  </h5>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Actionable items within phases that advance the project. Can
                  be assigned to customer or internal team members.
                </p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <PackageCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  </div>
                  <h5 className="font-semibold text-sm text-green-900 dark:text-green-100">
                    Tasks
                  </h5>
                </div>
                <p className="text-xs text-green-800 dark:text-green-200">
                  Granular work items with time estimates, specific
                  deliverables, and individual ownership for accountability.
                </p>
              </div>
            </div>
          </div>

          {/* Understanding Status Colors For A MAP */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              Understanding Status Colors For A MAP
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Each phase, step, and task in a MAP can have one of the following
              statuses to track progress and identify issues:
            </p>
            <TooltipProvider>
              <div className="flex flex-wrap gap-4 items-center">
                {/* Not Started */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-help">
                      <Clock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Not Started
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Work has not yet begun on this item. Awaiting initiation
                      or prerequisites.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* In Progress */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg cursor-help">
                      <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        In Progress
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Actively being worked on. The team is making forward
                      progress toward completion.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Blocked */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg cursor-help">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="text-sm font-medium text-red-900 dark:text-red-100">
                        Blocked
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Cannot proceed due to external dependencies, missing
                      information, or technical obstacles requiring resolution.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Complete */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg cursor-help">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-900 dark:text-green-100">
                        Complete
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Successfully finished. All objectives met and deliverables
                      provided.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Deferred */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg cursor-help">
                      <CircleX className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                        Deferred
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Postponed to a later date or phase. Not currently
                      prioritized but may be revisited.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Stalled */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg cursor-help">
                      <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        Stalled
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Progress has stopped temporarily. Awaiting resources,
                      decisions, or clarification to resume.
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* At Risk */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg cursor-help">
                      <AlertTriangle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                        At Risk
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      In danger of not meeting deadlines or objectives. Requires
                      immediate attention or mitigation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          {/* How to Create and Configure a MAP */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              How to Create and Configure a MAP
            </h4>
            <div className="space-y-4">
              <div>
                <h5 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                  1. Initialize from Template
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>• Open a project and click the MAP button</li>
                  <li>
                    • Select "Choose Template" to browse available MAP templates
                  </li>
                  <li>
                    • Templates include pre-configured phases, steps, and tasks
                  </li>
                  <li>
                    • One-click initialization applies template to your project
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                  2. Customize Phases, Steps, and Tasks
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>
                    • Use the Implementation tab for dual-layout view (List or
                    Board)
                  </li>
                  <li>• Drag-and-drop to reorder phases, steps, and tasks</li>
                  <li>
                    • Inline editing: click any name or description to edit in
                    place
                  </li>
                  <li>• Add new items with the + buttons at each level</li>
                  <li>
                    • Set start dates, due dates, and status for each item
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                  3. Assign Responsibilities
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>• Each phase/step/task supports 4 assignment types:</li>
                  <li className="ml-4">
                    ◦ Team Owned (checkbox for team-level responsibility)
                  </li>
                  <li className="ml-4">
                    ◦ Customer Stakeholder (assign to customer portal user)
                  </li>
                  <li className="ml-4">
                    ◦ Primary Engineer (internal team member)
                  </li>
                  <li className="ml-4">
                    ◦ Supporting Engineer (additional Internal resource)
                  </li>
                  <li>
                    • Use bulk assignment dialog to assign multiple items at
                    once
                  </li>
                  <li>
                    • Assignments cascade: parent assignments can flow to
                    children
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                  4. Track Progress
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>
                    • Overview tab shows progress percentage and status
                    distribution
                  </li>
                  <li>
                    • Timeline tab displays calendar view with start/end date
                    badges
                  </li>
                  <li>
                    • Activity Timeline shows real-time updates with live
                    indicator
                  </li>
                  <li>
                    • Assignments tab provides complete visibility of who owns
                    what
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                  5. Configure Automation (Admin/Engineer)
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>
                    • Automation tab lets you create event-driven triggers
                  </li>
                  <li>
                    • Set conditions (e.g., "when phase status changes to
                    Complete")
                  </li>
                  <li>
                    • Define actions (e.g., "auto-start next phase" or "send
                    notification")
                  </li>
                  <li>
                    • Project-specific automation overrides global configuration
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Working with MAPs */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              Working with MAPs Across Projects
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h5 className="font-medium text-sm text-green-600 dark:text-green-400">
                  Using Templates Effectively
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Create templates for common validation types</li>
                  <li>• Templates save time across similar projects</li>
                  <li>
                    • Customize after initialization for project-specific needs
                  </li>
                  <li>• Share template best practices with your team</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h5 className="font-medium text-sm text-blue-600 dark:text-blue-400">
                  Real-Time Collaboration
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• MAPs sync in real-time via WebSocket connection</li>
                  <li>• Live badge shows active sync status</li>
                  <li>• Multiple engineers can work simultaneously</li>
                  <li>• Customer portal users see updates immediately</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Assignment Flexibility */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              Flexible Assignment System
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              MAPs support a versatile 4-field assignment architecture designed
              for complex enterprise projects:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg">
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Team Owned
                </h6>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Mark an item as owned by the entire team rather than an
                  individual. Useful for collaborative phases or shared
                  responsibilities.
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg">
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Customer Stakeholder
                </h6>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Assign to a customer portal user who will see the item in
                  their view. Promotes customer accountability and transparency.
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg">
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Primary Engineer
                </h6>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  The main internal engineer responsible for this item. Typically
                  the project lead or subject matter expert.
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg">
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Supporting Engineer
                </h6>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Additional Internal resource for backup or specialized
                  expertise. Ensures continuity if primary engineer is
                  unavailable.
                </p>
              </div>
            </div>
          </div>

          {/* Metrics and Analytics */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              Metrics and Analytics
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              MAPs provide comprehensive metrics to track project health and
              team performance:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Progress Tracking
                </h6>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Overall completion percentage across all items</li>
                  <li>
                    • Status distribution (Not Started, In Progress, Complete,
                    Blocked, Deferred)
                  </li>
                  <li>• Phase-level progress with visual indicators</li>
                  <li>• Completion trend over time</li>
                </ul>
              </div>
              <div>
                <h6 className="font-medium text-xs mb-2 dark:text-gray-100">
                  Timeline Analytics
                </h6>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Total estimated hours (task-level aggregation)</li>
                  <li>• Total project duration in days</li>
                  <li>• Start/end date visualization on calendar</li>
                  <li>• Overdue item identification</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Best Practices */}
          <div>
            <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-3">
              Best Practices for Engineers
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h5 className="font-medium text-sm text-green-600 dark:text-green-400">
                  Planning and Setup
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Start with a template and customize as needed</li>
                  <li>• Set realistic time estimates at the task level</li>
                  <li>• Assign responsibilities early in the project</li>
                  <li>• Use descriptive names for phases/steps/tasks</li>
                  <li>• Align MAP dates with project timeline</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h5 className="font-medium text-sm text-blue-600 dark:text-blue-400">
                  Execution and Maintenance
                </h5>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Update status as work progresses</li>
                  <li>• Mark items as blocked immediately when issues arise</li>
                  <li>• Use Activity Timeline to communicate changes</li>
                  <li>• Review MAP with customer during check-ins</li>
                  <li>• Archive completed MAPs for future reference</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Account Portal Access */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Account Portal Integration
            </h5>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              When you create a MAP, it automatically becomes visible to
              customer portal users assigned to the project. Customers can view
              all phases, steps, and tasks, track progress, see assignments, and
              understand the timeline. This transparency builds trust and keeps
              everyone aligned throughout the validation process. Refer to the{" "}
              <strong>CriteriaIQ Workspace Guide</strong> for the
              customer-facing documentation on MAPs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
