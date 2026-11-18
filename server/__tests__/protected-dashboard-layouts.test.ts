// @vitest-environment node
//
// Coverage for the protected default Overview dashboard wiring (Task #555):
//
//   1. `seedProtectedDashboardLayouts()` — fresh-install INSERT path,
//      existing-row stamp-only path, and legacy-name normalization.
//   2. GET /api/dashboard-layout — role row first, then the All row.
//   3. The archived builders' write routes (layout, metrics, schema
//      context, legacy config) stay unregistered.
//
// The dashboard routes module imports `./db`, `./auth/simpleAuth`,
// and `@shared/schema`. We stub `./db` with an in-memory table that
// satisfies the small subset of Drizzle's chained API the route
// handlers actually use, and we stub `./auth/simpleAuth` so the
// request always lands authenticated. The seeder is exercised with
// the SAME stub so the two layers share a consistent fake store and
// the assertions round-trip cleanly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// In-memory `dashboard_layouts` store mutated by the db stub. Each test
// reaches in to seed rows directly via `seedRow()` (route tests) or
// invokes the seeder against an empty/legacy starting state.
// ---------------------------------------------------------------------------

interface FakeRow {
  id: number;
  name: string;
  description: string | null;
  pageKey: string;
  role: string;
  isGlobal: boolean;
  isDefault: boolean;
  isProtected: boolean;
  layoutConfig: unknown;
  userId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const store: { rows: FakeRow[]; nextId: number } = { rows: [], nextId: 1 };

function resetStore() {
  store.rows = [];
  store.nextId = 1;
}

function seedRow(row: Partial<FakeRow> & { pageKey: string; role: string }): FakeRow {
  const now = new Date();
  const full: FakeRow = {
    id: store.nextId++,
    name: row.name ?? `Layout for ${row.pageKey}`,
    description: row.description ?? null,
    pageKey: row.pageKey,
    role: row.role,
    isGlobal: row.isGlobal ?? false,
    isDefault: row.isDefault ?? false,
    isProtected: row.isProtected ?? false,
    layoutConfig: row.layoutConfig ?? { layouts: [], widgets: {} },
    userId: row.userId ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? now,
    updatedAt: row.updatedAt ?? now,
  };
  store.rows.push(full);
  return full;
}

// ---------------------------------------------------------------------------
// Drizzle stub — only the subset of operators / chain methods that
// `dashboard-routes.ts` and `seedProtectedDashboardLayouts` actually
// invoke. Conditions are represented as opaque function predicates so
// we don't need to model the full Drizzle column metadata.
// ---------------------------------------------------------------------------

type Predicate = (row: FakeRow) => boolean;

function eqStub(col: string, value: unknown): Predicate {
  return (row) => (row as unknown as Record<string, unknown>)[col] === value;
}

function andStub(...preds: Predicate[]): Predicate {
  return (row) => preds.every((p) => p(row));
}

function makeSelectChain() {
  let predicate: Predicate = () => true;
  let limit = Infinity;
  const chain = {
    from: () => chain,
    where: (p: Predicate) => {
      predicate = p;
      return chain;
    },
    limit: (n: number) => {
      limit = n;
      return chain;
    },
    then: (resolve: (rows: FakeRow[]) => unknown) =>
      Promise.resolve(store.rows.filter(predicate).slice(0, limit)).then(resolve),
  };
  return chain;
}

function makeUpdateChain() {
  let updates: Partial<FakeRow> = {};
  let predicate: Predicate = () => false;
  const chain = {
    set: (u: Partial<FakeRow>) => {
      updates = u;
      return chain;
    },
    where: (p: Predicate) => {
      predicate = p;
      return chain;
    },
    returning: () => {
      const updated: FakeRow[] = [];
      for (const row of store.rows) {
        if (predicate(row)) {
          Object.assign(row, updates);
          updated.push(row);
        }
      }
      return Promise.resolve(updated);
    },
    then: (resolve: (rows: FakeRow[]) => unknown) => chain.returning().then(resolve),
  };
  return chain;
}

function makeInsertChain() {
  let pending: Partial<FakeRow> = {};
  const chain = {
    values: (v: Partial<FakeRow>) => {
      pending = v;
      return chain;
    },
    returning: () => {
      const inserted = seedRow(pending as Partial<FakeRow> & { pageKey: string; role: string });
      return Promise.resolve([inserted]);
    },
    then: (resolve: (rows: FakeRow[]) => unknown) => chain.returning().then(resolve),
  };
  return chain;
}

function makeDeleteChain() {
  let predicate: Predicate = () => false;
  const chain = {
    where: (p: Predicate) => {
      predicate = p;
      const before = store.rows.length;
      store.rows = store.rows.filter((row) => !predicate(row));
      const removed = before - store.rows.length;
      return Promise.resolve({ rowCount: removed });
    },
  };
  return chain;
}

const dbStub = {
  select: () => makeSelectChain(),
  update: () => makeUpdateChain(),
  insert: () => makeInsertChain(),
  delete: () => makeDeleteChain(),
};

vi.mock("../db", () => ({
  db: dbStub,
  pool: {},
  dbReady: true,
}));

// `drizzle-orm` exports operators by name. We re-export light stubs that
// produce the predicates our select/update/delete chains understand.
vi.mock("drizzle-orm", async () => {
  return {
    eq: (col: { _columnName: string }, value: unknown) =>
      eqStub(col._columnName, value),
    and: (...preds: Predicate[]) => andStub(...preds),
    // dashboard-routes.ts also imports `desc` and `getTableColumns`
    // for unrelated handlers in the same module. We stub them so
    // module-load doesn't blow up; the protected-row tests never
    // exercise those handlers.
    desc: (col: unknown) => col,
    getTableColumns: (table: Record<string, unknown>) => {
      const cols: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(table)) {
        if (typeof k === "string" && !k.startsWith("_")) cols[k] = v;
      }
      return cols;
    },
  };
});

// `@shared/schema` is enormous. The dashboard routes only touch the
// `dashboardLayouts` table; we ship a minimal column descriptor for
// every column referenced by the eq() calls in the routes + seeder.
vi.mock("@shared/schema", async () => {
  // Minimal column descriptors for the only table the production
  // routes + seeder actually mutate. Other table imports are stubbed
  // as opaque placeholders so `dashboard-routes.ts`'s raw-schema
  // catalog (which only walks them via `getTableColumns`) doesn't
  // crash at module-load time.
  const dashboardLayouts = {
    id: { _columnName: "id" },
    name: { _columnName: "name" },
    pageKey: { _columnName: "pageKey" },
    role: { _columnName: "role" },
    isProtected: { _columnName: "isProtected" },
    isGlobal: { _columnName: "isGlobal" },
    isDefault: { _columnName: "isDefault" },
    layoutConfig: { _columnName: "layoutConfig" },
  };
  const stubTable = (name: string) => ({
    _columnName: name,
    [Symbol.for("drizzle:Columns")]: {},
  });
  return {
    dashboardLayouts,
    dashboardConfigs: stubTable("dashboardConfigs"),
    dashboardMetrics: stubTable("dashboardMetrics"),
    projects: stubTable("projects"),
    customers: stubTable("customers"),
    users: stubTable("users"),
    products: stubTable("products"),
    mapPhases: stubTable("mapPhases"),
    mapTasks: stubTable("mapTasks"),
    projectGaps: stubTable("projectGaps"),
    projectOutcomes: stubTable("projectOutcomes"),
    projectRiskPredictions: stubTable("projectRiskPredictions"),
    supportRequests: stubTable("supportRequests"),
    emailLogs: stubTable("emailLogs"),
    emailRules: stubTable("emailRules"),
    emailRuleAudits: stubTable("emailRuleAudits"),
    emailSchedules: stubTable("emailSchedules"),
    riskCriteria: stubTable("riskCriteria"),
  };
});

// Authenticate every request as an admin so the route handlers run.
vi.mock("../auth/simpleAuth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "admin-1", role: "Admin" };
    next();
  },
}));

// ---------------------------------------------------------------------------
// HTTP harness — mounts only the dashboard routes against the stubbed
// dependencies above so each request exercises the production handler.
// ---------------------------------------------------------------------------

let app: Express;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  resetStore();
  const { registerDashboardRoutes } = await import("../routes/dashboard-routes");
  app = express();
  app.use(express.json({ limit: "50mb" }));
  registerDashboardRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("seedProtectedDashboardLayouts()", () => {
  it("inserts the canonical Overview row on a fresh install", async () => {
    const { seedProtectedDashboardLayouts } = await import(
      "../lib/seed-protected-dashboard-layouts"
    );
    const { DEFAULT_OVERVIEW_LAYOUT_NAME, DEFAULT_OVERVIEW_PAGE_KEY, DEFAULT_OVERVIEW_ROLE } =
      await import("../lib/default-overview-dashboard");

    await seedProtectedDashboardLayouts();

    const row = store.rows.find(
      (r) => r.pageKey === DEFAULT_OVERVIEW_PAGE_KEY && r.role === DEFAULT_OVERVIEW_ROLE,
    );
    expect(row).toBeDefined();
    expect(row!.name).toBe(DEFAULT_OVERVIEW_LAYOUT_NAME);
    expect(row!.isProtected).toBe(true);
    expect(row!.isGlobal).toBe(true);
    expect(row!.isDefault).toBe(true);
    expect(row!.layoutConfig).toBeTruthy();
  });

  it("inserts every entry in PROTECTED_DASHBOARD_SEEDS on a fresh install (Task #562)", async () => {
    const { seedProtectedDashboardLayouts } = await import(
      "../lib/seed-protected-dashboard-layouts"
    );
    const { PROTECTED_DASHBOARD_SEEDS } = await import(
      "../lib/default-protected-dashboards"
    );

    await seedProtectedDashboardLayouts();

    // One row per seed entry — none missing, none duplicated.
    expect(store.rows).toHaveLength(PROTECTED_DASHBOARD_SEEDS.length);

    // Every seed entry has a matching protected, populated row.
    for (const seed of PROTECTED_DASHBOARD_SEEDS) {
      const row = store.rows.find(
        (r) => r.pageKey === seed.pageKey && r.role === seed.role,
      );
      expect(row, `expected protected row for page=${seed.pageKey}`).toBeDefined();
      expect(row!.name).toBe(seed.name);
      expect(row!.isProtected).toBe(true);
      expect(row!.isGlobal).toBe(true);
      expect(row!.isDefault).toBe(true);
      expect(row!.layoutConfig).toBe(seed.layoutConfig);
    }

    // Sanity check: the new pages from Task #562 are all represented.
    const pageKeys = store.rows.map((r) => r.pageKey);
    expect(pageKeys).toEqual(
      expect.arrayContaining(["overview", "account_portal", "project_validation", "support"]),
    );
  });

  it("is idempotent — a second call does not duplicate or mutate any seeded row", async () => {
    const { seedProtectedDashboardLayouts } = await import(
      "../lib/seed-protected-dashboard-layouts"
    );

    await seedProtectedDashboardLayouts();
    const initialCount = store.rows.length;
    expect(initialCount).toBeGreaterThan(0);
    const snapshot = JSON.stringify(
      [...store.rows].sort((a, b) => a.id - b.id),
    );

    await seedProtectedDashboardLayouts();
    expect(store.rows).toHaveLength(initialCount);
    expect(JSON.stringify([...store.rows].sort((a, b) => a.id - b.id))).toBe(snapshot);
  });

  it("stamps isProtected on an existing row but preserves the admin's edited layoutConfig", async () => {
    const { seedProtectedDashboardLayouts } = await import(
      "../lib/seed-protected-dashboard-layouts"
    );
    const customConfig = { layouts: [{ id: "custom-edit" }], widgets: {} };

    // Pre-seed an existing (legacy) Overview row that an admin has
    // already customized — the seeder must promote it to protected
    // without clobbering their work.
    seedRow({
      pageKey: "overview",
      role: "All",
      name: "Customized Overview",
      isProtected: false,
      isGlobal: false,
      isDefault: false,
      layoutConfig: customConfig,
    });

    await seedProtectedDashboardLayouts();

    const row = store.rows.find((r) => r.pageKey === "overview" && r.role === "All");
    expect(row).toBeDefined();
    expect(row!.isProtected).toBe(true);
    // Customized name preserved (not the legacy auto-name) — admin's
    // intent is respected on existing installs.
    expect(row!.name).toBe("Customized Overview");
    // Most importantly, the admin's edited layoutConfig is NOT
    // overwritten by the seeded default.
    expect(row!.layoutConfig).toBe(customConfig);
  });

  it("normalizes the legacy 'Layout for <pageKey>' auto-name to the canonical name for every protected page", async () => {
    const { seedProtectedDashboardLayouts } = await import(
      "../lib/seed-protected-dashboard-layouts"
    );
    const { PROTECTED_DASHBOARD_SEEDS } = await import(
      "../lib/default-protected-dashboards"
    );

    // Pre-seed each protected page with its legacy auto-generated
    // name so the seeder's normalization branch fires for all of them
    // in a single pass.
    for (const seed of PROTECTED_DASHBOARD_SEEDS) {
      seedRow({
        pageKey: seed.pageKey,
        role: seed.role,
        name: `Layout for ${seed.pageKey}`,
        isProtected: false,
      });
    }

    await seedProtectedDashboardLayouts();

    for (const seed of PROTECTED_DASHBOARD_SEEDS) {
      const row = store.rows.find(
        (r) => r.pageKey === seed.pageKey && r.role === seed.role,
      );
      expect(row, `expected normalized row for page=${seed.pageKey}`).toBeDefined();
      expect(row!.name).toBe(seed.name);
      expect(row!.isProtected).toBe(true);
    }
  });
});

describe("GET /api/dashboard-layout", () => {
  it("returns the role's layout, falling back to the All row", async () => {
    seedRow({ pageKey: "overview", role: "All", name: "Overview", isProtected: true });
    seedRow({ pageKey: "overview", role: "Sales", name: "Overview (Sales)" });

    const sales = await (await fetch(`${baseUrl}/api/dashboard-layout?page=overview&role=Sales`)).json();
    expect(sales.name).toBe("Overview (Sales)");

    const fallback = await (await fetch(`${baseUrl}/api/dashboard-layout?page=overview&role=Customer`)).json();
    expect(fallback.name).toBe("Overview");
    expect(fallback.isProtected).toBe(true);
  });
});

// Dashboard Builder and Metric Builder were archived. Their write routes only
// checked that someone was signed in, so any user could rewrite or delete the
// Home dashboard; they must stay gone.
describe("removed dashboard write routes", () => {
  const removed: Array<[string, string]> = [
    ["POST", "/api/dashboard-layout"],
    ["DELETE", "/api/dashboard-layout/1"],
    ["POST", "/api/dashboard-metrics"],
    ["PUT", "/api/dashboard-metrics/1"],
    ["DELETE", "/api/dashboard-metrics/1"],
    ["GET", "/api/schema-context?mode=raw"],
    ["GET", "/api/dashboard-config"],
    ["POST", "/api/dashboard-config"],
  ];

  it.each(removed)("%s %s is not registered", async (method, url) => {
    const row = seedRow({ pageKey: "overview", role: "All", isProtected: true, layoutConfig: { layouts: [], widgets: {} } });
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ pageKey: "overview", role: "All", layoutConfig: { hijacked: true } }),
    });
    expect(res.status).toBe(404);
    expect(store.rows.find((r) => r.id === row.id)?.layoutConfig).toEqual({ layouts: [], widgets: {} });
  });
});
