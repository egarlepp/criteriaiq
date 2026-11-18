import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { RotateCcw, Eye, Hash, MessagesSquare, Users, Waypoints } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { JourneyStageTrack } from "@/components/value-journey/JourneyStageTrack";
import { getTagInfo } from "@/lib/tagUtils";
import { StatusBadge } from "@/components/shared/StatusBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectCardProject {
  id: number;
  name?: string | null;
  /** Displayed on the back face only */
  businessProblem?: string | null;
  /** Back face */
  customerObjective?: string | null;
  /** Back face */
  policyConsiderations?: string | null;
  customerName?: string | null;
  solutionName?: string | null;
  /** Internal/internal status — shown only as tooltip on the progress ring */
  status?: string | null;
  /** Account/customer-facing status — shown as the front badge */
  customerStatus?: string | null;
  endDate?: string | null;
  progress?: number | null;
  successCriteria?: Array<{ isActive?: boolean | null; status?: string | null }> | null;
  /** Topical tags (text[] column on projects). Rendered as small filled pills
   *  below the solutions row when present. */
  tags?: string[] | null;
}

export interface ProjectCardStatusConfig {
  name: string;
  color: string;
  icon?: string | null;
}

export interface ProjectCardProps {
  project: ProjectCardProject;
  /** Internal status config (used for ring color + hover tooltip) */
  statusConfig?: ProjectCardStatusConfig;
  /** Account/customer status config (shown as front badge) */
  customerStatusConfig?: ProjectCardStatusConfig;
  onViewProject: (id: number) => void;
  /** Optional secondary action (e.g. View MAP) */
  onViewPlan?: (id: number) => void;
  planLabel?: string;
  planDisabled?: boolean;
  /** Optional chat button: opens the project's messages. */
  onOpenMessages?: (id: number) => void;
  /** Unread messages, shown as a count on the chat button. */
  unreadMessages?: number;
  /**
   * The small label above the solution title: the account name (default, for
   * boards listing many accounts) or the project's name (the Account Portal,
   * where every card is the same account and the roadmap lists names).
   */
  eyebrow?: "customer" | "name";
  /** Optional Account Users button, right of View MAP: who has access to the project. */
  onOpenAccess?: (id: number) => void;
  accessLabel?: string;
  /** Extra className on the outer wrapper */
  className?: string;
  /** False for Customer, Partner and Guest viewers: the ring tooltip shows
   *  progress instead of the Internal Project Status name. */
  showInternalStatus?: boolean;
  /** Resolver that maps a solution name to its uploaded graphic filename and
   *  its icon name; the graphic wins. Optional — when omitted the card renders
   *  solution names without pictures. Caller owns the products query so this
   *  component stays decoupled. */
  getSolutionMark?: (solutionName: string) => { graphic?: string | null; icon?: string | null } | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSolutions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    return [String(parsed)].filter(Boolean);
  } catch {
    if (raw.includes(",")) return raw.split(",").map((s) => s.trim()).filter(Boolean);
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
}

function statusToProgress(
  status: string | null | undefined,
  progress: number | null | undefined,
): number {
  if (progress != null) return progress;
  const s = (status ?? "").toLowerCase();
  if (s.includes("planning")) return 10;
  if (s.includes("progress")) return 40;
  if (s.includes("tcc")) return 75;
  if (s.includes("complete")) return 90;
  return 25;
}

function hexToLighter(hex: string): string {
  const clean = (hex || "#6366F1").replace("#", "");
  if (clean.length < 6) return "#818CF8";
  const r = Math.min(255, parseInt(clean.slice(0, 2), 16) + 50);
  const g = Math.min(255, parseInt(clean.slice(2, 4), 16) + 50);
  const b = Math.min(255, parseInt(clean.slice(4, 6), 16) + 50);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Back face labeled field ──────────────────────────────────────────────────

function BackField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="shrink-0 overflow-hidden">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">
        {label}
      </p>
      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">
        {value}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectCard({
  project,
  statusConfig,
  customerStatusConfig,
  onViewProject,
  onViewPlan,
  planLabel,
  planDisabled = false,
  onOpenMessages,
  onOpenAccess,
  accessLabel,
  eyebrow = "customer",
  unreadMessages = 0,
  className,
  getSolutionMark,
  showInternalStatus = true,
}: ProjectCardProps) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);

  // ── Progress ring ────────────────────────────────────────────────────────
  const pct = statusToProgress(project.status, project.progress);
  const ringColor = statusConfig?.color ?? "#6366F1";
  const ringLighter = hexToLighter(ringColor);
  const gradientStyle = `linear-gradient(to right, ${ringColor}, ${ringLighter})`;

  // ── Date badge ───────────────────────────────────────────────────────────
  const endDateObj = project.endDate ? new Date(project.endDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysRemaining = endDateObj
    ? Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const daysLabel =
    daysRemaining == null
      ? null
      : daysRemaining < 0
      ? t("projectCard.daysOverdue", { count: Math.abs(daysRemaining) })
      : daysRemaining === 0
      ? t("projectCard.dueToday")
      : t("projectCard.daysLeft", { count: daysRemaining });

  const dateBadgeClass =
    daysRemaining == null
      ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
      : daysRemaining < 0
      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
      : daysRemaining <= 14
      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
      : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800";

  // ── Display values ───────────────────────────────────────────────────────
  const solutions = parseSolutions(project.solutionName as string | null);
  // Cap visible solutions so a project with many doesn't blow out the line;
  // overflow surfaces as a muted "+N" hint instead of wrapping.
  const MAX_VISIBLE_SOLUTIONS = 4;
  const visibleSolutions = solutions.slice(0, MAX_VISIBLE_SOLUTIONS);
  const extraSolutions = Math.max(0, solutions.length - MAX_VISIBLE_SOLUTIONS);
  const solutionDisplay = solutions.slice(0, 2).join(", ") || (project.solutionName ?? "");
  const customerStatusName = customerStatusConfig?.name ?? project.customerStatus ?? "";
  const internalStatusName = statusConfig?.name ?? project.status ?? "";

  // Tags row — only render when the project actually has tags assigned. Uses
  // the same getTagInfo helper as the project-creation form for consistent
  // colors; pills are deliberately smaller than the form's so they don't
  // compete with the bold solution line above.
  const tagList = (project.tags ?? []).filter((t): t is string => typeof t === "string" && t.trim().length > 0);

  return (
    <div style={{ perspective: "1000px" }} className={cn("relative h-full", className)}>
      {/* Rotating inner — both faces live here */}
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
        className="relative h-full"
      >
        {/* ── FRONT FACE ──────────────────────────────────────────────── */}
        <div
          style={{ backfaceVisibility: "hidden" }}
          onClick={() => setFlipped(true)}
          className="h-full bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-100 dark:border-gray-800 flex flex-col cursor-pointer select-none overflow-hidden"
        >
          {/* Gradient top bar */}
          <div className="h-1.5 w-full shrink-0" style={{ background: gradientStyle }} />

          <div className="p-5 flex flex-col flex-1 gap-0 relative">
            {/* Progress ring — absolutely positioned in the card's top-right
                corner so it doesn't inflate the flex-row heights of the rows
                it visually overlaps. The rows beneath it (status+date,
                customer+solution) carry `pr-16` so their content can't run
                under the ring; the ring's own click target stops propagation
                so it never triggers the card flip. Internal status shows on
                hover via the existing tooltip. */}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute top-4 right-4 w-14 h-14 cursor-help z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="#E5E7EB"
                        className="dark:stroke-gray-700"
                        strokeWidth="3.2"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="3.2"
                        strokeDasharray={`${pct} ${100 - pct}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span
                        className="text-xs font-black leading-none"
                        style={{ color: ringColor }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {showInternalStatus ? (
                    <>
                      <p className="text-xs font-semibold">{internalStatusName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("projectCard.internalStatus")}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-semibold">
                      {pct}% {t("projectCard.progress")}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Status + date row — surfaced at the very top of the card body
                so the operational signal (where this project stands and how
                soon it's due) reads first, above the customer/solution
                identity. Only rendered when at least one of the two is set.
                pr-16 reserves a clear lane for the absolute-positioned ring. */}
            {(customerStatusName && customerStatusConfig) || daysLabel ? (
              <div className="flex items-center gap-2 mb-3 flex-wrap pr-16">
                {customerStatusName && customerStatusConfig && (
                  <StatusBadge
                    config={customerStatusConfig}
                    label={customerStatusName}
                    size="lg"
                  />
                )}
                {daysLabel && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border",
                      dateBadgeClass,
                    )}
                  >
                    📅{" "}
                    {endDateObj
                      ? endDateObj.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}{" "}
                    · {daysLabel}
                  </span>
                )}
              </div>
            ) : null}

            {/* Header: account (or project) name / solution name. The progress ring is
                rendered above (absolute top-right), so this block carries
                pr-16 to keep long names from running under it. */}
            <div className="mb-4 pr-16">
              {eyebrow === "name" && project.name ? (
                <p
                  className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1 truncate"
                  data-testid={`project-card-name-${project.id}`}
                >
                  {project.name}
                </p>
              ) : project.customerName ? (
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1 truncate">
                  {project.customerName}
                </p>
              ) : null}
              {visibleSolutions.length > 0 ? (
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight line-clamp-1 flex items-center min-w-0 flex-wrap">
                  {visibleSolutions.map((sol, i) => {
                    const mark = getSolutionMark?.(sol);
                    return (
                      <span key={`${sol}-${i}`} className="inline-flex items-center min-w-0">
                        {i > 0 && (
                          <span
                            aria-hidden
                            className="mx-1.5 text-gray-300 dark:text-gray-600 font-normal"
                          >
                            |
                          </span>
                        )}
                        <SolutionGraphic graphic={mark?.graphic} icon={mark?.icon} className="w-4 h-4 mr-1" />
                        <span className="truncate">{sol}</span>
                      </span>
                    );
                  })}
                  {extraSolutions > 0 && (
                    <span className="ml-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
                      +{extraSolutions}
                    </span>
                  )}
                </h3>
              ) : (
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight line-clamp-1">
                  {solutionDisplay || project.name || t("common.notSpecified")}
                </h3>
              )}
            </div>

            {/* Tags row — smaller filled pills, mirrors the project-form
                tag styling but scaled down so it sits subordinate to the
                solution line. Only rendered when the project has tags. */}
            {tagList.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-3 -mt-2">
                {tagList.map((tag) => {
                  const info = getTagInfo(tag);
                  return (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: info.color }}
                      title={info.description ?? info.name}
                    >
                      <Hash className="h-2.5 w-2.5" />
                      {info.name}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Value journey stages, with the project and plan buttons (icons
                only) on the right, pinned to the bottom so cards in a row
                line up. The stages stay on one line: the portal grid sizes
                its columns so they fit (PortalProjectCardsGrid).
                stopPropagation keeps a button click from flipping the card. */}
            <div className="mt-auto flex items-end gap-3">
              <div className="flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                  {t("projectCard.journeyStages")}
                </p>
                <JourneyStageTrack projectId={project.id} variant="icons" />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProject(project.id);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                  aria-label={t("projectCard.viewProject")}
                  title={t("projectCard.viewProject")}
                  data-testid={`project-card-view-${project.id}`}
                >
                  <Eye className="h-4 w-4" />
                </button>
                {onOpenMessages && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMessages(project.id);
                    }}
                    className="relative grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label={
                      unreadMessages > 0
                        ? t("projectCard.messagesUnread", { count: unreadMessages })
                        : t("projectCard.messages")
                    }
                    title={
                      unreadMessages > 0
                        ? t("projectCard.messagesUnread", { count: unreadMessages })
                        : t("projectCard.messages")
                    }
                    data-testid={`project-card-messages-${project.id}`}
                  >
                    <MessagesSquare className="h-4 w-4" />
                    {unreadMessages > 0 && (
                      <span
                        className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:bg-red-500 dark:ring-gray-900"
                        aria-hidden="true"
                        data-testid={`project-card-unread-${project.id}`}
                      >
                        {unreadMessages > 99 ? "99+" : unreadMessages}
                      </span>
                    )}
                  </button>
                )}
                {onViewPlan && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!planDisabled) onViewPlan(project.id);
                    }}
                    disabled={planDisabled}
                    className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label={planLabel}
                    title={planLabel}
                    data-testid={`project-card-plan-${project.id}`}
                  >
                    <Waypoints className="h-4 w-4" />
                  </button>
                )}
                {onOpenAccess && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAccess(project.id);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label={accessLabel}
                    title={accessLabel}
                    data-testid={`project-card-access-${project.id}`}
                  >
                    <Users className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── BACK FACE ───────────────────────────────────────────────── */}
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="absolute inset-0 bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden"
        >
          {/* Matching gradient top bar */}
          <div className="h-1.5 w-full shrink-0" style={{ background: gradientStyle }} />

          {/* Mini header */}
          <div className="px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
            {project.customerName && (
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate mb-0.5">
                {project.customerName}
              </p>
            )}
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight line-clamp-1">
              {project.name || solutionDisplay || t("common.notSpecified")}
            </h3>
          </div>

          {/* Detail fields */}
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 px-5 pt-3 pb-2">
            <BackField
              label={t("projectCard.businessProblem")}
              value={project.businessProblem}
            />
            <BackField
              label={t("projectCard.customerObjective")}
              value={project.customerObjective}
            />
            <BackField
              label={t("projectCard.policyConsiderations")}
              value={project.policyConsiderations}
            />
          </div>

          {/* Flip back */}
          <div className="px-5 pb-4 pt-2">
            <button
              onClick={() => setFlipped(false)}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              {t("projectCard.flipBack")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
