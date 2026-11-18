/**
 * EmailLogCard
 *
 * Recent-email table on System Health › Email (moved from the panel that
 * used to sit under Integrations › Email Configuration). Shows the last 20
 * entries with a type filter and a details dialog, so admins can check test
 * and credential-verification results next to the delivery metrics. The
 * Email Log KPIs (total, this week, this month, success rate) live in the
 * Email System Health overview card above it.
 *
 * Auto-refreshes every 30 seconds via React Query's refetchInterval.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Eye, Mail, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { sanitizeEmailHtml } from "@/lib/safeHtml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import type { EmailLog } from "@/components/communications/types";

const TYPE_FILTERS = ["all", "credential_verification", "configuration_test", "template_test"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const TYPE_LABEL_KEYS: Record<Exclude<TypeFilter, "all">, string> = {
  credential_verification: "systemHealth.emailLog.types.credentialCheck",
  configuration_test: "systemHealth.emailLog.types.configurationTest",
  template_test: "systemHealth.emailLog.types.templateTest",
};

const RECENT_LIMIT = 20;

function isKnownType(type: string | undefined): type is Exclude<TypeFilter, "all"> {
  return !!type && type in TYPE_LABEL_KEYS;
}

function TypeBadge({ emailType }: { emailType?: string }) {
  const { t } = useTranslation();
  if (emailType === "credential_verification") {
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-xs text-green-700 dark:border-green-400 dark:text-green-300">
        <ShieldCheck className="h-3 w-3" />
        {t(TYPE_LABEL_KEYS.credential_verification)}
      </Badge>
    );
  }
  if (isKnownType(emailType)) {
    return (
      <Badge variant="outline" className="text-xs">
        {t(TYPE_LABEL_KEYS[emailType])}
      </Badge>
    );
  }
  return emailType ? (
    <Badge variant="outline" className="text-xs capitalize">
      {emailType.replace(/_/g, " ")}
    </Badge>
  ) : null;
}

function SuccessBadge({ success, className }: { success: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={success ? "default" : "destructive"}
      className={`text-xs ${success ? "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700" : ""} ${className ?? ""}`}
    >
      {success ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {success ? t("systemHealth.emailLog.sent") : t("systemHealth.emailLog.failed")}
    </Badge>
  );
}

function EmailLogDetails({ email }: { email: EmailLog }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <strong>{t("systemHealth.emailLog.details.from")}</strong> {email.fromEmail || "—"}
        </div>
        <div>
          <strong>{t("systemHealth.emailLog.details.to")}</strong> {email.toEmail}
        </div>
        <div>
          <strong>{t("systemHealth.emailLog.details.subject")}</strong> {email.subject}
        </div>
        <div>
          <strong>{t("systemHealth.emailLog.details.status")}</strong>
          <SuccessBadge success={email.success} className="ml-2" />
        </div>
        <div>
          <strong>{t("systemHealth.emailLog.details.sent")}</strong>{" "}
          {email.sentAt ? new Date(email.sentAt).toLocaleString() : "—"}
        </div>
        {email.emailType && (
          <div>
            <strong>{t("systemHealth.emailLog.details.type")}</strong> <TypeBadge emailType={email.emailType} />
          </div>
        )}
        {email.error && (
          <div className="col-span-2">
            <strong>{t("systemHealth.emailLog.details.error")}</strong>
            <div className="mt-1 break-words text-red-600 dark:text-red-400">{email.error}</div>
          </div>
        )}
      </div>
      <Separator />
      <div>
        <h4 className="mb-2 font-medium">{t("systemHealth.emailLog.details.content")}</h4>
        {email.htmlContent ? (
          <div className="max-h-72 overflow-y-auto rounded-lg border bg-gray-50 p-3 text-xs dark:bg-gray-800">
            <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.htmlContent) }} />
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-lg border bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {email.textContent || t("systemHealth.emailLog.details.noContent")}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmailLogCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);
  const [sortConfig, handleSort] = useUrlSortState("emailLogCard");

  const { data, isLoading, isFetching, refetch } = useQuery<{ emails: EmailLog[] }>({
    queryKey: ["/api/email-logs"],
    staleTime: 25_000,
    refetchInterval: 30_000,
  });

  const recent = useMemo(() => {
    const rows = data?.emails ?? [];
    const filtered = typeFilter === "all" ? rows : rows.filter((e) => e.emailType === typeFilter);
    // Take the newest RECENT_LIMIT first, then apply the column sort to them.
    const newest = [...filtered]
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, RECENT_LIMIT);
    return sortRows(newest, sortConfig, {
      sentAt: (e) => (e.sentAt ? new Date(e.sentAt) : null),
      status: (e) => e.success,
    });
  }, [data, typeFilter, sortConfig]);

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card data-testid="email-log-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <button className="group flex items-center gap-2 text-left focus:outline-none">
                  <Mail className="h-5 w-5" />
                  <CardTitle className="text-2xl transition-colors group-hover:text-primary">
                    {t("systemHealth.emailLog.title")}
                  </CardTitle>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-8 w-8 p-0"
                  title={t("systemHealth.emailLog.refresh")}
                  aria-label={t("systemHealth.emailLog.refresh")}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <a
                  href="/admin?tab=email-logs"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  {t("systemHealth.emailLog.viewFullLog")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">{t("systemHealth.emailLog.filterByType")}</span>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                  <SelectTrigger className="h-8 w-52 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_FILTERS.map((value) => (
                      <SelectItem key={value} value={value} className="text-sm">
                        {value === "all" ? t("systemHealth.emailLog.types.all") : t(TYPE_LABEL_KEYS[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("systemHealth.emailLog.autoRefresh", { count: RECENT_LIMIT })}
                </span>
              </div>

              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("systemHealth.emailLog.loading")}</div>
              ) : recent.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("systemHealth.emailLog.empty")}</div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={handleSort} className="h-auto w-12 px-3 py-2">
                          {t("systemHealth.emailLog.columns.id")}
                        </SortableTableHead>
                        <SortableTableHead sortKey="toEmail" sortConfig={sortConfig} onSort={handleSort} className="h-auto px-3 py-2">
                          {t("systemHealth.emailLog.columns.to")}
                        </SortableTableHead>
                        <SortableTableHead sortKey="subject" sortConfig={sortConfig} onSort={handleSort} className="hidden h-auto px-3 py-2 md:table-cell">
                          {t("systemHealth.emailLog.columns.subject")}
                        </SortableTableHead>
                        <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort} className="h-auto px-3 py-2">
                          {t("systemHealth.emailLog.columns.status")}
                        </SortableTableHead>
                        <SortableTableHead sortKey="sentAt" sortConfig={sortConfig} onSort={handleSort} className="hidden h-auto px-3 py-2 lg:table-cell">
                          {t("systemHealth.emailLog.columns.sentAt")}
                        </SortableTableHead>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("systemHealth.emailLog.columns.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((email, idx) => (
                        <tr
                          key={email.id}
                          className={`border-t ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} transition-colors hover:bg-muted/40`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{email.id}</td>
                          <td className="max-w-[160px] truncate px-3 py-2">{email.toEmail}</td>
                          <td className="hidden max-w-[200px] truncate px-3 py-2 text-muted-foreground md:table-cell">{email.subject}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <SuccessBadge success={email.success} />
                              <TypeBadge emailType={email.emailType} />
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                            {email.sentAt ? format(new Date(email.sentAt), "MMM d, yyyy HH:mm") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedEmail(email)}>
                              <Eye className="mr-1 h-3 w-3" />
                              {t("systemHealth.emailLog.view")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={selectedEmail !== null} onOpenChange={(next) => !next && setSelectedEmail(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t("systemHealth.emailLog.details.title")}
              {selectedEmail?.sentAt && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {t("systemHealth.emailLog.details.sentOn", { date: format(new Date(selectedEmail.sentAt), "MMM d, yyyy HH:mm") })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEmail && <EmailLogDetails email={selectedEmail} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
