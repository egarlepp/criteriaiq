// Server-side stack de-minification for the Error Audit Log.
//
// Production client bundles are content-hashed and minified, so a logged stack
// like `…/assets/config-DGP6sHOc.js:1:15033` is unreadable. When the client is
// built with hidden source maps (vite `build.sourcemap: "hidden"`), the matching
// `*.js.map` files ship to `dist/public/assets/` but are NOT served to browsers
// (a guard in server/vite.ts blocks public `.map` requests). This module reads
// those maps server-side and rewrites each frame to its original
// `client/src/...:line:col`, so the viewer shows a readable stack.
//
// Uses Node's built-in `module.SourceMap` — no third-party dependency. Fully
// best-effort: if maps are absent (e.g. sourcemaps disabled, or this is a dev
// run) it returns null and the original minified stack is kept.

import { SourceMap } from "node:module";
import fs from "node:fs";
import path from "node:path";

// The server bundle runs from `dist/`, so built client assets (and their hidden
// `.map` siblings) live at `dist/public/assets` — the same dir serveStatic uses.
const ASSETS_DIR = path.resolve(import.meta.dirname, "..", "public", "assets");

// Cache parsed maps (and misses) for the process — chunk files are immutable per
// build, so this never goes stale within a running server.
const mapCache = new Map<string, SourceMap | null>();

function loadSourceMap(jsFileName: string): SourceMap | null {
  const cached = mapCache.get(jsFileName);
  if (cached !== undefined) return cached;
  let sm: SourceMap | null = null;
  try {
    const mapPath = path.join(ASSETS_DIR, `${jsFileName}.map`);
    if (fs.existsSync(mapPath)) {
      sm = new SourceMap(JSON.parse(fs.readFileSync(mapPath, "utf8")));
    }
  } catch {
    sm = null;
  }
  mapCache.set(jsFileName, sm);
  return sm;
}

// Frames look like:
//   at fn (https://host/assets/config-DGP6sHOc.js:1:15033)
//   at https://host/assets/config-DGP6sHOc.js:1:15033
const MAX_FRAME_LINE_LENGTH = 1024;
const FRAME_RE = /(https?:\/\/[^\s)]+\/assets\/([A-Za-z0-9._-]+\.js)):(\d+):(\d+)/g;

/**
 * Rewrites minified `…/assets/<chunk>.js:line:col` frames in a stack to their
 * original source positions using hidden source maps. Returns the rewritten
 * stack, or null if nothing could be resolved (no maps available / no match).
 */
export function resolveMinifiedStack(stack?: string | null): string | null {
  if (!stack || typeof stack !== "string") return null;
  let resolvedAny = false;

  // The stack arrives from the browser, so it is untrusted. FRAME_RE
  // backtracks on long unbroken tokens, so it only runs on lines of a
  // realistic length; anything longer is kept as it is.
  const resolveLine = (line: string): string => {
    if (line.length > MAX_FRAME_LINE_LENGTH) return line;
    return line.replace(FRAME_RE, (whole, _url, jsFile, lineStr, colStr) => {
      const sm = loadSourceMap(jsFile);
      if (!sm) return whole;
      try {
        // V8 stack line/column are 1-based; SourceMap.findEntry expects 0-based.
        // findEntry returns `{} | SourceMapping`; narrow to the fields we read.
        const entry = sm.findEntry(Number(lineStr) - 1, Number(colStr) - 1) as {
          originalSource?: string;
          originalLine?: number;
          originalColumn?: number;
        };
        if (entry && entry.originalSource != null) {
          resolvedAny = true;
          // Trim the long file:// / webpack-style prefix down to the repo-relative
          // path (e.g. "client/src/pages/config.tsx").
          const src = String(entry.originalSource).replace(/^.*?((?:client\/)?src\/.*)$/, "$1");
          const ol = (entry.originalLine ?? 0) + 1;
          const oc = (entry.originalColumn ?? 0) + 1;
          return `${src}:${ol}:${oc}  [${jsFile}]`;
        }
      } catch {
        /* fall through, keep original frame */
      }
      return whole;
    });
  };

  const out = stack.split("\n").map(resolveLine).join("\n");
  return resolvedAny ? out : null;
}
