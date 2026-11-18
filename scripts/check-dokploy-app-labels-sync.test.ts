// @vitest-environment node
//
// Locks the contract that the "paste-into-Dokploy-UI" Traefik label
// snippet in `docs/guides/dokploy-traefik-timeouts.md` stays in
// lock-step with the Compose-mode YAML snippet that lives just
// above it in the same file. The check itself lives in
// `scripts/check-dokploy-app-labels-sync.ts` (see task-673); this
// suite exercises the parser/comparator on synthetic fixtures and
// then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  COMPOSE_HEADING,
  DEFAULT_SERVICE_NAME,
  DOCS_FILE,
  DOKPLOY_HEADING,
  SERVICE_PLACEHOLDER,
  checkDokployAppLabelsSync,
  compareLabels,
  expandDokployLabel,
  extractComposeSnippetLabels,
  extractDokployUiLabels,
  formatReport,
  inferServiceName,
} from "./check-dokploy-app-labels-sync";

const sampleDocs = [
  `## ${COMPOSE_HEADING}`,
  "",
  "Drop this into your Dokploy compose template:",
  "",
  "```yaml",
  "services:",
  "  app:",
  "    labels:",
  '      - "traefik.enable=true"',
  '      - "traefik.http.routers.criteriaiq.rule=Host(`x`)"',
  '      - "traefik.http.services.criteriaiq.loadbalancer.server.port=5000"',
  '      - "traefik.http.services.criteriaiq.loadbalancer.healthcheck.path=/api/setup/status"',
  '      - "traefik.http.services.criteriaiq.loadbalancer.healthcheck.interval=30s"',
  '      - "traefik.http.services.criteriaiq.loadbalancer.serversTransport=criteriaiq-transport"',
  '      - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s"',
  '      - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.dialTimeout=30s"',
  "```",
  "",
  `## ${DOKPLOY_HEADING}`,
  "",
  "Paste these into Dokploy → Advanced → Labels:",
  "",
  "```",
  "traefik.http.services.<service>.loadbalancer.server.port=5000",
  "traefik.http.services.<service>.loadbalancer.healthcheck.path=/api/setup/status",
  "traefik.http.services.<service>.loadbalancer.healthcheck.interval=30s",
  "traefik.http.services.<service>.loadbalancer.serversTransport=<service>-transport",
  "traefik.http.serversTransports.<service>-transport.forwardingTimeouts.responseHeaderTimeout=60s",
  "traefik.http.serversTransports.<service>-transport.forwardingTimeouts.dialTimeout=30s",
  "```",
  "",
].join("\n");

describe("extractComposeSnippetLabels", () => {
  it("pulls the ordered traefik.* labels out of the yaml fence", () => {
    const labels = extractComposeSnippetLabels(sampleDocs);
    expect(labels).toContain("traefik.enable=true");
    expect(labels).toContain(
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    );
    expect(labels.length).toBe(8);
  });

  it("throws if the Compose heading is missing", () => {
    expect(() =>
      extractComposeSnippetLabels(`## ${DOKPLOY_HEADING}\n\n\`\`\`\nx\n\`\`\`\n`),
    ).toThrow(/Could not find heading/);
  });

  it("throws if there is no yaml fence under the heading", () => {
    const md = `## ${COMPOSE_HEADING}\n\nProse but no fenced code.\n`;
    expect(() => extractComposeSnippetLabels(md)).toThrow(
      /yaml fenced code block/,
    );
  });

  it("throws if the yaml fence has no traefik labels", () => {
    const md = [
      `## ${COMPOSE_HEADING}`,
      "",
      "```yaml",
      "services:",
      "  app:",
      "    image: x",
      "```",
    ].join("\n");
    expect(() => extractComposeSnippetLabels(md)).toThrow(
      /No `traefik\.…` labels/,
    );
  });
});

describe("extractDokployUiLabels", () => {
  it("pulls bare traefik.* labels out of the plain ``` fence", () => {
    expect(extractDokployUiLabels(sampleDocs)).toEqual([
      "traefik.http.services.<service>.loadbalancer.server.port=5000",
      "traefik.http.services.<service>.loadbalancer.healthcheck.path=/api/setup/status",
      "traefik.http.services.<service>.loadbalancer.healthcheck.interval=30s",
      "traefik.http.services.<service>.loadbalancer.serversTransport=<service>-transport",
      "traefik.http.serversTransports.<service>-transport.forwardingTimeouts.responseHeaderTimeout=60s",
      "traefik.http.serversTransports.<service>-transport.forwardingTimeouts.dialTimeout=30s",
    ]);
  });

  it("throws if the Dokploy-UI heading is missing", () => {
    expect(() =>
      extractDokployUiLabels(
        `## ${COMPOSE_HEADING}\n\n\`\`\`yaml\n- "traefik.x=1"\n\`\`\`\n`,
      ),
    ).toThrow(/Could not find heading/);
  });

  it("throws if there is no plain fence under the heading", () => {
    const md = `## ${DOKPLOY_HEADING}\n\nProse but no fenced code.\n`;
    expect(() => extractDokployUiLabels(md)).toThrow(/plain `+\s+fenced/);
  });

  it("throws if the plain fence has no traefik labels", () => {
    const md = [
      `## ${DOKPLOY_HEADING}`,
      "",
      "```",
      "not a label",
      "```",
    ].join("\n");
    expect(() => extractDokployUiLabels(md)).toThrow(/No bare `traefik/);
  });

  it("ignores blank lines inside the fence", () => {
    const md = [
      `## ${DOKPLOY_HEADING}`,
      "",
      "```",
      "traefik.x=1",
      "",
      "traefik.y=2",
      "```",
    ].join("\n");
    expect(extractDokployUiLabels(md)).toEqual([
      "traefik.x=1",
      "traefik.y=2",
    ]);
  });
});

describe("inferServiceName", () => {
  it("extracts the service-name token from the loadbalancer.server.port label", () => {
    expect(
      inferServiceName([
        "traefik.enable=true",
        "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
      ]),
    ).toBe("criteriaiq");
  });

  it("picks up a renamed service name automatically", () => {
    expect(
      inferServiceName([
        "traefik.http.services.myapp.loadbalancer.server.port=5000",
      ]),
    ).toBe("myapp");
  });

  it("falls back to DEFAULT_SERVICE_NAME when no port label is present", () => {
    expect(inferServiceName(["traefik.enable=true"])).toBe(
      DEFAULT_SERVICE_NAME,
    );
  });
});

describe("expandDokployLabel", () => {
  it("substitutes every <service> occurrence with the inferred name", () => {
    expect(
      expandDokployLabel(
        "traefik.http.services.<service>.loadbalancer.serversTransport=<service>-transport",
        "myapp",
      ),
    ).toBe(
      "traefik.http.services.myapp.loadbalancer.serversTransport=myapp-transport",
    );
  });

  it("falls back to DEFAULT_SERVICE_NAME when no name is supplied", () => {
    expect(
      expandDokployLabel(
        "traefik.http.services.<service>.loadbalancer.server.port=5000",
      ),
    ).toBe(
      `traefik.http.services.${DEFAULT_SERVICE_NAME}.loadbalancer.server.port=5000`,
    );
  });

  it("is a no-op when no <service> placeholder is present", () => {
    expect(expandDokployLabel("traefik.enable=true", "myapp")).toBe(
      "traefik.enable=true",
    );
  });

  it("uses the exported SERVICE_PLACEHOLDER constant for the substitution", () => {
    expect(SERVICE_PLACEHOLDER).toBe("<service>");
  });
});

describe("compareLabels", () => {
  it("reports OK when every Dokploy-UI label appears in the Compose list", () => {
    const compose = [
      "traefik.enable=true",
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    ];
    const dokploy = [
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    ];
    const result = compareLabels(compose, dokploy);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("does NOT require Dokploy-UI to cover every Compose label", () => {
    // The Compose snippet has router-level labels (rule, entrypoints,
    // tls.certresolver, …) that are intentionally absent from the
    // Dokploy-UI snippet because Dokploy auto-generates them.
    const compose = [
      "traefik.enable=true",
      "traefik.http.routers.criteriaiq.rule=Host(`x`)",
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    ];
    const dokploy = [
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    ];
    expect(compareLabels(compose, dokploy).ok).toBe(true);
  });

  it("flags a Dokploy-UI label whose value drifted from the Compose snippet", () => {
    const compose = [
      "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s",
    ];
    const dokploy = [
      "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=120s",
    ];
    const result = compareLabels(compose, dokploy);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Dokploy-UI label 1");
    expect(result.reason).toContain("responseHeaderTimeout=120s");
    expect(result.reason).toContain("responseHeaderTimeout=60s");
  });

  it("flags a Dokploy-UI label that does not exist in the Compose snippet at all", () => {
    const compose = ["traefik.enable=true"];
    const dokploy = [
      "traefik.http.services.criteriaiq.loadbalancer.server.port=5000",
    ];
    const result = compareLabels(compose, dokploy);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no match");
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the label count", () => {
    const result = compareLabels(["traefik.x=1"], ["traefik.x=1"]);
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("1 label");
    expect(report).toContain(DOCS_FILE);
  });

  it("produces a FAIL summary that points at the source of truth", () => {
    const result = compareLabels(
      ["traefik.x=1"],
      ["traefik.x=2"],
    );
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(DOCS_FILE);
    expect(report).toContain("source of truth");
    expect(report).toContain(DEFAULT_SERVICE_NAME);
  });

  it("threads the inferred service name through to OK and FAIL reports", () => {
    const okResult = compareLabels(
      ["traefik.http.services.myapp.loadbalancer.server.port=5000"],
      ["traefik.http.services.myapp.loadbalancer.server.port=5000"],
      "myapp",
    );
    expect(formatReport(okResult)).toContain("`myapp`");

    const failResult = compareLabels(
      ["traefik.http.services.myapp.loadbalancer.server.port=5000"],
      ["traefik.http.services.myapp.loadbalancer.server.port=4000"],
      "myapp",
    );
    expect(formatReport(failResult)).toContain("`myapp`");
  });
});

describe("checkDokployAppLabelsSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkDokployAppLabelsSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.dokployLabelsExpanded.length).toBeGreaterThan(0);
    // Every expanded Dokploy-UI label must be present in the
    // Compose label list.
    const composeSet = new Set(result.composeLabels);
    for (const label of result.dokployLabelsExpanded) {
      expect(composeSet.has(label)).toBe(true);
    }
  });

  it("checks all six labels described in the docs subsection", () => {
    const result = checkDokployAppLabelsSync();
    expect(result.dokployLabelsExpanded.length).toBe(6);
  });

  it("infers a non-empty service-name token from the live Compose snippet", () => {
    const result = checkDokployAppLabelsSync();
    expect(result.serviceName).toBeTruthy();
    // And every expanded Dokploy-UI label should contain that token
    // (sanity check that the substitution actually happened).
    for (const label of result.dokployLabelsExpanded) {
      expect(label).toContain(result.serviceName);
    }
  });
});
