import { describe, expect, it } from "vitest";
import { canCompleteCustomerAction, compareCustomerActions, customerActionsFromMap, isCustomerAction, mapSharedWithOutsideUsers, type CustomerActionTaskInput } from "../customer-actions";

const task = (over: Partial<CustomerActionTaskInput>): CustomerActionTaskInput => ({
  id: 1,
  name: "Task",
  status: "not_started",
  stepId: 10,
  teamOwned: null,
  assignedToCustomerUserId: null,
  dueDate: null,
  ...over,
});

describe("isCustomerAction", () => {
  it("counts a customer owner or a customer team", () => {
    expect(isCustomerAction(task({ assignedToCustomerUserId: "u1" }))).toBe(true);
    expect(isCustomerAction(task({ teamOwned: "Customer" }))).toBe(true);
    expect(isCustomerAction(task({ teamOwned: "Customer IT Security" }))).toBe(true);
    expect(isCustomerAction(task({ teamOwned: "client team" }))).toBe(true);
  });

  it("ignores internal-only tasks and the N/A team", () => {
    expect(isCustomerAction(task({}))).toBe(false);
    expect(isCustomerAction(task({ teamOwned: "N/A" }))).toBe(false);
    expect(isCustomerAction(task({ teamOwned: "  " }))).toBe(false);
    expect(isCustomerAction(task({ teamOwned: "Internal" }))).toBe(false);
    expect(isCustomerAction(task({ teamOwned: "IT Security" }))).toBe(false);
  });

  it("ignores finished, cancelled and deferred tasks", () => {
    for (const status of ["complete", "completed", "cancelled", "deferred"]) {
      expect(isCustomerAction(task({ status, assignedToCustomerUserId: "u1" }))).toBe(false);
    }
    expect(isCustomerAction(task({ status: "blocked", assignedToCustomerUserId: "u1" }))).toBe(true);
  });
});

describe("customerActionsFromMap", () => {
  const today = new Date("2026-11-05T15:00:00Z");
  const steps = [{ id: 10, name: "Configure" }];

  it("sorts overdue first, then by due date, undated last", () => {
    const result = customerActionsFromMap(
      {
        steps,
        tasks: [
          task({ id: 1, name: "No date", teamOwned: "Customer" }),
          task({ id: 2, name: "Later", teamOwned: "Customer", dueDate: "2026-11-20T00:00:00Z" }),
          task({ id: 3, name: "Overdue 4", teamOwned: "Customer", dueDate: "2026-11-01T00:00:00Z" }),
          task({ id: 4, name: "Soon", teamOwned: "Customer", dueDate: "2026-11-07T00:00:00Z" }),
          task({ id: 5, name: "Internal", dueDate: "2026-10-01T00:00:00Z" }),
        ],
      },
      today,
    );
    expect(result.map((a) => a.taskId)).toEqual([3, 4, 2, 1]);
    expect(result[0]).toMatchObject({ daysOverdue: 4, stepName: "Configure", team: "Customer", dueDate: "2026-11-01" });
    expect(result[1].daysOverdue).toBe(0);
  });

  it("returns nothing for an empty plan", () => {
    expect(customerActionsFromMap({ steps: [], tasks: [] }, today)).toEqual([]);
  });
});

describe("compareCustomerActions", () => {
  it("orders rows from several projects the same way as one plan", () => {
    const rows = [
      { name: "b", dueDate: null, daysOverdue: 0 },
      { name: "a", dueDate: "2026-11-10", daysOverdue: 0 },
      { name: "c", dueDate: "2026-11-01", daysOverdue: 4 },
      { name: "d", dueDate: "2026-10-20", daysOverdue: 16 },
    ];
    expect([...rows].sort(compareCustomerActions).map((r) => r.name)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("mapSharedWithOutsideUsers", () => {
  it("is shared by default", () => {
    expect(mapSharedWithOutsideUsers(null)).toBe(true);
    expect(mapSharedWithOutsideUsers({})).toBe(true);
  });

  it("is hidden when the deliverables area or the MAP tab is hidden", () => {
    expect(mapSharedWithOutsideUsers({ cardVisible: false })).toBe(false);
    expect(mapSharedWithOutsideUsers({ cardVisible: true, tabs: { map: false } })).toBe(false);
    expect(mapSharedWithOutsideUsers({ cardVisible: true, tabs: { map: true } })).toBe(true);
  });
});

describe("canCompleteCustomerAction", () => {
  const teamTask = { teamOwned: "Customer", assignedToCustomerUserId: null };
  const mine = { teamOwned: null, assignedToCustomerUserId: "c1" };
  const colleagues = { teamOwned: "Customer", assignedToCustomerUserId: "c2" };
  const internalTask = { teamOwned: "Internal", assignedToCustomerUserId: null };

  it("lets an outside user tick their own or the customer team's unassigned tasks", () => {
    expect(canCompleteCustomerAction({ task: mine, userId: "c1", isExternal: true, hasEditAccess: false })).toBe(true);
    expect(canCompleteCustomerAction({ task: teamTask, userId: "c1", isExternal: true, hasEditAccess: false })).toBe(true);
  });

  it("keeps a colleague's task and internal tasks out of an outside user's reach", () => {
    expect(canCompleteCustomerAction({ task: colleagues, userId: "c1", isExternal: true, hasEditAccess: false })).toBe(false);
    expect(canCompleteCustomerAction({ task: internalTask, userId: "c1", isExternal: true, hasEditAccess: true })).toBe(false);
  });

  it("lets staff tick customer tasks only with edit access", () => {
    expect(canCompleteCustomerAction({ task: colleagues, userId: "s1", isExternal: false, hasEditAccess: true })).toBe(true);
    expect(canCompleteCustomerAction({ task: colleagues, userId: "s1", isExternal: false, hasEditAccess: false })).toBe(false);
    expect(canCompleteCustomerAction({ task: internalTask, userId: "s1", isExternal: false, hasEditAccess: true })).toBe(false);
  });
});
