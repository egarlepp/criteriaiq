// @vitest-environment node
//
// Locks the contract that `docs/guides/dokploy-traefik-timeouts.md`
// stays in lock-step with the live `HEALTHCHECK` directive in the
// project's `Dockerfile`. The check itself lives in
// `scripts/check-healthcheck-doc-sync.ts` (see task-512); this suite
// exercises the parser/comparator on synthetic fixtures and then
// asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  DOCKERFILE,
  DOCS_FILE,
  HEALTHCHECK_KNOBS,
  checkHealthcheckDocSync,
  compareCitations,
  extractDocsHealthcheckCitations,
  formatReport,
  parseDockerfileHealthcheck,
} from "./check-healthcheck-doc-sync";

const sampleDockerfile = [
  "FROM node:20",
  "WORKDIR /app",
  "EXPOSE 5000",
  "HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \\",
  "  CMD curl -fsS http://127.0.0.1:5000/api/setup/status || exit 1",
  'CMD ["node", "dist/index.js"]',
  "",
].join("\n");

const sampleDocs = [
  "# Some guide",
  "",
  "The Dockerfile `HEALTHCHECK` `start-period=90s` exists for this reason.",
  "",
  "Behaviour: ~30–60s of 502s on first deploy.",
  "",
  "```yaml",
  "services:",
  "  app:",
  "    labels:",
  '      - "traefik.http.services.foo.loadbalancer.healthcheck.interval=30s"',
  "```",
  "",
].join("\n");

describe("parseDockerfileHealthcheck", () => {
  it("extracts every supported knob from a single-line directive", () => {
    const dockerfile =
      "HEALTHCHECK --interval=30s --timeout=5s --start-period=90s " +
      "--retries=3 CMD curl -fsS http://x/ || exit 1\n";
    expect(parseDockerfileHealthcheck(dockerfile)).toEqual({
      interval: "30s",
      timeout: "5s",
      "start-period": "90s",
      retries: "3",
    });
  });

  it("joins backslash-continued lines before parsing flags", () => {
    expect(parseDockerfileHealthcheck(sampleDockerfile)).toEqual({
      interval: "30s",
      timeout: "5s",
      "start-period": "90s",
      retries: "3",
    });
  });

  it("does not mistake a flag-shaped token after CMD for a knob", () => {
    const dockerfile =
      "HEALTHCHECK --start-period=90s CMD curl --retries=99 http://x/\n";
    expect(parseDockerfileHealthcheck(dockerfile)).toEqual({
      "start-period": "90s",
    });
  });

  it("returns only the knobs that are actually present", () => {
    const dockerfile = "HEALTHCHECK --start-period=42s CMD true\n";
    expect(parseDockerfileHealthcheck(dockerfile)).toEqual({
      "start-period": "42s",
    });
  });

  it("throws if no HEALTHCHECK directive is present", () => {
    expect(() => parseDockerfileHealthcheck("FROM node:20\nCMD true\n"))
      .toThrow(/Could not find a HEALTHCHECK directive/);
  });
});

describe("extractDocsHealthcheckCitations", () => {
  it("captures every backticked HEALTHCHECK knob with its line number", () => {
    const citations = extractDocsHealthcheckCitations(sampleDocs);
    expect(citations).toEqual([
      {
        line: 3,
        knob: "start-period",
        value: "90s",
        raw: "start-period=90s",
      },
    ]);
  });

  it("tolerates an optional leading `--` on the citation", () => {
    const md = "Set `--interval=30s` for the probe.\n";
    expect(extractDocsHealthcheckCitations(md)).toEqual([
      {
        line: 1,
        knob: "interval",
        value: "30s",
        raw: "--interval=30s",
      },
    ]);
  });

  it("returns multiple citations in document order", () => {
    const md = [
      "Quote one: `start-period=90s`.",
      "",
      "Quote two: `retries=3`.",
    ].join("\n");
    const citations = extractDocsHealthcheckCitations(md);
    expect(citations.map((c) => c.knob)).toEqual([
      "start-period",
      "retries",
    ]);
    expect(citations.map((c) => c.line)).toEqual([1, 3]);
  });

  it("ignores backticked tokens that aren't HEALTHCHECK knobs", () => {
    const md =
      "Other knobs like `DB_POOL_MAX=25` and `SLOW_SAVE_THRESHOLD_MS` " +
      "are unrelated.\n";
    expect(extractDocsHealthcheckCitations(md)).toEqual([]);
  });

  it("ignores knob-shaped strings that live inside a fenced code block", () => {
    // The yaml fence carries `traefik.…healthcheck.interval=30s`,
    // which is a Traefik LB setting, not the Dockerfile HEALTHCHECK
    // directive. It must not be picked up.
    const citations = extractDocsHealthcheckCitations(sampleDocs);
    expect(citations.some((c) => c.raw.includes("traefik"))).toBe(false);
  });
});

describe("compareCitations", () => {
  it("reports OK when every cited knob matches the Dockerfile", () => {
    const result = compareCitations(
      { interval: "30s", "start-period": "90s" },
      [{ line: 5, knob: "start-period", value: "90s", raw: "start-period=90s" }],
    );
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("flags a divergent value with file:line and both sides", () => {
    const result = compareCitations(
      { "start-period": "120s" },
      [{ line: 42, knob: "start-period", value: "90s", raw: "start-period=90s" }],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(`${DOCS_FILE}:42`);
    expect(result.reason).toContain("start-period=90s");
    expect(result.reason).toContain("--start-period=120s");
  });

  it("flags a citation whose knob is not in the Dockerfile at all", () => {
    const result = compareCitations(
      { "start-period": "90s" },
      [{ line: 7, knob: "retries", value: "3", raw: "retries=3" }],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no --retries= flag");
  });

  it("requires at least one citation in the docs", () => {
    const result = compareCitations({ "start-period": "90s" }, []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not cite any HEALTHCHECK knob");
    for (const knob of HEALTHCHECK_KNOBS) {
      expect(result.reason).toContain(knob);
    }
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the citation count", () => {
    const result = compareCitations(
      { "start-period": "90s" },
      [{ line: 3, knob: "start-period", value: "90s", raw: "start-period=90s" }],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("1 citation");
  });

  it("produces a FAIL summary with a fix pointer to the Dockerfile", () => {
    const result = compareCitations(
      { "start-period": "120s" },
      [{ line: 9, knob: "start-period", value: "90s", raw: "start-period=90s" }],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(DOCS_FILE);
    expect(report).toContain(DOCKERFILE);
    expect(report).toContain("source of truth");
  });
});

describe("checkHealthcheckDocSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkHealthcheckDocSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.citations.length).toBeGreaterThan(0);
    // Every citation in the live guide should reference a knob the
    // live Dockerfile actually declares.
    for (const c of result.citations) {
      expect(result.dockerfileValues[c.knob]).toBe(c.value);
    }
  });
});
