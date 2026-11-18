// Compact source-of-truth pill rendered next to persisted-config inputs
// (Setup wizard + System Settings). Wording lives in
// `setup.envHelper.fieldBadge.*`.
import { useTranslation } from "react-i18next";
import {
  type EnvHelperSource,
  envSourceBadgeClass,
} from "@/lib/env-source-badges";

interface FieldSourceBadgeProps {
  source: EnvHelperSource;
  testId?: string;
}

export function FieldSourceBadge({ source, testId }: FieldSourceBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded font-medium ${envSourceBadgeClass(source)}`}
      data-testid={testId}
      data-source={source}
      role="status"
    >
      {t(`setup.envHelper.fieldBadge.${source}`)}
    </span>
  );
}
