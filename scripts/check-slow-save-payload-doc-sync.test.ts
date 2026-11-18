// @vitest-environment node
//
// Locks the contract that the literal JSON warning samples in
// `docs/guides/dokploy-traefik-timeouts.md` and `PROJECT_REFERENCE.md` stay in
// lock-step with the `event` object literal that `warnIfSlowSave`
// constructs in `server/lib/slow-save-warn.ts`. The check itself
// lives in `scripts/check-slow-save-payload-doc-sync.ts` (see
// task-519); this suite exercises the parser/comparator on
// synthetic fixtures and then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  DOCS_FILES,
  SAMPLE_MARKER,
  SOURCE_FILE,
  checkSlowSavePayloadDocSync,
  compareSamples,
  findJsonSamples,
  formatReport,
  normalizeSample,
  parseCanonicalKeys,
  parseSampleKeys,
} from "./check-slow-save-payload-doc-sync";

const sampleSource = [
  "// Some preamble.",
  "export function warnIfSlowSave() {",
  "  const event: Record<string, unknown> = {",
  "    event: 'slow_field_settings_save',",
  "    handler,",
  "    durationMs,",
  "    thresholdMs,",
  "  };",
  "  return event;",
  "}",
  "",
].join("\n");

describe("parseCanonicalKeys", () => {
  it("extracts every key from the `event` object literal in source order", () => {
    expect(parseCanonicalKeys(sampleSource)).toEqual([
      "event",
      "handler",
      "durationMs",
      "thresholdMs",
    ]);
  });

  it("tolerates loose whitespace inside the type annotation", () => {
    const src = [
      "  const  event :  Record < string , unknown >  = {",
      "    event: 'x',",
      "    handler,",
      "  };",
    ].join("\n");
    expect(parseCanonicalKeys(src)).toEqual(["event", "handler"]);
  });

  it("skips comment-only and blank lines inside the literal", () => {
    const src = [
      "const event: Record<string, unknown> = {",
      "  // leading comment",
      "  event: 'x',",
      "",
      "  handler, // trailing comment",
      "  durationMs,",
      "};",
    ].join("\n");
    expect(parseCanonicalKeys(src)).toEqual([
      "event",
      "handler",
      "durationMs",
    ]);
  });

  it("throws if the `event` object literal is missing entirely", () => {
    expect(() =>
      parseCanonicalKeys("export function nope() { return 0; }\n"),
    ).toThrow(/Could not find a .*const event/);
  });

  it("picks up a renamed key so docs drift is exposed", () => {
    // Simulate someone renaming `durationMs` → `elapsedMs` on the
    // server side. The canonical set must change; downstream
    // comparator will then flag any doc sample that still says
    // `durationMs`.
    const src = [
      "const event: Record<string, unknown> = {",
      "  event: 'slow_field_settings_save',",
      "  handler,",
      "  elapsedMs,",
      "  thresholdMs,",
      "};",
    ].join("\n");
    expect(parseCanonicalKeys(src)).toEqual([
      "event",
      "handler",
      "elapsedMs",
      "thresholdMs",
    ]);
  });
});

describe("findJsonSamples", () => {
  it("captures a fenced JSON sample with its opening-brace line", () => {
    const md = [
      "Preamble.",
      "",
      "```",
      '{"event":"slow_field_settings_save","handler":"PUT /x","durationMs":12,"thresholdMs":2000,"id":"3"}',
      "```",
      "",
    ].join("\n");
    const samples = findJsonSamples(
      "docs/guides/dokploy-traefik-timeouts.md",
      md,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]!.line).toBe(4);
    expect(samples[0]!.raw.startsWith("{")).toBe(true);
    expect(samples[0]!.raw.endsWith("}")).toBe(true);
    expect(samples[0]!.raw).toContain("slow_field_settings_save");
  });

  it("captures an inline-code JSON sample (PROJECT_REFERENCE.md style)", () => {
    const md =
      'The server emits `{"event":"slow_field_settings_save",' +
      '"handler":"...","durationMs":N,"thresholdMs":N,"id":"..."}` ' +
      "on stderr.\n";
    const samples = findJsonSamples("PROJECT_REFERENCE.md", md);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.line).toBe(1);
    expect(samples[0]!.raw).toContain("durationMs");
  });

  it("ignores marker mentions that are not inside a JSON object", () => {
    // Bare prose mention of the event name in backticks — no
    // surrounding `{ ... }` — must not be flagged as a sample.
    const md =
      "Look for the `slow_field_settings_save` line in the deployment log.\n";
    expect(findJsonSamples("PROJECT_REFERENCE.md", md)).toEqual([]);
  });

  it("returns multiple samples when a file has more than one", () => {
    const md = [
      '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
      "",
      "Some prose.",
      "",
      '{"event":"slow_field_settings_save","handler":"b","durationMs":3,"thresholdMs":4}',
    ].join("\n");
    const samples = findJsonSamples("PROJECT_REFERENCE.md", md);
    expect(samples.map((s) => s.line)).toEqual([1, 5]);
  });
});

describe("normalizeSample", () => {
  it("rewrites bare `N` placeholder values to `0` for parseability", () => {
    const raw = '{"durationMs":N,"thresholdMs":N,"id":"..."}';
    expect(normalizeSample(raw)).toBe(
      '{"durationMs":0,"thresholdMs":0,"id":"..."}',
    );
  });

  it("leaves real numeric values and string placeholders untouched", () => {
    const raw = '{"durationMs":12345,"id":"3"}';
    expect(normalizeSample(raw)).toBe(raw);
  });
});

describe("parseSampleKeys", () => {
  it("returns the top-level keys of a literal JSON sample", () => {
    const raw =
      '{"event":"slow_field_settings_save","handler":"PUT /x",' +
      '"durationMs":12345,"thresholdMs":2000,"id":"3"}';
    expect(parseSampleKeys(raw)).toEqual([
      "event",
      "handler",
      "durationMs",
      "thresholdMs",
      "id",
    ]);
  });

  it("parses inline-code samples that use `N` placeholders", () => {
    const raw =
      '{"event":"slow_field_settings_save","handler":"...",' +
      '"durationMs":N,"thresholdMs":N,"id":"..."}';
    expect(parseSampleKeys(raw)).toEqual([
      "event",
      "handler",
      "durationMs",
      "thresholdMs",
      "id",
    ]);
  });

  it("throws on a JSON sample that is not an object literal", () => {
    expect(() => parseSampleKeys("[1, 2, 3]")).toThrow(/not an object/);
  });

  it("throws on malformed JSON with a precise message", () => {
    expect(() => parseSampleKeys('{"event":}')).toThrow(/Could not parse/);
  });
});

describe("compareSamples", () => {
  const canonical = ["event", "handler", "durationMs", "thresholdMs"];

  it("reports OK when every sample contains every canonical key", () => {
    const result = compareSamples(canonical, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 59,
        raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2,"id":"3"}',
        keys: ["event", "handler", "durationMs", "thresholdMs", "id"],
      },
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        raw: '{"event":"slow_field_settings_save","handler":"...","durationMs":N,"thresholdMs":N,"id":"..."}',
        keys: ["event", "handler", "durationMs", "thresholdMs", "id"],
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("flags a sample missing a canonical key with file:line and key list", () => {
    const result = compareSamples(canonical, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 59,
        // `thresholdMs` deliberately absent — the original drift in
        // task-519. We expect the report to point at the line and
        // name the missing key precisely.
        raw: '{"event":"slow_field_settings_save","handler":"PUT /x","durationMs":12345,"id":"3"}',
        keys: ["event", "handler", "durationMs", "id"],
      },
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        raw: '{"event":"slow_field_settings_save","handler":"...","durationMs":N,"thresholdMs":N,"id":"..."}',
        keys: ["event", "handler", "durationMs", "thresholdMs", "id"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "docs/guides/dokploy-traefik-timeouts.md:59",
    );
    expect(result.reason).toContain("`thresholdMs`");
    expect(result.reason).toContain(SOURCE_FILE);
  });

  it("flags a renamed canonical key by listing it as missing", () => {
    // Simulate `durationMs` → `elapsedMs` on the server side; old
    // doc sample still says `durationMs`. The lint must spot that
    // `elapsedMs` is missing from the doc.
    const result = compareSamples(
      ["event", "handler", "elapsedMs", "thresholdMs"],
      [
        {
          file: "docs/guides/dokploy-traefik-timeouts.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
          keys: ["event", "handler", "durationMs", "thresholdMs"],
        },
        {
          file: "PROJECT_REFERENCE.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
          keys: ["event", "handler", "durationMs", "thresholdMs"],
        },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("`elapsedMs`");
  });

  it("requires at least one JSON sample per documentation file", () => {
    const result = compareSamples(canonical, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 59,
        raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
        keys: ["event", "handler", "durationMs", "thresholdMs"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("PROJECT_REFERENCE.md");
    expect(result.reason).toContain("does not contain");
  });

  it("requires the docs guide to contain a sample too", () => {
    const result = compareSamples(canonical, [
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
        keys: ["event", "handler", "durationMs", "thresholdMs"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "docs/guides/dokploy-traefik-timeouts.md",
    );
    expect(result.reason).toContain("does not contain");
  });
});

describe("formatReport", () => {
  it("produces an OK summary that names every canonical key", () => {
    const result = compareSamples(
      ["event", "handler", "durationMs", "thresholdMs"],
      [
        {
          file: "docs/guides/dokploy-traefik-timeouts.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
          keys: ["event", "handler", "durationMs", "thresholdMs"],
        },
        {
          file: "PROJECT_REFERENCE.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
          keys: ["event", "handler", "durationMs", "thresholdMs"],
        },
      ],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("`thresholdMs`");
    expect(report).toContain("2 sample");
  });

  it("produces a FAIL summary that points operators back at the source", () => {
    const result = compareSamples(
      ["event", "handler", "durationMs", "thresholdMs"],
      [
        {
          file: "docs/guides/dokploy-traefik-timeouts.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"id":"3"}',
          keys: ["event", "handler", "durationMs", "id"],
        },
        {
          file: "PROJECT_REFERENCE.md",
          line: 59,
          raw: '{"event":"slow_field_settings_save","handler":"a","durationMs":1,"thresholdMs":2}',
          keys: ["event", "handler", "durationMs", "thresholdMs"],
        },
      ],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(SOURCE_FILE);
    for (const docs of DOCS_FILES) {
      expect(report).toContain(docs);
    }
    expect(report).toContain("source of truth");
  });
});

describe("checkSlowSavePayloadDocSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkSlowSavePayloadDocSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    // Both documentation files must have contributed at least one
    // sample; otherwise drift in whichever file is silent would
    // slip through.
    const filesSeen = new Set(result.samples.map((s) => s.file));
    for (const file of DOCS_FILES) {
      expect(filesSeen.has(file)).toBe(true);
    }
    // Every sample must contain every canonical key.
    for (const sample of result.samples) {
      for (const key of result.canonicalKeys) {
        expect(sample.keys).toContain(key);
      }
    }
  });

  it("the canonical set still includes the documented keys", () => {
    // Belt-and-braces: even if someone changes the source-of-truth
    // parser, the four keys the prose talks about must remain
    // canonical or the lint loses its meaning. (If you legitimately
    // need to remove one, update both this test and the prose in
    // the same change.)
    const result = checkSlowSavePayloadDocSync();
    for (const key of ["event", "handler", "durationMs", "thresholdMs"]) {
      expect(result.canonicalKeys).toContain(key);
    }
  });

  it("uses the documented marker string", () => {
    expect(SAMPLE_MARKER).toBe("slow_field_settings_save");
  });
});
