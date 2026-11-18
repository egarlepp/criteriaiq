import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_TOPIC_ORDER, getTopic, topicDescriptionKey, type GuideRoleKey, type GuideTopicKey } from "./guide-data";

export function GuideTopicGrid({ role, onOpenTopic }: { role: GuideRoleKey; onOpenTopic: (topic: GuideTopicKey) => void }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3" aria-labelledby="guide-topics-title">
      <h2 id="guide-topics-title" className="text-base font-semibold text-foreground">{t("guide.topics.title")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {ROLE_TOPIC_ORDER[role].map((key) => {
          const topic = getTopic(key);
          const Icon = topic.icon;
          return (
            <button
              key={topic.key}
              type="button"
              onClick={() => onOpenTopic(topic.key)}
              className="group flex items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`guide-topic-${topic.urlKey}`}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", topic.tileClass)}>
                <Icon className={cn("h-[18px] w-[18px]", topic.iconClass)} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{t(`guide.topics.${topic.key}.title`)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(topicDescriptionKey(role, topic.key))}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
