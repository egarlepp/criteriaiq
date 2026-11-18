import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PROJECT_MESSAGE_MAX_LENGTH, type ProjectMessageView } from "@shared/project-messages";
import {
  projectMessagesKey,
  useDeleteProjectMessage,
  useMarkProjectMessagesRead,
  usePostProjectMessage,
} from "./use-workspace-mutations";

export const MESSAGES_REFRESH_MS = 30_000;

/** "Mar 4, 2:15 PM" in the viewer's language and time zone. */
export function useMessageTimeFormat(timezone: string): Intl.DateTimeFormat {
  const { i18n } = useTranslation();
  return new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

interface MessageBubbleProps {
  message: ProjectMessageView;
  isExternalViewer: boolean;
  accountName?: string | null;
  timeFormat: Intl.DateTimeFormat;
  /** A tag before the author line, e.g. the project's name on the portal. */
  tag?: ReactNode;
  /** Shown beside the bubble when the viewer may delete it. */
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

/** One message: author, side and time over a chat bubble. The viewer's own side sits on the right. */
export function MessageBubble({ message, isExternalViewer, accountName, timeFormat, tag, onDelete, deleteDisabled }: MessageBubbleProps) {
  const { t } = useTranslation();
  const ownSide = message.authorIsExternal === isExternalViewer;
  const sideLabel = message.authorIsExternal ? accountName || t("workspace.messages.customerSide") : t("workspace.messages.teamSide");
  const deleteButton =
    onDelete && message.canDelete ? (
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="mt-1.5 rounded-md p-1 text-slate-500 opacity-0 transition-opacity hover:text-red-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 dark:text-slate-400 dark:hover:text-red-400"
        aria-label={t("workspace.messages.delete")}
        title={t("workspace.messages.delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    ) : null;

  return (
    <div className={cn("group flex flex-col gap-1", ownSide ? "items-end" : "items-start")}>
      <span className={cn("flex max-w-full flex-wrap items-center gap-x-1.5 text-[11px] text-slate-600 dark:text-slate-400", ownSide && "justify-end")}>
        {tag}
        <span className="font-semibold text-slate-800 dark:text-slate-200">{message.authorName ?? t("workspace.messages.unknownAuthor")}</span>
        <span aria-hidden="true">·</span>
        <span>{sideLabel}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>
      </span>
      {message.deletedAt ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("workspace.messages.deleted")}
        </p>
      ) : (
        <div className="flex max-w-[92%] items-start gap-1">
          {ownSide ? deleteButton : null}
          <p
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
              ownSide
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
            )}
          >
            {message.body}
          </p>
          {ownSide ? null : deleteButton}
        </div>
      )}
    </div>
  );
}

interface ProjectMessageThreadProps {
  projectId: number;
  isExternalViewer: boolean;
  accountName?: string | null;
  timezone: string;
  /** Height cap of the scrolling list. */
  listClassName?: string;
}

/**
 * One project's conversation and its reply box. Plain text, newest at the
 * bottom; Enter sends, Shift+Enter adds a line. Authors (and Admins) can
 * delete a message. Seeing the newest message marks the project read.
 */
export function ProjectMessageThread({ projectId, isExternalViewer, accountName, timezone, listClassName = "max-h-[420px]" }: ProjectMessageThreadProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const { data: messages = [], isLoading } = useQuery<ProjectMessageView[]>({
    queryKey: projectMessagesKey(projectId),
    // The default query function fetches only the key's first part.
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/messages`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    refetchInterval: MESSAGES_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  const post = usePostProjectMessage(projectId);
  const remove = useDeleteProjectMessage(projectId);
  const markRead = useMarkProjectMessagesRead(projectId);
  const timeFormat = useMessageTimeFormat(timezone);

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const markReadRef = useRef(markRead.mutate);
  markReadRef.current = markRead.mutate;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    if (lastId !== null) markReadRef.current(lastId);
  }, [lastId]);

  const trimmed = draft.trim();
  const tooLong = draft.length > PROJECT_MESSAGE_MAX_LENGTH;
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || tooLong || post.isPending) return;
    post.mutate(trimmed, { onSuccess: () => setDraft("") });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
  };

  return (
    <>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="ml-8 h-12" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="workspace-messages-empty">
          {isExternalViewer ? t("workspace.messages.emptyExternal") : t("workspace.messages.emptyInternal")}
        </p>
      ) : (
        <ol ref={listRef} className={cn("flex flex-col gap-3 overflow-y-auto pr-1", listClassName)} aria-live="polite">
          {messages.map((message) => (
            <li key={message.id}>
              <MessageBubble
                message={message}
                isExternalViewer={isExternalViewer}
                accountName={accountName}
                timeFormat={timeFormat}
                onDelete={() => setPendingDelete(message.id)}
                deleteDisabled={remove.isPending}
              />
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={send} className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <label htmlFor={`project-message-${projectId}`} className="sr-only">
          {t("workspace.messages.inputLabel")}
        </label>
        <Textarea
          id={`project-message-${projectId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isExternalViewer ? t("workspace.messages.placeholderExternal") : t("workspace.messages.placeholderInternal")}
          rows={2}
          className="min-h-[64px] resize-none dark:border-slate-700 dark:bg-slate-950"
          aria-invalid={tooLong}
          data-testid="workspace-message-input"
        />
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-xs", tooLong ? "font-semibold text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-400")}>
            {tooLong
              ? t("workspace.messages.tooLong", { max: PROJECT_MESSAGE_MAX_LENGTH })
              : t("workspace.messages.visibleTo")}
          </span>
          <Button type="submit" size="sm" disabled={!trimmed || tooLong || post.isPending} data-testid="workspace-message-send">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {t("workspace.messages.send")}
          </Button>
        </div>
      </form>
      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("workspace.messages.deleteTitle")}
        description={t("workspace.messages.deleteDescription")}
        confirmLabel={t("workspace.messages.delete")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete !== null) remove.mutate(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
