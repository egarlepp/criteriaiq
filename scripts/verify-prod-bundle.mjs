#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const entry = path.resolve(repoRoot, "dist/index.js");

const DEV_ONLY_PATTERNS = [
  /^vite$/,
  /^@vitejs\//,
  /^@tailwindcss\//,
];

const STATIC_IMPORT_RE =
  /^[ \t]*import\s+(?!\()(?:[^"';]*?\sfrom\s+)?["']([^"']+)["'];?/gm;

function extractStaticImports(source) {
  const specs = [];
  let m;
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((m = STATIC_IMPORT_RE.exec(source)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

function isDevOnly(spec) {
  return DEV_ONLY_PATTERNS.some((p) => p.test(spec));
}

function isLocal(spec) {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/");
}

const visited = new Set();
const violations = [];

function scan(file, chain) {
  const abs = path.resolve(file);
  if (visited.has(abs)) return;
  visited.add(abs);
  if (!existsSync(abs)) return;

  const source = readFileSync(abs, "utf8");
  const specs = extractStaticImports(source);

  for (const spec of specs) {
    if (isDevOnly(spec)) {
      violations.push({
        file: path.relative(repoRoot, abs),
        spec,
        chain: [...chain.map((f) => path.relative(repoRoot, f)), path.relative(repoRoot, abs)],
      });
    }
    if (isLocal(spec)) {
      const next = path.resolve(path.dirname(abs), spec);
      scan(next, [...chain, abs]);
    }
  }
}

if (!existsSync(entry)) {
  console.error(`[verify-prod-bundle] Missing build output: ${path.relative(repoRoot, entry)}`);
  console.error("[verify-prod-bundle] Run `npm run build` first.");
  process.exit(1);
}

scan(entry, []);

if (violations.length > 0) {
  console.error("");
  console.error("[verify-prod-bundle] FAIL: production server bundle statically imports dev-only packages.");
  console.error("");
  console.error("These packages (vite, @vitejs/*, @tailwindcss/*) are devDependencies");
  console.error("and get removed by `npm prune --omit=dev` in the Dockerfile. The container will boot-crash");
  console.error("with ERR_MODULE_NOT_FOUND if any of them is statically reachable from dist/index.js.");
  console.error("");
  console.error("Violations:");
  for (const v of violations) {
    console.error(`  • ${v.file}`);
    console.error(`      static import: "${v.spec}"`);
    console.error(`      reach chain:   ${v.chain.join(" -> ")}`);
  }
  console.error("");
  console.error("Fix: move the offending code into a chunk that is only loaded via");
  console.error('     `await import("./vite-dev")` (or another dynamic import gated on NODE_ENV).');
  console.error("     See server/vite-dev.ts for the established pattern.");
  console.error("");
  process.exit(1);
}

console.log(`[verify-prod-bundle] OK — scanned ${visited.size} chunk(s), no dev-only static imports reachable from dist/index.js.`);
