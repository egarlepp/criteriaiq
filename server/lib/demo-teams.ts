// Demo Mode teams: two teams with nested subteams, staffed by the Demo
// Staff users (demo-story.ts), so Admin › Team & People › Teams, the
// Users page Team column and every team filter have something to show in
// Demo Mode. Rows carry teams.is_demo (migration 115); subteams and both
// member tables cascade with their team, so the wipe deletes only teams.
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { subteamMembers, subteams, teamMembers, teams } from "@shared/schema";
import type { SubteamKind, SubteamRole } from "@shared/teams";
import type { DemoStaff } from "./demo-story";

type StaffKey = "se1" | "se2" | "specialist" | "sales" | "lead";

interface SubteamSpec {
  key: string;
  name: string;
  kind: SubteamKind;
  parent?: string;
  members: ReadonlyArray<{ who: StaffKey; role: SubteamRole }>;
}

interface TeamSpec {
  key: "se" | "sales";
  name: string;
  slug: string;
  description: string;
  icon: string;
  manager: StaffKey;
  /** Members in order; a person's first team (in DEMO_TEAMS order) is their default. */
  members: readonly StaffKey[];
  subteams: readonly SubteamSpec[];
}

const DEMO_TEAMS: readonly TeamSpec[] = [
  {
    key: "se",
    name: "[demo] Solutions Engineering",
    slug: "demo-solutions-engineering",
    description: "Pre-sales engineers who run technical validations, grouped by region and specialty.",
    icon: "Network",
    manager: "lead",
    members: ["lead", "se1", "se2", "specialist"],
    subteams: [
      {
        key: "na",
        name: "North America",
        kind: "region",
        members: [
          { who: "lead", role: "leader" },
          { who: "se1", role: "member" },
          { who: "se2", role: "member" },
        ],
      },
      { key: "east", name: "East", kind: "region", parent: "na", members: [{ who: "se1", role: "leader" }] },
      { key: "west", name: "West", kind: "region", parent: "na", members: [{ who: "se2", role: "leader" }] },
      {
        key: "identity",
        name: "Identity Specialists",
        kind: "product",
        members: [{ who: "specialist", role: "leader" }],
      },
    ],
  },
  {
    key: "sales",
    name: "[demo] Enterprise Sales",
    slug: "demo-enterprise-sales",
    description: "Account executives who own the demo accounts and their opportunities.",
    icon: "Briefcase",
    manager: "sales",
    members: ["sales", "lead"],
    subteams: [
      {
        key: "strategic",
        name: "Strategic Accounts",
        kind: "type",
        members: [
          { who: "sales", role: "leader" },
          { who: "lead", role: "member" },
        ],
      },
    ],
  },
];

/** Share of demo projects owned by the sales team instead of the SE team. */
const SALES_OWNED_SHARE = 0.2;

export interface DemoTeams {
  teams: number;
  subteams: number;
  /** The owning team and subteam for a demo project, from its primary SE. */
  placeFor(primaryEngineerId: string): { teamId: number; subteamId: number };
}

function staffId(staff: DemoStaff, who: StaffKey): string {
  switch (who) {
    case "se1":
      return staff.engineers[0];
    case "se2":
      return staff.engineers[1] ?? staff.engineers[0];
    case "specialist":
      return staff.specialist;
    case "sales":
      return staff.sales;
    case "lead":
      return staff.lead;
  }
}

/**
 * Creates the demo teams and subteams. Demo teams left by an earlier seed
 * that failed part way are removed first, so the fixed slugs never clash.
 */
export async function seedDemoTeams(staff: DemoStaff): Promise<DemoTeams> {
  await db.delete(teams).where(eq(teams.isDemo, true));

  const teamIds = new Map<TeamSpec["key"], number>();
  const subteamIds = new Map<string, number>();
  const hasDefault = new Set<string>();
  let subteamCount = 0;

  for (const spec of DEMO_TEAMS) {
    const [team] = await db
      .insert(teams)
      .values({
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        icon: spec.icon,
        managerUserId: staffId(staff, spec.manager),
        isDemo: true,
      })
      .returning({ id: teams.id });
    teamIds.set(spec.key, team.id);

    const memberIds = Array.from(new Set(spec.members.map((who) => staffId(staff, who))));
    await db.insert(teamMembers).values(
      memberIds.map((userId) => {
        const isDefault = !hasDefault.has(userId);
        hasDefault.add(userId);
        return { teamId: team.id, userId, isDefault };
      }),
    );

    // Parents come before their children in each spec list.
    for (const sub of spec.subteams) {
      const [row] = await db
        .insert(subteams)
        .values({
          teamId: team.id,
          name: sub.name,
          kind: sub.kind,
          parentSubteamId: sub.parent ? (subteamIds.get(sub.parent) ?? null) : null,
        })
        .returning({ id: subteams.id });
      subteamIds.set(sub.key, row.id);
      subteamCount++;
      const seen = new Set<string>();
      const members = sub.members
        .map((m) => ({ userId: staffId(staff, m.who), role: m.role }))
        .filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)));
      await db.insert(subteamMembers).values(members.map((m) => ({ subteamId: row.id, ...m })));
    }
  }

  const seTeam = teamIds.get("se") as number;
  const salesTeam = teamIds.get("sales") as number;
  const regionFor = new Map<string, number>([
    [staffId(staff, "se1"), subteamIds.get("east") as number],
    [staffId(staff, "se2"), subteamIds.get("west") as number],
  ]);

  return {
    teams: DEMO_TEAMS.length,
    subteams: subteamCount,
    placeFor(primaryEngineerId) {
      if (faker.number.float({ min: 0, max: 1 }) < SALES_OWNED_SHARE) {
        return { teamId: salesTeam, subteamId: subteamIds.get("strategic") as number };
      }
      return {
        teamId: seTeam,
        subteamId: regionFor.get(primaryEngineerId) ?? (subteamIds.get("na") as number),
      };
    },
  };
}
