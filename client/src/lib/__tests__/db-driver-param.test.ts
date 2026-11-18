// @vitest-environment happy-dom
//
// Locks the contract for the `?driver=` URL helpers (Task #481) that
// power the setup wizard, the saved DB-connection form, and the
// backup-destination form's "Database Driver" dropdown. The server
// already has parallel coverage for the matching `selectDriver` and
// `stripDriverParam` halves of the contract in
// server/lib/__tests__/db-driver.test.ts — these tests pin the client
// behavior so a regression in either half is caught locally instead
// of at the next operator's setup-wizard run.
import { describe, it, expect } from "vitest";
import { applyDriverChoice, readDriverChoice } from "../db-driver-param";

describe("readDriverChoice", () => {
  it("returns 'auto' for a URL with no driver param", () => {
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db"),
    ).toBe("auto");
  });

  it("returns 'neon' / 'pg' for an explicit override", () => {
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db?driver=neon"),
    ).toBe("neon");
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db?driver=pg"),
    ).toBe("pg");
  });

  it("matches the server-side helper's case-insensitive parsing", () => {
    // Mirrors selectDriver in server/lib/db-driver.ts which lower-cases
    // the param before matching — keeping both halves on the same rule
    // means a hand-edited URL behaves identically on the client UI and
    // the server's driver picker.
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db?driver=NEON"),
    ).toBe("neon");
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db?driver=Pg"),
    ).toBe("pg");
  });

  it("falls back to 'auto' for unknown driver values", () => {
    expect(
      readDriverChoice("postgresql://u:p@host:5432/db?driver=mysql"),
    ).toBe("auto");
  });

  it("returns 'auto' for empty input or unparseable URL", () => {
    expect(readDriverChoice("")).toBe("auto");
    expect(readDriverChoice("not a url")).toBe("auto");
  });
});

describe("applyDriverChoice", () => {
  it("appends driver=neon / driver=pg to a URL with no existing query", () => {
    expect(
      applyDriverChoice("postgresql://u:p@host:5432/db", "neon"),
    ).toBe("postgresql://u:p@host:5432/db?driver=neon");
    expect(
      applyDriverChoice("postgresql://u:p@host:5432/db", "pg"),
    ).toBe("postgresql://u:p@host:5432/db?driver=pg");
  });

  it("preserves other query params when adding the driver param", () => {
    expect(
      applyDriverChoice(
        "postgresql://u:p@host:5432/db?sslmode=require",
        "neon",
      ),
    ).toBe("postgresql://u:p@host:5432/db?sslmode=require&driver=neon");
  });

  it("overwrites an existing driver= value rather than appending a duplicate", () => {
    expect(
      applyDriverChoice(
        "postgresql://u:p@host:5432/db?driver=pg",
        "neon",
      ),
    ).toBe("postgresql://u:p@host:5432/db?driver=neon");
  });

  it("strips driver= when the choice is 'auto'", () => {
    expect(
      applyDriverChoice(
        "postgresql://u:p@host:5432/db?driver=neon",
        "auto",
      ),
    ).toBe("postgresql://u:p@host:5432/db");
  });

  it("does not leave a dangling '?' when 'auto' removes the only query param", () => {
    // URL.toString() emits a trailing '?' after deleting the last
    // searchParam; the helper strips it so the cleaned URL is
    // byte-identical to a URL that never had a query string in the
    // first place. This matches the server-side stripDriverParam
    // contract pinned in server/lib/__tests__/db-driver.test.ts.
    const cleaned = applyDriverChoice(
      "postgresql://u:p@host:5432/db?driver=pg",
      "auto",
    );
    expect(cleaned.endsWith("?")).toBe(false);
    expect(cleaned).toBe("postgresql://u:p@host:5432/db");
  });

  it("preserves sibling params when stripping the driver param", () => {
    expect(
      applyDriverChoice(
        "postgresql://u:p@host:5432/db?sslmode=require&driver=neon",
        "auto",
      ),
    ).toBe("postgresql://u:p@host:5432/db?sslmode=require");
  });

  it("is idempotent for 'auto' on a URL with no driver param", () => {
    expect(
      applyDriverChoice("postgresql://u:p@host:5432/db", "auto"),
    ).toBe("postgresql://u:p@host:5432/db");
  });

  it("returns the input unchanged for an empty string", () => {
    expect(applyDriverChoice("", "neon")).toBe("");
  });

  it("returns the input unchanged for an unparseable URL", () => {
    // Defers the error-message UX to the server's selectDriver path
    // (which routes unparseable URLs through pg for a clearer error)
    // instead of producing a half-mangled string from the client.
    expect(applyDriverChoice("not a url", "neon")).toBe("not a url");
  });
});
