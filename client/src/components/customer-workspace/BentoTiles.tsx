import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type BentoTone = "brand" | "warn" | "plain";

const TONE_CLASS: Record<BentoTone, string> = {
  brand: "bg-primary text-primary-foreground",
  warn: "bg-orange-50 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100",
  plain: "bg-card text-card-foreground dark:bg-slate-900 dark:text-slate-100",
};

/** The faded icon behind a tile's value. */
const WATERMARK_CLASS: Record<BentoTone, string> = {
  brand: "text-primary-foreground/15",
  warn: "text-orange-700/10 dark:text-orange-300/10",
  plain: "text-slate-500/10 dark:text-slate-400/10",
};

const ICON_CLASS: Record<BentoTone, string> = {
  brand: "text-primary-foreground",
  warn: "text-orange-700 dark:text-orange-300",
  plain: "text-primary",
};

const LABEL_CLASS: Record<BentoTone, string> = {
  brand: "text-primary-foreground/80",
  warn: "text-orange-800 dark:text-orange-300",
  plain: "text-slate-600 dark:text-slate-400",
};

interface BentoCardProps {
  /** Card heading; omit for a tile that draws its own. */
  title?: ReactNode;
  /** Right side of the heading row (a link or a count). */
  action?: ReactNode;
  tone?: BentoTone;
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}

/** A rounded workspace card (the bento grid on the project page and Account Portal). */
export function BentoCard({ title, action, tone = "plain", className, children, ...rest }: BentoCardProps) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800", TONE_CLASS[tone], className)}
      data-testid={rest["data-testid"]}
    >
      {title || action ? (
        <div className="flex items-baseline justify-between gap-3">
          {title ? <h2 className="text-base font-bold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

interface BentoStatProps {
  label: string;
  /** Shown beside the label and, large and faded, behind the value. */
  icon?: LucideIcon;
  value: ReactNode;
  /** Small text after the value ("days", "of 5"). */
  unit?: string;
  /** Line under the value. */
  hint?: ReactNode;
  /** Colors the hint red, for overdue counts. */
  hintAlert?: boolean;
  tone?: BentoTone;
  /** 0–100: draws a bar under the value. */
  progress?: number | null;
  loading?: boolean;
  className?: string;
  /** Size override for a value that is text, not a number (a date). */
  valueClassName?: string;
  /** Drawn under the value (a segmented bar). */
  footer?: ReactNode;
  /** Makes the whole tile a button; `actionLabel` names what it opens. */
  onClick?: () => void;
  actionLabel?: string;
  "data-testid"?: string;
}

/** One number tile: label, big value, hint, optional bar. */
export function BentoStat({
  label,
  icon: Icon,
  value,
  unit,
  hint,
  hintAlert,
  tone = "plain",
  progress,
  loading,
  className,
  valueClassName,
  footer,
  onClick,
  actionLabel,
  ...rest
}: BentoStatProps) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <BentoCard
      tone={tone}
      className={cn("relative overflow-hidden", onClick && "transition-colors hover:border-primary/60 dark:hover:border-primary/60", className)}
      data-testid={rest["data-testid"]}
    >
      {Icon ? (
        <Icon
          className={cn("pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 -rotate-12", WATERMARK_CLASS[tone])}
          aria-hidden="true"
          strokeWidth={1.5}
        />
      ) : null}
      <p className={cn("relative flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", LABEL_CLASS[tone])}>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", ICON_CLASS[tone])} aria-hidden="true" /> : null}
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <p className={cn("relative flex flex-wrap items-baseline gap-x-2 text-4xl font-bold leading-none tracking-tight tabular-nums", valueClassName)}>
          {value}
          {unit ? <span className={cn("text-base font-semibold tracking-normal", LABEL_CLASS[tone])}>{unit}</span> : null}
        </p>
      )}
      {pct != null ? (
        <div
          className={cn("relative h-2.5 overflow-hidden rounded-full", tone === "brand" ? "bg-primary-foreground/25" : "bg-slate-200 dark:bg-slate-700")}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <div className={cn("h-full rounded-full", tone === "brand" ? "bg-primary-foreground" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {hint ? (
        <p
          className={cn(
            "relative text-sm",
            hintAlert ? "font-semibold text-red-700 dark:text-red-400" : LABEL_CLASS[tone],
          )}
        >
          {hint}
        </p>
      ) : null}
      {footer ? <div className="relative">{footer}</div> : null}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={actionLabel ? `${label}: ${actionLabel}` : label}
          title={actionLabel}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          data-testid={rest["data-testid"] ? `${rest["data-testid"]}-open` : undefined}
        />
      ) : null}
    </BentoCard>
  );
}
