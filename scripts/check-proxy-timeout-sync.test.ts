// @vitest-environment node
//
// Locks the contract that the per-proxy upstream timeout knobs in
// `docs/guides/dokploy-traefik-timeouts.md` (the new "Other reverse
// proxies" section added by task-511) stay in lock-step with the same
// knobs in `docs/guides/self-hosting.md` (Path B step 6 Caddyfile and
// the § NGINX reverse proxy block).
//
// The check itself lives in `scripts/check-proxy-timeout-sync.ts`
// (task-513); this suite exercises the parser/comparator on synthetic
// fixtures and then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  CADDY_KNOBS,
  NGINX_KNOBS,
  SELF_HOSTING_DOC,
  TIMEOUTS_DOC,
  checkProxyTimeoutSync,
  collectFileKnobs,
  compareFileKnobs,
  extractFencedBlocks,
  extractKnobValues,
  formatReport,
} from "./check-proxy-timeout-sync";

const goodCaddyDocsBlock = [
  "## Other reverse proxies (Caddy & NGINX)",
  "",
  "### Caddy",
  "",
  "```caddy",
  "your-domain.com {",
  "  reverse_proxy localhost:5000 {",
  "    transport http {",
  "      dial_timeout    30s   # ↔ Traefik dialTimeout",
  "      read_timeout    60s   # ↔ Traefik responseHeaderTimeout — raise this",
  "      write_timeout   60s   # ↔ Traefik respondingTimeouts.writeTimeout",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "### NGINX",
  "",
  "```nginx",
  "location / {",
  "  proxy_pass         http://127.0.0.1:5000;",
  "  proxy_connect_timeout 30s;   # ↔ Traefik dialTimeout",
  "  proxy_read_timeout    60s;   # ↔ Traefik responseHeaderTimeout — raise this",
  "  proxy_send_timeout    60s;   # ↔ Traefik respondingTimeouts.writeTimeout",
  "}",
  "```",
  "",
].join("\n");

const goodSelfHostingBlock = [
  "6. Put Caddy in front for free TLS.",
  "   ```caddy",
  "   your-domain.com {",
  "     reverse_proxy localhost:5000 {",
  "       transport http {",
  "         dial_timeout    30s",
  "         read_timeout    60s",
  "         write_timeout   60s",
  "       }",
  "     }",
  "   }",
  "   ```",
  "",
  "### NGINX reverse proxy",
  "",
  "```nginx",
  "server {",
  "  location / {",
  "    proxy_connect_timeout 30s;",
  "    proxy_send_timeout    60s;",
  "    proxy_read_timeout    60s;",
  "  }",
  "}",
  "```",
  "",
].join("\n");

describe("extractFencedBlocks", () => {
  it("returns the body of every matching fenced code block", () => {
    const md = [
      "```caddy",
      "block-one",
      "```",
      "intermission",
      "```caddy",
      "block-two",
      "```",
    ].join("\n");
    expect(extractFencedBlocks(md, "caddy")).toEqual([
      "block-one\n",
      "block-two\n",
    ]);
  });

  it("returns an empty list when no fences match the language", () => {
    const md = "```yaml\nfoo: bar\n```";
    expect(extractFencedBlocks(md, "caddy")).toEqual([]);
  });

  it("does not match languages with extra suffix tokens", () => {
    // A future ```caddy-extra fence must not silently leak into Caddy
    // parsing; the extractor is intentionally strict on the info
    // string.
    const md = "```caddyfile\nfoo\n```";
    expect(extractFencedBlocks(md, "caddy")).toEqual([]);
  });
});

describe("extractKnobValues", () => {
  it("pulls the value of a Caddy knob with a comment tail", () => {
    const block = "      dial_timeout    30s   # ↔ Traefik dialTimeout\n";
    expect(extractKnobValues(block, "dial_timeout")).toEqual(["30s"]);
  });

  it("pulls the value of an NGINX knob with a trailing semicolon", () => {
    const block = "  proxy_connect_timeout 30s;   # ↔ Traefik dialTimeout\n";
    expect(extractKnobValues(block, "proxy_connect_timeout")).toEqual(["30s"]);
  });

  it("returns every match in document order when a knob repeats", () => {
    const block = [
      "  proxy_read_timeout 60s;",
      "  # … later",
      "  proxy_read_timeout 90s;",
    ].join("\n");
    expect(extractKnobValues(block, "proxy_read_timeout")).toEqual([
      "60s",
      "90s",
    ]);
  });

  it("returns an empty list when the knob is absent", () => {
    expect(extractKnobValues("nothing relevant here\n", "dial_timeout")).toEqual(
      [],
    );
  });

  it("ignores knob mentions inside comments / prose-only lines", () => {
    // Word-boundary-ish: the knob must be at the start of a line
    // (modulo leading whitespace) to count, so a prose mention like
    // `# tweak dial_timeout if needed` is not picked up.
    const block = "  # tweak dial_timeout if needed\n";
    expect(extractKnobValues(block, "dial_timeout")).toEqual([]);
  });
});

describe("collectFileKnobs", () => {
  it("collects all Caddy + NGINX knob values from a docs page", () => {
    const result = collectFileKnobs(goodCaddyDocsBlock, "fake-docs.md");
    expect(result.file).toBe("fake-docs.md");
    expect(result.caddy).toEqual({
      dial_timeout: "30s",
      read_timeout: "60s",
      write_timeout: "60s",
    });
    expect(result.nginx).toEqual({
      proxy_connect_timeout: "30s",
      proxy_read_timeout: "60s",
      proxy_send_timeout: "60s",
    });
  });

  it("handles indented fences (as used in numbered list steps)", () => {
    const result = collectFileKnobs(goodSelfHostingBlock, "fake-self.md");
    expect(result.caddy).toEqual({
      dial_timeout: "30s",
      read_timeout: "60s",
      write_timeout: "60s",
    });
    expect(result.nginx).toEqual({
      proxy_connect_timeout: "30s",
      proxy_read_timeout: "60s",
      proxy_send_timeout: "60s",
    });
  });

  it("leaves a knob undefined when no snippet documents it", () => {
    const md = [
      "```caddy",
      "your-domain.com {",
      "  reverse_proxy localhost:5000",
      "}",
      "```",
    ].join("\n");
    const result = collectFileKnobs(md, "fake.md");
    expect(result.caddy.dial_timeout).toBeUndefined();
    expect(result.caddy.read_timeout).toBeUndefined();
    expect(result.caddy.write_timeout).toBeUndefined();
  });

  it("throws when the same knob has conflicting values inside one file", () => {
    const md = [
      "```caddy",
      "  dial_timeout 30s",
      "```",
      "",
      "```caddy",
      "  dial_timeout 90s",
      "```",
    ].join("\n");
    expect(() => collectFileKnobs(md, "broken.md")).toThrow(
      /conflicting Caddy `dial_timeout`/,
    );
  });

  it("does not pick up knob names mentioned in the prose mapping table", () => {
    // The timeouts guide has a markdown table that mentions every
    // knob name in backticks (`dial_timeout`, etc.). Those rows are
    // outside any ```caddy / ```nginx fence and so must not influence
    // the canonical value.
    const md = [
      "| Traefik | Caddy | NGINX |",
      "| --- | --- | --- |",
      "| dialTimeout | `dial_timeout` | `proxy_connect_timeout` |",
      "",
      "```caddy",
      "  dial_timeout 30s",
      "```",
    ].join("\n");
    const result = collectFileKnobs(md, "fake.md");
    expect(result.caddy.dial_timeout).toBe("30s");
  });
});

describe("compareFileKnobs", () => {
  it("returns ok when every Caddy + NGINX knob agrees across both files", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const b = collectFileKnobs(goodSelfHostingBlock, "b.md");
    const result = compareFileKnobs(a, b);
    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
    expect(result.matched).toBe(CADDY_KNOBS.length + NGINX_KNOBS.length);
  });

  it("flags a Caddy value that disagrees between the two files", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const drifted = goodSelfHostingBlock.replace(
      "read_timeout    60s",
      "read_timeout    90s",
    );
    const b = collectFileKnobs(drifted, "b.md");
    const result = compareFileKnobs(a, b);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    const drift = result.drifts[0];
    expect(drift.proxy).toBe("caddy");
    expect(drift.knob).toBe("read_timeout");
    expect(drift.values).toEqual([
      { file: "a.md", value: "60s" },
      { file: "b.md", value: "90s" },
    ]);
    expect(drift.reason).toContain("a.md: 60s");
    expect(drift.reason).toContain("b.md: 90s");
  });

  it("flags an NGINX value that disagrees between the two files", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const drifted = goodSelfHostingBlock.replace(
      "proxy_connect_timeout 30s;",
      "proxy_connect_timeout 15s;",
    );
    const b = collectFileKnobs(drifted, "b.md");
    const result = compareFileKnobs(a, b);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].proxy).toBe("nginx");
    expect(result.drifts[0].knob).toBe("proxy_connect_timeout");
    expect(result.drifts[0].reason).toContain("30s");
    expect(result.drifts[0].reason).toContain("15s");
  });

  it("flags a knob that is documented in only one of the two files", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    // Strip the write_timeout line entirely from the self-hosting copy.
    const stripped = goodSelfHostingBlock.replace(
      /\s*write_timeout\s+60s\n/,
      "\n",
    );
    const b = collectFileKnobs(stripped, "b.md");
    const result = compareFileKnobs(a, b);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].knob).toBe("write_timeout");
    expect(result.drifts[0].reason).toContain("missing from b.md");
  });

  it("reports multiple drifts when several knobs disagree at once", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const drifted = goodSelfHostingBlock
      .replace("dial_timeout    30s", "dial_timeout    99s")
      .replace("proxy_send_timeout    60s;", "proxy_send_timeout    120s;");
    const b = collectFileKnobs(drifted, "b.md");
    const result = compareFileKnobs(a, b);
    expect(result.ok).toBe(false);
    expect(result.drifts.map((d) => `${d.proxy}.${d.knob}`).sort()).toEqual([
      "caddy.dial_timeout",
      "nginx.proxy_send_timeout",
    ]);
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the verified knob count", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const b = collectFileKnobs(goodSelfHostingBlock, "b.md");
    const report = formatReport(compareFileKnobs(a, b));
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("6 knobs verified");
  });

  it("produces a FAIL summary that names both files and the bad value", () => {
    const a = collectFileKnobs(goodCaddyDocsBlock, "a.md");
    const drifted = goodSelfHostingBlock.replace(
      "read_timeout    60s",
      "read_timeout    90s",
    );
    const b = collectFileKnobs(drifted, "b.md");
    const report = formatReport(compareFileKnobs(a, b));
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain("a.md");
    expect(report).toContain("b.md");
    expect(report).toContain("60s");
    expect(report).toContain("90s");
    expect(report).toContain("npm run lint:proxy-timeouts");
  });
});

describe("checkProxyTimeoutSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkProxyTimeoutSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(CADDY_KNOBS.length + NGINX_KNOBS.length);
  });

  it("targets the documented file paths", () => {
    expect(TIMEOUTS_DOC).toBe("docs/guides/dokploy-traefik-timeouts.md");
    expect(SELF_HOSTING_DOC).toBe("docs/guides/self-hosting.md");
  });
});
