import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessagesSquare, Pencil, Pin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/rich-text/MarkdownContent";
import { TiptapEditor } from "@/components/rich-text/TiptapEditor";
import { BentoCard } from "./BentoTiles";
import { ProjectMessageThread } from "./ProjectMessageThread";

interface ProjectMessagesCardProps {
  projectId: number;
  /** The signed-in user is a Customer, Partner or Guest. */
  isExternalViewer: boolean;
  /** Account name, for the side labels ("Acme" vs "Project team"). */
  accountName?: string | null;
  timezone: string;
  /** The project's notes, pinned above the messages; omit to leave them out. */
  notes?: ProjectNotes;
}

export interface ProjectNotes {
  /** Saved notes (Markdown from the rich-text editor), or empty. */
  value: string | null | undefined;
  /** The viewer has edit access to the project. */
  canEdit: boolean;
  /** Saves the notes; resolves when saved, rejects on failure. */
  onSave(value: string): Promise<unknown>;
}

/**
 * The project notes as a pinned block at the top of Messages. Everyone on
 * the project reads them; users with edit access change them in place.
 */
function PinnedNotes({ value, canEdit, onSave }: ProjectNotes) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const text = (value ?? "").trim();

  if (!text && !canEdit) return null;

  const startEditing = () => {
    setDraft(value ?? "");
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // The caller shows the error toast; keep the editor open with the draft.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"
      data-testid="workspace-notes"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          <Pin className="h-3.5 w-3.5" aria-hidden="true" />
          {t("workspace.notes.title")}
        </span>
        {canEdit && !editing && text ? (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200 dark:hover:bg-amber-900/40"
            data-testid="workspace-notes-edit"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            {t("workspace.notes.edit")}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <TiptapEditor
            value={draft}
            onChange={setDraft}
            placeholder={t("projects.enterProjectNotes")}
            toolbar="minimal"
            minHeight="96px"
            maxHeight="360px"
            size="sm"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="workspace-notes-save">
              {t("workspace.notes.save")}
            </Button>
          </div>
        </div>
      ) : text ? (
        <div className="max-h-48 overflow-y-auto text-sm text-slate-900 dark:text-slate-100">
          <MarkdownContent content={text} className="text-sm" />
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="inline-flex items-center gap-1.5 self-start rounded-md text-sm font-semibold text-amber-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200"
          data-testid="workspace-notes-add"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("workspace.notes.add")}
        </button>
      )}
    </div>
  );
}

/**
 * The project's conversation between the customer and the project team, in
 * the workspace side panel, with the project notes pinned at the top.
 */
export function ProjectMessagesCard({ projectId, isExternalViewer, accountName, timezone, notes }: ProjectMessagesCardProps) {
  const { t } = useTranslation();
  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("workspace.messages.title")}
        </span>
      }
      data-testid="workspace-messages"
    >
      {notes ? <PinnedNotes {...notes} /> : null}
      <ProjectMessageThread projectId={projectId} isExternalViewer={isExternalViewer} accountName={accountName} timezone={timezone} />
    </BentoCard>
  );
}
