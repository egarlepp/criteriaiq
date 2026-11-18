// @vitest-environment node
//
// Locks the contract that `getVersionInfo` (the helper backing
// GET /api/version) returns the unbranded `'unknown'` sentinel — and
// not a hardcoded version literal — when version.json is missing and
// the build-time env vars are unset. See task-379: a stale literal
// fallback was previously masquerading as the running version on the
// login + setup screens because version.json was not copied into the
// runner Docker stage.

import { describe, it, expect, vi } from "vitest";
import { getVersionInfo, getVersionUpdates } from "../lib/version-info";

describe("getVersionInfo", () => {
  it("returns 'unknown' for version + gitCommit when version.json is missing and env vars are unset", () => {
    const warn = vi.fn();
    const result = getVersionInfo(
      "/no/such/dir",
      {
        existsSync: () => false,
        readFileSync: () => "",
      } as unknown as typeof import("fs"),
      {} as NodeJS.ProcessEnv,
      warn,
    );

    expect(result.version).toBe("unknown");
    expect(result.gitCommit).toBe("unknown");
    expect(result.environment).toBe("development");
    // Diagnostic must be visible in logs so a missing-file regression
    // doesn't silently linger across deploys.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("version.json not found");
  });

  it("prefers VITE_APP_VERSION / GIT_COMMIT env vars over the 'unknown' sentinel", () => {
    const warn = vi.fn();
    const result = getVersionInfo(
      "/no/such/dir",
      {
        existsSync: () => false,
        readFileSync: () => "",
      } as unknown as typeof import("fs"),
      {
        VITE_APP_VERSION: "v9.9.9",
        GIT_COMMIT: "abcdef",
        BUILD_DATE: "2026-04-26T00:00:00Z",
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv,
      warn,
    );

    expect(result.version).toBe("v9.9.9");
    expect(result.gitCommit).toBe("abcdef");
    expect(result.buildDate).toBe("2026-04-26T00:00:00Z");
    expect(result.environment).toBe("production");
  });

  it("reads version.json when present and returns the embedded version", () => {
    const warn = vi.fn();
    const payload = JSON.stringify({
      version: "v0.7.10",
      buildDate: "2026-04-23T00:00:00Z",
      gitCommit: "first-run-setup-and-self-hosting-bootstrap",
      environment: "production",
    });
    const result = getVersionInfo(
      "/app",
      {
        existsSync: (p: string) => p.endsWith("version.json"),
        readFileSync: () => payload,
      } as unknown as typeof import("fs"),
      {} as NodeJS.ProcessEnv,
      warn,
    );

    expect(result.version).toBe("v0.7.10");
    expect(result.gitCommit).toBe("first-run-setup-and-self-hosting-bootstrap");
    expect(result.environment).toBe("production");
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to 'unknown' (and warns) when version.json is corrupt", () => {
    const warn = vi.fn();
    const result = getVersionInfo(
      "/app",
      {
        existsSync: () => true,
        readFileSync: () => "{not json",
      } as unknown as typeof import("fs"),
      {} as NodeJS.ProcessEnv,
      warn,
    );

    expect(result.version).toBe("unknown");
    expect(result.gitCommit).toBe("unknown");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Could not read version.json");
  });
});

describe("getVersionUpdates", () => {
  const io = (content: string) =>
    ({
      existsSync: () => true,
      readFileSync: () => content,
    }) as unknown as typeof import("fs");

  it("returns the interim updates from version.json, dropping malformed rows", () => {
    const result = getVersionUpdates(
      "/app",
      io(
        JSON.stringify({
          version: "v0.10.2",
          release: "v0.10.0",
          updates: [
            { version: "v0.10.2", date: "2026-10-28", pr: 12, title: "Second", category: "security" },
            { version: "v0.10.1", date: "2026-10-27", pr: "x", title: "First", category: "bogus" },
            { title: "no version" },
            "junk",
          ],
        }),
      ),
    );
    expect(result).toEqual({
      release: "v0.10.0",
      version: "v0.10.2",
      updates: [
        { version: "v0.10.2", date: "2026-10-28", pr: 12, title: "Second", category: "security" },
        // Unknown or missing categories (rows written before categories) read as Improvements.
        { version: "v0.10.1", date: "2026-10-27", pr: null, title: "First", category: "improvement" },
      ],
    });
  });

  it("returns an empty list when version.json has no updates (just after a release cut)", () => {
    expect(getVersionUpdates("/app", io(JSON.stringify({ version: "v0.11.0", release: "v0.11.0" })))).toEqual({
      release: "v0.11.0",
      version: "v0.11.0",
      updates: [],
    });
  });

  it("returns an empty list when version.json is missing or unreadable", () => {
    const missing = { existsSync: () => false, readFileSync: () => "" } as unknown as typeof import("fs");
    expect(getVersionUpdates("/app", missing).updates).toEqual([]);
    expect(getVersionUpdates("/app", io("{not json")).updates).toEqual([]);
  });
});
