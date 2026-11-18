import { beforeEach, describe, expect, it, vi } from "vitest";

// section -> level granted to the test user ("view" | "edit")
const grants = vi.hoisted(() => new Map<string, "view" | "edit">());

vi.mock("../section-permissions", () => ({
  userCanViewSection: async (_req: unknown, section: string) => grants.has(section),
  userCanEditSection: async (_req: unknown, section: string) => grants.get(section) === "edit",
}));

import { isPermissionKey } from "@shared/permissions";
import {
  SCHEDULE_ACTION_TYPES,
  SCHEDULE_OWNER_SECTION,
  SCHEDULER_SECTION,
  isScheduleActionType,
  resolveSchedulePermissions,
} from "../schedule-permissions";

describe("resolveSchedulePermissions", () => {
  beforeEach(() => grants.clear());

  it("gives no access without the Scheduler or an owning page", async () => {
    const perms = await resolveSchedulePermissions({});
    for (const type of SCHEDULE_ACTION_TYPES) {
      expect(perms.canView(type)).toBe(false);
      expect(perms.canEdit(type)).toBe(false);
    }
  });

  it("Scheduler view sees every schedule but changes none", async () => {
    grants.set(SCHEDULER_SECTION, "view");
    const perms = await resolveSchedulePermissions({});
    for (const type of SCHEDULE_ACTION_TYPES) {
      expect(perms.canView(type)).toBe(true);
      expect(perms.canEdit(type)).toBe(false);
    }
  });

  it("Scheduler edit can change every schedule, backups included", async () => {
    grants.set(SCHEDULER_SECTION, "edit");
    const perms = await resolveSchedulePermissions({});
    expect(perms.canEdit("database_cleanup")).toBe(true);
    expect(perms.canEdit("email_digest")).toBe(true);
  });

  it("an owning page grants rights for its own type only", async () => {
    grants.set("ai-risk.docs", "edit");
    const perms = await resolveSchedulePermissions({});
    expect(perms.canEdit("docs_sync")).toBe(true);
    expect(perms.canView("docs_sync")).toBe(true);
    expect(perms.canEdit("ai_assessment_analysis")).toBe(false);
    expect(perms.canView("database_cleanup")).toBe(false);
  });

  it("view on an owning page does not allow changes", async () => {
    grants.set("analytics.main", "view");
    const perms = await resolveSchedulePermissions({});
    expect(perms.canView("report_generation")).toBe(true);
    expect(perms.canEdit("report_generation")).toBe(false);
  });

  it("names only pages Role Management can grant", () => {
    expect(isPermissionKey(SCHEDULER_SECTION)).toBe(true);
    for (const section of Object.values(SCHEDULE_OWNER_SECTION)) expect(isPermissionKey(section!)).toBe(true);
  });

  it("types with no owning page need the Scheduler", async () => {
    for (const section of ["config.workflow-automation", "analytics.main", "ai-risk.docs", "config.salesforce"]) {
      grants.set(section, "edit");
    }
    const perms = await resolveSchedulePermissions({});
    expect(perms.canEdit("database_cleanup")).toBe(false);
    expect(perms.canEdit("project_status_check")).toBe(false);
    expect(perms.canEdit("webhook_retry")).toBe(false);
  });

  it("treats a missing action type as an email digest", async () => {
    grants.set("config.workflow-automation", "edit");
    const perms = await resolveSchedulePermissions({});
    expect(perms.canEdit(null)).toBe(true);
    expect(perms.canEdit(undefined)).toBe(true);
  });

  it("refuses unknown action types unless the user has the Scheduler", async () => {
    grants.set("config.workflow-automation", "edit");
    expect((await resolveSchedulePermissions({})).canEdit("drop_tables")).toBe(false);
    grants.set(SCHEDULER_SECTION, "edit");
    expect((await resolveSchedulePermissions({})).canEdit("drop_tables")).toBe(true);
    expect(isScheduleActionType("drop_tables")).toBe(false);
  });
});
