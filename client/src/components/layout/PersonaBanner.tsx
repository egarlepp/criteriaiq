import { Eye, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePersona } from "@/contexts/PersonaContext";
import { showErrorToast } from "@/lib/toast-helper";

// Shown while an Admin uses View As: who they are viewing as, that it is
// read only, and who is really signed in.
export function PersonaBanner() {
  const { t } = useTranslation();
  const { isActive, personaLabel, realUser, exitPersona } = usePersona();

  if (!isActive) return null;

  const realName = realUser ? [realUser.firstName, realUser.lastName].filter(Boolean).join(" ") || realUser.email || "" : "";

  const handleExit = () => {
    exitPersona().catch(() => showErrorToast("devPersona.switchFailed", "devPersona.switchFailedDescription"));
  };

  return (
    <div className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 flex items-center justify-between z-50 shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium truncate">
          {t("layout.personaBanner.label")} <strong>{personaLabel}</strong>
          {" — "}
          <span className="font-normal opacity-90">{t("layout.personaBanner.viewOnly")}</span>
          {realName && (
            <span className="font-normal opacity-90">
              {" · "}
              {t("layout.personaBanner.signedInAs", { name: realName })}
            </span>
          )}
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors shrink-0 ml-4"
      >
        <X className="h-3.5 w-3.5" />
        {t("layout.personaBanner.exit")}
      </button>
    </div>
  );
}
