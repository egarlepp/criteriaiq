import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { StatusBadge, type StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { CUSTOMER_STATUS_NEUTRAL_FALLBACK } from "@/lib/customerStatusUtils";
import { ProjectStatusGuide } from "./project-status-guide";

export interface CustomerStatusOption {
  id: number | string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

interface ProjectHeroStatusProps {
  customerStatusConfigs: CustomerStatusOption[];
  customerStatusValue: string;
  onCustomerStatusChange: (value: string) => void;
  canEdit: boolean;
  /** Internal Project Status. Pass `show: false` for Customer, Partner and Guest. */
  internalStatus: { show: boolean; config: StatusBadgeConfig | null; label: string | null };
  /** Sales stage, or null to hide it. */
  salesStage: string | null;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </div>
  );
}

/**
 * The status controls in the project header band: the Account Status picker
 * (with the status guide), plus the internal-only Internal Project Status and
 * sales stage, on the light ProjectHero surface.
 */
export function ProjectHeroStatus({
  customerStatusConfigs,
  customerStatusValue,
  onCustomerStatusChange,
  canEdit,
  internalStatus,
  salesStage,
}: ProjectHeroStatusProps) {
  const { t } = useTranslation();
  const current = customerStatusConfigs.find((c) => c.name === customerStatusValue) ?? null;

  const renderOption = (option: CustomerStatusOption | null, name: string) => {
    const iconName = option?.icon || CUSTOMER_STATUS_NEUTRAL_FALLBACK.icon;
    const color = option?.color || CUSTOMER_STATUS_NEUTRAL_FALLBACK.color;
    return (
      <div className="flex items-center gap-2">
        {iconName && <DynamicIcon name={iconName} className="h-4 w-4" style={{ color }} />}
        <span>{name}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="project-hero-status">
      <Labelled label={t("projects.customerStatus")}>
        <div className="flex items-center gap-1">
          {canEdit ? (
          <Select value={customerStatusValue} onValueChange={onCustomerStatusChange}>
            <SelectTrigger
              className="h-8 w-fit min-w-[180px] border-slate-200 bg-background text-foreground dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              aria-label={t("projects.customerStatus")}
            >
              {renderOption(current, customerStatusValue || t("common.notSet"))}
            </SelectTrigger>
            <SelectContent className="w-64">
              {customerStatusConfigs.map((config) => (
                <SelectItem key={config.id} value={config.name}>
                  {renderOption(config, config.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          ) : (
            // Viewers who cannot change it see the status, not a greyed-out picker.
            <StatusBadge
              config={current ? { name: current.name, color: current.color ?? null, icon: current.icon ?? null } : null}
              label={customerStatusValue || null}
              fallbackColor={CUSTOMER_STATUS_NEUTRAL_FALLBACK.color}
              size="lg"
              hideWhenEmpty={false}
              className="h-8"
            />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={t("projectView.hero.statusGuide")}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-h-[600px] w-[800px] max-w-[95vw] overflow-y-auto p-0" side="bottom" align="start">
              <ProjectStatusGuide />
            </PopoverContent>
          </Popover>
        </div>
      </Labelled>
      {internalStatus.show && (
        <Labelled label={t("projects.internalProjectStatus")}>
          <StatusBadge
            config={internalStatus.config}
            label={internalStatus.label}
            variant="solid"
            size="lg"
            hideWhenEmpty={false}
            className="h-8"
          />
        </Labelled>
      )}
      {salesStage && (
        <Labelled label={t("projectView.hero.salesStage")}>
          <span
            className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            data-testid="project-hero-sales-stage"
          >
            {salesStage}
          </span>
        </Labelled>
      )}
    </div>
  );
}
