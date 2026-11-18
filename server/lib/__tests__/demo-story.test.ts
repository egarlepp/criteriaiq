import { describe, it, expect } from "vitest";
import { faker } from "@faker-js/faker";
import { GapTypeEnum, GapStatusEnum, GapCriticalityEnum, CancelledReasonCodeEnum } from "@shared/schema";
import {
  DEMO_MAP_PLAN,
  DEMO_USER_EMAIL_DOMAIN,
  fakeCrmIds,
  forecastCategoryFor,
  isDemoUserEmail,
  planCriteria,
  planDemoStatuses,
  planAccountStatuses,
  accountStatusFits,
  planGaps,
  planMapItems,
  criterionPriorityFor,
  demoAgreementFor,
  validationProgress,
  planOutcome,
  planRiskAssessment,
  riskLevelFor,
  salesStageFor,
  stageForStatus,
} from "../demo-story";
import { DEMO_CATALOG } from "../demo-library";

const calendar = { holidays: new Set<string>() };

describe("stageForStatus", () => {
  it("reads the stage from the Internal Status name", () => {
    expect(stageForStatus("Closed Won")).toBe("won");
    expect(stageForStatus("Closed Lost")).toBe("lost");
    expect(stageForStatus("TCC Stage")).toBe("late");
    expect(stageForStatus("In Progress")).toBe("mid");
    expect(stageForStatus("Planning")).toBe("early");
    expect(stageForStatus("Something custom")).toBe("other");
  });
});

describe("planMapItems", () => {
  const window = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-11-30T00:00:00Z") };

  it("puts every start and due date on a working day, in order", () => {
    const items = planMapItems(12, window, "mid", calendar);
    expect(items).toHaveLength(12);
    for (const item of items) {
      expect([0, 6]).not.toContain(item.startDate.getUTCDay());
      expect([0, 6]).not.toContain(item.dueDate.getUTCDay());
      expect(item.dueDate.getTime()).toBeGreaterThanOrEqual(item.startDate.getTime());
    }
    for (let i = 1; i < items.length; i++) {
      expect(items[i].startDate.getTime()).toBeGreaterThan(items[i - 1].startDate.getTime());
    }
  });

  it("completes everything for a won project and part of an open one", () => {
    expect(planMapItems(8, window, "won", calendar).every((i) => i.status === "complete")).toBe(true);
    const mid = planMapItems(20, window, "mid", calendar);
    const done = mid.filter((i) => i.status === "complete").length;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(20);
    expect(mid.some((i) => i.status === "in_progress")).toBe(true);
    expect(mid.filter((i) => i.status === "complete").every((i) => i.completedDate !== null)).toBe(true);
  });

  it("never starts an item after one that hasn't started", () => {
    for (const stage of ["early", "mid", "late", "won", "lost", "other"] as const) {
      const items = planMapItems(24, window, stage, calendar);
      const firstWaiting = items.findIndex((i) => i.status === "not_started");
      if (firstWaiting === -1) continue;
      expect(items.slice(firstWaiting).every((i) => i.status === "not_started")).toBe(true);
    }
  });

  it("returns nothing for zero items", () => {
    expect(planMapItems(0, window, "mid", calendar)).toEqual([]);
  });
});

describe("criterionPriorityFor", () => {
  it("makes the last third nice-to-haves and the rest must-haves", () => {
    expect(Array.from({ length: 6 }, (_, i) => criterionPriorityFor(i, 6))).toEqual([
      "must_have", "must_have", "must_have", "must_have", "nice_to_have", "nice_to_have",
    ]);
    expect(Array.from({ length: 4 }, (_, i) => criterionPriorityFor(i, 4))).toEqual([
      "must_have", "must_have", "must_have", "nice_to_have",
    ]);
  });

  it("keeps every criterion a must-have below three", () => {
    expect([0, 1].map((i) => criterionPriorityFor(i, 2))).toEqual(["must_have", "must_have"]);
  });
});

describe("demoAgreementFor", () => {
  it("waits on the customer while planning, and has the criteria agreed once planning is done", () => {
    for (let seed = 0; seed < 20; seed++) {
      faker.seed(seed);
      expect(demoAgreementFor("early", false)).toBe("sent");
      expect(demoAgreementFor("mid", false)).toBe("sent");
      expect(demoAgreementFor("late", true)).toBe("agreed");
      expect(demoAgreementFor("won", true)).toBe("agreed");
      expect(demoAgreementFor("lost", true)).toBe("agreed");
      expect(["agreed", "changed"]).toContain(demoAgreementFor("mid", true));
    }
  });
});

describe("validationProgress", () => {
  it("reads a phase's planned items", () => {
    expect(validationProgress([])).toEqual({ share: 0, started: false, ended: false });
    expect(validationProgress([{ status: "complete" }, { status: "in_progress" }, { status: "not_started" }, { status: "complete" }]))
      .toEqual({ share: 0.5, started: true, ended: false });
    expect(validationProgress([{ status: "complete" }]).ended).toBe(true);
  });
});

describe("planCriteria", () => {
  it("uses only status values the criteria form offers", () => {
    faker.seed(7);
    const allowed = new Set(["pending", "in_progress", "complete", "fail", "at_risk"]);
    for (const stage of ["early", "mid", "late", "won", "lost", "other"] as const) {
      const rows = planCriteria(stage);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(rows.length).toBeLessThanOrEqual(6);
      for (const row of rows) expect(allowed.has(row.status)).toBe(true);
    }
  });

  it("marks every criterion met on a won project", () => {
    expect(planCriteria("won").every((c) => c.status === "complete")).toBe(true);
  });

  it("follows the phase that tests them: nothing met before it starts, every must-have once it ends", () => {
    for (let seed = 0; seed < 20; seed++) {
      faker.seed(seed);
      const before = planCriteria("mid", undefined, { share: 0, started: false, ended: false });
      expect(before.every((c) => c.status === "pending")).toBe(true);
      const after = planCriteria("late", undefined, { share: 1, started: true, ended: true });
      after.forEach((c, i) => {
        if (criterionPriorityFor(i, after.length) === "must_have") expect(c.status).toBe("complete");
        else expect(["complete", "fail"]).toContain(c.status);
      });
    }
  });

  it("fails one or two must-haves on a lost project", () => {
    for (let seed = 0; seed < 20; seed++) {
      faker.seed(seed);
      const rows = planCriteria("lost", undefined, { share: 0.6, started: true, ended: false });
      const failedMust = rows.filter((c, i) => c.status === "fail" && criterionPriorityFor(i, rows.length) === "must_have");
      expect(failedMust.length).toBeGreaterThanOrEqual(1);
      expect(failedMust.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("planOutcome", () => {
  it("records won and lost outcomes with reason codes the outcome dialog knows", () => {
    expect(planOutcome("won")?.outcomeType).toBe("won");
    expect(["Technical Fit", "Business Need", "Competitive Displacement", "Relationship"]).toContain(planOutcome("won")?.primaryReasonCode);
    expect(planOutcome("lost")?.outcomeType).toBe("lost");
    expect(planOutcome("mid")).toBeNull();
  });

  it("records a cancelled outcome for a cancelled project", () => {
    const o = planOutcome("lost", "Cancelled");
    expect(o?.outcomeType).toBe("cancelled");
    expect(CancelledReasonCodeEnum.options).toContain(o?.primaryReasonCode);
  });
});

const STATUSES = ["Planning", "In Progress", "Completed", "TCC", "Closed Won", "Closed Lost", "On Hold", "Cancelled"];

describe("planDemoStatuses", () => {
  it("returns exactly one configured status per project", () => {
    for (const total of [1, 7, 20, 53]) {
      const out = planDemoStatuses(STATUSES, total);
      expect(out).toHaveLength(total);
      for (const s of out) expect(STATUSES).toContain(s);
    }
  });

  it("gives a 20-project seed won, lost and open projects every time", () => {
    for (let seed = 0; seed < 25; seed++) {
      faker.seed(seed);
      const stages = planDemoStatuses(STATUSES, 20).map(stageForStatus);
      expect(stages.filter((s) => s === "won").length).toBeGreaterThanOrEqual(4);
      expect(stages.filter((s) => s === "lost").length).toBeGreaterThanOrEqual(2);
      expect(stages.filter((s) => s === "mid").length).toBeGreaterThanOrEqual(5);
    }
  });

  it("uses every configured status once there are enough projects, and falls back with none configured", () => {
    for (let seed = 0; seed < 25; seed++) {
      faker.seed(seed);
      expect(new Set(planDemoStatuses(STATUSES, 8))).toEqual(new Set(STATUSES));
      expect(new Set(planDemoStatuses(STATUSES, 12))).toEqual(new Set(STATUSES));
    }
    expect(new Set(planDemoStatuses(STATUSES, 3)).size).toBe(3);
    expect(planDemoStatuses([], 3)).toEqual(["In Progress", "In Progress", "In Progress"]);
    expect(planDemoStatuses(["Only One"], 4)).toEqual(["Only One", "Only One", "Only One", "Only One"]);
  });
});

const ACCOUNT_STATUSES = ["Need Assistance", "Evaluating Other Vendors", "Pending Internal Feedback", "In CAB", "On Time",
  "Delayed", "Complete", "On Hold", "Selecting Solution"];

describe("planAccountStatuses", () => {
  it("uses every Account Status in a 12-project seed, each next to an Internal Status it fits", () => {
    for (let seed = 0; seed < 50; seed++) {
      faker.seed(seed);
      const internal = planDemoStatuses(STATUSES, 12);
      const account = planAccountStatuses(internal, ACCOUNT_STATUSES);
      expect(new Set(account)).toEqual(new Set(ACCOUNT_STATUSES));
      account.forEach((a, i) => expect(accountStatusFits(a, stageForStatus(internal[i]))).toBe(true));
    }
  });

  it("never pairs a won project with a paused account, or an open one with Complete", () => {
    expect(accountStatusFits("On Hold", stageForStatus("Closed Won"))).toBe(false);
    expect(accountStatusFits("Complete", stageForStatus("In Progress"))).toBe(false);
    expect(accountStatusFits("On Hold", stageForStatus("On Hold"))).toBe(true);
    expect(accountStatusFits("Something custom", stageForStatus("Planning"))).toBe(true);
    expect(planAccountStatuses(["Planning"], [])).toEqual(["On Time"]);
  });
});

describe("sales stage and forecast category", () => {
  it("track the project stage", () => {
    expect(salesStageFor("won")).toBe("Closed Won");
    expect(salesStageFor("lost")).toBe("Closed Lost");
    expect(forecastCategoryFor("won")).toBe("Closed");
    expect(forecastCategoryFor("lost")).toBe("Omitted");
  });
});

describe("planGaps", () => {
  it("uses only the type, status and criticality values the gap form offers", () => {
    faker.seed(11);
    for (const stage of ["mid", "late", "won", "lost", "other"] as const) {
      for (const gap of planGaps(stage, "Identity Governance", ["Lifecycle Management"])) {
        expect(GapTypeEnum.options).toContain(gap.gapType);
        expect(GapStatusEnum.options).toContain(gap.status);
        expect(GapCriticalityEnum.options).toContain(gap.criticality);
        expect(gap.impactedSolution).toBe("Identity Governance");
      }
    }
    expect(planGaps("early", "Identity Governance", [])).toEqual([]);
  });
});

describe("planRiskAssessment", () => {
  it("scores every criterion and uses the engine's risk levels", () => {
    const names = ["Timeline Risk", "Customer Engagement Risk"];
    const { previous, latest } = planRiskAssessment("lost", names);
    for (const run of [previous, latest]) {
      expect(Object.keys(run.criteriaScores).sort()).toEqual([...names].sort());
      expect(run.riskLevel).toBe(riskLevelFor(run.overallRiskScore));
    }
    expect(latest.overallRiskScore).toBeGreaterThanOrEqual(55);
    expect(riskLevelFor(80)).toBe("critical");
    expect(riskLevelFor(51)).toBe("high");
    expect(riskLevelFor(26)).toBe("medium");
    expect(riskLevelFor(25)).toBe("low");
  });
});

describe("DEMO_CATALOG", () => {
  it("links every criterion to one of its solution's value mappings", () => {
    for (const sol of DEMO_CATALOG) {
      expect(sol.plan.steps.length).toBeGreaterThan(0);
      for (const comp of sol.components) {
        for (const c of comp.criteria) expect(sol.valueMappings[c.value]).toBeDefined();
      }
    }
  });
});

describe("fakeCrmIds", () => {
  it("formats ids for the CRM the install uses", () => {
    const sf = fakeCrmIds("salesforce");
    expect(sf?.crmOpportunityId).toMatch(/^006[A-Za-z0-9]{15}$/);
    expect(sf?.crmAccountId).toMatch(/^001[A-Za-z0-9]{15}$/);
    const hs = fakeCrmIds("hubspot");
    expect(hs?.crmOpportunityId).toMatch(/^\d{11}$/);
    expect(fakeCrmIds("none")).toBeNull();
  });
});

describe("demo users", () => {
  it("recognizes only the reserved demo domain", () => {
    expect(isDemoUserEmail(`jordan.rivera@${DEMO_USER_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoUserEmail("jordan.rivera@example.com")).toBe(false);
    expect(isDemoUserEmail(`someone@not${DEMO_USER_EMAIL_DOMAIN}.com`)).toBe(false);
    expect(isDemoUserEmail(null)).toBe(false);
  });

  it("has a full plan for the largest map depth (5)", () => {
    expect(DEMO_MAP_PLAN).toHaveLength(5);
    for (const phase of DEMO_MAP_PLAN) {
      expect(phase.steps).toHaveLength(5);
      for (const step of phase.steps) expect(step.tasks).toHaveLength(5);
    }
  });
});
