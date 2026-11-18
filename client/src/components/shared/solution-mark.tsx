/**
 * SolutionMark — a solution's picture plus its short name, with the full
 * name on hover. The picture follows one rule everywhere:
 *
 *   1. the uploaded graphic (products.solutionIcon, a file under
 *      /api/files/system/solution-icons/) always wins;
 *   2. else the chosen Lucide icon (`icon`, an icon name);
 *   3. else a generic package icon.
 *
 * The short name is products.abbreviation; when a solution has none, the
 * initials of its name stand in (e.g. "Identity Governance" → "IG").
 */

import { Package } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { solutionGraphicUrl } from "@/components/ui/solution-graphic";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SolutionMarkProps {
  /** Full solution name; shown on hover and used as the accessible name. */
  name: string;
  /** products.abbreviation. Blank falls back to the name's initials. */
  abbreviation?: string | null;
  /** Uploaded graphic filename (products.solutionIcon). */
  graphic?: string | null;
  /** Lucide icon name, used when there is no graphic. */
  icon?: string | null;
  className?: string;
}

const TOOLTIP_CLASS =
  "bg-white dark:bg-gray-800 text-black dark:text-white text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md";

/** Short label for a solution: its abbreviation, else up to 4 initials. */
export function solutionShortName(name: string, abbreviation?: string | null): string {
  const abbr = (abbreviation ?? "").trim();
  if (abbr) return abbr;
  const words = name.split(/[\s\-_/]+/).filter((w) => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function SolutionPicture({
  name,
  graphic,
  icon,
  className,
}: Pick<SolutionMarkProps, "name" | "graphic" | "icon" | "className">) {
  if (graphic && graphic !== "none") {
    return (
      <img
        src={solutionGraphicUrl(graphic)}
        alt=""
        aria-hidden
        className={cn("h-4 w-4 shrink-0 object-contain", className)}
        data-solution-graphic={name}
      />
    );
  }
  if (icon) {
    return <DynamicIcon name={icon} fallback={Package} aria-hidden className={cn("h-4 w-4 shrink-0", className)} />;
  }
  return <Package aria-hidden className={cn("h-4 w-4 shrink-0", className)} />;
}

export function SolutionMark({ name, abbreviation, graphic, icon, className }: SolutionMarkProps) {
  const shortName = solutionShortName(name, abbreviation);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={name}
          className={cn(
            "inline-flex max-w-[9rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold cursor-default",
            "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
            className,
          )}
        >
          <SolutionPicture name={name} graphic={graphic} icon={icon} />
          <span className="truncate">{shortName}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className={TOOLTIP_CLASS}>
        {name}
      </TooltipContent>
    </Tooltip>
  );
}
