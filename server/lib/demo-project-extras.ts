// Demo Mode: the parts of a project and an account that a real evaluation
// fills in along the way. Each demo account gets an Infrastructure
// Discovery profile, attached to its projects; each demo project gets the
// library's assumptions and dependencies, with dependency statuses that
// follow the project's stage. Everything here hangs off a demo account or
// project (or a demo library item) and goes with it on wipe. See
// docs/admin/demo-mode.md.

import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  infrastructureProfiles,
  projectAssumptions,
  projectDependencies,
  projects,
  successCriteria,
} from "@shared/schema";
import type { DemoArtifactAccount, DemoArtifactProject } from "./demo-artifacts";

const DAY_MS = 86_400_000;

/** Small deterministic PRNG so a given account always gets the same profile. */
function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/**
 * An Infrastructure Discovery profile as an SE would fill it in after a
 * discovery call. Keys and values are the ones the drawer offers
 * (client/src/components/accounts/InfrastructureDiscoveryDrawer.tsx).
 */
export function planDiscoveryProfile(index: number): Record<string, Record<string, unknown>> {
  const rand = seeded(index + 1);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length];
  const some = <T,>(list: readonly T[], min: number): T[] => {
    const chosen = list.filter(() => rand() < 0.5);
    return chosen.length >= min ? chosen : list.slice(0, min);
  };
  const idp = pick(["entra_id", "okta", "ping"] as const);
  const users = 1_500 + Math.round(rand() * 38) * 500;
  return {
    identity_directory: {
      ad_users: users,
      idp_primary: idp,
      directory_types: idp === "entra_id" ? ["ad_ds", "entra_id"] : ["ad_ds", "ldap"],
      ad_forest_count: 1 + Math.floor(rand() * 3),
      privileged_access_model: "Shared admin accounts in the server team; named admin accounts for domain admins only.",
      pam_tooling: rand() < 0.5 ? ["CyberArk"] : [],
      identity_source_of_truth: "hris",
      mfa_methods: some(["push", "totp", "fido2"] as const, 1),
    },
    endpoint_server_platforms: {
      endpoint_os_mix: pick(["mostly_windows", "mixed", "mac_heavy"] as const),
      server_os_mix: pick(["mostly_windows", "mixed", "linux_heavy"] as const),
      endpoint_count: Math.round(users * 1.2),
      remote_workforce_ratio: pick(["medium", "high"] as const),
      endpoint_mgmt_tool: pick(["intune", "mecm", "jamf"] as const),
      edr_platform: [pick(["CrowdStrike Falcon", "Microsoft Defender for Endpoint", "SentinelOne"] as const)],
      agent_allowed: rand() < 0.8,
      removable_media_control_required: rand() < 0.4,
      exfiltration_channels_of_concern: some(["usb", "email", "web_upload", "cloud_sync"] as const, 2),
      local_admin_rights_model: pick(["few", "strictly_controlled", "many_local_admins"] as const),
    },
    network_connectivity: {
      egress_model: pick(["proxy_required", "allowlist_only", "default_deny"] as const),
      proxy_in_use: true,
    },
    storage_file_systems: {
      data_stores_in_scope: some(["windows_file_shares", "sharepoint", "onedrive", "s3"] as const, 2),
      m365_in_scope: true,
      file_shares_in_scope: true,
      object_storage_in_scope: rand() < 0.5,
      dfs_in_use: rand() < 0.4,
      estimated_data_volume_tb: 20 + Math.round(rand() * 480),
      sensitive_data_types: some(["pii", "financial", "ip", "credentials"] as const, 2),
      permissions_risk_pattern: pick(["over_permissive", "unknown"] as const),
      classification_already_exists: rand() < 0.3,
      top_priority_repositories: ["Finance share", "HR SharePoint site"],
      primary_db_engine: pick(["sqlserver", "postgres", "oracle"] as const),
      db_hosting_model: pick(["on_prem", "hybrid", "cloud_managed"] as const),
    },
    application_landscape: {
      hris_system: pick(["Workday", "SAP SuccessFactors", "UKG Pro"] as const),
      itsm_platform: pick(["servicenow", "jira"] as const),
      m365_adoption_level: pick(["some", "heavy"] as const),
      critical_saas_apps: ["Salesforce", "ServiceNow", "Slack"],
      integration_preference: pick(["api", "agent_connector"] as const),
      automation_tool_standard: pick(["powershell", "ansible", "terraform"] as const),
      secrets_management_standard: pick(["key_vault", "vault", "aws_secrets"] as const),
    },
    security_architecture: {
      siem_platform: pick(["splunk", "sentinel", "qradar"] as const),
      soar_platform: pick(["xsoar", "sentinel_playbooks", "none"] as const),
      log_retention_days: pick([90, 180, 365] as const),
      immutable_logging_required: rand() < 0.5,
      vuln_mgmt_tool: pick(["tenable", "qualys", "rapid7"] as const),
      mfa_for_privileged_access: true,
      privileged_session_monitoring_required: rand() < 0.6,
      incident_ticketing_flow: pick(["itsm_integrated", "soar_automated", "manual"] as const),
      security_data_sensitivity_constraints: pick(["medium", "high"] as const),
    },
    operations_service_management: {
      change_mgmt_lead_time_days: pick([3, 5, 10] as const),
      maintenance_window: "Saturdays 22:00–02:00 local time",
      monitoring_tool: pick(["datadog", "scom", "prometheus"] as const),
      environments_present: ["dev", "test", "prod"],
    },
    cloud_saas_posture: {
      cloud_providers: some(["aws", "azure", "gcp"] as const, 1),
      region_restrictions: rand() < 0.4 ? ["EU only"] : [],
      tenant_model_preference: pick(["single_tenant", "either"] as const),
    },
  };
}

export type DemoDependencyStatus = "open" | "in_review" | "resolved" | "fail" | "blocked";

/**
 * Status of each of a project's dependencies by its story stage: nothing
 * settled before work starts, some in review mid-way, all resolved once the
 * project is late or won, one failed for a lost project and one blocked for
 * a project on hold or cancelled.
 */
export function planDependencyStatuses(stage: string, count: number): DemoDependencyStatus[] {
  const statuses: DemoDependencyStatus[] = [];
  for (let i = 0; i < count; i++) {
    switch (stage) {
      case "early":
        statuses.push("open");
        break;
      case "mid":
        statuses.push(i === 0 ? "resolved" : i === 1 ? "in_review" : "open");
        break;
      case "late":
      case "won":
        statuses.push("resolved");
        break;
      case "lost":
        statuses.push(i === count - 1 ? "fail" : "resolved");
        break;
      default:
        statuses.push(i === 0 ? "blocked" : "open");
    }
  }
  return statuses;
}

export interface DemoProjectExtrasInput {
  accounts: readonly DemoArtifactAccount[];
  projects: readonly DemoArtifactProject[];
  assumptionIds: readonly number[];
  dependencyIds: readonly number[];
  /** The account's champion (customer-side owner of customer dependencies), by account id. */
  championEmailByAccount: ReadonlyMap<number, string>;
  createdBy: string;
}

/** Seeds profiles, project assumptions and project dependencies; returns the row count. */
export async function seedDemoProjectExtras(input: DemoProjectExtrasInput): Promise<number> {
  let rows = 0;

  // One default discovery profile per account, attached to every project on it.
  for (const [index, account] of input.accounts.entries()) {
    const [profile] = await db
      .insert(infrastructureProfiles)
      .values({
        customerId: account.id,
        profileName: "Discovery call",
        isDefault: true,
        discoveryData: planDiscoveryProfile(account.id + index),
        createdBy: account.ownerId,
      })
      .returning({ id: infrastructureProfiles.id });
    rows++;
    const projectIds = input.projects.filter((p) => p.customerId === account.id).map((p) => p.id);
    if (projectIds.length > 0) {
      await db.update(projects).set({ infrastructureProfileId: profile.id }).where(inArray(projects.id, projectIds));
    }
  }

  for (const project of input.projects) {
    const [firstCriterion] = await db
      .select({ id: successCriteria.id })
      .from(successCriteria)
      .where(eq(successCriteria.projectId, project.id))
      .limit(1);

    if (input.assumptionIds.length > 0) {
      const assumptionRows = input.assumptionIds.slice(0, 2).map((assumptionId, i) => ({
        assumptionId,
        projectId: project.id,
        notes: i === 0 ? "Confirmed with the customer on the kickoff call." : null,
        solutionIds: project.solutionIds,
        createdBy: input.createdBy,
        createdAt: new Date(project.startDate.getTime() + DAY_MS),
      }));
      await db.insert(projectAssumptions).values(assumptionRows);
      rows += assumptionRows.length;
    }

    if (input.dependencyIds.length > 0) {
      const statuses = planDependencyStatuses(project.stage, Math.min(3, input.dependencyIds.length));
      const champion = input.championEmailByAccount.get(project.customerId);
      const dependencyRows = statuses.map((status, i) => ({
        dependencyId: input.dependencyIds[i],
        projectId: project.id,
        status,
        dueDate: new Date(project.startDate.getTime() + (7 + i * 7) * DAY_MS),
        notes: status === "blocked"
          ? "Waiting on the customer's change board."
          : status === "fail"
            ? "Not approved in time for the evaluation."
            : null,
        solutionIds: project.solutionIds,
        successCriteriaIds: i === 0 && firstCriterion ? [firstCriterion.id] : null,
        successCriteriaId: i === 0 && firstCriterion ? firstCriterion.id : null,
        showOnSuccessCriteria: i === 0 && Boolean(firstCriterion),
        // Every demo dependency is a customer action, owned by the champion.
        assignedCustomerEmails: champion ? [champion] : null,
        createdBy: input.createdBy,
        createdAt: new Date(project.startDate.getTime() + DAY_MS),
      }));
      await db.insert(projectDependencies).values(dependencyRows);
      rows += dependencyRows.length;
    }
  }
  return rows;
}
