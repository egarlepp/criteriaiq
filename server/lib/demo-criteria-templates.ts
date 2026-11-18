// Demo Mode: Criteria Builder templates. Each demo solution gets one
// template that walks its library (solution → component → criteria →
// expected outcome → action taken), in the same instance-entity format the
// builder saves (client/src/components/validation-criteria/
// ValidationCriteriaTemplateBuilder.tsx). The demo project templates and the
// demo projects of that solution point at it, so Criteria Builder shows
// usage. Templates carry is_demo (migration 135) and go with the wipe.
// See docs/admin/demo-mode.md.

import { inArray } from "drizzle-orm";
import { db } from "../db";
import { projects, validationCriteriaTemplates } from "@shared/schema";
import type { DemoSolution } from "./demo-library";

type TemplateEntity = {
  id: string;
  libraryId: number;
  type: "solution" | "component" | "criteria" | "outcome" | "action";
  name: string;
};

type TemplateLink = { fromId: string; toId: string; type: string };

export interface DemoCriteriaTemplatePlan {
  name: string;
  description: string;
  icon: string;
  rootSolutionId: number;
  isStarred: boolean;
  instanceEntities: {
    solution: TemplateEntity[];
    component: TemplateEntity[];
    criteria: TemplateEntity[];
    outcome: TemplateEntity[];
    action: TemplateEntity[];
    links: TemplateLink[];
  };
}

/** Pure: the template for one demo solution. Instance ids are stable per library id. */
export function planCriteriaTemplate(
  solution: Pick<DemoSolution, "id" | "name" | "icon" | "components">,
  starred: boolean,
): DemoCriteriaTemplatePlan {
  const entity = (type: TemplateEntity["type"], libraryId: number, name: string): TemplateEntity => ({
    id: `${type}-${libraryId}-demo`,
    libraryId,
    type,
    name,
  });
  const root = entity("solution", solution.id, solution.name);
  const plan: DemoCriteriaTemplatePlan = {
    name: `${solution.name} evaluation criteria`,
    description: `The standard ${solution.name} success criteria, with the outcome each one proves and the action that shows it.`,
    icon: solution.icon,
    rootSolutionId: solution.id,
    isStarred: starred,
    instanceEntities: { solution: [root], component: [], criteria: [], outcome: [], action: [], links: [] },
  };
  const { instanceEntities: e } = plan;
  for (const comp of solution.components) {
    const component = entity("component", comp.id, comp.name);
    e.component.push(component);
    e.links.push({ fromId: root.id, toId: component.id, type: "solution-component" });
    for (const c of comp.criteria) {
      const criterion = entity("criteria", c.id, c.name);
      const outcome = entity("outcome", c.outcome.id, c.outcome.name);
      const action = entity("action", c.action.id, c.action.name);
      e.criteria.push(criterion);
      e.outcome.push(outcome);
      e.action.push(action);
      e.links.push(
        { fromId: component.id, toId: criterion.id, type: "component-criteria" },
        { fromId: criterion.id, toId: outcome.id, type: "criteria-outcome" },
        { fromId: outcome.id, toId: action.id, type: "outcome-action" },
      );
    }
  }
  return plan;
}

export interface DemoCriteriaTemplate {
  id: number;
  name: string;
}

/**
 * Seeds one template per demo solution (the first is starred) and points
 * the demo projects whose first solution it is at it. Returns the template
 * of each solution, by solution id.
 */
export async function seedDemoCriteriaTemplates(
  solutions: readonly DemoSolution[],
  demoProjects: ReadonlyArray<{ id: number; solutionIds: readonly number[] }>,
  createdBy: string,
): Promise<Map<number, DemoCriteriaTemplate>> {
  const bySolution = new Map<number, DemoCriteriaTemplate>();
  for (const [index, solution] of solutions.entries()) {
    const plan = planCriteriaTemplate(solution, index === 0);
    const [row] = await db
      .insert(validationCriteriaTemplates)
      .values({
        ...plan,
        isActive: true,
        isSystem: false,
        isDemo: true,
        createdBy,
        updatedBy: createdBy,
      })
      .returning({ id: validationCriteriaTemplates.id, name: validationCriteriaTemplates.name });
    bySolution.set(solution.id, row);
    const projectIds = demoProjects.filter((p) => p.solutionIds[0] === solution.id).map((p) => p.id);
    if (projectIds.length > 0) {
      await db.update(projects).set({ validationCriteriaTemplateId: row.id }).where(inArray(projects.id, projectIds));
    }
  }
  return bySolution;
}
