import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PERMISSION_KEYS } from "@shared/permissions";

// Every permission key a page or route checks must be one Role Management
// stores (shared/permissions.ts). A check against a key nobody can grant refuses every non-Admin
// (the old "assumptions" / "dependencies" keys did exactly that).

const ROOT = join(__dirname, "../../../..");

const KNOWN = new Set<string>(PERMISSION_KEYS);

// A call that names its key inline, or a `const X_SECTION = "key"` that a
// route passes to one.
const CHECKS = [
  /\b(?:canView|canEdit|hasPermission|getEffectivePermission|userCanViewSection|userCanEditSection|requireSectionView|requireSectionEdit)\((?:req,\s*)?["']([a-z0-9_.-]+)["']/g,
  /^(?:export )?const [A-Z_]+_SECTION\s*=\s*["']([a-z0-9_.-]+)["']/gm,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "__tests__" || name === "dist") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("permission keys checked in code", () => {
  it("are all keys Role Management can grant", () => {
    const unknown: string[] = [];
    for (const file of [
      ...sourceFiles(join(ROOT, "client/src")),
      ...sourceFiles(join(ROOT, "server")),
      ...sourceFiles(join(ROOT, "shared")),
    ]) {
      const text = readFileSync(file, "utf8");
      for (const check of CHECKS) {
        for (const match of text.matchAll(check)) {
          if (!KNOWN.has(match[1])) unknown.push(`${relative(ROOT, file)}: ${match[1]}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});
