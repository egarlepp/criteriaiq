import { describe, it, expect, vi, beforeEach } from "vitest";

const getProjectById = vi.fn();
const getUser = vi.fn();
const createUserNotifications = vi.fn(async (rows: unknown[]) => rows.length);
const hasProjectAccess = vi.fn(async () => true);
const hasCustomerAccess = vi.fn(async () => true);
const getTeam = vi.fn();
const listTeamMemberIds = vi.fn();

vi.mock("../../storage", () => ({ storage: { getProjectById, getUser, createUserNotifications, getTeam, listTeamMemberIds } }));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess }));
vi.mock("../../lib/customer-access", () => ({ hasCustomerAccess }));
vi.mock("../../webhooks/webhook-service", () => ({ webhookService: { deliverToSubscribers: vi.fn().mockResolvedValue([]) } }));

const { planNotification, notifyForEvent, internalTeamIds, customerUserIds, planSupportRequestNotifications, notifyUsers } =
  await import("../notifications");

const project = {
  id: 7,
  solutionName: "Acme POC",
  customerName: "Acme",
  primaryEngineerId: "pe",
  specialistEngineerId: "se",
  supportingEngineers: ["sup1"],
  additionalSupportingTeam: ["ast"],
  accountRepresentativeId: "rep",
  opportunityEngineerId: null,
  tccUserId: null,
  customerUsers: [{ id: "cust1", email: "c@acme.test" }, { userId: "cust2" }],
};

const users: Record<string, { id: string; role: string; email: string; isActive: boolean; isApproved: boolean }> = {
  pe: { id: "pe", role: "Engineer", email: "pe@x.test", isActive: true, isApproved: true },
  se: { id: "se", role: "Engineer", email: "se@x.test", isActive: true, isApproved: true },
  sup1: { id: "sup1", role: "Sales", email: "s@x.test", isActive: true, isApproved: true },
  ast: { id: "ast", role: "Engineer", email: "a@x.test", isActive: false, isApproved: true },
  rep: { id: "rep", role: "Sales", email: "r@x.test", isActive: true, isApproved: true },
  cust1: { id: "cust1", role: "Customer", email: "c@acme.test", isActive: true, isApproved: true },
  cust2: { id: "cust2", role: "Customer", email: "c2@acme.test", isActive: true, isApproved: true },
};

beforeEach(() => {
  getProjectById.mockReset().mockResolvedValue(project);
  getUser.mockReset().mockImplementation(async (id: string) => users[id]);
  createUserNotifications.mockClear();
  hasProjectAccess.mockReset().mockResolvedValue(true);
  hasCustomerAccess.mockReset().mockResolvedValue(true);
  getTeam.mockReset().mockResolvedValue({ id: 5, name: "Solutions Engineering" });
  listTeamMemberIds.mockReset().mockResolvedValue(["pe", "se", "cust1", "ast"]);
});

function written(): Array<{ userId: string; kind: string; linkPath: string }> {
  return (createUserNotifications.mock.calls.at(-1)?.[0] ?? []) as Array<{ userId: string; kind: string; linkPath: string }>;
}

describe("team helpers", () => {
  it("collects the internal team and customer users", () => {
    expect(internalTeamIds(project)).toEqual(["pe", "se", "sup1", "ast", "rep"]);
    expect(customerUserIds(project)).toEqual(["cust1", "cust2"]);
  });
});

describe("planNotification", () => {
  it("ignores events that notify nobody", () => {
    expect(planNotification({ triggerKey: "project.updated", projectId: 7 }, project)).toBeNull();
    expect(planNotification({ triggerKey: "map.task.assigned", projectId: 7, metadata: {} }, project)).toBeNull();
  });

  it("links MAP assignments to the MAP tab with the item's name", () => {
    const plan = planNotification(
      { triggerKey: "map.step.assigned", projectId: 7, metadata: { assignedTo: "cust1", stepName: "Install" } },
      project,
    );
    expect(plan).toMatchObject({
      kind: "map_item_assigned",
      candidates: ["cust1"],
      linkPath: "/project/7?tab=map",
      params: { itemType: "step", itemName: "Install", projectName: "Acme POC" },
    });
  });

  it("keeps status changes internal", () => {
    const plan = planNotification(
      { triggerKey: "project.status_changed", projectId: 7, metadata: { oldStatus: "Planning", newStatus: "Active" } },
      project,
    );
    expect(plan?.internalOnly).toBe(true);
    expect(plan?.params).toMatchObject({ oldStatus: "Planning", newStatus: "Active" });
  });
});

describe("notifyForEvent", () => {
  it("tells the team and customer users about a completed criterion, never the actor or inactive users", async () => {
    await notifyForEvent({ triggerKey: "criteria.completed", projectId: 7, userId: "pe", metadata: { criterionName: "SSO" } });
    expect(written().map((r) => r.userId).sort()).toEqual(["cust1", "cust2", "rep", "se", "sup1"]);
    expect(written()[0]).toMatchObject({ kind: "criterion_completed", linkPath: "/project/7?tab=success-criteria" });
  });

  it("never tells outside users about status changes", async () => {
    await notifyForEvent({ triggerKey: "project.status_changed", projectId: 7, userId: "rep", metadata: { newStatus: "Active" } });
    expect(written().map((r) => r.userId).sort()).toEqual(["pe", "se", "sup1"]);
  });

  it("drops anyone who can't open the project", async () => {
    hasProjectAccess.mockImplementation(async (id: string) => id !== "cust2");
    await notifyForEvent({ triggerKey: "criteria.completed", projectId: 7, userId: "pe", metadata: {} });
    expect(written().map((r) => r.userId)).not.toContain("cust2");
  });

  it("tells every member of the new Our team who can open the project, internal users only", async () => {
    hasProjectAccess.mockImplementation(async (id: string) => id !== "se");
    await notifyForEvent({
      triggerKey: "map.task.team_assigned",
      projectId: 7,
      userId: "pe",
      metadata: { assignedTeamId: 5, taskName: "Install agent" },
    });
    // pe is the actor, se can't open the project, cust1 is external, ast is inactive.
    expect(written()).toHaveLength(0);
    hasProjectAccess.mockResolvedValue(true);
    listTeamMemberIds.mockResolvedValue(["pe", "se", "sup1"]);
    await notifyForEvent({
      triggerKey: "map.task.team_assigned",
      projectId: 7,
      userId: "pe",
      metadata: { assignedTeamId: 5, taskName: "Install agent" },
    });
    expect(written().map((r) => r.userId).sort()).toEqual(["se", "sup1"]);
    expect(written()[0]).toMatchObject({
      kind: "map_item_team_assigned",
      linkPath: "/project/7?tab=map",
      params: { teamName: "Solutions Engineering", itemType: "task", itemName: "Install agent" },
    });
  });

  it("writes nothing for a team that no longer exists", async () => {
    getTeam.mockResolvedValue(null);
    await notifyForEvent({ triggerKey: "map.step.team_assigned", projectId: 7, userId: "pe", metadata: { assignedTeamId: 99 } });
    expect(createUserNotifications).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    getProjectById.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyForEvent({ triggerKey: "criteria.completed", projectId: 7 })).resolves.toBe(0);
    err.mockRestore();
  });
});

describe("support and evaluation requests", () => {
  const before = { id: 3, title: "Login broken", status: "Not Started", customerId: 9, submittedByUserId: "cust1", assignedToUserId: null };

  it("tells the submitter about a status change and the new assignee about an assignment", () => {
    const plans = planSupportRequestNotifications(before, { ...before, status: "In Progress", assignedToUserId: "se" }, "pe");
    expect(plans.map((p) => [p.kind, p.recipients])).toEqual([
      ["support_request_status_changed", ["cust1"]],
      ["support_request_assigned", ["se"]],
    ]);
    expect(planSupportRequestNotifications(before, { ...before, title: "Renamed" }, "pe")).toEqual([]);
  });

  it("skips the actor and anyone who can't open the account", async () => {
    hasCustomerAccess.mockImplementation(async (id: string) => id !== "cust2");
    await notifyUsers({
      kind: "evaluation_request_submitted",
      recipients: ["rep", "pe", "cust2", null],
      actorUserId: "pe",
      customerId: 9,
      params: {},
      linkPath: "/x",
    });
    expect(written().map((r) => r.userId)).toEqual(["rep"]);
  });
});
