import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_PASSWORD_STRENGTH_SEGMENTS,
  adminPasswordRuleStatus,
  adminPasswordStrengthScore,
  validateAdminEmailField,
  validateAdminFirstNameField,
  validateAdminPasswordField,
  validateAdminInputShared,
} from "../admin-validation";

describe("admin-validation field helpers", () => {
  it("flags missing/invalid emails", () => {
    expect(validateAdminEmailField("")).toBe("adminEmailInvalid");
    expect(validateAdminEmailField("not-an-email")).toBe("adminEmailInvalid");
    expect(validateAdminEmailField("missing@host")).toBe("adminEmailInvalid");
    expect(validateAdminEmailField("a b@host.com")).toBe("adminEmailInvalid");
    expect(validateAdminEmailField("admin@example.com")).toBeNull();
  });

  it("flags missing or whitespace-only first names", () => {
    expect(validateAdminFirstNameField("")).toBe("adminFirstNameRequired");
    expect(validateAdminFirstNameField("   ")).toBe("adminFirstNameRequired");
    expect(validateAdminFirstNameField("Ada")).toBeNull();
  });

  it("enforces password length and complexity rules", () => {
    expect(ADMIN_PASSWORD_MIN_LENGTH).toBe(10);
    expect(validateAdminPasswordField("")).toBe("adminPasswordTooShort");
    expect(validateAdminPasswordField("short1!A")).toBe("adminPasswordTooShort");
    // Long enough, but missing upper-case + special
    expect(validateAdminPasswordField("alllowercase1")).toBe("adminPasswordWeak");
    // Long enough, but missing digit
    expect(validateAdminPasswordField("NoDigitsHere!")).toBe("adminPasswordWeak");
    // Long enough, but missing special character
    expect(validateAdminPasswordField("MissingSpecial1")).toBe("adminPasswordWeak");
    // Strong
    expect(validateAdminPasswordField("StrongPassw0rd!")).toBeNull();
  });
});

describe("validateAdminInputShared", () => {
  it("returns ok for a fully valid input", () => {
    expect(
      validateAdminInputShared({
        email: "admin@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        password: "StrongPassw0rd!",
      }),
    ).toEqual({ ok: true });
  });

  it("fails fast on the first invalid field in declaration order", () => {
    const r = validateAdminInputShared({
      email: "bad",
      firstName: "",
      password: "short",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("adminEmailInvalid");
    }
  });

  it("surfaces the password rule when only the password is weak", () => {
    const r = validateAdminInputShared({
      email: "admin@example.com",
      firstName: "Ada",
      password: "alllowercase1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("adminPasswordWeak");
    }
  });
});

describe("adminPasswordRuleStatus", () => {
  it("reports nothing satisfied for an empty password", () => {
    expect(adminPasswordRuleStatus("")).toEqual({
      length: false,
      lowercase: false,
      uppercase: false,
      digit: false,
      special: false,
    });
  });

  it("flips each rule on as the operator types", () => {
    expect(adminPasswordRuleStatus("a")).toMatchObject({
      length: false,
      lowercase: true,
      uppercase: false,
      digit: false,
      special: false,
    });
    expect(adminPasswordRuleStatus("aA")).toMatchObject({
      lowercase: true,
      uppercase: true,
      digit: false,
      special: false,
    });
    expect(adminPasswordRuleStatus("aA1")).toMatchObject({
      lowercase: true,
      uppercase: true,
      digit: true,
      special: false,
    });
    expect(adminPasswordRuleStatus("aA1!")).toMatchObject({
      lowercase: true,
      uppercase: true,
      digit: true,
      special: true,
    });
  });

  it("only marks the length rule satisfied at or above the minimum", () => {
    expect(adminPasswordRuleStatus("a".repeat(ADMIN_PASSWORD_MIN_LENGTH - 1)).length).toBe(false);
    expect(adminPasswordRuleStatus("a".repeat(ADMIN_PASSWORD_MIN_LENGTH)).length).toBe(true);
  });

  it("agrees with validateAdminPasswordField on the canonical strong password", () => {
    const status = adminPasswordRuleStatus("StrongPassw0rd!");
    expect(status).toEqual({
      length: true,
      lowercase: true,
      uppercase: true,
      digit: true,
      special: true,
    });
    expect(validateAdminPasswordField("StrongPassw0rd!")).toBeNull();
  });
});

describe("adminPasswordStrengthScore", () => {
  it("renders an empty bar with the weak label for an empty password", () => {
    expect(adminPasswordStrengthScore("")).toEqual({
      score: 0,
      segments: ADMIN_PASSWORD_STRENGTH_SEGMENTS,
      label: "weak",
    });
  });

  it("scales the score with the number of rules satisfied", () => {
    // 1 rule met (lowercase only) → weak
    expect(adminPasswordStrengthScore("a")).toMatchObject({
      score: 1,
      label: "weak",
    });
    // 2 rules met (lowercase + uppercase) → still weak
    expect(adminPasswordStrengthScore("aA")).toMatchObject({
      score: 2,
      label: "weak",
    });
    // 3 rules met (lowercase + uppercase + digit) → fair
    expect(adminPasswordStrengthScore("aA1")).toMatchObject({
      score: 3,
      label: "fair",
    });
    // 4 rules met (still missing length) → fair (never "strong" while invalid)
    expect(adminPasswordStrengthScore("aA1!")).toMatchObject({
      score: 4,
      label: "fair",
    });
  });

  it("withholds the final segment when all rules pass but the password is just at the minimum length", () => {
    // 10 chars (min length), all classes present → 4/5, fair
    const justBarelyValid = "Abcdefgh1!";
    expect(justBarelyValid.length).toBe(ADMIN_PASSWORD_MIN_LENGTH);
    expect(adminPasswordStrengthScore(justBarelyValid)).toEqual({
      score: ADMIN_PASSWORD_STRENGTH_SEGMENTS - 1,
      segments: ADMIN_PASSWORD_STRENGTH_SEGMENTS,
      label: "fair",
    });
  });

  it("awards the final segment and the strong label when the length bonus kicks in", () => {
    const longEnough = "A".padEnd(
      ADMIN_PASSWORD_MIN_LENGTH + ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD - 3,
      "a",
    ) + "1!";
    expect(longEnough.length).toBe(
      ADMIN_PASSWORD_MIN_LENGTH + ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD - 1,
    );
    // One char short of the bonus → still fair
    expect(adminPasswordStrengthScore(longEnough).label).toBe("fair");

    const withBonus = longEnough + "x";
    expect(withBonus.length).toBe(
      ADMIN_PASSWORD_MIN_LENGTH + ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD,
    );
    expect(adminPasswordStrengthScore(withBonus)).toEqual({
      score: ADMIN_PASSWORD_STRENGTH_SEGMENTS,
      segments: ADMIN_PASSWORD_STRENGTH_SEGMENTS,
      label: "strong",
    });
  });
});

