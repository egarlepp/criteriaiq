import { describe, it, expect } from "vitest";
import { planCriteriaTemplate } from "../demo-criteria-templates";

const solution = {
  id: 10,
  name: "Identity Governance",
  icon: "ShieldCheck",
  components: [
    {
      id: 20,
      name: "Access Reviews",
      criteria: [
        { id: 30, name: "Run a quarterly review", outcome: { id: 40, name: "Review closes on time" }, action: { id: 50, name: "Demo the campaign" } },
        { id: 31, name: "Revoke on reject", outcome: { id: 41, name: "Access removed in a day" }, action: { id: 51, name: "Reject an entitlement" } },
      ],
    },
  ],
};

describe("planCriteriaTemplate", () => {
  const plan = planCriteriaTemplate(solution, true);

  it("roots the template at the solution", () => {
    expect(plan.rootSolutionId).toBe(10);
    expect(plan.instanceEntities.solution).toEqual([
      { id: "solution-10-demo", libraryId: 10, type: "solution", name: "Identity Governance" },
    ]);
    expect(plan.isStarred).toBe(true);
  });

  it("keeps library ids on every instance and links the whole chain", () => {
    const e = plan.instanceEntities;
    expect(e.criteria.map((c) => c.libraryId)).toEqual([30, 31]);
    expect(e.outcome.map((o) => o.libraryId)).toEqual([40, 41]);
    expect(e.action.map((a) => a.libraryId)).toEqual([50, 51]);
    const ids = new Set([...e.solution, ...e.component, ...e.criteria, ...e.outcome, ...e.action].map((x) => x.id));
    for (const link of e.links) {
      expect(ids.has(link.fromId)).toBe(true);
      expect(ids.has(link.toId)).toBe(true);
    }
    const types = e.links.map((l) => l.type);
    expect(types.filter((t) => t === "solution-component")).toHaveLength(1);
    expect(types.filter((t) => t === "component-criteria")).toHaveLength(2);
    expect(types.filter((t) => t === "criteria-outcome")).toHaveLength(2);
    expect(types.filter((t) => t === "outcome-action")).toHaveLength(2);
  });
});
