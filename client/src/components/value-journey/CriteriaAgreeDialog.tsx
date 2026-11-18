import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleDashed, Handshake, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { agreementSnapshot, type AgreementCriterionInput } from "@shared/value-journey";
import { invalidateProjectJourney } from "./use-value-journey";

interface CriteriaAgreeDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string | null | undefined;
  /** The project's criteria as they stand; the customer agrees to these. */
  criteria: AgreementCriterionInput[];
  /** The signed-in customer's name, to start the name field with. */
  defaultName: string;
  defaultTitle?: string | null;
  /** Opens the project's Messages, for "Suggest a change". */
  onSuggestChange?: () => void;
}

/**
 * What a customer contact sees after the team sends the criteria: the
 * must-haves and nice-to-haves, their name and title, and a box to tick.
 * Agreeing saves the name, title, date and time and a copy of the criteria.
 */
export function CriteriaAgreeDialog({
  projectId,
  open,
  onOpenChange,
  accountName,
  criteria,
  defaultName,
  defaultTitle,
  onSuggestChange,
}: CriteriaAgreeDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setTitle(defaultTitle ?? "");
      setAccepted(false);
    }
  }, [open, defaultName, defaultTitle]);

  const agree = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/criteria-agreement/agree`, {
        name: name.trim(),
        title: title.trim(),
        accepted: true,
      }),
    onSuccess: () => {
      invalidateProjectJourney(queryClient, projectId);
      showSuccessToast("valueJourney.agree.savedTitle", "valueJourney.agree.savedDescription");
      onOpenChange(false);
    },
    onError: () => showErrorToast("common.error", "valueJourney.agree.failed"),
  });

  const rows = agreementSnapshot(criteria);
  const must = rows.filter((row) => row.priority === "must_have");
  const nice = rows.filter((row) => row.priority === "nice_to_have");
  const canAgree = name.trim().length > 0 && accepted && rows.length > 0 && !agree.isPending;
  const account = accountName?.replace(/^\[demo\]\s*/i, "") || t("valueJourney.agree.yourTeam");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="criteria-agree-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("valueJourney.agree.title")}
          </DialogTitle>
          <DialogDescription>{t("valueJourney.agree.intro", { count: must.length })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section aria-labelledby="agree-must">
            <h3 id="agree-must" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="h-4 w-4 fill-purple-100 text-purple-700 dark:fill-purple-900/60 dark:text-purple-300" aria-hidden="true" />
              {t("valueJourney.agree.mustHaves", { count: must.length })}
            </h3>
            <ol className="space-y-1.5">
              {must.map((row) => (
                <li key={row.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    <span className="mr-1.5 tabular-nums text-slate-500 dark:text-slate-400">#{row.lineNumber ?? "—"}</span>
                    {row.criterion}
                  </p>
                  {row.expectedOutcome ? <p className="text-xs text-slate-600 dark:text-slate-400">{row.expectedOutcome}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          {nice.length > 0 ? (
            <section aria-labelledby="agree-nice">
              <h3 id="agree-nice" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <CircleDashed className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                {t("valueJourney.agree.niceToHaves", { count: nice.length })}
              </h3>
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {nice.map((row) => (
                  <li key={row.id}>
                    <span className="mr-1.5 tabular-nums text-slate-500 dark:text-slate-400">#{row.lineNumber ?? "—"}</span>
                    {row.criterion}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agree-name">{t("valueJourney.agree.name")}</Label>
              <Input id="agree-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agree-title">{t("valueJourney.agree.jobTitle")}</Label>
              <Input id="agree-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} autoComplete="organization-title" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
            <Checkbox checked={accepted} onCheckedChange={(checked) => setAccepted(checked === true)} className="mt-0.5" />
            <span>{t("valueJourney.agree.statement", { account })}</span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("valueJourney.agree.recorded")}</p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {onSuggestChange ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onSuggestChange();
              }}
            >
              <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("valueJourney.agree.suggestChange")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => agree.mutate()} disabled={!canAgree} data-testid="criteria-agree-submit">
            <Handshake className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("valueJourney.agree.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
