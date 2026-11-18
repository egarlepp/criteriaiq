import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_PRELOADS } from "@/lib/page-preloads";
import { SIDEBAR_NAV } from "../sidebar-nav-config";

const SRC = resolve(__dirname, "../../..");
// Normalize line endings so the checks also pass on a Windows (CRLF) checkout.
const APP = readFileSync(join(SRC, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

// The header, Admin menu and tab bar live in PageLayout. If a route builds its
// own PageLayout (or a lazy page renders one), they sit inside the page's
// Suspense boundary and unmount while its code loads, so the whole app looks
// like it reloads.
describe("persistent page layout", () => {
  it("renders one PageLayout in App.tsx, around the routes' Suspense boundary", () => {
    expect(APP.match(/<PageLayout>/g)).toHaveLength(1);
    expect(APP.indexOf("<PageLayout>")).toBeLessThan(APP.indexOf("<Suspense fallback={<PageSkeleton />}>\n            <Switch>"));
  });

  it("doesn't pass inline component functions to routes (they remount the page on every render)", () => {
    expect(APP).not.toMatch(/component=\{\s*\(/);
  });

  it("has no page that renders its own PageLayout", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !path.includes(join("components", "layout")) && !path.endsWith("App.tsx"))
      .filter((path) => readFileSync(path, "utf8").includes("<PageLayout"))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  it("preloads every page the Admin menu links to", () => {
    const paths = new Set(
      SIDEBAR_NAV.filter((g) => g.secondTier)
        .flatMap((g) => g.items)
        .flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)])
        .map((href) => href.split("?")[0]),
    );
    expect([...paths].filter((path) => !PAGE_PRELOADS[path])).toEqual([]);
  });
});
