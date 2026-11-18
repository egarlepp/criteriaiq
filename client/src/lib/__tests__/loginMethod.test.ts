import { describe, it, expect } from "vitest";
import {
  describeLoginMethod,
  LOGIN_METHOD_RECOVERY_TAG_I18N_KEY,
  LOGIN_METHOD_UNKNOWN_I18N_KEY,
} from "../loginMethod";

describe("describeLoginMethod", () => {
  it("renders the password / email branch with a friendly label and no MFA flags", () => {
    const info = describeLoginMethod("email");

    expect(info.label).toBe("Email");
    expect(info.isMfa).toBe(false);
    expect(info.isRecovery).toBe(false);
    expect(info.raw).toBe("email");
  });

  it("recognizes the authenticator-app branch as MFA but not recovery", () => {
    const info = describeLoginMethod("mfa-totp");

    expect(info.label).toBe("Email + Authenticator app");
    expect(info.isMfa).toBe(true);
    expect(info.isRecovery).toBe(false);
  });

  it("recognizes recovery-code logins as both MFA and recovery so the UI can highlight them", () => {
    const info = describeLoginMethod("mfa-recovery");

    expect(info.label).toBe("Email + Recovery code");
    expect(info.isMfa).toBe(true);
    expect(info.isRecovery).toBe(true);
  });

  it("preserves the raw machine value so tooltips/test hooks can still inspect it", () => {
    expect(describeLoginMethod("mfa-recovery").raw).toBe("mfa-recovery");
    expect(describeLoginMethod("auto-login").raw).toBe("auto-login");
  });

  it("falls back to a Title-Cased label for unknown method values without crashing", () => {
    const info = describeLoginMethod("passkey");

    // Unknown method should render *something* friendly so a future
    // login-method (e.g. passkey, added by Task #602) doesn't ship a
    // raw "passkey" string in the audit UI.
    expect(info.label).toBe("Passkey");
    expect(info.isMfa).toBe(false);
    expect(info.isRecovery).toBe(false);
  });

  it("Title-Cases multi-segment unknown values", () => {
    expect(describeLoginMethod("sso-okta").label).toBe("Sso Okta");
  });

  it("handles null / undefined / blank loginMethod safely", () => {
    for (const value of [null, undefined, "", "   "] as const) {
      const info = describeLoginMethod(value);
      expect(info.label).toBe("Unknown");
      expect(info.isMfa).toBe(false);
      expect(info.isRecovery).toBe(false);
      expect(info.raw).toBe("unknown");
    }
  });

  // The remaining cases lock in the i18n behavior introduced by
  // Task #622: when callers (e.g. <LoginMethodBadge />) pass an
  // i18next-style translator, the humanized label must come from the
  // `profile.activity.methods.*` namespace rather than the hardcoded
  // English string. Without these the helper would silently regress to
  // shipping English in the middle of an otherwise translated audit
  // page.
  describe("with a translator option", () => {
    it("routes the known-method labels through the profile.activity.methods.* keys", () => {
      const calls: Array<{ key: string; defaultValue: string }> = [];
      const translate = (key: string, defaultValue: string) => {
        calls.push({ key, defaultValue });
        // Pretend pt-BR is loaded — the key resolves to a Portuguese
        // string. The point is to prove the translator's return value
        // ends up on the descriptor instead of the English default.
        return `pt:${key}`;
      };

      expect(describeLoginMethod("email", { translate }).label).toBe(
        "pt:profile.activity.methods.email",
      );
      expect(describeLoginMethod("mfa-totp", { translate }).label).toBe(
        "pt:profile.activity.methods.mfaTotp",
      );
      expect(describeLoginMethod("mfa-recovery", { translate }).label).toBe(
        "pt:profile.activity.methods.mfaRecovery",
      );
      expect(describeLoginMethod("auto-login", { translate }).label).toBe(
        "pt:profile.activity.methods.autoLogin",
      );

      // Each call must also pass the English label as the defaultValue
      // so callers without a matching translation still get something
      // readable instead of the raw key.
      expect(calls).toEqual([
        { key: "profile.activity.methods.email", defaultValue: "Email" },
        {
          key: "profile.activity.methods.mfaTotp",
          defaultValue: "Email + Authenticator app",
        },
        {
          key: "profile.activity.methods.mfaRecovery",
          defaultValue: "Email + Recovery code",
        },
        {
          key: "profile.activity.methods.autoLogin",
          defaultValue: "Auto-login (demo)",
        },
      ]);
    });

    it("routes the Unknown fallback through the dedicated i18n key", () => {
      let observedKey: string | undefined;
      const translate = (key: string, defaultValue: string) => {
        observedKey = key;
        return `pt:${defaultValue}`;
      };

      const info = describeLoginMethod(null, { translate });

      expect(observedKey).toBe(LOGIN_METHOD_UNKNOWN_I18N_KEY);
      expect(info.label).toBe("pt:Unknown");
    });

    it("does NOT translate unknown raw values — Title-Case fallback wins so a future method (e.g. passkey) still renders something readable", () => {
      const translate = () => "should-not-be-used";

      // We deliberately don't have a per-locale string for unknown
      // methods, so the Title-Cased machine value remains the safest
      // stop-gap until a translation is added.
      expect(describeLoginMethod("passkey", { translate }).label).toBe(
        "Passkey",
      );
    });

    it("exposes a stable i18n key for the adjacent Recovery code tag so the badge can translate it consistently", () => {
      // The badge uses this key directly (not via `describeLoginMethod`)
      // because the tag is rendered separately from the label. Pin the
      // key here so the badge and the helper can't drift apart.
      expect(LOGIN_METHOD_RECOVERY_TAG_I18N_KEY).toBe(
        "profile.activity.methods.recoveryCodeTag",
      );
    });
  });
});
