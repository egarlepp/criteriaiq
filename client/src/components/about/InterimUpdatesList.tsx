import { useTranslation } from "react-i18next";
import { Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VersionUpdate } from "@/hooks/use-version-updates";
import type { UpdateCategory } from "@shared/version-updates";

export interface InterimUpdatesListProps {
  updates: VersionUpdate[] | undefined;
  release: string | undefined;
  isLoading: boolean;
  isError: boolean;
  /** "compact" for the sidebar version popover, "card" for About → Introduction. */
  variant?: "compact" | "card";
  /**
   * Show only this many updates open and fold the rest into an
   * "Earlier updates (N)" section, like ImpactIQ's What's new. Leave unset to
   * list every update (About → Introduction keeps the long list).
   */
  collapseAfter?: number;
}

// The Major Release Change Log's four headings (docs/guides/version-update-guide.md
// → Change Categories): same emoji and colors on the heading and the left rule.
const CATEGORY_STYLE: Record<UpdateCategory, { emoji: string; rule: string; heading: string }> = {
  security: {
    emoji: "🔒",
    rule: "border-red-500 dark:border-red-400",
    heading: "text-red-700 dark:text-red-300",
  },
  feature: {
    emoji: "🆕",
    rule: "border-green-500 dark:border-green-400",
    heading: "text-green-700 dark:text-green-300",
  },
  improvement: {
    emoji: "🔧",
    rule: "border-blue-500 dark:border-blue-400",
    heading: "text-blue-700 dark:text-blue-300",
  },
  fix: {
    emoji: "🐛",
    rule: "border-orange-500 dark:border-orange-400",
    heading: "text-orange-700 dark:text-orange-300",
  },
};

function UpdateCard({ update, current, compact }: { update: VersionUpdate; current: boolean; compact: boolean }) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[update.category] ?? CATEGORY_STYLE.improvement;
  return (
    <li
      className={cn(
        "rounded border",
        compact ? "p-1.5" : "px-3 py-2",
        current
          ? "border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30"
          : "border-gray-200 dark:border-gray-800",
      )}
      data-testid={`interim-update-${update.version}`}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 font-semibold text-gray-900 dark:text-gray-100",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        <span className="flex items-center gap-1 font-mono">
          {update.version}
          {current && (
            <span className="rounded-sm bg-blue-600 px-1 py-px font-sans text-[9px] font-semibold uppercase tracking-wide text-white dark:bg-blue-500">
              {t("about.versionUpdates.current")}
            </span>
          )}
        </span>
        <span className="shrink-0 font-normal text-gray-400 dark:text-gray-500">
          {update.pr !== null && <span className="mr-1.5">{t("about.versionUpdates.prNumber", { number: update.pr })}</span>}
          {update.date}
        </span>
      </div>
      <section className={cn("mt-1 border-l-2", compact ? "pl-2" : "pl-3", style.rule)} data-category={update.category}>
        {/* Not an <h4>: index.css paints every `.dark h4` white, which would drop the category color. */}
        <p
          role="heading"
          aria-level={4}
          className={cn("flex items-center gap-1 font-semibold", compact ? "text-[11px]" : "text-xs", style.heading)}
        >
          <span aria-hidden="true">{style.emoji}</span>
          {t(`about.versionUpdates.category.${update.category}`)}
        </p>
        <ul
          className={cn(
            "ml-3 list-disc text-gray-700 dark:text-gray-300",
            compact ? "text-[11px] leading-snug" : "mt-0.5 text-sm",
          )}
        >
          <li>{update.title}</li>
        </ul>
      </section>
    </li>
  );
}

/**
 * The interim (patch) updates merged since the last release, newest first,
 * laid out like ImpactIQ's What's new: one card per version, the newest
 * marked Current, its note under its Change Log heading (Security, New
 * Features, Improvements, Fixes). Titles are the merged PR titles, so they
 * stay in English; the surrounding text is translated.
 */
export function InterimUpdatesList({
  updates,
  release,
  isLoading,
  isError,
  variant = "card",
  collapseAfter,
}: InterimUpdatesListProps) {
  const { t } = useTranslation();
  const compact = variant === "compact";

  if (isLoading) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("about.versionUpdates.loading")}
      </p>
    );
  }
  if (isError) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-xs text-red-600 dark:text-red-400">
        <XCircle className="h-3 w-3" />
        {t("about.versionUpdates.loadFailed")}
      </p>
    );
  }
  if (!updates || updates.length === 0) {
    return (
      <p className="py-2 text-xs text-gray-500 dark:text-gray-400">
        {t("about.versionUpdates.empty", { release: release ?? "" })}
      </p>
    );
  }

  const openCount = collapseAfter !== undefined && collapseAfter >= 0 ? collapseAfter : updates.length;
  const featured = updates.slice(0, openCount);
  const earlier = updates.slice(openCount);

  return (
    <div className={cn(compact ? "max-h-80 overflow-y-auto pr-1" : "max-h-[32rem] overflow-y-auto pr-2")} data-testid="interim-updates-list">
      <ol className={cn(compact ? "space-y-2" : "space-y-2.5")}>
        {featured.map((u, i) => (
          <UpdateCard key={u.version} update={u} current={i === 0} compact={compact} />
        ))}
      </ol>
      {earlier.length > 0 && (
        <details className="mt-2 rounded border border-gray-200 dark:border-gray-800" data-testid="interim-updates-earlier">
          <summary className="cursor-pointer select-none px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60">
            {t("about.versionUpdates.earlierUpdates", { count: earlier.length })}
          </summary>
          <ol className="space-y-1.5 p-1.5">
            {earlier.map((u) => (
              <UpdateCard key={u.version} update={u} current={false} compact={compact} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export default InterimUpdatesList;
