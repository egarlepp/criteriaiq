import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE } from "@shared/admin-validation";

// `simpleAuth.ts` transitively imports `../email/email`, which has a stale
// relative `import("./mfaUtils")` that vite's static analysis can't resolve.
// We're only here to exercise the env-driven helper, so stub the offending
// modules out before the dynamic import below pulls them in.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../storage", () => ({
  storage: {},
}));
vi.mock("../../db-bootstrap", () => ({}));

const { getPasswordHistorySize } = await import("../simpleAuth");

describe("getPasswordHistorySize", () => {
  const original = process.env.PASSWORD_HISTORY_SIZE;

  beforeEach(() => {
    delete process.env.PASSWORD_HISTORY_SIZE;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PASSWORD_HISTORY_SIZE;
    } else {
      process.env.PASSWORD_HISTORY_SIZE = original;
    }
  });

  it("falls back to the shared default when the env var is unset", () => {
    expect(getPasswordHistorySize()).toBe(ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE);
  });

  it("falls back to the default for empty / non-numeric values", () => {
    process.env.PASSWORD_HISTORY_SIZE = "";
    expect(getPasswordHistorySize()).toBe(ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE);
    process.env.PASSWORD_HISTORY_SIZE = "not-a-number";
    expect(getPasswordHistorySize()).toBe(ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE);
  });

  it("falls back to the default for negative values", () => {
    process.env.PASSWORD_HISTORY_SIZE = "-3";
    expect(getPasswordHistorySize()).toBe(ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE);
  });

  it("honours a valid override and allows zero to disable the check", () => {
    process.env.PASSWORD_HISTORY_SIZE = "0";
    expect(getPasswordHistorySize()).toBe(0);
    process.env.PASSWORD_HISTORY_SIZE = "10";
    expect(getPasswordHistorySize()).toBe(10);
  });

  it("clamps absurd values to the safety ceiling", () => {
    process.env.PASSWORD_HISTORY_SIZE = "9999";
    expect(getPasswordHistorySize()).toBe(50);
  });
});
