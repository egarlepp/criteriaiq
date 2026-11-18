import { MapPinCheck, ChevronDown } from 'lucide-react';
import { fillRecordName, useValidationRecordLabel } from '@/hooks/use-validation-record-label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type StageFrameworkData = {
  titleSuffix: string;
  goal: string;
  responsibilities: string[];
  description: string[];
  images: Array<{ src: string; alt: string }>;
  acquaint?: {
    goal: string;
    responsibilities: string[];
    description: string[];
  };
};

const stageData: StageFrameworkData[] = [
  {
    titleSuffix: 'Attach',
    goal: 'Establish your presence early, build technical trust, and establish clear ownership',
    responsibilities: [
      'Join early-stage sales conversations with Sales reps',
      'Understand initial deal context and challenges',
      'Start thinking about technical success metrics',
      'Begin relationship-building with customer stakeholders',
    ],
    description: [
      'This phase formally links a Sales Engineer (SE) to your CRM\'s opportunity, establishing clear ownership and accountability. When the Primary SE, specialist SEs, overlays, and SMEs are "ATTACHed" to an opportunity, it clarifies roles and responsibilities and enables a measurable attach rate KPI.',
      'This utilization KPI helps leaders track how effectively technical resources are deployed across all open opportunities. By attaching yourself and the necessary team members in the CRM, you create visibility into who guides the deal. It reinforces a culture where SEs are empowered to take charge of key accounts, ensuring that customer needs are adequately addressed from the earliest stage.',
    ],
    images: [],
  },
  {
    titleSuffix: 'Assess',
    goal: 'Gather deep technical understanding and scope the technical validation process',
    responsibilities: [
      "Research the customer's environment, tools, and industry",
      'Review any RFx requests if applicable',
      'Identify key technical influencers and decision-makers',
      'Conduct discovery sessions to capture use cases, technical requirements, and security & compliance considerations',
      'Draft initial artifacts — MAP (Mutual Action Plan), Execution Criteria Plan, Security and Compliance Docs',
    ],
    description: [
      'The SE creates and maintains a Technical Account Plan (TAP), dynamically documenting every crucial detail of the opportunity\'s technical landscape. The TAP evolves throughout the deal cycle and serves as all stakeholders\' central source of truth.',
      'By owning and regularly updating the TAP, the SE can anticipate challenges, guide technical validation, and drive Technical Clearance to Closure (TCC). Consistent, data-driven evaluations help ensure that specialists, management, and the extended sales team remain on the same page, fostering a smooth path to success. Presently, TAP is maintained on the {{record}} record, connected to the Opportunity, and coordinated through CriteriaIQ SalesForce integration.',
      '',
      'This tactical blueprint informs analytics, coaching opportunities, root-cause analysis, and in-depth discussions. By owning and regularly updating the TAP, the SE can, Anticpate Challenges, Guide Technical Validation, and Drive Technical Clearance to Closure (TCC). Ultimately, consistent, data-driven evaluations help ensure that specialists, management, and the extended sales team remain on the same page, fostering a smooth path to success as the opportunity progresses.',
    ],
    images: [],
  },
  {
    titleSuffix: 'Affect',
    goal: 'Architect, deploy, and execute the technical validation',
    responsibilities: [
      'Lead weekly syncs with all stakeholders',
      'Design POC architecture (CloudLAB or Onsite)',
      'Track progress against MAP or Execution Criteria',
      'Build and test the environment (install, configure, validate)',
      'Document technical implementation — Requirements & Design Docs',
      'Run project with customer to against validation criteria',
      'Collaborate with Product/Engineering to enable advanced features and resolve blockers',
      'Log all feedback and track activities via Events in Salesforce',
    ],
    description: [
      'Armed with the knowledge from the Assess stage, you’re now poised to influence the direction of the opportunity and AFFECT its momentum. This is where you propose well-aligned solutions, demonstrate your expertise, and illustrate the tangible business impact of your offering. Craft a Persuasive Narrative, use customer-focused language and share relevant success stories. By demonstrating how similar organizations have benefited, you reinforce the credibility of your solution and boost customer confidence. At the same time, you’ll drive the deal forward by conducting technical validation activities to showcase real-world use cases, engage key stakeholders, and highlight both business and technical value.',
      'Map each feature to the identified need, quantify the benefits with measurable outcomes, and capture all technical validation activities and stakeholder feedback in your TAP. Maintaining detailed records promotes transparency, reveals new coaching or optimization opportunities, and keeps everyone aligned.',
    ],
    images: [],
  },
  {
    titleSuffix: 'Align & Acquaint',
    goal: 'Validate technical validation success, secure Technical Win (TCC), and build lasting relationships',
    responsibilities: [
      'Lead weekly syncs with all stakeholders',
      'Conduct final validation and executive readout',
      'Declare Technical Win (TCC) when all criteria are met',
      'Update all relevant stakeholders about technical approval and remaining tasks required during hand-off.',
      'Prepare and deliver a warm handoff to Services — MAP, Design Docs, Transition Plan, Gaps, and Adoption Challenges',
    ],
    description: [
      'ALIGNing on technical and business objectives becomes essential as the opportunity moves toward a decision. The SE seeks to achieve Technical Clearance to Close (TCC) — customer acknowledgment that the evaluated solution meets all critical requirements, there are no technical hurdles, no longer competitive with another vendor, and is their chosen path forward. It is dependent ultimately on last minute budget or legal issues, but if MEDDPICC is followed, little to any gotchas.',
      'By attaining TCC and maintaining a visible presence through final procurement steps, you reinforce trust (further building that Trusted Advisor status), prevent misunderstandings, and help guarantee a smooth transition from technical approval to contract signature. This collaborative approach drives the deal to a successful close while preserving valuable relationships for future opportunities.',
    ],
    images: [],
    acquaint: {
      goal: 'Support onboarding, reflect on outcomes, and prepare for expansion',
      responsibilities: [
        'Support CS/Services with onboarding (if needed)',
        'Conduct internal post-mortem or reflection',
        'Update TAP (Technical Account Plan)',
        'Share lessons learned with the SE team',
        'Identify expansion opportunities — new stakeholders, evolving needs',
      ],
      description: [
        "Even after a deal closes, the SE’s role continues. ACQUAINT focuses on expanding the customer relationship, capturing lessons learned, and turning post-sale insight into future opportunity. By reviewing Attach, Assess, Affect, and Align, SEs can identify what worked, where gaps remain, and how to improve the next cycle. Combined with ongoing guidance, feedback loops, and awareness of account changes, this strengthens customer loyalty, improves business management, and helps generate future pipeline.",
      ],
    },
  },
];

type Props = {
  stageIndex: number;
  iconColor?: string;
};

export const Stage5AFramework = ({ stageIndex, iconColor = 'text-muted-foreground' }: Props) => {
  const data = stageData[stageIndex];
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  if (!data) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 bg-muted/40 hover:bg-muted rounded-xl border border-border transition-colors group">
        <div className="flex items-center gap-2">
          <MapPinCheck className={`h-5 w-5 ${iconColor} transition-colors`} />
          <span className="text-sm font-bold text-foreground">
            Influence Via The 5A Framework: {data.titleSuffix}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 animate-in slide-in-from-top-2">
        <div className="rounded-xl border border-border bg-card p-5 space-y-6 shadow-sm">

          {/* Goal */}
          <div className="bg-muted/40 rounded-lg p-2 border border-border/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Goal</p>
            <p className="text-sm text-foreground font-medium">{data.goal}</p>
          </div>

          {/* Responsibilities */}
          <div className="bg-muted/40 rounded-lg p-2 border border-border/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Responsibilities</p>
            <ul className="space-y-1">
              {data.responsibilities.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <span className="text-muted-foreground/50 shrink-0 mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Description — one <p> per array entry */}
          <div className="space-y-2">
            {data.description.map((para, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed">{fillRecordName(para, record)}</p>
            ))}
          </div>

          {/* Images below text */}
          {data.images.length > 0 && (
            <div className="space-y-4">
              {data.images.map((img, i) => (
                <img
                  key={i}
                  src={img.src}
                  alt={img.alt}
                  className="w-full max-w-2xl mx-auto rounded-lg border border-border/60 shadow-sm block"
                />
              ))}
            </div>
          )}

          {/* Acquaint section (Stage 4 only) */}
          {data.acquaint && (
            <div className="border-t border-border pt-5 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <MapPinCheck className={`h-4 w-4 ${iconColor}`} />
                <span className="text-sm font-bold text-foreground">Acquaint: Ongoing Relationships & Process Refinement</span>
              </div>

              <div className="bg-muted/40 rounded-lg p-4 border border-border/50">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Goal</p>
                <p className="text-sm text-foreground font-medium">{data.acquaint.goal}</p>
              </div>

              <div className="bg-muted/40 rounded-lg p-4 border border-border/50">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Responsibilities</p>
                <ul className="space-y-1">
                  {data.acquaint.responsibilities.map((r, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                      <span className="text-muted-foreground/50 shrink-0 mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                {data.acquaint.description.map((para, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed">{para}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
