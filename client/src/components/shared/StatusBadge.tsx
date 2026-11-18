import * as React from "react";
import { useTranslation } from "react-i18next";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";

/**
 * StatusBadge — the canonical "render a Field-Settings-configured status as a
 * colored pill" component.
 *
 * Why this exists: prior to this, the pattern was hand-rolled inline in at
 * least four files (the Account Portal table, the Account Portal card, the
 * main dashboard table, and the dashboard project card rail). Each variant
 * picked its own pill markup, icon size, dark-mode treatment, and Tailwind
 * arbitrary-value syntax. That's exactly how the Tailwind 4 regression that
 * silently dropped `bg-[--var]` shorthand slipped past — one fix didn't
 * propagate. From now on, anything that turns a `/api/status-configs` or
 * `/api/customer-status-configs` row into a UI pill goes through this
 * component.
 *
 * Inputs map directly to the admin UI:
 *   - `config` = the resolved row from one of those two endpoints
 *     ({ name, color, icon? }). Both endpoints are admin-edited at
 *     Configuration → Field Settings → Internal Project Status / Account
 *     Status, so colors here ARE the colors operators see in that page.
 *   - `label` = optional display override (when the project stores a raw
 *     status string that doesn't match a config row, e.g. legacy data).
 *   - `variant`/`size` = visual presets. Add new presets here rather than
 *     forking the markup into a new call site.
 *
 * Every pill leads with an icon: the config's own, else a dot, else (no
 * status at all) a dashed circle.
 */

export interface StatusBadgeConfig {
  /** Display name as edited in Field Settings. */
  name?: string | null;
  /** Hex color (`#RRGGBB`). */
  color?: string | null;
  /** Lucide icon name (used by DynamicIcon). */
  icon?: string | null;
}

export type StatusBadgeVariant = "solid" | "darkRail";
export type StatusBadgeSize = "sm" | "md" | "lg";

export interface StatusBadgeProps {
  /** Resolved Field-Settings row. Pass null/undefined when the project has
   *  no matching config — the badge will fall back to `fallbackColor` and
   *  `label`/`config.name`/"Not set" in that order. */
  config?: StatusBadgeConfig | null;
  /** Override the displayed text. When omitted, uses `config.name`, then
   *  falls back to "Not set". */
  label?: string | null;
  /** Visual preset. `solid` (default) = colored bg + white text, the right
   *  choice for table cells and card surfaces with a light background.
   *  `darkRail` = status tint over a dark base + colored border + white
   *  text, for a gradient header whose colors come from the theme (e.g. the
   *  DashboardProjectCard rail); readable on light and dark gradients. */
  variant?: StatusBadgeVariant;
  /** Pill size. Defaults to `md`. */
  size?: StatusBadgeSize;
  /** Fallback hex color when `config.color` is absent. Defaults to gray. */
  fallbackColor?: string;
  /** When true (default), renders nothing if there's neither a config nor a
   *  label. Set false to render a muted "Not set" pill instead. */
  hideWhenEmpty?: boolean;
  /** Optional className passthrough (applied after presets). */
  className?: string;
  /** Optional title attribute (defaults to the resolved label). */
  title?: string;
  /** Round, button-sized pill showing only the status icon on the status
   *  color. The label becomes the accessible name; pair it with a Tooltip
   *  for sighted users (the native title is left off so the two don't
   *  stack). Used by the Manage Projects table. */
  iconOnly?: boolean;
}

const SIZE_CLASSES: Record<StatusBadgeSize, { pill: string; icon: string; round: string; roundIcon: string }> = {
  sm: { pill: "px-2 py-0.5 text-[10px] gap-1", icon: "h-3 w-3", round: "h-6 w-6", roundIcon: "h-3.5 w-3.5" },
  md: { pill: "px-2.5 py-0.5 text-xs gap-1.5", icon: "h-3 w-3", round: "h-7 w-7", roundIcon: "h-4 w-4" },
  lg: { pill: "px-2.5 py-1 text-xs gap-1.5", icon: "h-3 w-3", round: "h-8 w-8", roundIcon: "h-4 w-4" },
};

/** Blend a hex color toward Tailwind gray-800 so the pill stays readable
 *  in dark mode (white text on a darkened-but-still-tinted background).
 *  Mirrors the helper that used to live inline in customer-dashboard. */
function getDarkerBg(hex: string): string {
  const clean = (hex || "").replace("#", "");
  if (clean.length !== 6) return "rgb(31, 41, 55)";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // 90% gray-800 + 10% color — same recipe used everywhere else.
  const dr = Math.round(r * 0.1 + 31 * 0.9);
  const dg = Math.round(g * 0.1 + 41 * 0.9);
  const db = Math.round(b * 0.1 + 55 * 0.9);
  return `rgb(${dr}, ${dg}, ${db})`;
}

/** Blend a hex color into an rgba with the given alpha — used by the
 *  darkRail variant to derive both the translucent bg and the border. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || "").replace("#", "");
  if (clean.length !== 6) return `rgba(100, 116, 139, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function StatusBadge({
  config,
  label,
  variant = "solid",
  size = "md",
  fallbackColor = "#6b7280",
  hideWhenEmpty = true,
  className,
  title,
  iconOnly = false,
}: StatusBadgeProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? config?.name ?? null;
  if (hideWhenEmpty && !resolvedLabel) return null;
  const displayLabel = resolvedLabel ?? t("common.notSet");
  const iconName = config?.icon || (resolvedLabel ? "CircleDot" : "CircleDashed");

  const baseColor = config?.color || fallbackColor;
  const sz = SIZE_CLASSES[size];

  const commonClasses = cn(
    "inline-flex items-center rounded-full font-semibold w-fit whitespace-nowrap",
    iconOnly ? cn("justify-center shrink-0", sz.round) : sz.pill,
    className,
  );
  const iconClass = iconOnly ? sz.roundIcon : sz.icon;
  const titleAttr = iconOnly ? title : (title ?? displayLabel);

  if (variant === "darkRail") {
    // Status tint over a dark slate base + colored border + white text.
    // The dark base keeps white text readable even where an Appearance
    // theme makes the header gradient light; on the default dark header it
    // looks the same as a plain translucent tint. Dark mode uses the same
    // recipe — no swap needed.
    return (
      <span
        className={cn(commonClasses, "cursor-default text-white")}
        style={{
          background: `linear-gradient(${hexToRgba(baseColor, 0.35)}, ${hexToRgba(baseColor, 0.35)}), rgba(15, 23, 42, 0.72)`,
          border: `1px solid ${hexToRgba(baseColor, 0.6)}`,
        }}
        title={titleAttr}
        role={iconOnly ? "img" : undefined}
        aria-label={iconOnly ? displayLabel : undefined}
      >
        <DynamicIcon name={iconName} className={iconClass} aria-hidden={iconOnly || undefined} />
        {!iconOnly && displayLabel}
      </span>
    );
  }

  // Solid variant: light mode = raw color bg + white text; dark mode =
  // gray-800-blended bg + colored text (keeps the status identity readable
  // against a dark surface without a saturated block).
  return (
    <span
      className={cn(
        commonClasses,
        "bg-[var(--status-light-bg)] text-[var(--status-light-text)]",
        "dark:bg-[var(--status-dark-bg)] dark:text-[var(--status-dark-text)]",
      )}
      style={
        {
          "--status-light-bg": baseColor,
          "--status-light-text": "#FFFFFF",
          // A round icon-only pill keeps the full status color in dark mode:
          // a lone icon on the blended background is too faint to read.
          "--status-dark-bg": iconOnly ? baseColor : getDarkerBg(baseColor),
          "--status-dark-text": iconOnly ? "#FFFFFF" : baseColor,
        } as React.CSSProperties
      }
      title={titleAttr}
      role={iconOnly ? "img" : undefined}
      aria-label={iconOnly ? displayLabel : undefined}
    >
      <DynamicIcon name={iconName} className={iconClass} aria-hidden={iconOnly || undefined} />
      {!iconOnly && displayLabel}
    </span>
  );
}
