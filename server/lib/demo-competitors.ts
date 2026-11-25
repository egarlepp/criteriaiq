// Demo Mode Competitor Intelligence: two generic technology spaces and a
// handful of fictional competitors, linked to the demo solutions, demo
// projects and demo accounts. Fresh installs seed no competitor data, so
// this is the only place the page gets sample content. Spaces and
// competitors are is_demo = true (migration 119), so Demo Mode shows only
// these and the real library never does. demo-wipe.ts removes them; their
// space, solution, activity, project and account links cascade.
import { inArray } from "drizzle-orm";
import { db } from "../db";
import {
  technologySpaces,
  competitors,
  competitorSpaces,
  competitorSolutions,
  competitorActivity,
  projectCompetitors,
  customerCompetitors,
} from "@shared/schema";
import type { DemoSolution } from "./demo-library";
import { trimEdgeChar } from "@shared/trim-edge";

interface DemoSpaceDef {
  code: string;
  name: string;
  description: string;
  color: string;
}

interface DemoCompetitorDef {
  name: string;
  /** Space codes; the first is the primary space. */
  spaces: readonly string[];
  /** Demo solution abbreviations this competitor goes up against. */
  solutions: readonly string[];
  vendorType: string;
  pricingPosition: string;
  companySizeBand: string;
  deploymentModel: string;
  hqRegion: string;
  summary: string;
  strengths: string;
  weaknesses: string;
  counterPositioning: string;
}

export const DEMO_SPACES: readonly DemoSpaceDef[] = [
  {
    code: "IAM",
    name: "Identity & Access",
    description: "Who has access to what, how it is granted, reviewed and removed.",
    color: "#3b82f6",
  },
  {
    code: "DATA",
    name: "Data Protection",
    description: "Finding sensitive data and controlling who can reach it.",
    color: "#10b981",
  },
];

// Fictional vendors. Names carry the "[demo]" prefix like every other demo
// row, so they never read as a real company.
export const DEMO_COMPETITORS: readonly DemoCompetitorDef[] = [
  {
    name: "Bluepeak Security",
    spaces: ["IAM", "DATA"],
    solutions: ["IGA", "AAN"],
    vendorType: "Platform",
    pricingPosition: "Premium",
    companySizeBand: "Enterprise",
    deploymentModel: "SaaS",
    hqRegion: "North America",
    summary: "Broad security platform that bundles identity and data controls into one large contract.",
    strengths: "Single vendor for many controls; strong executive relationships.",
    weaknesses: "Long deployments; identity features trail the specialists.",
    counterPositioning: "Lead with time to value: show a working access review in the first two weeks.",
  },
  {
    name: "Keystone Access",
    spaces: ["IAM"],
    solutions: ["PAM"],
    vendorType: "Point Product",
    pricingPosition: "Mid",
    companySizeBand: "Mid-market",
    deploymentModel: "Hybrid",
    hqRegion: "Europe",
    summary: "Privileged access tool popular with mid-sized IT teams.",
    strengths: "Quick to install; familiar to administrators.",
    weaknesses: "No governance or reviews; limited cloud coverage.",
    counterPositioning: "Show privileged access tied to reviews and leaver processes, not a standalone vault.",
  },
  {
    name: "Harborline Data",
    spaces: ["DATA"],
    solutions: ["AAN"],
    vendorType: "Point Product",
    pricingPosition: "Budget",
    companySizeBand: "Mid-market",
    deploymentModel: "SaaS",
    hqRegion: "North America",
    summary: "Low-cost data discovery and classification service.",
    strengths: "Low entry price; fast discovery scans.",
    weaknesses: "Finds data but cannot fix who has access to it.",
    counterPositioning: "Pair discovery with access remediation; ask how findings get closed today.",
  },
];

/** A demo project as the competitor seed needs it. */
export interface DemoCompetitorProject {
  id: number;
  customerId: number;
  /** Demo solution ids the project validates. */
  solutionIds: number[];
  closed: boolean;
}

export interface DemoCompetitorResult {
  spaces: number;
  competitors: number;
  projectLinks: number;
  accountLinks: number;
}

/** `wanted`, or the first free variant of it, within the 10-character column. */
function freeCode(wanted: string, taken: Set<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; n < 100; n++) {
    const candidate = `${wanted.slice(0, 10 - String(n).length)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`[demo-mode] no free technology space code for ${wanted}`);
}

function toSlug(name: string): string {
  return trimEdgeChar(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "-");
}

export async function seedDemoCompetitors(
  solutions: readonly DemoSolution[],
  demoProjects: readonly DemoCompetitorProject[],
  createdByUserId: string,
): Promise<DemoCompetitorResult> {
  // Codes are unique across real and demo rows; a real space may already
  // use one, so the demo copy takes the next free variant.
  const takenCodes = new Set(
    (await db.select({ code: technologySpaces.code }).from(technologySpaces)).map((r) => r.code),
  );
  const spaceRows = await db
    .insert(technologySpaces)
    .values(DEMO_SPACES.map((sp, i) => {
      const code = freeCode(sp.code, takenCodes);
      takenCodes.add(code);
      return {
        code,
        name: sp.name,
        description: sp.description,
        color: sp.color,
        displayOrder: i + 1,
        isActive: true,
        isDemo: true,
      };
    }))
    .returning({ id: technologySpaces.id });
  const spaceIdByCode = new Map(DEMO_SPACES.map((sp, i) => [sp.code, spaceRows[i].id] as const));

  // Slugs are unique too; skip a name a real competitor already uses.
  const named = DEMO_COMPETITORS.map((c) => ({ ...c, name: `[demo] ${c.name}` }));
  const slugs = named.map((c) => toSlug(c.name));
  const takenSlugs = new Set(
    (await db.select({ slug: competitors.slug }).from(competitors).where(inArray(competitors.slug, slugs)))
      .map((r) => r.slug),
  );
  const toCreate = named.filter((_, i) => !takenSlugs.has(slugs[i]));
  if (toCreate.length === 0) {
    return { spaces: spaceRows.length, competitors: 0, projectLinks: 0, accountLinks: 0 };
  }

  const now = new Date();
  const competitorRows = await db
    .insert(competitors)
    .values(toCreate.map((c) => ({
      name: c.name,
      slug: toSlug(c.name),
      isActive: true,
      vendorType: c.vendorType,
      pricingPosition: c.pricingPosition,
      companySizeBand: c.companySizeBand,
      deploymentModel: c.deploymentModel,
      hqRegion: c.hqRegion,
      summary: c.summary,
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      counterPositioning: c.counterPositioning,
      lastReviewedAt: now,
      reviewedByUserId: createdByUserId,
      createdByUserId,
      isDemo: true,
    })))
    .returning({ id: competitors.id, name: competitors.name });

  const solutionIdByAbbrev = new Map(solutions.map((s) => [s.abbreviation, s.id] as const));
  const created = toCreate.map((def, i) => ({ def, id: competitorRows[i].id }));

  const spaceLinks = created.flatMap(({ def, id }) =>
    def.spaces.flatMap((code, i) => {
      const spaceId = spaceIdByCode.get(code);
      return spaceId ? [{ competitorId: id, spaceId, isPrimary: i === 0 }] : [];
    }),
  );
  if (spaceLinks.length > 0) await db.insert(competitorSpaces).values(spaceLinks);

  const solutionLinks = created.flatMap(({ def, id }) =>
    def.solutions.flatMap((abbrev) => {
      const solutionId = solutionIdByAbbrev.get(abbrev);
      return solutionId ? [{ competitorId: id, solutionId }] : [];
    }),
  );
  if (solutionLinks.length > 0) await db.insert(competitorSolutions).values(solutionLinks);

  await db.insert(competitorActivity).values(created.map(({ def, id }) => ({
    competitorId: id,
    activityType: "Added",
    message: `Competitor "${def.name}" was added to the library.`,
    createdByUserId,
  })));

  // Every other demo project faces one competitor: open projects mostly
  // against a vendor still being evaluated (High-Risk Opps), closed ones
  // against an incumbent.
  const projectRows = demoProjects
    .filter((_, i) => i % 2 === 0)
    .map((p, i) => {
      const { def, id } = created[i % created.length];
      const solutionId = p.solutionIds.find((sid) =>
        def.solutions.some((abbrev) => solutionIdByAbbrev.get(abbrev) === sid)) ?? null;
      return {
        projectId: p.id,
        competitorId: id,
        spaceId: spaceIdByCode.get(def.spaces[0]) ?? null,
        solutionId,
        relationshipType: p.closed ? "Own" : "Evaluating",
        threatLevel: p.closed ? "Low" : i % 3 === 0 ? "High" : "Medium",
        isCustomerIncumbent: p.closed,
        ownerUserId: createdByUserId,
      };
    });
  if (projectRows.length > 0) await db.insert(projectCompetitors).values(projectRows);

  // Each demo account records the vendor it owns today.
  const accountIds = [...new Set(demoProjects.map((p) => p.customerId))];
  const accountRows = accountIds.map((customerId, i) => {
    const { def, id } = created[(i + 1) % created.length];
    return {
      customerId,
      competitorId: id,
      spaceId: spaceIdByCode.get(def.spaces[0]) ?? null,
      relationship: "Own",
    };
  });
  if (accountRows.length > 0) await db.insert(customerCompetitors).values(accountRows);

  return {
    spaces: spaceRows.length,
    competitors: competitorRows.length,
    projectLinks: projectRows.length,
    accountLinks: accountRows.length,
  };
}
