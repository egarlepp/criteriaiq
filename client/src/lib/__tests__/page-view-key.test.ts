// Page keys behind Admin › Monitoring & Audit › Page Usage: every page in
// App.tsx gets a stable, valid key, and keys follow the sidebar menu.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_KEY_PATTERN } from "@shared/page-views";
import { pageCatalog, pageKeyForLocation } from "../page-view-key";

describe("pageKeyForLocation", () => {
  it("names a page by its menu entry", () => {
    expect(pageKeyForLocation("/", "")).toBe("dashboard");
    expect(pageKeyForLocation("/admin", "?tab=system-health&subtab=database")).toBe("system-health-database");
    expect(pageKeyForLocation("/admin", "tab=backup")).toBe("backup");
    expect(pageKeyForLocation("/admin", "?tab=roles")).toBe("roles");
  });

  it("fills in a page's default tab", () => {
    expect(pageKeyForLocation("/admin", "")).toBe(pageKeyForLocation("/admin", "?tab=system-health&subtab=overview"));
  });

  it("gives every menu link its own entry's key", () => {
    const misses: string[] = [];
    for (const entry of pageCatalog()) {
      if (!entry.href) continue;
      const [pathname, query = ""] = entry.href.split("?");
      const key = pageKeyForLocation(pathname, query);
      if (key !== entry.key) misses.push(`${entry.href}: ${key} (expected ${entry.key})`);
    }
    expect(misses).toEqual([]);
  });

  it("keeps one key for a page whatever its filters", () => {
    expect(pageKeyForLocation("/admin", "?tab=backup&foo=1")).toBe("backup");
  });

  it("names pages outside the menu", () => {
    expect(pageKeyForLocation("/project/42", "?source=dashboard")).toBe("page-project-detail");
    expect(pageKeyForLocation("/project/42/audit", "")).toBe("page-project-audit");
    expect(pageKeyForLocation("/edit-project/42", "")).toBe("page-edit-project");
    expect(pageKeyForLocation("/tags", "")).toBe("page-tags");
  });

  it("doesn't count unknown URLs", () => {
    expect(pageKeyForLocation("/no-such-page", "")).toBeNull();
    expect(pageKeyForLocation("/error-test", "")).toBeNull();
  });
});

describe("pageCatalog", () => {
  const catalog = pageCatalog();

  it("has unique keys the server accepts", () => {
    const keys = catalog.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key, key).toMatch(PAGE_KEY_PATTERN);
  });

  it("covers every signed-in route in App.tsx", () => {
    const source = readFileSync(path.resolve(__dirname, "../../App.tsx"), "utf8");
    const app = source.slice(source.indexOf("<PageLayout>"), source.indexOf("</PageLayout>"));
// /error-test is a dev page; /profile only redirects to /?profile=<tab> (Profile Settings opens over the
    // current page), so it is never a page view of its own.
    // /config, /communications and /archive-management only redirect to /admin;
    // /analytics (old Reports URL) and /report-builder (archived) only redirect to /reports.
    const notPages = new Set(["/error-test", "/profile", "/config", "/communications", "/archive-management", "/analytics", "/report-builder"]);
    const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]).filter((r) => !notPages.has(r));
    for (const route of routes) {
      const sample = route.replace(/:[a-zA-Z]+/g, "1");
      const key = pageKeyForLocation(sample, "");
      expect(key, route).not.toBeNull();
      expect(catalog.some((e) => e.key === key), `${route} → ${key}`).toBe(true);
    }
  });

  it("marks Admin-only pages", () => {
    expect(catalog.find((e) => e.key === "page-usage")?.adminOnly).toBe(true);
    expect(catalog.find((e) => e.key === "dashboard")?.adminOnly).toBe(false);
  });
});
