import { describe, expect, it } from "vitest";
import { calculateCompleteness } from "../profile-editor-utils";
import { isProfileEditorTab } from "../profile-editor-types";
import type { UserProfile } from "../profile-editor-types";

const full = {
  firstName: "Sam",
  lastName: "Lee",
  accountId: "a1",
  title: "SE",
  region: "EMEA",
  department: "Sales",
} as unknown as UserProfile;

describe("calculateCompleteness", () => {
  it("ignores the CRM when none applies to the user", () => {
    expect(calculateCompleteness(full)).toBe(100);
    expect(calculateCompleteness(full, null)).toBe(100);
  });
  it("counts the CRM connection as one more field", () => {
    expect(calculateCompleteness(full, true)).toBe(100);
    expect(calculateCompleteness(full, false)).toBe(86);
  });
  it("is 0 with no profile", () => {
    expect(calculateCompleteness(undefined, true)).toBe(0);
  });
});

describe("isProfileEditorTab", () => {
  it("accepts only real tab names from a URL", () => {
    expect(isProfileEditorTab("integrations")).toBe(true);
    expect(isProfileEditorTab("security")).toBe(true);
    expect(isProfileEditorTab("admin")).toBe(false);
    expect(isProfileEditorTab(null)).toBe(false);
  });
});
