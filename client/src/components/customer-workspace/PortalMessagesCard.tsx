import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessagesSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectMessageUnread, ProjectMessageView } from "@shared/project-messages";
import { BentoCard } from "./BentoTiles";
import { ProjectPills, type PillProject } from "./ProjectPills";
import { MESSAGES_REFRESH_MS, MessageBubble, ProjectMessageThread, useMessageTimeFormat } from "./ProjectMessageThread";
import { ACCOUNT_MESSAGES_KEY } from "./use-workspace-mutations";

export type PortalMessageProject = PillProject;

/** Fetches a cross-project message read (`path` under /api/project-messages) for the listed projects. */
async function fetchAccountMessages<T>(path: string, projectIds: number[]): Promise<T> {
  const response = await fetch(`/api/project-messages${path}?projectIds=${projectIds.join(",")}`, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch messages");
  return response.json();
}

/** Unread message counts for the listed projects that have messages, keyed by project id; refreshed every 30 seconds. */
export function useProjectMessageUnread(projectIds: number[]): Map<number, number> {
  const { data = [] } = useQuery<ProjectMessageUnread[]>({
    queryKey: [ACCOUNT_MESSAGES_KEY, "unread", projectIds.join(",")],
    queryFn: () => fetchAccountMessages<ProjectMessageUnread[]>("/unread", projectIds),
    enabled: projectIds.length > 0,
    refetchInterval: MESSAGES_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  return new Map(data.map((row) => [row.projectId, row.unread]));
}

interface PortalMessagesCardProps {
  projects: PortalMessageProject[];
  /** Unread counts by project; a project is listed only once it has messages. */
  unread: Map<number, number>;
  /** The project whose conversation is open; null shows the latest from all projects. */
  selectedProjectId: number | null;
  onSelect(projectId: number | null): void;
  isExternalViewer: boolean;
  accountName: string;
  timezone: string;
}

/**
 * Account Portal messages in the side panel. "All" lists the latest
 * messages from every project, each tagged with its project; a project pill
 * (with its unread count) opens that project's conversation and a reply
 * box. Only projects with messages get a pill. The list scrolls inside a
 * fixed height.
 */
export function PortalMessagesCard({
  projects,
  unread,
  selectedProjectId,
  onSelect,
  isExternalViewer,
  accountName,
  timezone,
}: PortalMessagesCardProps) {
  const { t } = useTranslation();
  const projectIds = projects.map((project) => project.id);
  const names = new Map(projects.map((project) => [project.id, project.label]));
  const selected = selectedProjectId !== null && names.has(selectedProjectId) ? selectedProjectId : null;
  // A pill per project that has messages (the unread counts list only those),
  // plus the open one, which a project card's chat button can open before its
  // first message. Without any, only the All feed shows, with no pills.
  const pillProjects = projects.filter((project) => unread.has(project.id) || project.id === selected);
  const totalUnread = projectIds.reduce((sum, id) => sum + (unread.get(id) ?? 0), 0);
  const timeFormat = useMessageTimeFormat(timezone);
  const listRef = useRef<HTMLOListElement>(null);

  const { data: latest = [], isLoading } = useQuery<ProjectMessageView[]>({
    queryKey: [ACCOUNT_MESSAGES_KEY, "recent", projectIds.join(",")],
    queryFn: () => fetchAccountMessages<ProjectMessageView[]>("", projectIds),
    enabled: projectIds.length > 0 && selected === null,
    refetchInterval: MESSAGES_REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const lastId = latest.length > 0 ? latest[latest.length - 1].id : null;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastId, selected]);

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("workspace.messages.title")}
        </span>
      }
      action={
        totalUnread > 0 ? (
          <span className="text-xs font-semibold text-primary" data-testid="portal-messages-unread">
            {t("workspace.portalMessages.unread", { count: totalUnread })}
          </span>
        ) : null
      }
      data-testid="portal-messages"
    >
      <div id="portal-messages" className="flex flex-col gap-3 scroll-mt-24">
        {pillProjects.length > 0 ? (
          <ProjectPills
            projects={pillProjects}
            selected={selected}
            onSelect={onSelect}
            counts={unread}
            label={t("workspace.portalMessages.filter")}
            countLabel={(name, count) => t("workspace.portalMessages.pillUnread", { name, count })}
            testIdPrefix="portal-messages-pill"
          />
        ) : null}

        {selected !== null ? (
          <ProjectMessageThread
            key={selected}
            projectId={selected}
            isExternalViewer={isExternalViewer}
            accountName={accountName}
            timezone={timezone}
            listClassName="max-h-[320px]"
          />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="ml-8 h-12" />
          </div>
        ) : latest.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="portal-messages-empty">
            {t("workspace.portalMessages.empty")}
          </p>
        ) : (
          <>
            <ol ref={listRef} className="flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-1" aria-live="polite" data-testid="portal-messages-latest">
              {latest.map((message) => (
                <li key={message.id}>
                  <MessageBubble
                    message={message}
                    isExternalViewer={isExternalViewer}
                    accountName={accountName}
                    timeFormat={timeFormat}
                    tag={
                      <button
                        type="button"
                        onClick={() => onSelect(message.projectId)}
                        className="max-w-[140px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        title={t("workspace.portalMessages.openProject", { name: names.get(message.projectId) ?? "" })}
                      >
                        {names.get(message.projectId) ?? t("projectView.hero.untitled", { id: message.projectId })}
                      </button>
                    }
                  />
                </li>
              ))}
            </ol>
            <p className="border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {t("workspace.portalMessages.pickToReply")}
            </p>
          </>
        )}
      </div>
    </BentoCard>
  );
}
