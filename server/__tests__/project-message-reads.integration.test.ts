// Unread project messages against a live DB: getProjectMessageCounts counts
// messages by someone else after the newest one the user has read (deleted
// ones left out), markProjectMessagesRead never moves back, and
// listRecentProjectMessages spans projects without deleted messages.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, dbReady } from "../db";
import { projects, users } from "@shared/schema";
import { storage } from "../storage";

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;
const TAG = `msg-reads-${Date.now()}`;

describe.skipIf(!SHOULD_RUN)("Project message reads (integration)", () => {
  const customer = `${TAG}-customer`;
  const engineer = `${TAG}-engineer`;
  let projectA = 0;
  let projectB = 0;
  const ids: number[] = [];

  beforeAll(async () => {
    await db.insert(users).values([
      { id: customer, email: `${customer}@example.invalid`, role: "Customer" },
      { id: engineer, email: `${engineer}@example.invalid`, role: "Engineer" },
    ]);
    const rows = await db
      .insert(projects)
      .values([
        { name: `${TAG} A`, customerName: TAG, solutionName: "Test" },
        { name: `${TAG} B`, customerName: TAG, solutionName: "Test" },
      ])
      .returning({ id: projects.id });
    [projectA, projectB] = rows.map((row) => row.id);
    for (const [projectId, author, body] of [
      [projectA, engineer, "Welcome"],
      [projectA, customer, "Thanks"],
      [projectA, engineer, "Kickoff on Tuesday"],
      [projectB, engineer, "Lab is ready"],
    ] as const) {
      ids.push((await storage.createProjectMessage(projectId, author, body)).id);
    }
  });

  afterAll(async () => {
    if (projectA) await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db.delete(users).where(inArray(users.id, [customer, engineer]));
  });

  const counts = async (userId: string) =>
    new Map((await storage.getProjectMessageCounts([projectA, projectB], userId)).map((row) => [row.projectId, row.unread]));

  it("counts everything someone else wrote before the first read", async () => {
    expect(await counts(customer)).toEqual(new Map([[projectA, 2], [projectB, 1]]));
    expect(await counts(engineer)).toEqual(new Map([[projectA, 1], [projectB, 0]]));
  });

  it("clears up to the message read and never moves back", async () => {
    await storage.markProjectMessagesRead(customer, projectA, ids[2]);
    await storage.markProjectMessagesRead(customer, projectA, ids[0]);
    expect((await counts(customer)).get(projectA)).toBe(0);
    const later = await storage.createProjectMessage(projectA, engineer, "Agenda attached");
    ids.push(later.id);
    expect((await counts(customer)).get(projectA)).toBe(1);
  });

  it("leaves deleted messages out of the count and the latest list", async () => {
    await storage.deleteProjectMessage(ids[3]);
    expect((await counts(customer)).get(projectB)).toBe(0);
    const latest = await storage.listRecentProjectMessages([projectA, projectB], 10);
    expect(latest.map((row) => row.body)).toEqual(["Welcome", "Thanks", "Kickoff on Tuesday", "Agenda attached"]);
  });
});
