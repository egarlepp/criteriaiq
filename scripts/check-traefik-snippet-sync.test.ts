// @vitest-environment node
//
// Locks the contract that the commented Traefik labels in
// `docker-compose.yml` stay in lock-step with the
// "Recommended Traefik snippet for Dokploy" section of
// `docs/guides/dokploy-traefik-timeouts.md`. The check itself lives
// in `scripts/check-traefik-snippet-sync.ts` (see task-504); this
// suite exercises the parser/comparator on synthetic fixtures and
// then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  COMPOSE_FILE,
  DOCS_FILE,
  DOCS_HEADING,
  checkTraefikSnippetSync,
  compareLabels,
  extractComposeLabels,
  extractDocsLabels,
  formatReport,
} from "./check-traefik-snippet-sync";

const sampleDocs = [
  `## ${DOCS_HEADING}`,
  "",
  "Drop this into your Dokploy compose template:",
  "",
  "```yaml",
  "services:",
  "  app:",
  "    labels:",
  '      - "traefik.enable=true"',
  '      - "traefik.http.routers.foo.rule=Host(`x`)"',
  '      - "traefik.http.services.foo.loadbalancer.server.port=5000"',
  "```",
  "",
].join("\n");

const sampleCompose = [
  "services:",
  "  app:",
  "    image: x",
  "    # ----------------------------------------------------------------------",
  "    # Recommended Traefik labels for Dokploy …",
  "    # ----------------------------------------------------------------------",
  "    # labels:",
  '    #   - "traefik.enable=true"',
  '    #   - "traefik.http.routers.foo.rule=Host(`x`)"',
  '    #   - "traefik.http.services.foo.loadbalancer.server.port=5000"',
  "",
  "  postgres:",
  "    image: y",
].join("\n");

describe("extractDocsLabels", () => {
  it("pulls the ordered traefik.* labels out of the fenced YAML block", () => {
    expect(extractDocsLabels(sampleDocs)).toEqual([
      "traefik.enable=true",
      "traefik.http.routers.foo.rule=Host(`x`)",
      "traefik.http.services.foo.loadbalancer.server.port=5000",
    ]);
  });

  it("throws if the heading is missing", () => {
    expect(() => extractDocsLabels("# Some other doc\n\nNo snippet here.\n"))
      .toThrow(/Could not find heading/);
  });

  it("throws if there is no yaml fence under the heading", () => {
    const md = `## ${DOCS_HEADING}\n\nProse but no fenced code.\n`;
    expect(() => extractDocsLabels(md)).toThrow(/yaml fenced code block/);
  });

  it("throws if the fence has no traefik labels", () => {
    const md = [
      `## ${DOCS_HEADING}`,
      "",
      "```yaml",
      "services:",
      "  app:",
      "    image: x",
      "```",
    ].join("\n");
    expect(() => extractDocsLabels(md)).toThrow(/No `traefik\.…` labels/);
  });

  it("ignores non-traefik lines inside the fence", () => {
    const md = [
      `## ${DOCS_HEADING}`,
      "",
      "```yaml",
      "services:",
      "  app:",
      "    labels:",
      '      - "other.label=keep-out"',
      '      - "traefik.enable=true"',
      "```",
    ].join("\n");
    expect(extractDocsLabels(md)).toEqual(["traefik.enable=true"]);
  });
});

describe("extractComposeLabels", () => {
  it("pulls commented traefik.* labels under a `# labels:` marker", () => {
    expect(extractComposeLabels(sampleCompose)).toEqual([
      "traefik.enable=true",
      "traefik.http.routers.foo.rule=Host(`x`)",
      "traefik.http.services.foo.loadbalancer.server.port=5000",
    ]);
  });

  it("tolerates blank `#` separator lines inside the block", () => {
    const yaml = [
      "services:",
      "  app:",
      "    # labels:",
      '    #   - "traefik.enable=true"',
      "    #",
      '    #   - "traefik.http.routers.foo.rule=Host(`x`)"',
      "",
    ].join("\n");
    expect(extractComposeLabels(yaml)).toEqual([
      "traefik.enable=true",
      "traefik.http.routers.foo.rule=Host(`x`)",
    ]);
  });

  it("stops at the first non-comment, non-traefik line", () => {
    const yaml = [
      "services:",
      "  app:",
      "    # labels:",
      '    #   - "traefik.enable=true"',
      "  postgres:",
      "    image: y",
      '    #   - "traefik.should.not.appear=true"',
    ].join("\n");
    expect(extractComposeLabels(yaml)).toEqual(["traefik.enable=true"]);
  });

  it("throws if no `# labels:` marker is present", () => {
    const yaml = "services:\n  app:\n    image: x\n";
    expect(() => extractComposeLabels(yaml)).toThrow(
      /No commented `traefik/,
    );
  });
});

describe("compareLabels", () => {
  it("reports OK when the two ordered lists match exactly", () => {
    const labels = ["traefik.enable=true", "traefik.x=1"];
    const result = compareLabels(labels, labels.slice());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("flags a mismatched value at a given position", () => {
    const result = compareLabels(
      ["traefik.enable=true", "traefik.x=1"],
      ["traefik.enable=true", "traefik.x=2"],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Label 2 differs");
    expect(result.reason).toContain("traefik.x=1");
    expect(result.reason).toContain("traefik.x=2");
  });

  it("flags an extra label that the docs has but the compose does not", () => {
    const result = compareLabels(
      ["traefik.enable=true"],
      ["traefik.enable=true", "traefik.extra=1"],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(DOCS_FILE);
    expect(result.reason).toContain("extra label");
    expect(result.reason).toContain("traefik.extra=1");
  });

  it("flags an extra label that the compose has but the docs does not", () => {
    const result = compareLabels(
      ["traefik.enable=true", "traefik.extra=1"],
      ["traefik.enable=true"],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(COMPOSE_FILE);
    expect(result.reason).toContain("extra label");
    expect(result.reason).toContain("traefik.extra=1");
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the label count", () => {
    const result = compareLabels(["traefik.enable=true"], ["traefik.enable=true"]);
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("1 label");
  });

  it("produces a FAIL summary with a fix pointer to the docs guide", () => {
    const result = compareLabels(
      ["traefik.enable=true"],
      ["traefik.enable=false"],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(DOCS_FILE);
    expect(report).toContain(COMPOSE_FILE);
    expect(report).toContain("source of truth");
  });
});

describe("checkTraefikSnippetSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkTraefikSnippetSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.composeLabels.length).toBeGreaterThan(0);
    expect(result.composeLabels).toEqual(result.docsLabels);
  });
});
