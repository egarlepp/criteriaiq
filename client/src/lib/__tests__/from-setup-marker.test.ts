// @vitest-environment happy-dom
//
// Locks the contract for the "came-from-setup" sessionStorage marker
// helper introduced by Task #456. Before this helper was hoisted, the
// literal `"criteriaiq:fromSetup"` was hard-coded in four separate
// client modules (setup.tsx, setup-health-check-view.tsx, useAuth.ts,
// landing.tsx). A typo or rename in any one of them silently broke
// the bounce-suppression contract introduced by Task #455 — the
// operator was once again trapped on the diagnostic screen, and the
// individual unit tests still passed against their stale local key.
//
// This suite pins the helper's read/write/clear surface so a future
// refactor that changes the underlying key has to update exactly one
// place. We assert each branch:
//
//   1. mark → read returns true; the underlying sessionStorage value
//      is the documented `"1"` string under the documented key.
//   2. clear → read returns false; the underlying key is removed.
//   3. read with no prior write returns false (default state).
//   4. read with a non-`"1"` value returns false (we only honor the
//      documented signal, not any truthy value — defends against a
//      future caller writing `"true"` or `"yes"`).
//   5. All three helpers swallow storage errors raised by the
//      sessionStorage shim so the auth/navigation flow never breaks
//      because of a marker-read or marker-write failure (private
//      browsing, quota, blocked storage, …). hasCameFromSetup
//      specifically returns false on read failure — the safe default
//      for both consumers (useAuth's bounce fires; the Landing
//      banner stays hidden).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FROM_SETUP_KEY,
  clearCameFromSetup,
  hasCameFromSetup,
  markCameFromSetup,
} from "../from-setup-marker";

// Import the canonical key constant rather than re-declaring the
// literal — Task #456 requires the whole codebase to contain exactly
// ONE textual occurrence of "criteriaiq:fromSetup" (the definition
// in from-setup-marker.ts). A grep for the literal anywhere else,
// including this test, would defeat the purpose of the refactor.
const KEY = FROM_SETUP_KEY;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("from-setup-marker", () => {
  it("markCameFromSetup() writes the documented signal under the documented key", () => {
    markCameFromSetup();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
    expect(hasCameFromSetup()).toBe(true);
  });

  it("clearCameFromSetup() removes the underlying key", () => {
    markCameFromSetup();
    expect(hasCameFromSetup()).toBe(true);

    clearCameFromSetup();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(hasCameFromSetup()).toBe(false);
  });

  it("hasCameFromSetup() returns false when no marker has ever been set", () => {
    expect(hasCameFromSetup()).toBe(false);
  });

  it("hasCameFromSetup() only honors the documented signal value", () => {
    // Defensive: a future caller bypassing the helper and writing a
    // truthy-but-non-canonical value (e.g. "true", "yes", "fromSetup")
    // must not be treated as a valid marker. The helper is the only
    // sanctioned writer; anything else is treated as absent.
    window.sessionStorage.setItem(KEY, "true");
    expect(hasCameFromSetup()).toBe(false);

    window.sessionStorage.setItem(KEY, "");
    expect(hasCameFromSetup()).toBe(false);
  });

  it("swallows sessionStorage errors so the navigation flow never breaks", () => {
    // Simulate the private-browsing / quota / blocked-storage failure
    // mode where every sessionStorage method throws. None of the three
    // helpers may rethrow. hasCameFromSetup must additionally return
    // false (the safe default — useAuth bounces, banner stays hidden).
    //
    // happy-dom's sessionStorage is its own instance and does NOT
    // delegate to `Storage.prototype`, so a `spyOn(Storage.prototype,
    // …)` mock is never invoked in this environment. Spy directly on
    // the live sessionStorage object instead.
    const setItemSpy = vi
      .spyOn(window.sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    const getItemSpy = vi
      .spyOn(window.sessionStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    const removeItemSpy = vi
      .spyOn(window.sessionStorage, "removeItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    expect(() => markCameFromSetup()).not.toThrow();
    expect(() => clearCameFromSetup()).not.toThrow();
    expect(() => hasCameFromSetup()).not.toThrow();
    expect(hasCameFromSetup()).toBe(false);

    // Sanity: the helpers genuinely tried to touch sessionStorage —
    // they didn't no-op past the throw early.
    expect(setItemSpy).toHaveBeenCalled();
    expect(getItemSpy).toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalled();
  });
});
