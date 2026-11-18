import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, BookCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ProjectOutcomeDialog } from "@/components/outcomes/ProjectOutcomeDialog";

type OutcomeType = "won" | "lost" | "cancelled";

interface OutcomeRequestResponse {
  request: {
    outcomeType: OutcomeType;
    required: boolean;
    status: "open" | "captured" | "not_required" | "preexisting";
  } | null;
  hasOutcome: boolean;
  canRecord: boolean;
  /** optional: banner only; prompt: dialog once per session; required: dialog on every visit. */
  enforcement?: "optional" | "prompt" | "required";
}

interface ProjectOutcomePromptProps {
  projectId: number;
  projectName: string;
  /** Passed so the prompt re-checks as soon as the project closes or reopens. */
  status?: string | null;
  salesStage?: string | null;
}

// With "prompt" the dialog opens by itself once per browser session per
// project, so a person who closes it isn't pushed again on every visit; the
// banner stays. "required" opens it on every visit, "optional" never.
function shownKey(projectId: number) {
  return `outcome-prompt-shown:${projectId}`;
}

function alreadyShown(projectId: number): boolean {
  try {
    return sessionStorage.getItem(shownKey(projectId)) === "1";
  } catch {
    return false;
  }
}

function markShown(projectId: number) {
  try {
    sessionStorage.setItem(shownKey(projectId), "1");
  } catch {
    // Storage blocked: the banner still works, the dialog just may reopen.
  }
}

/**
 * The "record the outcome" prompt on a closed project. Shown to people who
 * can edit the project, only while the Outcome Intelligence rules require
 * the outcome and none is recorded. Internal users only (the page renders
 * it for them alone; the endpoint refuses everyone else).
 */
export function ProjectOutcomePrompt({ projectId, projectName, status, salesStage }: ProjectOutcomePromptProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data } = useQuery<OutcomeRequestResponse>({
    queryKey: ["project-outcome-request", projectId, status ?? null, salesStage ?? null],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcome-request`),
    staleTime: 30000,
  });

  const request = data?.request;
  const needsOutcome = !!request && !data?.hasOutcome && !!data?.canRecord && request.status === "open" && request.required;

  const enforcement = data?.enforcement ?? "prompt";

  useEffect(() => {
    if (!needsOutcome || enforcement === "optional") return;
    if (enforcement === "required" || !alreadyShown(projectId)) {
      markShown(projectId);
      setDialogOpen(true);
    }
  }, [needsOutcome, enforcement, projectId]);

  if (!request || !needsOutcome) return null;

  const required = enforcement === "required";

  return (
    <>
      <div
        role="status"
        className={
          required
            ? "flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/40"
            : "flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
        }
      >
        <BrainCircuit className={required ? "h-5 w-5 shrink-0 text-red-600 dark:text-red-400" : "h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"} />
        <div className="flex-1 min-w-0">
          <p className={required ? "text-sm font-medium text-red-900 dark:text-red-200" : "text-sm font-medium text-amber-900 dark:text-amber-200"}>
            {t(`outcomes.prompt.title.${request.outcomeType}`)}
          </p>
          <p className={required ? "text-xs text-red-800 dark:text-red-300" : "text-xs text-amber-800 dark:text-amber-300"}>
            {t(required ? "outcomes.prompt.descriptionRequired" : "outcomes.prompt.description")}
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="flex items-center gap-2 shrink-0">
          <BookCheck className="h-4 w-4" />
          {t("outcomes.prompt.record")}
        </Button>
      </div>
      <ProjectOutcomeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        projectName={projectName}
        outcomeType={request.outcomeType}
      />
    </>
  );
}
