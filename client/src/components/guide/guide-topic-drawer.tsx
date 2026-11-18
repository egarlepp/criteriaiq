import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getTopic, type GuideStatus, type GuideTopicKey } from "./guide-data";
import { GlossaryTopic, ProjectInfoTopic, ResourcesTopic, StatusesTopic, WorkspaceTopic } from "./guide-topics-reference";
import { HelpTopic, InterfaceTopic, MapTopic } from "./guide-topics-howto";

interface GuideTopicDrawerProps {
  topic: GuideTopicKey | null;
  onClose: () => void;
  accountStatuses: GuideStatus[];
  projectStatuses: GuideStatus[];
  supportEmail: string | null | undefined;
  onSubmitRequest: () => void;
}

export function GuideTopicDrawer({ topic, onClose, accountStatuses, projectStatuses, supportEmail, onSubmitRequest }: GuideTopicDrawerProps) {
  const { t } = useTranslation();
  const meta = topic ? getTopic(topic) : null;
  const Icon = meta?.icon;

  return (
    <Sheet open={topic !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="guide-topic-drawer">
        {meta && Icon && (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", meta.tileClass)}>
                  <Icon className={cn("h-4 w-4", meta.iconClass)} aria-hidden="true" />
                </span>
                {t(`guide.topics.${meta.key}.title`)}
              </SheetTitle>
              <SheetDescription>{t(`guide.topics.${meta.key}.description`)}</SheetDescription>
            </SheetHeader>
            {meta.key === "workspace" && <WorkspaceTopic />}
            {meta.key === "projectInfo" && <ProjectInfoTopic />}
            {meta.key === "statuses" && <StatusesTopic accountStatuses={accountStatuses} projectStatuses={projectStatuses} />}
            {meta.key === "interface" && <InterfaceTopic />}
            {meta.key === "map" && <MapTopic />}
            {meta.key === "resources" && <ResourcesTopic />}
            {meta.key === "glossary" && <GlossaryTopic />}
            {meta.key === "help" && <HelpTopic supportEmail={supportEmail} onSubmitRequest={onSubmitRequest} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
