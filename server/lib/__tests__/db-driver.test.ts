// @vitest-environment node
//
// Coverage for server/lib/db-driver.ts (task #479).
//
// The driver-selection rule is the only thing standing between a
// Dokploy-hosted Postgres URL and the previous Neon-only WebSocket
// path that gave operators the misleading `ECONNREFUSED <ip>:443`.
// These tests pin every branch — Neon hostnames, the `?driver=`
// override (both directions), the IPv4/IPv6/unix-style URL shapes
// that self-hosters actually use, and the `?driver=` strip behavior
// — so a regression here will fail the build instead of silently
// re-introducing the production bug.
import { describe, expect, it } from "vitest";
import { readDriverOverride, selectDriver, stripDriverParam } from "../db-driver";

describe("selectDriver — Neon hostnames", () => {
  it("routes a Neon-hosted URL to the neon driver", () => {
    expect(
      selectDriver(
        "postgresql://user:pw@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe("neon");
  });

  it("routes any *.neon.tech subdomain to neon", () => {
    expect(selectDriver("postgresql://u:p@anything.neon.tech/db")).toBe("neon");
    expect(selectDriver("postgres://u:p@deep.sub.domain.neon.tech/db")).toBe(
      "neon",
    );
  });

  it("matches neon.tech case-insensitively", () => {
    expect(selectDriver("postgresql://u:p@HOST.NEON.TECH/db")).toBe("neon");
  });

  it("does NOT match a hostname that merely contains 'neon.tech'", () => {
    // `myneon.tech` is a different registered domain — it must not be
    // mistaken for Neon. The rule is hostname endsWith `.neon.tech`
    // (note the leading dot) or exactly `neon.tech`.
    expect(selectDriver("postgresql://u:p@myneon.tech/db")).toBe("pg");
    expect(selectDriver("postgresql://u:p@neon.tech.evil.com/db")).toBe("pg");
  });
});

describe("selectDriver — self-hosted Postgres", () => {
  it("routes a Dokploy-style internal hostname to pg", () => {
    // This is the exact shape from the task #479 bug report.
    expect(
      selectDriver(
        "postgresql://postgres:secret@criteriaiq-criteriadb-qwir2m:5432/criteriaiq_db",
      ),
    ).toBe("pg");
  });

  it("routes an RDS hostname to pg", () => {
    expect(
      selectDriver(
        "postgresql://u:p@db-1.cluster-abc.us-east-1.rds.amazonaws.com:5432/postgres",
      ),
    ).toBe("pg");
  });

  it("routes a plain Docker hostname to pg", () => {
    expect(selectDriver("postgresql://u:p@postgres:5432/app")).toBe("pg");
    expect(selectDriver("postgresql://u:p@db/app")).toBe("pg");
  });

  it("routes localhost / loopback IPs to pg", () => {
    expect(selectDriver("postgresql://u:p@localhost:5432/app")).toBe("pg");
    expect(selectDriver("postgresql://u:p@127.0.0.1:5432/app")).toBe("pg");
  });

  it("routes a private IPv4 (the literal address from the bug report) to pg", () => {
    expect(selectDriver("postgresql://u:p@10.0.1.13:5432/app")).toBe("pg");
  });
});

describe("selectDriver — explicit ?driver= override", () => {
  it("honors ?driver=neon even on a non-Neon hostname", () => {
    expect(
      selectDriver("postgresql://u:p@my-host:5432/db?driver=neon"),
    ).toBe("neon");
  });

  it("honors ?driver=pg even on a Neon hostname", () => {
    // Useful escape hatch for an operator who wants to point a pg
    // proxy / pgbouncer at a Neon URL.
    expect(
      selectDriver(
        "postgresql://u:p@host.neon.tech/db?sslmode=require&driver=pg",
      ),
    ).toBe("pg");
  });

  it("ignores unknown ?driver= values and falls back to hostname rule", () => {
    expect(selectDriver("postgresql://u:p@host:5432/db?driver=mysql")).toBe(
      "pg",
    );
    expect(
      selectDriver("postgresql://u:p@x.neon.tech/db?driver=mysql"),
    ).toBe("neon");
  });

  it("matches ?driver= case-insensitively", () => {
    expect(selectDriver("postgresql://u:p@host:5432/db?driver=NEON")).toBe(
      "neon",
    );
    expect(
      selectDriver("postgresql://u:p@x.neon.tech/db?driver=PG"),
    ).toBe("pg");
  });
});

describe("selectDriver — degenerate inputs", () => {
  it("falls back to pg for an unparseable URL", () => {
    // pg's error message on a bad URL is much more informative than
    // Neon's "WebSocket failed", so unparseable strings are routed to
    // pg by design.
    expect(selectDriver("not-a-url")).toBe("pg");
    expect(selectDriver("")).toBe("pg");
  });
});

describe("readDriverOverride", () => {
  // Coverage for the helper added in task #484. Distinct from
  // `selectDriver` because the saved-connections UI needs to
  // surface the operator's original "Auto-detect" choice as its
  // own value — not silently collapse to whichever side the
  // hostname rule landed on. The test matrix mirrors the wire
  // contract `/api/db-connections` exposes.
  it("returns 'auto' when no ?driver= is present", () => {
    expect(
      readDriverOverride(
        "postgresql://u:p@host.neon.tech/db?sslmode=require",
      ),
    ).toBe("auto");
    expect(readDriverOverride("postgresql://u:p@db:5432/app")).toBe("auto");
  });

  it("returns the explicit override when present", () => {
    expect(
      readDriverOverride("postgresql://u:p@host:5432/db?driver=neon"),
    ).toBe("neon");
    expect(
      readDriverOverride(
        "postgresql://u:p@host.neon.tech/db?sslmode=require&driver=pg",
      ),
    ).toBe("pg");
  });

  it("matches the override case-insensitively", () => {
    expect(
      readDriverOverride("postgresql://u:p@host:5432/db?driver=NEON"),
    ).toBe("neon");
    expect(readDriverOverride("postgresql://u:p@host/db?driver=Pg")).toBe(
      "pg",
    );
  });

  it("treats unknown ?driver= values as auto (no false-positive override)", () => {
    // Wire enum is strict: only `auto | neon | pg`. Anything else
    // must collapse to `auto` so the badge does not lie about the
    // selection the operator actually made.
    expect(
      readDriverOverride("postgresql://u:p@host:5432/db?driver=mysql"),
    ).toBe("auto");
  });

  it("returns 'auto' for unparseable or empty input", () => {
    expect(readDriverOverride("")).toBe("auto");
    expect(readDriverOverride("not-a-url")).toBe("auto");
  });
});

describe("stripDriverParam", () => {
  it("removes the driver parameter and returns the rest of the URL unchanged", () => {
    expect(
      stripDriverParam(
        "postgresql://u:p@host:5432/db?sslmode=require&driver=pg",
      ),
    ).toBe("postgresql://u:p@host:5432/db?sslmode=require");
  });

  it("removes a sole driver parameter and the trailing '?'", () => {
    // A bare `?` after stripping is technically valid but ugly and
    // breaks byte-for-byte equality assertions in the call sites.
    expect(stripDriverParam("postgresql://u:p@host:5432/db?driver=pg")).toBe(
      "postgresql://u:p@host:5432/db",
    );
  });

  it("preserves URLs that have no driver parameter", () => {
    const url = "postgresql://u:p@host:5432/db?sslmode=require";
    expect(stripDriverParam(url)).toBe(url);
  });

  it("returns unparseable URLs unchanged", () => {
    expect(stripDriverParam("not-a-url")).toBe("not-a-url");
  });

  it("does not touch other query parameters", () => {
    expect(
      stripDriverParam(
        "postgresql://u:p@host/db?application_name=app&driver=neon&pool_max=5",
      ),
    ).toBe(
      "postgresql://u:p@host/db?application_name=app&pool_max=5",
    );
  });
});
