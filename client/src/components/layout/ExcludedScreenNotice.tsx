/**
 * Task #723 — Inline notice for excluded screens.
 *
 * Drop this small badge near the top of any screen that is exempt from
 * demo isolation (System Settings, User Management, Audit, About,
 * Getting Started, Archive, the Demo Mode page itself). Stays hidden
 * unless demo is currently active — only operationally relevant when
 * the operator is in demo and might wonder why a screen is showing real
 * users / settings.
 */
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDemoStatus } from "@/hooks/useDemoStatus";

export function ExcludedScreenNotice() {
  const { t } = useTranslation();
  const { data } = useDemoStatus();
  if (!data?.active) return null;
  return (
    <div
      data-testid="excluded-screen-notice"
      className="inline-flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-100"
    >
      <ShieldAlert className="h-3.5 w-3.5" />
      {t("layout.excludedScreenNotice")}
    </div>
  );
}
