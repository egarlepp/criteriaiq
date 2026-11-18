// @vitest-environment happy-dom
//
// Locks the contract for the "setup-complete banner dismissed"
// sessionStorage marker helper introduced by Task #457. Before this
// helper was hoisted, the literal
// `"criteriaiq:setupCompleteBannerDismissed"` was hard-coded in two
// call sites in `landing.tsx` (the banner-render gate in the mount
// effect, and the post-login cleanup in `handleAuth`) plus its test
// file. A typo or rename in either write or read site would silently
// break the "don't re-show the 'Setup already complete' banner after
// dismiss" contract — the banner would re-appear on every re-render —
// and the unit tests would still pass against the stale local key.
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
//      sessionStorage shim so the navigation flow never breaks
//      because of a marker-read or marker-write failure (private
//      browsing, quota, blocked storage, …). hasSetupCompleteBanner-
//      Dismissed specifically returns false on read failure — the
//      safe default (Landing falls through and may re-show the
//      banner; better than getting stuck unable to render it).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SETUP_COMPLETE_BANNER_DISMISSED_KEY,
  clearSetupCompleteBannerDismissed,
  hasSetupCompleteBannerDismissed,
  markSetupCompleteBannerDismissed,
} from "../setup-complete-banner-dismissed-marker";

// Import the canonical key constant rather than re-declaring the
// literal — Task #457 requires the whole codebase to contain exactly
// ONE textual occurrence of "criteriaiq:setupCompleteBannerDismissed"
// (the definition in setup-complete-banner-dismissed-marker.ts). A
// grep for the literal anywhere else, including this test, would
// defeat the purpose of the refactor.
const KEY = SETUP_COMPLETE_BANNER_DISMISSED_KEY;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("setup-complete-banner-dismissed-marker", () => {
  it("markSetupCompleteBannerDismissed() writes the documented signal under the documented key", () => {
    markSetupCompleteBannerDismissed();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
    expect(hasSetupCompleteBannerDismissed()).toBe(true);
  });

  it("clearSetupCompleteBannerDismissed() removes the underlying key", () => {
    markSetupCompleteBannerDismissed();
    expect(hasSetupCompleteBannerDismissed()).toBe(true);

    clearSetupCompleteBannerDismissed();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(hasSetupCompleteBannerDismissed()).toBe(false);
  });

  it("hasSetupCompleteBannerDismissed() returns false when no marker has ever been set", () => {
    expect(hasSetupCompleteBannerDismissed()).toBe(false);
  });

  it("hasSetupCompleteBannerDismissed() only honors the documented signal value", () => {
    // Defensive: a future caller bypassing the helper and writing a
    // truthy-but-non-canonical value (e.g. "true", "yes",
    // "dismissed") must not be treated as a valid marker. The helper
    // is the only sanctioned writer; anything else is treated as
    // absent.
    window.sessionStorage.setItem(KEY, "true");
    expect(hasSetupCompleteBannerDismissed()).toBe(false);

    window.sessionStorage.setItem(KEY, "");
    expect(hasSetupCompleteBannerDismissed()).toBe(false);
  });

  it("swallows sessionStorage errors so the navigation flow never breaks", () => {
    // Simulate the private-browsing / quota / blocked-storage failure
    // mode where every sessionStorage method throws. None of the three
    // helpers may rethrow. hasSetupCompleteBannerDismissed must
    // additionally return false (the safe default — Landing falls
    // through to the rest of the banner-render gate instead of
    // getting stuck unable to surface the callout).
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

    expect(() => markSetupCompleteBannerDismissed()).not.toThrow();
    expect(() => clearSetupCompleteBannerDismissed()).not.toThrow();
    expect(() => hasSetupCompleteBannerDismissed()).not.toThrow();
    expect(hasSetupCompleteBannerDismissed()).toBe(false);

    // Sanity: the helpers genuinely tried to touch sessionStorage —
    // they didn't no-op past the throw early.
    expect(setItemSpy).toHaveBeenCalled();
    expect(getItemSpy).toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalled();
  });
});
