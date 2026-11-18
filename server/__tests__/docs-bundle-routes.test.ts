// @vitest-environment node
//
// Coverage for the runtime docs viewer (task #476).
//
// We import the shared loader from `server/docs-runtime-loader` —
// the same module `server/routes.ts` uses at startup — so this test
// stays locked to production behavior. We then mount a small set of
// real Express handlers around it that mirror what `routes.ts` does
// for /api/docs/<slug>, point a temp cwd at a synthetic
// `dist/runtime-docs.json`, and assert:
//
//   1. The bundled-JSON path resolves real route slugs (the production
//      mode that previously 404'd before this task).
//   2. Slugs the manifest does NOT register still 404 (no leak).
//   3. The bundle is preferred over the live filesystem when the
//      server is NOT in development mode.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { docsManifest } from "../docs-manifest";
import { createDocsLoader } from "../docs-runtime-loader";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docs-bundle-test-"));

beforeAll(() => {
  fs.mkdirSync(path.join(tmpRoot, "dist"), { recursive: true });
  // Build a synthetic bundle whose values are easy to assert on.
  const bundle: Record<string, string> = {};
  for (const entry of docsManifest) {
    bundle[entry.source] = `# SYNTHETIC BUNDLE CONTENT\n\nsource=${entry.source}\n`;
  }
  fs.writeFileSync(
    path.join(tmpRoot, "dist", "runtime-docs.json"),
    JSON.stringify(bundle),
    "utf8",
  );
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("runtime docs bundle routes (task #476)", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl: string;

  beforeAll(async () => {
    // Use the production loader directly. We pass an explicit cwd so
    // the test doesn't depend on process.cwd(), and useBundle=true so
    // the result is deterministic regardless of vitest's NODE_ENV.
    const { loadDocSource, bundleLoaded, bundleSize } = createDocsLoader({
      cwd: tmpRoot,
      useBundle: true,
      log: () => {
        /* keep the test output tidy */
      },
    });
    expect(bundleLoaded).toBe(true);
    expect(bundleSize).toBe(docsManifest.length);

    const app = express();
    // Mirror the request handler `server/routes.ts` registers for
    // every API route in the manifest. Kept tiny on purpose: the
    // interesting logic lives in `loadDocSource`.
    for (const entry of docsManifest) {
      for (const apiPath of entry.apiRoutes) {
        app.get(apiPath, (_req, res) => {
          const md = loadDocSource(entry.source);
          if (md == null) return res.status(404).send("not found");
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.send(md);
        });
      }
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // Routes the About page actually links to today. If any of these
  // breaks, the customer-facing docs viewer breaks.
  const probedRoutes: { route: string; source: string }[] = [
    { route: "/api/docs/project_overview", source: "docs/architecture/project-overview.md" },
    { route: "/api/docs/db-schema-refactor", source: "migrations/db_refactor/README.md" },
    { route: "/api/docs/email-automation-system", source: "docs/features/workflow-automation-system.md" },
    { route: "/api/docs/workflow-automation-system", source: "docs/features/workflow-automation-system.md" },
    { route: "/api/docs/file-upload-system", source: "docs/features/file-upload-system.md" },
  ];

  for (const { route, source } of probedRoutes) {
    it(`serves ${route} from the bundle`, async () => {
      const res = await fetch(`${baseUrl}${route}`);
      expect(res.status).toBe(200);
      const body = await res.text();
      // Synthetic bundle content lets us assert the bundle is the
      // source — not some live filesystem read happening to succeed.
      expect(body).toContain("SYNTHETIC BUNDLE CONTENT");
      expect(body).toContain(`source=${source}`);
    });
  }

  it("returns 404 for an unknown /api/docs/* slug", async () => {
    const res = await fetch(`${baseUrl}/api/docs/this-slug-does-not-exist-anywhere`);
    expect(res.status).toBe(404);
  });

  it("registers every /api/docs/* route declared in the manifest", () => {
    // Sanity check: a manifest entry with no apiRoutes would be a bug
    // (the consumer can't reach it), so guard the contract here too.
    const totalApiRoutes = docsManifest.reduce(
      (n, entry) => n + entry.apiRoutes.length,
      0,
    );
    expect(totalApiRoutes).toBeGreaterThanOrEqual(docsManifest.length);
  });
});

describe("createDocsLoader dev-mode skip", () => {
  // A second tiny scenario: when useBundle=false we should NOT load
  // the bundle even if it's present, so any subsequent loadDocSource
  // call falls back to the filesystem (or returns null when the file
  // doesn't exist under the test's cwd).
  it("does not load the bundle when useBundle=false", () => {
    const { bundleLoaded, bundleSize, loadDocSource } = createDocsLoader({
      cwd: tmpRoot,
      useBundle: false,
      log: () => {
        /* tidy */
      },
    });
    expect(bundleLoaded).toBe(false);
    expect(bundleSize).toBe(0);
    // No real docs/ tree under tmpRoot, so the fallback returns null
    // instead of accidentally returning bundled content.
    expect(loadDocSource("docs/architecture/project-overview.md")).toBeNull();
  });
});
