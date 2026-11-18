import { Package } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";

/** Where an uploaded solution graphic is served from. */
export function solutionGraphicUrl(graphic: string): string {
  return graphic.startsWith("/") || /^https?:\/\//.test(graphic)
    ? graphic
    : `/api/files/system/solution-icons/${encodeURIComponent(graphic)}`;
}

/** True when a solution has a graphic or an icon to show. */
export function hasSolutionMark(graphic?: string | null, icon?: string | null): boolean {
  return Boolean((graphic && graphic !== "none") || icon);
}

interface SolutionGraphicProps {
  /** The uploaded graphic's filename (products.solutionIcon). */
  graphic?: string | null;
  /** A lucide icon name (products.solutionIconName). */
  icon?: string | null;
  /** The solution's name, used as the graphic's alt text. */
  name?: string;
  /** Size and color classes, such as "w-4 h-4". */
  className?: string;
  /** Show a package icon when the solution has neither. */
  fallback?: boolean;
}

/**
 * A solution's picture: its uploaded graphic when it has one, otherwise its
 * icon, otherwise (with `fallback`) a package icon. A graphic always wins.
 */
export function SolutionGraphic({ graphic, icon, name = "", className = "w-4 h-4", fallback = false }: SolutionGraphicProps) {
  if (graphic && graphic !== "none") {
    return <img src={solutionGraphicUrl(graphic)} alt={name} className={cn("object-contain shrink-0", className)} />;
  }
  if (icon) {
    return <DynamicIcon name={icon} fallback={Package} aria-hidden="true" className={cn("shrink-0 text-primary dark:text-primary", className)} />;
  }
  return fallback ? <Package aria-hidden="true" className={cn("shrink-0 text-muted-foreground", className)} /> : null;
}
