// @vitest-environment node
//
// Locks the contract that the prose Traefik defaults quoted in
// `docs/guides/self-hosting.md` (the intro paragraph above the § NGINX
// reverse proxy snippet, around line 85) stay in lock-step with the
// numeric values baked into the commented Traefik labels block in
// `docker-compose.yml` (`forwardingTimeouts.dialTimeout` and
// `forwardingTimeouts.responseHeaderTimeout`).
//
// The check itself lives in
// `scripts/check-self-hosting-traefik-defaults-sync.ts` (task-521);
// this suite exercises the parser/comparator on synthetic fixtures and
// then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  COMPOSE_FILE,
  SELF_HOSTING_DOC,
  TRAEFIK_KNOBS,
  checkSelfHostingTraefikDefaultsSync,
  collectComposeKnobs,
  collectProseKnobs,
  compareFileKnobs,
  extractComposeKnobValues,
  extractProseKnobValues,
  formatReport,
} from "./check-self-hosting-traefik-defaults-sync";

const goodComposeBlock = [
  "services:",
  "  app:",
  "    # labels:",
  '    #   - "traefik.enable=true"',
  '    #   - "traefik.http.services.criteriaiq.loadbalancer.serversTransport=criteriaiq-transport"',
  '    #   - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s"',
  '    #   - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.dialTimeout=30s"',
  "",
].join("\n");

const goodProseBlock = [
  "### NGINX reverse proxy",
  "",
  "If you prefer NGINX over Caddy, drop this `server` block into",
  "`/etc/nginx/sites-available/criteriaiq.conf`. The `proxy_*_timeout`",
  "values mirror the Caddy snippet above and the Traefik",
  "`responseHeaderTimeout=60s` / `dialTimeout=30s` defaults shipped",
  "in `docker-compose.yml`, so a slow-but-not-stuck admin write will",
  "not be clipped to `504 Gateway Timeout`.",
  "",
].join("\n");

describe("extractComposeKnobValues", () => {
  it("pulls the value from a commented Traefik label line", () => {
    expect(
      extractComposeKnobValues(goodComposeBlock, "responseHeaderTimeout"),
    ).toEqual(["60s"]);
    expect(extractComposeKnobValues(goodComposeBlock, "dialTimeout")).toEqual([
      "30s",
    ]);
  });

  it("returns an empty list when the knob is absent", () => {
    expect(extractComposeKnobValues("services: {}", "dialTimeout")).toEqual([]);
  });

  it("returns every match in document order when a knob repeats", () => {
    const yaml = [
      '    #   - "…forwardingTimeouts.dialTimeout=30s"',
      '    #   - "…forwardingTimeouts.dialTimeout=45s"',
    ].join("\n");
    expect(extractComposeKnobValues(yaml, "dialTimeout")).toEqual([
      "30s",
      "45s",
    ]);
  });

  it("does not match a different knob with the same suffix shape", () => {
    // `dialTimeout` and `responseHeaderTimeout` are different knobs;
    // a query for `dialTimeout` must not pick up a
    // `responseHeaderTimeout=…` line.
    const yaml =
      '    #   - "…forwardingTimeouts.responseHeaderTimeout=60s"\n';
    expect(extractComposeKnobValues(yaml, "dialTimeout")).toEqual([]);
  });
});

describe("extractProseKnobValues", () => {
  it("pulls the value from a `key=value` backtick mention", () => {
    expect(
      extractProseKnobValues(goodProseBlock, "responseHeaderTimeout"),
    ).toEqual(["60s"]);
    expect(extractProseKnobValues(goodProseBlock, "dialTimeout")).toEqual([
      "30s",
    ]);
  });

  it("returns an empty list when the knob is absent from prose", () => {
    expect(
      extractProseKnobValues("nothing relevant here\n", "dialTimeout"),
    ).toEqual([]);
  });

  it("ignores knob names mentioned without an `=value` tail", () => {
    // A bare backtick mention like `dialTimeout` (no `=…`) is
    // commentary, not a quoted default — must not be picked up.
    const md = "tweak `dialTimeout` if your upstream is slow\n";
    expect(extractProseKnobValues(md, "dialTimeout")).toEqual([]);
  });

  it("ignores knob mentions that are not wrapped in backticks", () => {
    // Plain prose like "dialTimeout=30s" without backticks is not the
    // quoted-default shape this check is contracted to enforce.
    const md = "the dialTimeout=30s default applies\n";
    expect(extractProseKnobValues(md, "dialTimeout")).toEqual([]);
  });
});

describe("collectComposeKnobs", () => {
  it("collects every Traefik knob value from a compose file", () => {
    const result = collectComposeKnobs(goodComposeBlock, "fake-compose.yml");
    expect(result.file).toBe("fake-compose.yml");
    expect(result.values).toEqual({
      dialTimeout: "30s",
      responseHeaderTimeout: "60s",
    });
  });

  it("throws when the same knob has conflicting values inside one file", () => {
    const yaml = [
      '    #   - "…forwardingTimeouts.dialTimeout=30s"',
      '    #   - "…forwardingTimeouts.dialTimeout=99s"',
    ].join("\n");
    expect(() => collectComposeKnobs(yaml, "broken.yml")).toThrow(
      /conflicting Traefik `dialTimeout`/,
    );
  });

  it("leaves a knob undefined when it is absent from the compose file", () => {
    const yaml = '    #   - "traefik.enable=true"\n';
    const result = collectComposeKnobs(yaml, "fake.yml");
    expect(result.values.dialTimeout).toBeUndefined();
    expect(result.values.responseHeaderTimeout).toBeUndefined();
  });
});

describe("collectProseKnobs", () => {
  it("collects every Traefik knob value from a prose page", () => {
    const result = collectProseKnobs(goodProseBlock, "fake-self.md");
    expect(result.file).toBe("fake-self.md");
    expect(result.values).toEqual({
      dialTimeout: "30s",
      responseHeaderTimeout: "60s",
    });
  });

  it("throws when the prose quotes the same knob with two values", () => {
    const md = [
      "first paragraph: `dialTimeout=30s` is the default.",
      "later: actually `dialTimeout=45s` is the default.",
    ].join("\n");
    expect(() => collectProseKnobs(md, "broken.md")).toThrow(
      /conflicting Traefik `dialTimeout`/,
    );
  });
});

describe("compareFileKnobs", () => {
  it("returns ok when every knob agrees across both files", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    const prose = collectProseKnobs(goodProseBlock, "self.md");
    const result = compareFileKnobs(compose, prose);
    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
    expect(result.matched).toBe(TRAEFIK_KNOBS.length);
  });

  it("flags the prose value when it disagrees with the compose value", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    const drifted = goodProseBlock.replace(
      "`responseHeaderTimeout=60s`",
      "`responseHeaderTimeout=120s`",
    );
    const prose = collectProseKnobs(drifted, "self.md");
    const result = compareFileKnobs(compose, prose);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    const drift = result.drifts[0];
    expect(drift.knob).toBe("responseHeaderTimeout");
    expect(drift.values).toEqual([
      { file: "compose.yml", value: "60s" },
      { file: "self.md", value: "120s" },
    ]);
    expect(drift.reason).toContain("compose.yml: 60s");
    expect(drift.reason).toContain("self.md: 120s");
  });

  it("flags the compose value when it disagrees with the prose value", () => {
    const drifted = goodComposeBlock.replace(
      "forwardingTimeouts.dialTimeout=30s",
      "forwardingTimeouts.dialTimeout=15s",
    );
    const compose = collectComposeKnobs(drifted, "compose.yml");
    const prose = collectProseKnobs(goodProseBlock, "self.md");
    const result = compareFileKnobs(compose, prose);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].knob).toBe("dialTimeout");
    expect(result.drifts[0].reason).toContain("15s");
    expect(result.drifts[0].reason).toContain("30s");
  });

  it("flags a knob that is documented in only one of the two files", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    // Strip the dialTimeout mention from the prose copy entirely.
    const stripped = goodProseBlock.replace(
      / \/ `dialTimeout=30s`/,
      "",
    );
    const prose = collectProseKnobs(stripped, "self.md");
    const result = compareFileKnobs(compose, prose);
    expect(result.ok).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].knob).toBe("dialTimeout");
    expect(result.drifts[0].reason).toContain("missing from self.md");
  });

  it("reports multiple drifts when both knobs disagree at once", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    const drifted = goodProseBlock
      .replace("`dialTimeout=30s`", "`dialTimeout=15s`")
      .replace("`responseHeaderTimeout=60s`", "`responseHeaderTimeout=120s`");
    const prose = collectProseKnobs(drifted, "self.md");
    const result = compareFileKnobs(compose, prose);
    expect(result.ok).toBe(false);
    expect(result.drifts.map((d) => d.knob).sort()).toEqual([
      "dialTimeout",
      "responseHeaderTimeout",
    ]);
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the verified knob count", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    const prose = collectProseKnobs(goodProseBlock, "self.md");
    const report = formatReport(compareFileKnobs(compose, prose));
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("2 knobs verified");
  });

  it("produces a FAIL summary that names both files and the bad value", () => {
    const compose = collectComposeKnobs(goodComposeBlock, "compose.yml");
    const drifted = goodProseBlock.replace(
      "`responseHeaderTimeout=60s`",
      "`responseHeaderTimeout=120s`",
    );
    const prose = collectProseKnobs(drifted, "self.md");
    const report = formatReport(compareFileKnobs(compose, prose));
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain("compose.yml");
    expect(report).toContain("self.md");
    expect(report).toContain("60s");
    expect(report).toContain("120s");
    expect(report).toContain("npm run lint:self-hosting-traefik");
  });
});

describe("checkSelfHostingTraefikDefaultsSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkSelfHostingTraefikDefaultsSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(TRAEFIK_KNOBS.length);
  });

  it("targets the documented file paths", () => {
    expect(COMPOSE_FILE).toBe("docker-compose.yml");
    expect(SELF_HOSTING_DOC).toBe("docs/guides/self-hosting.md");
  });
});
