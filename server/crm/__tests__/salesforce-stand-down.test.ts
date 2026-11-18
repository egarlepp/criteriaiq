// @vitest-environment node
//
// Salesforce stands down while it isn't the install's CRM: its routes answer
// 409 (the connection settings excepted), the OAuth callback redirects, and
// its scheduled jobs skip without writing a run row.
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const settingMock = vi.hoisted(() => ({
  getCrmProviderId: vi.fn(),
  isCrmProviderActive: vi.fn(),
}));
vi.mock("../provider-setting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../provider-setting")>();
  return { ...actual, getCrmProviderId: settingMock.getCrmProviderId, isCrmProviderActive: settingMock.isCrmProviderActive };
});
const storageMock = vi.hoisted(() => ({ getSystemSetting: vi.fn(), upsertSystemSetting: vi.fn() }));
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../salesforce-provider", () => ({ salesforceProvider: { id: "salesforce", isRecordId: () => true, connectForUser: vi.fn() } }));

import { isSharedSyncPath, registerSalesforceRouteGuard, salesforceRouteNeedsActiveCrm } from "../salesforce-route-guard";

function setCrm(provider: "salesforce" | "hubspot" | "none") {
  settingMock.getCrmProviderId.mockResolvedValue(provider);
  settingMock.isCrmProviderActive.mockImplementation(async (p: string) => p === provider);
}

describe("salesforceRouteNeedsActiveCrm", () => {
  it("guards every Salesforce prefix", () => {
    expect(salesforceRouteNeedsActiveCrm("/api/admin/salesforce/mappings")).toBe(true);
    expect(salesforceRouteNeedsActiveCrm("/api/salesforce/conflicts")).toBe(true);
    expect(salesforceRouteNeedsActiveCrm("/api/auth/salesforce/connect")).toBe(true);
    expect(salesforceRouteNeedsActiveCrm("/api/auth/salesforce/callback")).toBe(true);
  });

  it("leaves the connection settings, status and disconnect open", () => {
    expect(salesforceRouteNeedsActiveCrm("/api/admin/salesforce/credentials")).toBe(false);
    expect(salesforceRouteNeedsActiveCrm("/api/admin/salesforce/credentials/test")).toBe(false);
    expect(salesforceRouteNeedsActiveCrm("/api/admin/salesforce/mock-mode")).toBe(false);
    expect(salesforceRouteNeedsActiveCrm("/api/auth/salesforce/status")).toBe(false);
    expect(salesforceRouteNeedsActiveCrm("/api/auth/salesforce/disconnect")).toBe(false);
  });

  it("ignores everything else", () => {
    expect(salesforceRouteNeedsActiveCrm("/api/crm/provider")).toBe(false);
    expect(salesforceRouteNeedsActiveCrm("/api/projects")).toBe(false);
  });

  // A Salesforce route registered outside the guarded prefixes would keep
  // working on a HubSpot or None install. Every route path in server/ that
  // names Salesforce must sit under one of them.
  it("covers every Salesforce route path in the server", () => {
    const routesDir = path.resolve(__dirname, "../../routes");
    const files = [path.resolve(__dirname, "../../routes.ts"), ...readdirSync(routesDir).filter((f) => f.endsWith(".ts")).map((f) => path.join(routesDir, f))];
    const offenders: string[] = [];
    const routeCall = /app\.(?:get|post|put|patch|delete|all|use)\(\s*["'`]([^"'`]+)["'`]/g;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(routeCall)) {
        const route = match[1];
        if (!/salesforce/i.test(route)) continue;
        const open = ["/api/admin/salesforce/credentials", "/api/admin/salesforce/credentials/test", "/api/admin/salesforce/mock-mode", "/api/auth/salesforce/status", "/api/auth/salesforce/disconnect"];
        if (!open.includes(route) && !salesforceRouteNeedsActiveCrm(route)) offenders.push(`${path.basename(file)}: ${route}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("isSharedSyncPath", () => {
  it("covers the field sync screens' routes", () => {
    for (const p of [
      "/api/admin/salesforce/mappings",
      "/api/admin/salesforce/mappings/12",
      "/api/admin/salesforce/mappings/12/value-maps",
      "/api/admin/salesforce/value-maps/3",
      "/api/admin/salesforce/metadata/cqi",
      "/api/admin/salesforce/metadata/sf/fields",
      "/api/admin/salesforce/policies",
      "/api/admin/salesforce/sync/history",
      "/api/admin/salesforce/sync/run/5",
      "/api/admin/salesforce/sync/issues/9/retry",
      "/api/admin/salesforce/sync/link-check",
    ]) {
      expect(isSharedSyncPath(p)).toBe(true);
    }
  });

  it("keeps Salesforce-only tools out", () => {
    for (const p of [
      "/api/admin/salesforce/credentials",
      "/api/admin/salesforce/mappings/validate",
      "/api/admin/salesforce/mappings/preview",
      "/api/admin/salesforce/linkage/search",
      "/api/admin/salesforce/crm-id-backfill",
      "/api/salesforce/opportunities",
    ]) {
      expect(isSharedSyncPath(p)).toBe(false);
    }
  });
});

describe("registerSalesforceRouteGuard", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    registerSalesforceRouteGuard(app);
    const ok = (_req: express.Request, res: express.Response) => {
      res.json({ ok: true });
    };
    app.get("/api/admin/salesforce/mappings", ok);
    app.get("/api/admin/salesforce/linkage/search", ok);
    app.get("/api/admin/salesforce/credentials", ok);
    app.get("/api/auth/salesforce/status", ok);
    app.get("/api/auth/salesforce/callback", ok);
    app.get("/api/projects", ok);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => setCrm("salesforce"));

  it("passes everything through while Salesforce is the CRM", async () => {
    expect((await fetch(`${base}/api/admin/salesforce/mappings`)).status).toBe(200);
    expect((await fetch(`${base}/api/auth/salesforce/callback`, { redirect: "manual" })).status).toBe(200);
  });

  it.each(["none", "hubspot"] as const)("answers 409 on Salesforce-only routes when the CRM is %s", async (crm) => {
    setCrm(crm);
    const res = await fetch(`${base}/api/admin/salesforce/linkage/search`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ errorCode: "crm_provider_mismatch", required: "salesforce" });
  });

  it("opens the shared field sync routes on HubSpot but not on None", async () => {
    setCrm("hubspot");
    expect((await fetch(`${base}/api/admin/salesforce/mappings`)).status).toBe(200);
    setCrm("none");
    expect((await fetch(`${base}/api/admin/salesforce/mappings`)).status).toBe(409);
  });

  it("keeps the connection settings and status reachable", async () => {
    setCrm("none");
    expect((await fetch(`${base}/api/admin/salesforce/credentials`)).status).toBe(200);
    expect((await fetch(`${base}/api/auth/salesforce/status`)).status).toBe(200);
    expect((await fetch(`${base}/api/projects`)).status).toBe(200);
  });

  it("sends the OAuth callback back to the profile with a message", async () => {
    setCrm("none");
    const res = await fetch(`${base}/api/auth/salesforce/callback?code=x`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/\?profile=integrations&sf_error=/);
  });
});

describe("onlyWhenCrmActive", () => {
  it("skips the job quietly while its CRM isn't active", async () => {
    // The wrapper reads the real setting (the stored row), not the mock above.
    const { onlyWhenCrmActive, clearCrmProviderCache } = await import("../provider-setting");
    const task = vi.fn().mockResolvedValue({ status: "success", itemsProcessed: 3 });
    const wrapped = onlyWhenCrmActive("salesforce", task);

    clearCrmProviderCache();
    storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "none" } });
    expect(await wrapped()).toEqual({ status: "skipped", message: "crm_not_active" });
    expect(task).not.toHaveBeenCalled();

    clearCrmProviderCache();
    storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "salesforce" } });
    expect(await wrapped()).toEqual({ status: "success", itemsProcessed: 3 });
    expect(task).toHaveBeenCalledTimes(1);
  });
});
