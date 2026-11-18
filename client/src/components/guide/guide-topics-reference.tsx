import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  GLOSSARY_GROUPS,
  PROJECT_FIELD_GROUPS,
  RESOURCES,
  WORKSPACE_CAPABILITIES,
  type GuideStatus,
} from "./guide-data";
import { GuideStatusTiles } from "./guide-status-tiles";
import { BulletList, SectionTitle } from "./guide-primitives";

// Drawer bodies for the reference-style topics. The drawer itself renders
// the title and description, so each body starts with its first section.

export function WorkspaceTopic() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionTitle>{t("guide.workspace.capabilitiesTitle")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {WORKSPACE_CAPABILITIES.map(({ key, icon: Icon }) => (
            <div key={key} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 dark:bg-blue-400/15">
                <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </span>
              <p className="text-sm text-foreground/90 pt-1">{t(`guide.workspace.capabilities.${key}`)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <SectionTitle>{t("guide.workspace.tipsTitle")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-foreground">{t("guide.workspace.monitoringTitle")}</h4>
            <BulletList items={["m1", "m2", "m3", "m4", "m5"].map((k) => t(`guide.workspace.monitoring.${k}`))} />
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-foreground">{t("guide.workspace.communicationTitle")}</h4>
            <BulletList items={["e1", "e2", "e3", "e4"].map((k) => t(`guide.workspace.communication.${k}`))} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectInfoTopic() {
  const { t } = useTranslation();
  const [expandAll, setExpandAll] = useState(false);
  const [openField, setOpenField] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
        <Checkbox checked={expandAll} onCheckedChange={(checked) => setExpandAll(checked === true)} />
        <span className="text-sm font-medium text-muted-foreground">{t("guide.projectInfo.expandAll")}</span>
      </label>
      {PROJECT_FIELD_GROUPS.map((group) => (
        <div key={group.key} className="space-y-2">
          <h3 className={cn("text-sm font-semibold", group.iconClass)}>{t(`guide.projectInfo.groups.${group.key}`)}</h3>
          <div className="divide-y rounded-lg border bg-card">
            {group.fields.map((field) => {
              const expanded = expandAll || openField === field;
              return (
                <div key={field}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenField(openField === field ? null : field)}
                    className="w-full px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <span className="block text-sm font-medium text-foreground">{t(`guide.projectInfo.fields.${field}.name`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`guide.projectInfo.fields.${field}.short`)}</span>
                  </button>
                  {expanded && (
                    <div className="space-y-2 px-4 pb-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("guide.projectInfo.descriptionLabel")}</p>
                        <p className="text-sm text-foreground/90 leading-relaxed">{t(`guide.projectInfo.fields.${field}.long`)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("guide.projectInfo.exampleLabel")}</p>
                        <p className="text-sm italic text-muted-foreground">{t(`guide.projectInfo.fields.${field}.example`)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusesTopic({ accountStatuses, projectStatuses }: { accountStatuses: GuideStatus[]; projectStatuses: GuideStatus[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <SectionTitle>{t("guide.statuses.accountTitle")}</SectionTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("guide.statuses.accountDescription")}</p>
        </div>
        <GuideStatusTiles statuses={accountStatuses} columns={2} />
      </div>
      <div className="space-y-3">
        <div>
          <SectionTitle>{t("guide.statuses.projectTitle")}</SectionTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("guide.statuses.projectDescription")}</p>
        </div>
        <GuideStatusTiles statuses={projectStatuses} columns={2} />
      </div>
    </div>
  );
}

export function ResourcesTopic() {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {RESOURCES.map(({ key, url, icon: Icon, iconClass }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className={cn("h-[18px] w-[18px]", iconClass)} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-medium text-foreground group-hover:underline">
              {t(`guide.resources.items.${key}.title`)}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("guide.resources.opensInNewTab")} />
            </span>
            <span className="block text-xs text-muted-foreground">{t(`guide.resources.items.${key}.description`)}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

export function GlossaryTopic() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {GLOSSARY_GROUPS.map(({ key, icon: Icon, iconClass, terms }) => (
        <div key={key} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", iconClass)} aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">{t(`guide.glossary.groups.${key}.title`)}</h3>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("guide.glossary.termCount", { count: terms.length })}
            </span>
          </div>
          <dl className="space-y-2.5">
            {terms.map((term) => (
              <div key={term}>
                <dt className="text-sm font-medium text-foreground">{t(`guide.glossary.groups.${key}.terms.${term}.term`)}</dt>
                <dd className="text-sm text-muted-foreground">{t(`guide.glossary.groups.${key}.terms.${term}.definition`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
