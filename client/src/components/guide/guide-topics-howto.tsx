import { useTranslation } from "react-i18next";
import { Boxes, ClipboardPenLine, ListChecks, Mail, MessageSquarePlus, PackageCheck, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAP_STATUSES } from "./guide-data";
import { BulletList, SectionTitle } from "./guide-primitives";

// Drawer bodies for the how-to topics (Interface, MAP, Get help).

function LabelledLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span> {value}
    </p>
  );
}

function LabelledCards({ items }: { items: { label: string; description: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground">{item.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function InterfaceTopic() {
  const { t } = useTranslation();
  const keyed = (prefix: string, keys: string[]) => keys.map((k) => t(`${prefix}.${k}`));
  const labelled = (prefix: string, keys: string[]) =>
    keys.map((k) => ({ label: t(`${prefix}.${k}.label`), description: t(`${prefix}.${k}.description`) }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle>{t("guide.interface.portal.title")}</SectionTitle>
        <LabelledLine label={t("guide.interface.portal.whereLabel")} value={t("guide.interface.portal.where")} />
        <LabelledLine label={t("guide.interface.portal.whoLabel")} value={t("guide.interface.portal.who")} />
        <p className="text-sm font-medium text-foreground">{t("guide.interface.portal.firstTitle")}</p>
        <BulletList items={keyed("guide.interface.portal.first", ["f1", "f2", "f3", "f4", "f5"])} />
        <p className="text-sm font-medium text-foreground pt-1">{t("guide.interface.portal.layoutTitle")}</p>
        <LabelledCards items={labelled("guide.interface.portal.layout", ["l1", "l2", "l3", "l4"])} />
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.interface.filters.title")}</SectionTitle>
        <LabelledLine label={t("guide.interface.filters.searchLabel")} value={t("guide.interface.filters.search")} />
        <LabelledLine label={t("guide.interface.filters.solutionsLabel")} value={t("guide.interface.filters.solutions")} />
        <LabelledLine label={t("guide.interface.filters.statusLabel")} value={t("guide.interface.filters.status")} />
        <p className="text-xs text-muted-foreground">{t("guide.interface.filters.note")}</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.interface.detail.title")}</SectionTitle>
        <LabelledLine label={t("guide.interface.detail.openLabel")} value={t("guide.interface.detail.open")} />
        <LabelledCards items={labelled("guide.interface.detail.sections", ["s1", "s2", "s3", "s4", "s5"])} />
        <p className="text-xs text-muted-foreground">{t("guide.interface.detail.note")}</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.interface.capabilities.title")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-green-700 dark:text-green-400">{t("guide.interface.capabilities.viewTitle")}</h4>
            <BulletList items={keyed("guide.interface.capabilities.view", ["v1", "v2", "v3", "v4", "v5"])} />
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">{t("guide.interface.capabilities.downloadTitle")}</h4>
            <BulletList items={keyed("guide.interface.capabilities.download", ["d1", "d2", "d3", "d4"])} />
          </div>
        </div>
      </section>
    </div>
  );
}

export function MapTopic() {
  const { t } = useTranslation();
  const plans = [
    { key: "quickPlan", icon: ListChecks, iconClass: "text-green-600 dark:text-green-400", tileClass: "bg-green-500/10 dark:bg-green-400/15" },
    { key: "mapPlan", icon: Waypoints, iconClass: "text-blue-600 dark:text-blue-400", tileClass: "bg-blue-500/10 dark:bg-blue-400/15" },
  ];
  const structure = [
    { key: "phases", icon: ClipboardPenLine, iconClass: "text-purple-600 dark:text-purple-400" },
    { key: "steps", icon: Boxes, iconClass: "text-blue-600 dark:text-blue-400" },
    { key: "tasks", icon: PackageCheck, iconClass: "text-green-600 dark:text-green-400" },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <SectionTitle>{t("guide.map.whatTitle")}</SectionTitle>
        <p className="text-sm text-muted-foreground leading-relaxed">{t("guide.map.what")}</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.map.vsTitle")}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t("guide.map.vsIntro")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map(({ key, icon: Icon, iconClass, tileClass }) => (
            <div key={key} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", tileClass)}>
                  <Icon className={cn("h-4 w-4", iconClass)} aria-hidden="true" />
                </span>
                <h4 className="text-sm font-semibold text-foreground">{t(`guide.map.${key}.title`)}</h4>
              </div>
              <p className="text-sm text-muted-foreground">{t(`guide.map.${key}.description`)}</p>
              <p className="text-xs font-medium text-foreground">{t("guide.map.bestWhen")}</p>
              <BulletList items={["w1", "w2", "w3", "w4"].map((k) => t(`guide.map.${key}.${k}`))} />
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-foreground">{t("guide.map.decisionTitle")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("guide.map.decision")}</p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.map.structureTitle")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {structure.map(({ key, icon: Icon, iconClass }) => (
            <div key={key} className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", iconClass)} aria-hidden="true" />
                <h4 className="text-sm font-semibold text-foreground">{t(`guide.map.${key}.title`)}</h4>
              </div>
              <p className="text-xs text-muted-foreground">{t(`guide.map.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.map.howTitle")}</SectionTitle>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {["h1", "h2", "h3", "h4"].map((key, index) => (
            <li key={key} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-primary/20">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{t(`guide.map.how.${key}.title`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`guide.map.how.${key}.description`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("guide.map.practicesTitle")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-green-700 dark:text-green-400">{t("guide.map.informedTitle")}</h4>
            <BulletList items={["i1", "i2", "i3", "i4"].map((k) => t(`guide.map.informed.${k}`))} />
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">{t("guide.map.communicateTitle")}</h4>
            <BulletList items={["c1", "c2", "c3", "c4"].map((k) => t(`guide.map.communicate.${k}`))} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <SectionTitle>{t("guide.map.statusTitle")}</SectionTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("guide.map.statusIntro")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MAP_STATUSES.map(({ key, icon: Icon, iconClass }) => (
            <div key={key} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <Icon className={cn("h-[18px] w-[18px] shrink-0 mt-0.5", iconClass)} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-foreground">{t(`guide.map.status.${key}.label`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`guide.map.status.${key}.description`)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function HelpTopic({ supportEmail, onSubmitRequest }: { supportEmail: string | null | undefined; onSubmitRequest: () => void }) {
  const { t } = useTranslation();
  const mailto = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(t("guide.help.emailSubject"))}`
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">{t("guide.help.intro")}</p>
      <div className="grid gap-3">
        {mailto && (
          <a
            href={mailto}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <Mail className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-foreground">{t("guide.help.emailTitle")}</span>
              <span className="block text-xs text-muted-foreground">{t("guide.help.emailDescription")}</span>
            </span>
          </a>
        )}
        <button
          type="button"
          onClick={onSubmitRequest}
          className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
          data-testid="guide-submit-request"
        >
          <MessageSquarePlus className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
          <span>
            <span className="block text-sm font-medium text-foreground">{t("guide.help.requestTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("guide.help.requestDescription")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
