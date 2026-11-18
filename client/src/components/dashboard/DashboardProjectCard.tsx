/**
 * DashboardProjectCard — engineer-focused card used in the Manage Projects
 * "Due" and "For Review" accordion views (project-grouped-views.tsx).
 *
 * Front face:
 *   • Header bar in the theme's top-bar colors (Admin › Appearance):
 *     account name, "#ID · project name", Internal + Account Status pills
 *     with their Field Settings icons, and a progress ring on the right that
 *     shows the share of validation criteria marked Complete (Cancelled ones
 *     are left out of the total).
 *   • A 3px strip in the risk color above the header when risk is anything
 *     other than "None", so only projects that need attention stand out.
 *   • Labeled facts with icons: Ends (date · days), Account Rep, Risk,
 *     Ranking (icons and colors from Field Settings).
 *   • Business problem (2 lines) and solution badges.
 *   • Footer: "Engineers & journey" expander, plus View Project and
 *     MAP icon buttons.
 * Back face (click the card to flip):
 *   • Same header with a close button
 *   • Business Problem · Solution Description · Customer Objective ·
 *     Policy Considerations, and the validation criteria bar.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  ChevronDown,
  RotateCcw,
  Target,
  User,
  Users,
  Waypoints,
} from "lucide-react";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { JourneyStageTrack } from "@/components/value-journey/JourneyStageTrack";
import { getRankingColor, getRankingIcon } from "@/lib/rankingUtils";
import { getRiskLevelColor, getRiskLevelIcon } from "@/lib/riskLevelUtils";
import type { PocWithRelations } from "@shared/schema";
import { formatFullName } from "@/lib/nameUtils";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusConfigLike {
  name: string;
  color: string;
  icon?: string | null;
}

interface ConfigItem {
  name: string;
  color: string;
  icon?: string | null;
}

export interface DashboardProjectCardProps {
  project: PocWithRelations;
  statusConfig?: StatusConfigLike;
  customerStatusConfig?: StatusConfigLike;
  products?: Array<{ name: string; solutionIcon?: string | null; solutionIconName?: string | null }>;
  rankingConfigs?: ConfigItem[];
  riskLevelConfigs?: ConfigItem[];
  onViewProject: (id: number) => void;
  /** Navigate to the project's MAP */
  onViewPlan?: (id: number) => void;
}

type PersonLike = { firstName?: string | null; lastName?: string | null } | null;

const RING_RADIUS = 15.9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Inline helpers ───────────────────────────────────────────────────────────

/** Renders a labeled text block on the back face; returns null when value is empty. */
function BackField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-h-0 shrink-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">{value}</p>
    </div>
  );
}

function parseSolutions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [String(parsed)].filter(Boolean);
  } catch {
    if (raw.includes(",")) return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return raw.trim() ? [raw.trim()] : [];
  }
}

function personOf(value: unknown): PersonLike {
  return value && typeof value === "object" ? (value as PersonLike) : null;
}

function personName(person: PersonLike): string {
  return person ? formatFullName(person.firstName ?? null, person.lastName ?? null) : "";
}

/** One labeled fact in the card body: icon, muted label, value. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-xs">
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">{children}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardProjectCard({
  project,
  statusConfig,
  customerStatusConfig,
  products = [],
  rankingConfigs = [],
  riskLevelConfigs = [],
  onViewProject,
  onViewPlan,
}: DashboardProjectCardProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // ── Validation criteria (ring + back face bar) ───────────────────────────
  const criteria = (project.successCriteria ?? []) as Array<{ isActive?: boolean | null; status?: string | null }>;
  // Criterion statuses come from success-criteria-form: "complete" is met;
  // "cancelled" criteria drop out of the total.
  const activeCriteria = criteria.filter(
    (c) => c.isActive !== false && (c.status ?? "").toLowerCase() !== "cancelled",
  );
  const metCriteria = activeCriteria.filter((c) => (c.status ?? "").toLowerCase() === "complete");
  const hasCriteria = activeCriteria.length > 0;
  const criteriaPercent = hasCriteria ? Math.round((metCriteria.length / activeCriteria.length) * 100) : 0;
  const ringLabel = hasCriteria
    ? t("projectCard.criteriaRing", { met: metCriteria.length, total: activeCriteria.length, percent: criteriaPercent })
    : t("projectCard.noCriteria");

  // ── Risk / ranking (Field Settings icon + color) ─────────────────────────
  const riskName = (project.risk as string | null | undefined) || "None";
  const riskIconName = getRiskLevelIcon(riskName, riskLevelConfigs) || "Server";
  const riskColor = getRiskLevelColor(riskName, riskLevelConfigs);
  const showRiskEdge = riskName.toLowerCase() !== "none";

  const rankingName = (project.ranking as string | null | undefined) ?? "";
  const rankingIconName = rankingName ? getRankingIcon(rankingName, rankingConfigs) || "CalendarHeart" : null;
  const rankingColor = rankingName ? getRankingColor(rankingName, rankingConfigs) : undefined;

  // ── Solutions ────────────────────────────────────────────────────────────
  const solutions = parseSolutions(project.solutionName as string | null);
  const displayedSolutions = solutions.slice(0, 3);
  const extraSolutions = solutions.length - displayedSolutions.length;
  const getProductInfo = (sol: string) => {
    const p = products.find((pr) => pr.name === sol) ?? products.find((pr) => pr.name.toLowerCase() === sol.toLowerCase());
    return { name: p?.name || sol, icon: p?.solutionIcon ?? null, iconName: p?.solutionIconName ?? null };
  };

  // ── End date ─────────────────────────────────────────────────────────────
  const endDateRaw = (project.endDate as string | Date | null | undefined) ?? null;
  const endDateObj = (() => {
    if (!endDateRaw) return null;
    const iso = typeof endDateRaw === "string" ? endDateRaw : endDateRaw.toISOString();
    const [year, month, day] = iso.split("T")[0].split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day) : null;
  })();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysRemaining = endDateObj ? Math.round((endDateObj.getTime() - today.getTime()) / 86_400_000) : null;
  const endDateText = endDateObj
    ? endDateObj.toLocaleDateString(i18n.language || undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const daysLabel =
    daysRemaining == null ? null
    : daysRemaining < 0 ? t("projectCard.daysOverdue", { count: Math.abs(daysRemaining) })
    : daysRemaining === 0 ? t("projectCard.dueToday")
    : t("projectCard.daysLeft", { count: daysRemaining });
  const daysTextClass =
    daysRemaining == null ? "text-slate-400 dark:text-slate-500"
    : daysRemaining < 0 ? "text-red-600 dark:text-red-400"
    : daysRemaining <= 14 ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  // ── People ───────────────────────────────────────────────────────────────
  const primarySe = personOf(project.primarySe);
  const specialistSe = personOf(project.specialistSe);
  const accountRepName = personName(personOf(project.accountRepresentative));

  const planLabel = t("projects.manageTable.action.viewMap");

  const renderPersonMini = (label: string, person: PersonLike) => (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">{label}</span>
      {person ? (
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate leading-tight">{personName(person)}</span>
      ) : (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 italic truncate leading-tight">{t("projects.notAssigned")}</span>
      )}
    </div>
  );

  // ── Header bar (theme colors), shared by both faces ───────────────────────
  const Header = ({ showClose }: { showClose?: boolean }) => (
    <div className="brand-topbar flex items-center gap-3 px-3 py-2.5 shrink-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold leading-tight" title={project.customerName}>
          {project.customerName}
        </span>
        <span className="truncate text-[11px] leading-tight opacity-75">
          #{project.id}
          {project.name ? ` · ${project.name}` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge config={statusConfig} variant="darkRail" size="sm" />
          {project.customerStatus && <StatusBadge config={customerStatusConfig} variant="darkRail" size="sm" />}
        </div>
      </div>

      {showClose ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setFlipped(false); }}
          className="shrink-0 self-start rounded p-0.5 opacity-75 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={t("projectCard.flipBack")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="img"
              aria-label={ringLabel}
              tabIndex={0}
              className="relative h-12 w-12 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                {/* Own dark disc + white text, so the ring reads on any theme
                    gradient (a light Appearance theme sets dark top-bar text). */}
                <circle cx="18" cy="18" r="17.75" fill="#0F172A" fillOpacity={0.72} />
                <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth="3.5" />
                {hasCriteria && criteriaPercent > 0 && (
                  <circle
                    cx="18"
                    cy="18"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#6EE7B7"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(criteriaPercent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                  />
                )}
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums leading-none text-white">
                {hasCriteria ? `${criteriaPercent}%` : "—"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{ringLabel}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  // ── Card surface: risk strip on top when risk isn't "None" ───────────────
  const cardSurface =
    "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden " +
    "shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.35)]";
  const riskEdgeStyle: React.CSSProperties | undefined = showRiskEdge
    ? { borderTopWidth: 3, borderTopColor: riskColor }
    : undefined;

  return (
    // Perspective container — establishes 3D space, no overflow-hidden here
    <div style={{ perspective: "1000px" }} className="@container relative">
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
        className="relative motion-reduce:!transition-none"
      >
        {/* ═══════════════ FRONT FACE ═══════════════ */}
        <TooltipProvider delayDuration={150}>
          <div
            style={{ backfaceVisibility: "hidden", ...riskEdgeStyle }}
            className={cn(
              cardSurface,
              "flex flex-col cursor-pointer select-none transition-shadow duration-200",
              "hover:shadow-[0_5px_20px_rgba(15,23,42,0.12)] dark:hover:shadow-[0_5px_20px_rgba(0,0,0,0.5)]",
            )}
            onClick={() => setFlipped(true)}
          >
            <Header />

            {/* Labeled facts */}
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-3 pt-2.5 @[24rem]:grid-cols-2">
              <Fact icon={<Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />} label={t("projectCard.ends")}>
                {endDateText ? (
                  <>
                    <span className="tabular-nums">{endDateText}</span>
                    {daysLabel && <span className={cn("ml-1 font-semibold", daysTextClass)}>· {daysLabel}</span>}
                  </>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">{t("projectCard.notSet")}</span>
                )}
              </Fact>
              <Fact icon={<User className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />} label={t("projectCard.accountRep")}>
                {accountRepName || <span className="text-slate-400 dark:text-slate-500">{t("projects.notAssigned")}</span>}
              </Fact>
              <Fact icon={<DynamicIcon name={riskIconName} className="h-3.5 w-3.5" style={{ color: riskColor }} />} label={t("projectCard.risk")}>
                {riskName}
              </Fact>
              {rankingIconName && (
                <Fact icon={<DynamicIcon name={rankingIconName} className="h-3.5 w-3.5" style={{ color: rankingColor }} />} label={t("projectCard.ranking")}>
                  {rankingName}
                </Fact>
              )}
            </div>

            {/* Business problem */}
            <p className="px-3 pt-2 text-xs leading-snug text-slate-600 dark:text-slate-400 line-clamp-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{t("projectCard.businessProblem")}: </span>
              {project.businessProblem || t("common.notSpecified")}
            </p>

            {/* Solution badges */}
            {solutions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
                {displayedSolutions.map((sol, i) => {
                  const info = getProductInfo(sol);
                  return <SolutionBadge key={`${sol}-${i}`} solutionName={info.name} solutionIcon={info.icon ?? undefined} solutionIconName={info.iconName} />;
                })}
                {extraSolutions > 0 && (
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {t("projectCard.moreSolutions", { count: extraSolutions })}
                  </span>
                )}
              </div>
            )}

            {/* Expandable section — people + value journey */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none",
                expanded ? "max-h-[220px] opacity-100" : "max-h-0 opacity-0",
              )}
            >
              <div className="flex flex-col gap-3 px-3 pt-2.5">
                <div className="grid grid-cols-2 gap-2">
                  {renderPersonMini(t("projects.primaryEngineer"), primarySe)}
                  {renderPersonMini(t("projects.specialistEngineer"), specialistSe)}
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {t("projectCard.journeyStages")}
                  </p>
                  <div onClick={(e) => e.stopPropagation()}>
                    <JourneyStageTrack projectId={project.id} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer — expander left, actions right; clicks here don't flip */}
            <div
              className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800 shrink-0"
              style={{ marginTop: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 rounded text-[11px] font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
                <Users className="h-3 w-3" />
                {t("projectCard.engineersAndJourney")}
              </button>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onViewProject(project.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-label={t("dashboard.table.viewProject")}
                    >
                      <Target className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{t("dashboard.table.viewProject")}</p>
                  </TooltipContent>
                </Tooltip>

                {onViewPlan && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onViewPlan(project.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label={planLabel}
                      >
                        <Waypoints className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">{planLabel}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* ═══════════════ BACK FACE ═══════════════ */}
        <TooltipProvider delayDuration={150}>
          <div
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", ...riskEdgeStyle }}
            className={cn(cardSurface, "absolute inset-0 flex flex-col")}
          >
            <Header showClose />

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-2.5">
              <BackField label={t("projectCard.businessProblem")} value={project.businessProblem} />
              <BackField label={t("projectCard.solutionDescription")} value={(project as { solutionDescription?: string | null }).solutionDescription} />
              <BackField label={t("projectCard.customerObjective")} value={(project as { customerObjective?: string | null }).customerObjective} />
              <BackField label={t("projectCard.policyConsiderations")} value={(project as { policyConsiderations?: string | null }).policyConsiderations} />

              {hasCriteria && (
                <div className="min-h-0 shrink-0">
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {t("accountPortal.validationCriteria")}
                  </p>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-600 dark:text-slate-400">
                      {t("projectCard.criteriaMet", { met: metCriteria.length, total: activeCriteria.length })}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-400">{criteriaPercent}%</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${criteriaPercent}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
