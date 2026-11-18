// @vitest-environment node
//
// Projects point at their account by id (migration 120). Renaming an
// account used to detach its projects, because they matched by name. These
// tests run against the real Postgres in DATABASE_URL and skip without one,
// like the other server/__tests__ suites that need a live driver.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import { customers, projects, type InsertProject } from "@shared/schema";

const MARKER = "PCL-TEST";

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(projects).where(sql`${projects.customerName} LIKE ${MARKER + "%"}`);
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
}

async function account(name: string, logoUrl: string | null = null): Promise<number> {
  const [row] = await db
    .insert(customers)
    .values({ accountName: name, logoUrl })
    .returning({ id: customers.id });
  return row.id;
}

function projectFor(customerName: string): InsertProject {
  return { customerName, solutionName: "Solution" } as InsertProject;
}

describe.skipIf(!process.env.DATABASE_URL)("project ↔ account link by id", () => {
  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  it("links a new project to the account with that name", async () => {
    const id = await account(`${MARKER} Acme`);
    const project = await storage.createProject(projectFor(`${MARKER} Acme`));
    expect(project.customerId).toBe(id);
  });

  it("matches ignoring case and surrounding spaces", async () => {
    const id = await account(`${MARKER} Acme`);
    const project = await storage.createProject(projectFor(`  ${MARKER} ACME `));
    expect(project.customerId).toBe(id);
  });

  it("leaves the id empty when two accounts share the name", async () => {
    await account(`${MARKER} Twin`);
    await account(`${MARKER} Twin`);
    const project = await storage.createProject(projectFor(`${MARKER} Twin`));
    expect(project.customerId).toBeNull();
  });

  it("keeps projects attached when the account is renamed", async () => {
    const id = await account(`${MARKER} Old`, "https://example.invalid/logo.png");
    const project = await storage.createProject(projectFor(`${MARKER} Old`));

    await storage.updateCustomer(id, { accountName: `${MARKER} New` });

    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row.customerId).toBe(id);
    expect(row.customerName).toBe(`${MARKER} New`);

    const full = await storage.getProjectById(project.id);
    expect(full?.customerLogoLive).toBeTruthy();
  });

  it("adopts name-only projects on rename when the old name was unique", async () => {
    const id = await account(`${MARKER} Legacy`);
    const [legacy] = await db
      .insert(projects)
      .values({ customerName: `${MARKER} Legacy`, solutionName: "Solution", customerId: null })
      .returning({ id: projects.id });

    await storage.updateCustomer(id, { accountName: `${MARKER} Renamed` });

    const [row] = await db.select().from(projects).where(eq(projects.id, legacy.id));
    expect(row.customerId).toBe(id);
    expect(row.customerName).toBe(`${MARKER} Renamed`);
  });

  it("re-links only when a project's account name changes", async () => {
    const first = await account(`${MARKER} First`);
    const second = await account(`${MARKER} Second`);
    const project = await storage.createProject(projectFor(`${MARKER} First`));

    const unchanged = await storage.updatePoc(project.id, { customerName: `${MARKER} First` });
    expect(unchanged.customerId).toBe(first);

    const moved = await storage.updatePoc(project.id, { customerName: `${MARKER} Second` });
    expect(moved.customerId).toBe(second);

    const ids = (await db.select({ id: projects.id }).from(projects).where(inArray(projects.id, [project.id]))).length;
    expect(ids).toBe(1);
  });
});
