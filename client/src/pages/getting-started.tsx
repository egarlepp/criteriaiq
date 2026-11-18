import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { SupportFeatureDialog } from "@/components/support/support-feature-dialog";
import { GuideHubControls, type GuideRoleView } from "@/components/guide/guide-hub-controls";
import { GuideJourney } from "@/components/guide/guide-journey";
import { GuideTopicGrid } from "@/components/guide/guide-topic-grid";
import { GuideAccountStatuses } from "@/components/guide/guide-status-tiles";
import { GuideTopicDrawer } from "@/components/guide/guide-topic-drawer";
import { buildGuideSearchIndex } from "@/components/guide/guide-search";
import {
  FALLBACK_ACCOUNT_STATUSES,
  FALLBACK_PROJECT_STATUSES,
  GUIDE_ROLES,
  getTopic,
  topicFromUrlKey,
  type GuideRoleKey,
  type GuideStatus,
  type GuideTopicKey,
} from "@/components/guide/guide-data";
import { useAuth } from "@/hooks/useAuth";
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";

// Help › Guide. Role-based start hub (design option C, 2026-10-21): pick a
// role and stage for a checklist, browse topics that open in a side drawer,
// and see the Account Statuses that Customers, Partners and Guests set.
// ?tab=<topic> opens that topic's drawer; Global Search links rely on it.

interface StatusConfigRow {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean | null;
}

interface RoleRow {
  name: string;
  displayName?: string | null;
  color?: string | null;
  icon?: string | null;
}

function toGuideStatuses(rows: StatusConfigRow[], fallback: GuideStatus[], defaultIcon: string): GuideStatus[] {
  const active = rows
    .filter((row) => row.isActive !== false)
    .map((row) => ({
      name: row.name,
      description: row.description ?? "",
      color: row.color || "#6B7280",
      icon: row.icon || defaultIcon,
    }));
  return active.length > 0 ? active : fallback;
}

export default function GettingStarted() {
  const { t } = useTranslation();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { email: supportEmail } = useBrandingSupportEmail();
  const [showSupportDialog, setShowSupportDialog] = useState(false);

  const { data: accountStatusRows = [] } = useQuery<StatusConfigRow[]>({ queryKey: ["/api/customer-status-configs"] });
  const { data: projectStatusRows = [] } = useQuery<StatusConfigRow[]>({ queryKey: ["/api/status-configs"] });
  const { data: roleRows = [] } = useQuery<RoleRow[]>({ queryKey: ["/api/roles"] });

  const accountStatuses = useMemo(
    () => toGuideStatuses(accountStatusRows, FALLBACK_ACCOUNT_STATUSES, "HelpCircle"),
    [accountStatusRows],
  );
  const projectStatuses = useMemo(
    () => toGuideStatuses(projectStatusRows, FALLBACK_PROJECT_STATUSES, "ClipboardPenLine"),
    [projectStatusRows],
  );

  const roles: GuideRoleView[] = useMemo(
    () =>
      GUIDE_ROLES.map((role) => {
        const row = roleRows.find((candidate) => candidate.name === role.roleName);
        return {
          key: role.key,
          name: row?.displayName || t(`guide.roles.${role.key}.name`),
          color: row?.color || role.color,
          icon: row?.icon || role.icon,
        };
      }),
    [roleRows, t],
  );

  const ownRole = GUIDE_ROLES.find((role) => role.roleName.toLowerCase() === user?.role?.toLowerCase())?.key;
  const [pickedRole, setPickedRole] = useState<GuideRoleKey | null>(null);
  const selectedRole: GuideRoleKey = pickedRole ?? ownRole ?? "customer";

  const openTopic = topicFromUrlKey(new URLSearchParams(search).get("tab"));
  const setOpenTopic = useCallback(
    (topic: GuideTopicKey | null) => {
      const params = new URLSearchParams(search);
      if (topic) params.set("tab", getTopic(topic).urlKey);
      else params.delete("tab");
      const query = params.toString();
      navigate(query ? `${location}?${query}` : location, { replace: true });
    },
    [search, location, navigate],
  );

  const searchIndex = useMemo(
    () => buildGuideSearchIndex(t, accountStatuses, projectStatuses),
    [t, accountStatuses, projectStatuses],
  );

  return (
    <div className="space-y-4">
      <GuideHubControls
        roles={roles}
        selectedRole={selectedRole}
        onRoleChange={setPickedRole}
        searchIndex={searchIndex}
        onOpenTopic={setOpenTopic}
      />
      <GuideJourney role={selectedRole} />
      <GuideTopicGrid role={selectedRole} onOpenTopic={setOpenTopic} />
      <GuideAccountStatuses role={selectedRole} statuses={accountStatuses} onViewAll={() => setOpenTopic("statuses")} />

      <GuideTopicDrawer
        topic={openTopic}
        onClose={() => setOpenTopic(null)}
        accountStatuses={accountStatuses}
        projectStatuses={projectStatuses}
        supportEmail={supportEmail}
        onSubmitRequest={() => setShowSupportDialog(true)}
      />
      <SupportFeatureDialog
        open={showSupportDialog}
        onOpenChange={setShowSupportDialog}
        openedFromGetHelp={true}
        prefilledData={{ type: "issue" }}
        onSuccess={() => setShowSupportDialog(false)}
      />
    </div>
  );
}
