import { describe, expect, it } from "vitest";

import {
  parseChipsFromValue,
  validateChip,
} from "../filter-chips-helpers";

describe("parseChipsFromValue", () => {
  it("splits a comma-separated string into trimmed chips (legacy saved-report shape)", () => {
    expect(parseChipsFromValue("red, blue,green")).toEqual([
      "red",
      "blue",
      "green",
    ]);
  });

  it("ignores empty entries (trailing commas, double commas, all whitespace)", () => {
    expect(parseChipsFromValue(",a,, b ,")).toEqual(["a", "b"]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseChipsFromValue("")).toEqual([]);
  });

  it("accepts a real array (the new on-the-wire shape) and trims each entry", () => {
    expect(parseChipsFromValue(["red", " blue ", "green"])).toEqual([
      "red",
      "blue",
      "green",
    ]);
  });

  it("drops empty / whitespace-only entries from an array", () => {
    expect(parseChipsFromValue(["", " ", "a", "  b  "])).toEqual(["a", "b"]);
  });

  it("returns an empty list for null / undefined", () => {
    expect(parseChipsFromValue(null)).toEqual([]);
    expect(parseChipsFromValue(undefined)).toEqual([]);
  });

  it("preserves chips that contain commas when the input is a real array", () => {
    // The whole point of switching to an array on the wire: chip values
    // can now contain commas without escape tricks.
    expect(parseChipsFromValue(["Smith, John", "Doe, Jane"])).toEqual([
      "Smith, John",
      "Doe, Jane",
    ]);
  });
});

describe("validateChip", () => {
  it("rejects empty / whitespace-only chips for any field type", () => {
    expect(validateChip("   ", "string").ok).toBe(false);
    expect(validateChip("", "number").ok).toBe(false);
  });

  it("accepts any non-empty value for string fields", () => {
    expect(validateChip("hello", "string")).toEqual({
      ok: true,
      value: "hello",
    });
  });

  it("rejects non-numeric input for number fields so it never reaches the server", () => {
    const result = validateChip("abc", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/number/);
    }
  });

  it("accepts numeric strings (including negatives and decimals) for number fields", () => {
    expect(validateChip("-3.14", "number")).toEqual({
      ok: true,
      value: "-3.14",
    });
    expect(validateChip("0", "number")).toEqual({ ok: true, value: "0" });
  });

  it("rejects gibberish for date fields", () => {
    const result = validateChip("not-a-date", "date");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/date/);
    }
  });

  it("accepts ISO dates for date fields", () => {
    expect(validateChip("2026-01-15", "date")).toEqual({
      ok: true,
      value: "2026-01-15",
    });
  });

  it("rejects non-YYYY-MM-DD date formats so the server can't drift on locale parsing", () => {
    expect(validateChip("1/15/2026", "date").ok).toBe(false);
    expect(validateChip("2026/01/15", "date").ok).toBe(false);
    expect(validateChip("Jan 15, 2026", "date").ok).toBe(false);
    expect(validateChip("26-01-15", "date").ok).toBe(false);
  });

  it("rejects rollover dates that JS's Date silently converts (2026-02-31)", () => {
    // Without strict validation, `new Date("2026-02-31")` becomes
    // March 3, 2026 — a value the user definitely didn't ask to filter on.
    expect(validateChip("2026-02-31", "date").ok).toBe(false);
    expect(validateChip("2025-13-01", "date").ok).toBe(false);
    expect(validateChip("2025-00-15", "date").ok).toBe(false);
  });

  it("accepts the leap-day boundary correctly", () => {
    expect(validateChip("2024-02-29", "date").ok).toBe(true);
    expect(validateChip("2025-02-29", "date").ok).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateChip("  42  ", "number")).toEqual({
      ok: true,
      value: "42",
    });
  });
});
