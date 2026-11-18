import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BookCheck, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BentoCard } from "@/components/customer-workspace/BentoTiles";
import { ProjectOutcomeDialog } from "@/components/outcomes/ProjectOutcomeDialog";
import { apiRequest } from "@/lib/queryClient";
import { isCriterionCounted, isCriterionMet, normalizeCriterionPriority } from "@shared/value-journey";
import { useCriteriaAgreement } from "./use-value-journey";

type OutcomeType = "won" | "lost" | "cancelled";

interface OutcomeRequestResponse {
  request: { outcomeType: OutcomeType; status: string } | null;
  hasOutcome: boolean;
  canRecord: boolean;
}

interface ReviewCriterion {
  status?: string | null;
  priority?: string | null;
  isActive?: boolean | null;
}

/**
 * What a review after the sale starts from, on a closed project: how many
 * must-haves and nice-to-haves were met, who agreed to the criteria and how
 * much changed after they did. "Start review" records the win/loss outcome
 * (Outcome Intelligence). Staff only: the page renders it for internal users.
 */
export function AfterActionReviewCard({
  projectId,
  projectName,
  status,
  salesStage,
  criteria,
  locale,
}: {
  projectId: number;
  projectName: string;
  status?: string | null;
  salesStage?: string | null;
  criteria: ReviewCriterion[];
  locale: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Same key as ProjectOutcomePrompt, so the page asks once.
  const { data } = useQuery<OutcomeRequestResponse>({
    queryKey: ["project-outcome-request", projectId, status ?? null, salesStage ?? null],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcome-request`),
    staleTime: 30000,
  });
  const request = data?.request ?? null;
  const { data: agreement } = useCriteriaAgreement(projectId, !!request);
  if (!request) return null;

  const counted = criteria.filter(isCriterionCounted);
  const tally = (priority: "must_have" | "nice_to_have") => {
    const rows = counted.filter((c) => normalizeCriterionPriority(c.priority) === priority);
    return { met: rows.filter((c) => isCriterionMet(c.status)).length, total: rows.length };
  };
  const must = tally("must_have");
  const nice = tally("nice_to_have");
  const changes = agreement?.changes;
  const changedCount = changes ? changes.changedIds.length + changes.addedIds.length + changes.removedIds.length : 0;
  const agreed = agreement?.lastAgreed ?? null;
  const agreedOn = agreed?.agreedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(agreed.agreedAt)) : null;

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("valueJourney.review.title")}
        </span>
      }
      action={
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t(`valueJourney.review.outcome.${request.outcomeType}`)}
        </span>
      }
      data-testid="after-action-review"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t("valueJourney.review.mustHaves")}</dt>
          <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100" data-testid="review-must-haves">
            {t("valueJourney.card.ofTotal", { done: must.met, total: must.total })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t("valueJourney.review.niceToHaves")}</dt>
          <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {t("valueJourney.card.ofTotal", { done: nice.met, total: nice.total })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t("valueJourney.review.changedAfterSignOff")}</dt>
          <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100" data-testid="review-changed">
            {agreed ? changedCount : "—"}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {agreed && agreedOn
          ? t("valueJourney.review.agreedBy", { name: agreed.agreedByName ?? "", date: agreedOn })
          : t("valueJourney.review.neverAgreed")}
      </p>
      {data?.hasOutcome ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800 dark:text-green-300">
          <BookCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("valueJourney.review.recorded")}
        </p>
      ) : data?.canRecord ? (
        <>
          <Button type="button" size="sm" className="self-start" onClick={() => setOpen(true)} data-testid="review-start">
            <BookCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("valueJourney.review.start")}
          </Button>
          <ProjectOutcomeDialog open={open} onOpenChange={setOpen} projectId={projectId} projectName={projectName} outcomeType={request.outcomeType} />
        </>
      ) : null}
    </BentoCard>
  );
}
