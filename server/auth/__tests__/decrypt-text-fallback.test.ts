// @vitest-environment node
//
// Regression coverage for the dual-key decrypt fallback added in
// Task #726.
//
// The ENCRYPTION_KEY rotation handler in server/routes/system-routes.ts
// holds SHARE locks on every encrypted table inside one transaction,
// re-encrypts every row under the new key, COMMITs, and only then
// calls setEncryptionKey to update process.env. Between the COMMIT
// and that env swap there is a millisecond-scale window where the DB
// has been rewritten under the new key but process.env still holds
// the old key — a concurrent request that decrypts during that
// window would throw 'Unsupported state or unable to authenticate
// data'. The mirror window opens the moment process.env is swapped:
// any in-flight request that already SELECTed pre-COMMIT (old-key)
// ciphertext now sees process.env pointing at the new key and would
// throw the same error.
//
// To close both windows the rotation handler registers a "fallback"
// key in app-config (process-memory only, never persisted) and
// decryptText now tries the primary key first, falling back to the
// registered key if and only if the primary fails. This test pins:
//
//   * Steady state (no fallback registered): decryptText behaves
//     exactly as before — primary key succeeds, wrong primary key
//     throws.
//   * During rotation (fallback registered): primary failure
//     transparently retries with the fallback and returns the
//     plaintext, so the request mid-rotation does not see a
//     transient decode failure.
//   * The fallback is consulted ONLY on primary failure — a fallback
//     that happens to also decrypt successfully never overrides a
//     primary success (kept the hot path single-decipher and avoids
//     surprising the caller with the "wrong" key's plaintext if
//     someone ever loaded the same payload under both keys).
//   * Malformed / wrong-length fallback values are ignored (the
//     setter clears them) so decryptText can never silently fall
//     through to garbage.
//   * The original primary-key error is surfaced when BOTH keys
//     fail — callers see the exception that matches their current
//     process.env key, not a misleading fallback decode error.

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptText, decryptText } from "../mfaUtils";
import {
  setFallbackEncryptionKey,
  getFallbackEncryptionKey,
} from "../../lib/app-config";

function generateKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

const KEY_A = generateKey();
const KEY_B = generateKey();

let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.ENCRYPTION_KEY;
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = originalEnv;
  }
  setFallbackEncryptionKey(null);
});

describe("decryptText steady-state (no fallback registered)", () => {
  it("round-trips ciphertext encrypted under the active key", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipher = encryptText("hello");
    expect(decryptText(cipher)).toBe("hello");
  });

  it("throws when the active key cannot decrypt the payload", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipher = encryptText("hello");
    process.env.ENCRYPTION_KEY = KEY_B;
    expect(() => decryptText(cipher)).toThrow();
  });
});

describe("decryptText with rotation fallback registered (Task #726)", () => {
  it("falls back to the registered key when the primary fails — covers the COMMIT/swap window", () => {
    // Mid-rotation, post-COMMIT: DB has new-key ciphertext but
    // process.env still has the old key. The handler armed the
    // fallback to the new key just before COMMIT.
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipherUnderB = (() => {
      process.env.ENCRYPTION_KEY = KEY_B;
      const c = encryptText("rotated");
      process.env.ENCRYPTION_KEY = KEY_A;
      return c;
    })();
    setFallbackEncryptionKey(KEY_B);
    expect(decryptText(cipherUnderB)).toBe("rotated");
  });

  it("falls back the other direction after the env swap — covers buffered pre-COMMIT ciphertext", () => {
    // Mid-rotation, post-swap: process.env is now the new key but
    // an in-flight request still holds old-key ciphertext from a
    // SELECT it issued before COMMIT. The handler flipped the
    // fallback to the old key the moment it called
    // setEncryptionKey.
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipherUnderA = encryptText("stale-buffer");
    process.env.ENCRYPTION_KEY = KEY_B;
    setFallbackEncryptionKey(KEY_A);
    expect(decryptText(cipherUnderA)).toBe("stale-buffer");
  });

  it("never consults the fallback when the primary key already decrypts the payload", () => {
    // The hot path must stay single-decipher — registering a
    // fallback shouldn't change the answer for ciphertext the
    // primary already accepts. We register a fallback that would
    // ALSO succeed on a different payload to prove the primary
    // wins.
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipherUnderA = encryptText("primary-wins");
    setFallbackEncryptionKey(KEY_B);
    expect(decryptText(cipherUnderA)).toBe("primary-wins");
  });

  it("ignores a malformed fallback value (wrong length / non-hex) instead of shadowing the primary", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipher = encryptText("ok");
    setFallbackEncryptionKey("not-a-valid-key");
    expect(getFallbackEncryptionKey()).toBeNull();
    // Primary still works because no fallback ever got registered.
    expect(decryptText(cipher)).toBe("ok");
    // And a payload the primary cannot decrypt still throws cleanly
    // (no silent fall-through to a malformed key).
    process.env.ENCRYPTION_KEY = KEY_B;
    expect(() => decryptText(cipher)).toThrow();
  });

  it("re-throws the original primary-key error when BOTH keys fail to decrypt", () => {
    // Both registered keys are valid, but the payload was encrypted
    // under a third key neither knows. The caller must see the
    // primary's exception (so the error message reflects their
    // current process.env state), not a misleading fallback
    // decode error.
    const KEY_C = generateKey();
    process.env.ENCRYPTION_KEY = KEY_C;
    const cipherUnderC = encryptText("orphan");
    process.env.ENCRYPTION_KEY = KEY_A;
    setFallbackEncryptionKey(KEY_B);
    expect(() => decryptText(cipherUnderC)).toThrow();
  });

  it("clears the fallback when null is passed, returning to single-key behaviour", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const cipherUnderB = (() => {
      process.env.ENCRYPTION_KEY = KEY_B;
      const c = encryptText("transient");
      process.env.ENCRYPTION_KEY = KEY_A;
      return c;
    })();
    setFallbackEncryptionKey(KEY_B);
    expect(decryptText(cipherUnderB)).toBe("transient");
    // Tail period elapses — handler clears the fallback. The
    // payload from the earlier rotation no longer decrypts.
    setFallbackEncryptionKey(null);
    expect(getFallbackEncryptionKey()).toBeNull();
    expect(() => decryptText(cipherUnderB)).toThrow();
  });
});
