// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  SESSION_EXPIRED_FLAG,
  SESSION_IDLE_TIMEOUT_FLAG,
  consumeSessionEndReason,
  flagSessionEnded,
  redirectToSignIn,
} from "../sign-in-redirect";

let originalLocation: Location;
let assignedHref: string | null;

beforeEach(() => {
  window.sessionStorage.clear();
  originalLocation = window.location;
  assignedHref = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      get href() {
        return "http://localhost/create";
      },
      set href(v: string) {
        assignedHref = v;
      },
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  window.sessionStorage.clear();
});

describe("redirectToSignIn", () => {
  it("reloads the app at / (never the POST-only /api/login) and flags the expiry", () => {
    redirectToSignIn();
    expect(assignedHref).toBe("/");
    expect(window.sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe("1");
  });
});

describe("consumeSessionEndReason", () => {
  it("returns null when nothing is flagged", () => {
    expect(consumeSessionEndReason()).toBeNull();
  });

  it("returns the reason once, then clears it", () => {
    flagSessionEnded("expired");
    expect(consumeSessionEndReason()).toBe("expired");
    expect(consumeSessionEndReason()).toBeNull();
  });

  it("prefers idle when both flags are set and clears both", () => {
    flagSessionEnded("expired");
    flagSessionEnded("idle");
    expect(consumeSessionEndReason()).toBe("idle");
    expect(window.sessionStorage.getItem(SESSION_IDLE_TIMEOUT_FLAG)).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull();
  });
});
