import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, UserSearch, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatFullName } from "@/lib/nameUtils";

/** One person on the account's Contact Users list (Account Management). */
export interface AccountContact {
  userId: string;
  stakeholderTypes?: string[] | null;
  userEmail?: string | null;
}

export interface AccountAccessUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /** Job title (users.title). */
  title?: string | null;
}

/** The project fields that say who works on it. */
export interface AccountAccessProject {
  id: number;
  name?: string | null;
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  primarySe?: { id?: string | null } | null;
  specialistSe?: { id?: string | null } | null;
  supportingEngineers?: string[] | null;
  additionalAccess?: Array<{ userId?: string | null; userEmail?: string | null }> | null;
}

interface CustomerAccessRow {
  userEmail: string;
  permission: string;
}

interface AccountAccessDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  contacts: AccountContact[];
  users: AccountAccessUser[];
  /** The account's projects, to count each person's projects. */
  projects: AccountAccessProject[];
  /** Set to list only the people with access to this one project. */
  project?: AccountAccessProject | null;
  /** The signed-in user: their own row offers to set a missing job title. */
  viewerId?: string | null;
}

/** Avatar colors, picked from the name so a person keeps theirs. */
const AVATAR_COLORS = ["#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#15803d", "#4f46e5", "#b45309"];

function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(first: string | null | undefined, last: string | null | undefined, email: string | null | undefined): string {
  const fromName = `${(first ?? "").trim().charAt(0)}${(last ?? "").trim().charAt(0)}`.toUpperCase();
  return fromName || (email ?? "?").trim().charAt(0).toUpperCase() || "?";
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when the person is on the project: an engineer on it or given access to it. */
export function isOnProject(project: AccountAccessProject, userId: string, email: string | null | undefined): boolean {
  if (project.primaryEngineerId === userId || project.primarySe?.id === userId) return true;
  if (project.specialistEngineerId === userId || project.specialistSe?.id === userId) return true;
  if (Array.isArray(project.supportingEngineers) && project.supportingEngineers.includes(userId)) return true;
  return (
    Array.isArray(project.additionalAccess) &&
    project.additionalAccess.some((access) => access.userId === userId || sameEmail(access.userEmail, email))
  );
}

interface AccessRow {
  key: string;
  name: string;
  initials: string;
  color: string;
  userId: string | null;
  title: string | null;
  email: string | null;
  /** Account view: how many of the account's projects they are on. */
  projectCount: number | null;
  /** Project view: View or Edit, from the project's customer access list. */
  permission: string | null;
}

/**
 * Side drawer listing the account's people (its Contact Users, set in
 * Account Management), each with an initials avatar, job title and email.
 * A viewer without a title can set their own from their row. Account view counts each person's projects; with `project` set it
 * lists only the people with access to that project and their permission.
 */
export function AccountAccessDrawer({ open, onOpenChange, accountName, contacts, users, projects, project = null, viewerId = null }: AccountAccessDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // A user sets only their own title, through their profile endpoint.
  const saveTitle = useMutation({
    mutationFn: (title: string) => apiRequest("PUT", "/api/users/me", { title }),
    onSuccess: () => {
      setEditingTitle(false);
      setTitleDraft("");
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      showSuccessToast(t("accountPortal.access.titleSaved"));
    },
    onError: () => showErrorToast(t("accountPortal.access.titleSaveFailed")),
  });
  const projectId = project?.id ?? null;
  const { data: projectAccess = [] } = useQuery<CustomerAccessRow[]>({
    queryKey: [`/api/customer-access/${projectId}`],
    enabled: open && projectId != null,
  });

  const rows = useMemo<AccessRow[]>(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    const permissionFor = (email: string | null) =>
      projectAccess.find((access) => sameEmail(access.userEmail, email))?.permission ?? null;
    const listed: AccessRow[] = [];
    for (const contact of contacts) {
      const user = byId.get(contact.userId);
      const email = contact.userEmail ?? user?.email ?? null;
      const permission = project ? permissionFor(email) : null;
      if (project && !permission && !isOnProject(project, contact.userId, email)) continue;
      const name = user ? formatFullName(user.firstName, user.lastName) : "";
      listed.push({
        key: contact.userId,
        name: name || email || t("accountPortal.access.unknownUser"),
        initials: initials(user?.firstName, user?.lastName, email),
        color: avatarColor(contact.userId),
        userId: contact.userId,
        title: user?.title?.trim() || null,
        email,
        projectCount: project ? null : projects.filter((row) => isOnProject(row, contact.userId, email)).length,
        permission,
      });
    }
    // Project view: people given access by email who aren't account contacts.
    if (project) {
      for (const access of projectAccess) {
        if (listed.some((row) => sameEmail(row.email, access.userEmail))) continue;
        const user = users.find((row) => sameEmail(row.email, access.userEmail));
        const name = user ? formatFullName(user.firstName, user.lastName) : "";
        listed.push({
          key: `email-${access.userEmail}`,
          name: name || access.userEmail,
          initials: initials(user?.firstName, user?.lastName, access.userEmail),
          color: avatarColor(access.userEmail.toLowerCase()),
          userId: user?.id ?? null,
          title: user?.title?.trim() || null,
          email: access.userEmail,
          projectCount: null,
          permission: access.permission,
        });
      }
    }
    return listed;
  }, [contacts, users, projects, project, projectAccess, t]);

  const permissionLabel = (permission: string) =>
    permission.toLowerCase() === "edit" ? t("accountPortal.access.permissionEdit") : t("accountPortal.access.permissionView");

  const TitleIcon = project ? Users : UserSearch;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] max-w-[92vw] p-0" data-testid="account-access-drawer">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200/70 bg-white p-5 dark:border-slate-800/70 dark:bg-slate-950">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="flex items-center gap-2.5 text-base">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20" aria-hidden="true">
                  <TitleIcon className="h-4 w-4" />
                </span>
                {project ? t("accountPortal.access.projectTitle") : t("accountPortal.access.title")}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600 dark:text-slate-400">
                {project
                  ? t("accountPortal.access.projectSubtitle", { project: project.name || t("projectView.hero.untitled", { id: project.id }), account: accountName })
                  : t("accountPortal.access.subtitle", { account: accountName })}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-5">
            {rows.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">
                {project ? t("accountPortal.access.projectEmpty") : t("accountPortal.access.empty")}
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
                  data-testid={`account-access-row-${row.key}`}
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  >
                    {row.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
                    {row.title ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{row.title}</p>
                    ) : row.userId != null && row.userId === viewerId ? (
                      editingTitle ? (
                        <form
                          className="mt-1.5 flex flex-wrap items-center gap-1.5"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const title = titleDraft.trim();
                            if (title) saveTitle.mutate(title);
                          }}
                        >
                          <Input
                            id="account-access-job-title"
                            value={titleDraft}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            placeholder={t("accountPortal.access.titlePlaceholder")}
                            aria-label={t("accountPortal.access.titlePlaceholder")}
                            maxLength={120}
                            className="h-8 basis-full text-xs"
                            autoFocus
                          />
                          <Button type="submit" size="sm" className="h-8" disabled={!titleDraft.trim() || saveTitle.isPending}>
                            {t("common.save")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditingTitle(false)}>
                            {t("common.cancel")}
                          </Button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingTitle(true)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-testid="account-access-set-title"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          {t("accountPortal.access.setTitle")}
                        </button>
                      )
                    ) : (
                      <p className="mt-0.5 truncate text-xs italic text-slate-400 dark:text-slate-500">{t("accountPortal.access.noTitle")}</p>
                    )}
                    {row.email ? (
                      <a
                        href={`mailto:${row.email}`}
                        className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 hover:text-primary hover:underline dark:text-slate-400"
                      >
                        <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{row.email}</span>
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("accountPortal.access.noEmail")}</p>
                    )}
                  </div>
                  {row.permission ? (
                    <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
                      {permissionLabel(row.permission)}
                    </span>
                  ) : row.projectCount != null ? (
                    <span className="shrink-0 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t("accountPortal.access.projectCount", { count: row.projectCount })}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
