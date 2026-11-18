import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Diamond, Eye, Handshake, History, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import type { AgreementCriterionInput } from "@shared/value-journey";
import { CriterionPriorityButton } from "./CriterionPriorityButton";
import { CriteriaAgreeDialog } from "./CriteriaAgreeDialog";
import { invalidateProjectJourney, useCriteriaAgreement, type CriteriaAgreementView } from "./use-value-journey";

export interface AgreementContact {
  id: string;
  name: string;
}

interface CriteriaAgreementBarProps {
  projectId: number;
  /** Staff with edit access may send the criteria. */
  canSend: boolean;
  /** Customer, Partner or Guest: may agree when a request is open. */
  isExternalViewer: boolean;
  /** The project's customer contacts, for "Send for agreement". */
  contacts: AgreementContact[];
  criteria: AgreementCriterionInput[];
  accountName: string | null | undefined;
  /** The signed-in user's name and title, to start the agree form with. */
  viewerName: string;
  viewerTitle?: string | null;
  /** Opens the agree dialog on load (the link in the request notification). */
  openAgreeOnLoad?: boolean;
  onSuggestChange?: () => void;
}

/**
 * The bar above the Success Criteria table: whether the customer agreed to
 * the criteria, who and when, what changed since, and the actions that fit
 * (send, ask to re-agree, view the agreed version, agree).
 */
export function CriteriaAgreementBar({
  projectId,
  canSend,
  isExternalViewer,
  contacts,
  criteria,
  accountName,
  viewerName,
  viewerTitle,
  openAgreeOnLoad,
  onSuggestChange,
}: CriteriaAgreementBarProps) {
  const { t, i18n } = useTranslation();
  const { data: state } = useCriteriaAgreement(projectId);
  const [sendOpen, setSendOpen] = useState(false);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [viewing, setViewing] = useState<CriteriaAgreementView | null>(null);

  const status = state?.status ?? "none";
  const canAgree = isExternalViewer && status === "sent";

  useEffect(() => {
    if (openAgreeOnLoad && canAgree) setAgreeOpen(true);
  }, [openAgreeOnLoad, canAgree]);

  if (!state) return null;

  const dateTime = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const shortDate = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });
  const fmt = (value: string | null | undefined, f = dateTime) => (value ? f.format(new Date(value)) : "");
  const names = (people: Array<{ name: string | null; email: string | null }>) =>
    people.map((p) => p.name ?? p.email ?? "").filter(Boolean).join(", ");

  const agreed = state.lastAgreed;
  const snapshot = agreed?.criteriaSnapshot ?? [];
  const mustCount = snapshot.filter((row) => row.priority === "must_have").length;
  const changes = state.changes;
  const changeCount = changes ? changes.changedIds.length + changes.addedIds.length + changes.removedIds.length : 0;

  const tone =
    status === "agreed"
      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40"
      : status === "changed"
        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
        : status === "sent"
          ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40"
          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50";

  let headline: string;
  let detail: string | null = null;
  if (status === "none") {
    headline = t("valueJourney.agreement.bar.noneTitle");
    detail = isExternalViewer ? t("valueJourney.agreement.bar.noneExternal") : t("valueJourney.agreement.bar.noneInternal");
  } else if (status === "sent") {
    headline = isExternalViewer ? t("valueJourney.agreement.bar.sentExternal") : t("valueJourney.agreement.bar.sentTitle");
    detail = t("valueJourney.agreement.bar.sentDetail", {
      people: names(state.current?.recipients ?? []) || t("valueJourney.agreement.bar.theCustomer"),
      date: fmt(state.current?.requestedAt, shortDate),
    });
  } else {
    headline = agreed?.agreedByTitle
      ? t("valueJourney.agreement.bar.agreedByWithTitle", { name: agreed.agreedByName, title: agreed.agreedByTitle })
      : t("valueJourney.agreement.bar.agreedBy", { name: agreed?.agreedByName ?? "" });
    detail = [
      fmt(agreed?.agreedAt),
      t("valueJourney.agreement.bar.criteriaCount", { count: snapshot.length, must: mustCount }),
      agreed?.requestedBy?.name ? t("valueJourney.agreement.bar.sentBy", { name: agreed.requestedBy.name }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const lineNumberOf = new Map(criteria.map((c) => [c.id, c.lineNumber]));
  const changedNumbers = changes
    ? [...changes.changedIds, ...changes.addedIds].map((id) => `#${lineNumberOf.get(id) ?? "?"}`).join(", ")
    : "";

  return (
    <div className={cn("space-y-2 rounded-xl border p-3", tone)} data-testid="criteria-agreement-bar">
      <div className="flex flex-wrap items-center gap-3">
        <Diamond
          className={cn(
            "h-5 w-5 shrink-0",
            status === "agreed" && "fill-green-600 text-green-700 dark:fill-green-500 dark:text-green-400",
            status === "changed" && "text-amber-600 dark:text-amber-400",
            status === "sent" && "text-blue-600 dark:text-blue-400",
            status === "none" && "text-slate-400 dark:text-slate-500",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-[1_1_260px]">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="criteria-agreement-status">
            {headline}
          </p>
          {detail ? <p className="text-xs text-slate-600 dark:text-slate-400">{detail}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {agreed ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setViewing(agreed)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("valueJourney.agreement.bar.viewAgreed")}
            </Button>
          ) : null}
          {canSend ? (
            <Button
              type="button"
              size="sm"
              variant={status === "agreed" ? "outline" : "default"}
              onClick={() => setSendOpen(true)}
              disabled={criteria.length === 0}
              data-testid="criteria-agreement-send"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {status === "none"
                ? t("valueJourney.agreement.bar.send")
                : status === "sent"
                  ? t("valueJourney.agreement.bar.resend")
                  : t("valueJourney.agreement.bar.askReagree")}
            </Button>
          ) : null}
          {canAgree ? (
            <Button type="button" size="sm" onClick={() => setAgreeOpen(true)} data-testid="criteria-agreement-review">
              <Handshake className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("valueJourney.agreement.bar.reviewAndAgree")}
            </Button>
          ) : null}
        </div>
      </div>

      {status === "changed" && changeCount > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200" data-testid="criteria-agreement-changes">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {t("valueJourney.agreement.bar.changedSince", { count: changeCount, name: agreed?.agreedByName ?? "", rows: changedNumbers || "—" })}
            {canSend ? ` ${t("valueJourney.agreement.bar.changedHint")}` : ""}
          </span>
        </p>
      ) : null}

      {state.history.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {t("valueJourney.agreement.history.title")}
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
              {state.history.map((row) => (
                <li key={row.id} className="text-xs text-slate-700 dark:text-slate-300">
                  {row.agreedAt ? (
                    <p>
                      <span className="font-semibold">
                        {t("valueJourney.agreement.history.agreed", { name: row.agreedByName ?? "" })}
                      </span>
                      {row.agreedByTitle ? `, ${row.agreedByTitle}` : ""} · {fmt(row.agreedAt)}
                    </p>
                  ) : null}
                  <p className={row.agreedAt ? "text-slate-500 dark:text-slate-400" : undefined}>
                    {t("valueJourney.agreement.history.sent", {
                      by: row.requestedBy?.name ?? t("valueJourney.agreement.bar.theTeam"),
                      to: names(row.recipients) || t("valueJourney.agreement.bar.theCustomer"),
                    })}{" "}
                    · {fmt(row.requestedAt)}
                  </p>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {canSend ? (
        <SendForAgreementDialog
          projectId={projectId}
          open={sendOpen}
          onOpenChange={setSendOpen}
          contacts={contacts}
          preselected={(state.current?.recipients ?? []).map((p) => p.id)}
        />
      ) : null}
      {isExternalViewer ? (
        <CriteriaAgreeDialog
          projectId={projectId}
          open={agreeOpen}
          onOpenChange={setAgreeOpen}
          accountName={accountName}
          criteria={criteria}
          defaultName={viewerName}
          defaultTitle={viewerTitle}
          onSuggestChange={onSuggestChange}
        />
      ) : null}
      <AgreedVersionDialog view={viewing} onClose={() => setViewing(null)} formatDate={(value) => fmt(value)} />
    </div>
  );
}

function SendForAgreementDialog({
  projectId,
  open,
  onOpenChange,
  contacts,
  preselected,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: AgreementContact[];
  preselected: string[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const known = preselected.filter((id) => contacts.some((c) => c.id === id));
    setPicked(new Set(known.length > 0 ? known : contacts.slice(0, 1).map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/criteria-agreement/request`, { recipientUserIds: [...picked] }),
    onSuccess: () => {
      invalidateProjectJourney(queryClient, projectId);
      showSuccessToast("valueJourney.agreement.send.sentTitle", "valueJourney.agreement.send.sentDescription");
      onOpenChange(false);
    },
    onError: () => showErrorToast("common.error", "valueJourney.agreement.send.failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="criteria-agreement-send-dialog">
        <DialogHeader>
          <DialogTitle>{t("valueJourney.agreement.send.title")}</DialogTitle>
          <DialogDescription>{t("valueJourney.agreement.send.description")}</DialogDescription>
        </DialogHeader>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("valueJourney.agreement.send.noContacts")}</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <Checkbox
                    checked={picked.has(contact.id)}
                    onCheckedChange={(checked) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (checked === true) next.add(contact.id);
                        else next.delete(contact.id);
                        return next;
                      })
                    }
                  />
                  {contact.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => send.mutate()} disabled={picked.size === 0 || send.isPending}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("valueJourney.agreement.send.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgreedVersionDialog({
  view,
  onClose,
  formatDate,
}: {
  view: CriteriaAgreementView | null;
  onClose: () => void;
  formatDate: (value: string | null) => string;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("valueJourney.agreement.version.title")}</DialogTitle>
          <DialogDescription>
            {view
              ? t("valueJourney.agreement.version.description", { name: view.agreedByName ?? "", date: formatDate(view.agreedAt) })
              : null}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-1.5">
          {(view?.criteriaSnapshot ?? []).map((row) => (
            <li key={row.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <CriterionPriorityButton priority={row.priority} />
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  <span className="mr-1.5 tabular-nums text-slate-500 dark:text-slate-400">#{row.lineNumber ?? "—"}</span>
                  {row.criterion}
                </p>
                {row.expectedOutcome ? <p className="text-xs text-slate-600 dark:text-slate-400">{row.expectedOutcome}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
