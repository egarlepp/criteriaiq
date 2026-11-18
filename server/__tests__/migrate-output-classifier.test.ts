import { describe, expect, it } from "vitest";
import { classifyMigrateOutput } from "../routes/setup-routes";

describe("classifyMigrateOutput", () => {
  it("returns null for empty output", () => {
    expect(classifyMigrateOutput("")).toBeNull();
  });

  it("returns null when no known pattern matches", () => {
    expect(classifyMigrateOutput("Pulling schema from database...\nDone."))
      .toBeNull();
  });

  it("detects insufficient privileges (schema-level)", () => {
    expect(
      classifyMigrateOutput(
        'error: permission denied for schema public\n  at Connection',
      ),
    ).toBe("insufficientPrivileges");
  });

  it("detects insufficient privileges (must be owner)", () => {
    expect(
      classifyMigrateOutput("ERROR: must be owner of relation users"),
    ).toBe("insufficientPrivileges");
  });

  it("detects role mismatch (missing role)", () => {
    expect(
      classifyMigrateOutput('FATAL: role "criteriaiq" does not exist'),
    ).toBe("roleMismatch");
  });

  it("detects role mismatch (missing database)", () => {
    expect(
      classifyMigrateOutput('FATAL: database "criteriaiq_prod" does not exist'),
    ).toBe("roleMismatch");
  });

  it("detects role mismatch (bad password)", () => {
    expect(
      classifyMigrateOutput('FATAL: password authentication failed for user "app"'),
    ).toBe("roleMismatch");
  });

  it("detects SSL required (pg_hba)", () => {
    expect(
      classifyMigrateOutput(
        "no pg_hba.conf entry for host \"1.2.3.4\", user \"app\", database \"db\", SSL off",
      ),
    ).toBe("sslRequired");
  });

  it("detects SSL required (self-signed)", () => {
    expect(
      classifyMigrateOutput("Error: self signed certificate in certificate chain"),
    ).toBe("sslRequired");
  });

  it("detects SSL required (sslmode mention)", () => {
    expect(
      classifyMigrateOutput("the server requires sslmode=require"),
    ).toBe("sslRequired");
  });

  it("detects unsupported PostgreSQL version", () => {
    expect(
      classifyMigrateOutput("server version 11.5; client version 16"),
    ).toBe("versionTooOld");
  });

  it("does not flag PostgreSQL 14 as too old", () => {
    expect(
      classifyMigrateOutput("server version 14.3 — running migrations"),
    ).not.toBe("versionTooOld");
  });

  it("prioritises SSL over generic permission text", () => {
    // Both phrases appear; SSL handshake failures should win because they
    // are the actual root cause and operators must fix the connection
    // string before any auth-level errors become meaningful.
    expect(
      classifyMigrateOutput(
        "permission denied for database app\nno pg_hba.conf entry for host",
      ),
    ).toBe("sslRequired");
  });

  it("detects connection timeout (ETIMEDOUT)", () => {
    expect(
      classifyMigrateOutput(
        "Error: connect ETIMEDOUT 10.0.0.5:5432\n  at Socket._onTimeout",
      ),
    ).toBe("connectionTimeout");
  });

  it("detects connection timeout (ENOTFOUND / getaddrinfo)", () => {
    expect(
      classifyMigrateOutput(
        "Error: getaddrinfo ENOTFOUND db.internal.example.com",
      ),
    ).toBe("connectionTimeout");
  });

  it("detects connection timeout (PostgreSQL host-name resolution)", () => {
    expect(
      classifyMigrateOutput(
        'could not translate host name "db.internal" to address: Name or service not known',
      ),
    ).toBe("connectionTimeout");
  });

  it("detects connection-limit exhaustion (too many clients)", () => {
    expect(
      classifyMigrateOutput("FATAL: sorry, too many clients already"),
    ).toBe("tooManyConnections");
  });

  it("detects connection-limit exhaustion (reserved slots)", () => {
    expect(
      classifyMigrateOutput(
        "FATAL: remaining connection slots are reserved for non-replication superuser connections",
      ),
    ).toBe("tooManyConnections");
  });

  it("detects read-only target (CREATE TABLE in read-only transaction)", () => {
    expect(
      classifyMigrateOutput(
        "ERROR: cannot execute CREATE TABLE in a read-only transaction",
      ),
    ).toBe("readOnlyTarget");
  });

  it("detects read-only target (default_transaction_read_only)", () => {
    expect(
      classifyMigrateOutput(
        "ERROR: cannot set transaction read-write mode during recovery (default_transaction_read_only is on)",
      ),
    ).toBe("readOnlyTarget");
  });

  it("detects SCRAM channel binding mismatch", () => {
    expect(
      classifyMigrateOutput(
        "Error: SASL: channel binding required but not used",
      ),
    ).toBe("scramMismatch");
  });

  it("detects SCRAM exchange failure", () => {
    expect(
      classifyMigrateOutput(
        "Error: SCRAM authentication exchange failed: server signature does not match",
      ),
    ).toBe("scramMismatch");
  });

  it("prioritises connection timeout over downstream auth errors", () => {
    // If the socket itself died with ETIMEDOUT we never even attempted auth;
    // any "password authentication failed" line is unrelated noise from a
    // prior attempt or driver retry.
    expect(
      classifyMigrateOutput(
        'connect ETIMEDOUT 10.0.0.5:5432\nFATAL: password authentication failed for user "app"',
      ),
    ).toBe("connectionTimeout");
  });

  it("prioritises too-many-connections over generic role errors", () => {
    expect(
      classifyMigrateOutput(
        'FATAL: sorry, too many clients already\nFATAL: role "app" does not exist',
      ),
    ).toBe("tooManyConnections");
  });

  it("prioritises SCRAM over generic password-auth failure", () => {
    expect(
      classifyMigrateOutput(
        "channel binding type 'tls-server-end-point' is not supported by this client\nFATAL: password authentication failed for user \"app\"",
      ),
    ).toBe("scramMismatch");
  });

  it("prioritises read-only target over insufficient-privilege wording", () => {
    expect(
      classifyMigrateOutput(
        "ERROR: permission denied for schema public\nERROR: cannot execute CREATE TABLE in a read-only transaction",
      ),
    ).toBe("readOnlyTarget");
  });

  it("detects the internal drizzle-kit push timeout marker", () => {
    // `runDrizzlePush` SIGKILLs drizzle-kit at 120s and appends this exact
    // line so the wizard can flag the timeout as the most likely cause.
    expect(
      classifyMigrateOutput(
        "Pulling schema from database...\n[setup] drizzle-kit push timed out after 120s",
      ),
    ).toBe("migrationTimedOut");
  });

  it("prioritises the migration-timeout marker over partial libpq output", () => {
    // The kill often happens mid-handshake, so the captured output before
    // the marker can resemble a generic ETIMEDOUT / connection failure. The
    // explicit marker must win so operators see the timeout-specific tip.
    expect(
      classifyMigrateOutput(
        "Error: connect ETIMEDOUT 10.0.0.5:5432\n[setup] drizzle-kit push timed out after 120s",
      ),
    ).toBe("migrationTimedOut");
  });
});
