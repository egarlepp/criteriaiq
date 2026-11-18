import { useTranslation } from "react-i18next";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { GuideRoleKey, GuideStatus } from "./guide-data";

// Only the icon carries the status color; the tile stays neutral (Eric,
// 2026-10-21). Colors are admin-set in Configuration → Field Settings; a very
// dark one (e.g. Evaluating Competitors' #374151) would vanish on the dark
// theme, so those icons switch to a light gray there.

function isVeryDark(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance < 0.08;
}

export function GuideStatusTiles({ statuses, columns = 3 }: { statuses: GuideStatus[]; columns?: 2 | 3 }) {
  return (
    <div className={columns === 3 ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
      {statuses.map((status) => (
        <div key={status.name} className="flex items-start gap-3 rounded-lg border bg-card p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 dark:bg-muted">
            <DynamicIcon
              name={status.icon}
              className={isVeryDark(status.color) ? "h-[18px] w-[18px] dark:!text-gray-300" : "h-[18px] w-[18px]"}
              style={{ color: status.color }}
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{status.name}</span>
            {status.description && (
              <span className="block text-xs leading-relaxed text-muted-foreground">{status.description}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function GuideAccountStatuses({
  role,
  statuses,
  onViewAll,
}: {
  role: GuideRoleKey;
  statuses: GuideStatus[];
  onViewAll: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4" aria-labelledby="guide-account-statuses-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="guide-account-statuses-title" className="text-base font-semibold text-foreground">{t(`guide.accountStatuses.roles.${role}.title`)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(`guide.accountStatuses.roles.${role}.description`)}</p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-semibold text-primary hover:underline"
          data-testid="guide-all-statuses"
        >
          {t("guide.accountStatuses.viewAll")}
        </button>
      </div>
      <GuideStatusTiles statuses={statuses} />
    </section>
  );
}
