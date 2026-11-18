// @vitest-environment happy-dom
//
// Behavior contract for <LoginMethodBadge />: humanizes the raw
// `audit_logins.loginMethod` strings written by Task #596 and gives
// recovery-code redemptions an obvious, scannable visual marker so
// admins can spot them on the Recent Logins / Audit Login surfaces.
//
// As of Task #622 the badge also pulls its labels from the i18n
// bundles, so the locale-switching cases at the bottom guard against a
// regression where non-English admins see English text mid-page.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Importing the i18n module here ensures the global i18next instance is
// initialized with the real locale bundles before the badge renders.
// Without this, `useTranslation()` would return a degraded instance and
// the locale-specific assertions below would silently fall back to the
// English defaults instead of exercising the real translation path.
import i18n from "@/i18n";
import { LoginMethodBadge } from "../LoginMethodBadge";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe("<LoginMethodBadge />", () => {
  it("renders a friendly label for plain email logins (no recovery marker)", () => {
    render(<LoginMethodBadge method="email" />);

    const badge = container.querySelector("[data-testid='login-method-badge']");
    expect(badge?.textContent).toContain("Email");
    expect(container.textContent).not.toContain("Recovery code");
  });

  it("labels authenticator-code logins as Email + Authenticator app", () => {
    render(<LoginMethodBadge method="mfa-totp" />);

    expect(container.textContent).toContain("Email + Authenticator app");
    // Authenticator-app logins are MFA but NOT a recovery-code event,
    // so we must not stamp the noisy amber "Recovery code" tag here.
    expect(container.textContent).not.toContain("Recovery code");
  });

  it("makes recovery-code redemptions obvious with both a humanized label and a Recovery code tag", () => {
    render(<LoginMethodBadge method="mfa-recovery" />);

    expect(container.textContent).toContain("Email + Recovery code");
    // The adjacent uppercase "Recovery code" tag is the scannable
    // marker the task explicitly calls for ("a small recovery-code
    // badge or row highlight makes it easy to scan a long list").
    expect(container.textContent).toContain("Recovery code");
  });

  it("exposes the raw machine value on the DOM so the column stays tooltip- / test-friendly", () => {
    render(<LoginMethodBadge method="mfa-recovery" />);

    const badge = container.querySelector("[data-login-method='mfa-recovery']");
    expect(badge).not.toBeNull();
  });

  it("falls back gracefully for nullish loginMethod values instead of crashing", () => {
    render(<LoginMethodBadge method={null} />);

    const badge = container.querySelector("[data-testid='login-method-badge']");
    expect(badge?.textContent).toContain("Unknown");
  });

  // The locale-switching cases below verify Task #622: the humanized
  // labels (and the adjacent "Recovery code" tag) come from the i18n
  // bundles instead of being hardcoded English. They run last and
  // restore the original language so other tests in the suite are not
  // affected by the language switch.
  describe("locale-aware labels (Task #622)", () => {
    let previousLanguage: string;

    beforeEach(async () => {
      previousLanguage = i18n.language;
    });

    afterEach(async () => {
      await i18n.changeLanguage(previousLanguage);
    });

    it("renders the pt-BR label for plain email logins so admins on Portuguese don't see English mid-page", async () => {
      await i18n.changeLanguage("pt");
      render(<LoginMethodBadge method="email" />);

      const badge = container.querySelector(
        "[data-testid='login-method-badge']",
      );
      expect(badge?.textContent).toContain("E-mail");
      expect(badge?.textContent).not.toContain("Email");
    });

    it("renders the de-DE recovery-code label AND the translated Recovery code tag", async () => {
      await i18n.changeLanguage("de");
      render(<LoginMethodBadge method="mfa-recovery" />);

      // Both surfaces — the badge label and the adjacent uppercase tag
      // — must be translated. The tag in particular used to be the
      // hardcoded string "Recovery code" before Task #622.
      expect(container.textContent).toContain("E-Mail + Wiederherstellungscode");
      expect(container.textContent).toContain("Wiederherstellungscode");
      expect(container.textContent).not.toContain("Recovery code");
    });

    it("renders the fr-FR authenticator-app label for MFA logins", async () => {
      await i18n.changeLanguage("fr");
      render(<LoginMethodBadge method="mfa-totp" />);

      expect(container.textContent).toContain(
        "E-mail + application d'authentification",
      );
      expect(container.textContent).not.toContain("Authenticator");
    });
  });
});

describe("login-method i18n bundle parity (Task #622)", () => {
  // Catch the silent regression where someone adds a new locale (or a
  // new entry to en-US) but forgets to translate the
  // `profile.activity.methods.*` keys — non-English admins would
  // otherwise see English text in the middle of an otherwise
  // translated audit page.
  const REQUIRED_KEYS = [
    "email",
    "autoLogin",
    "mfaTotp",
    "mfaRecovery",
    "recoveryCodeTag",
    "unknown",
  ] as const;

  const LOCALES = ["en", "fr", "de", "es", "pt", "it"] as const;

  for (const locale of LOCALES) {
    it(`exposes every method label for ${locale}`, () => {
      const bundle = i18n.getResourceBundle(locale, "translation") as
        | Record<string, unknown>
        | undefined;
      const methods = (bundle?.profile as { activity?: { methods?: Record<string, string> } } | undefined)
        ?.activity?.methods;

      expect(methods, `missing profile.activity.methods for ${locale}`).toBeDefined();
      for (const key of REQUIRED_KEYS) {
        const value = methods?.[key];
        expect(value, `missing ${key} for ${locale}`).toBeTruthy();
        expect(typeof value).toBe("string");
      }
    });
  }
});
