// @vitest-environment node
//
// Regression coverage for the recovery-code login matching contract
// added in Task #595.
//
// `findMatchingUnusedRecoveryCode` is the small helper extracted out
// of the `/api/mfa/challenge` route so we can prove the
// match-and-replay-protect logic without standing up the full Express
// stack. The route layer is responsible for:
//
//   1. Loading the user's recovery codes filtered to `usedAt IS NULL`.
//   2. Calling this helper to find a bcrypt match in constant time.
//   3. Marking the matched row's `usedAt` so the next attempt with
//      the same code falls into the empty-candidate branch.
//
// The route's "same code cannot be reused" guarantee therefore
// reduces to two properties of this helper:
//
//   * A correct submitted code matches its stored hash and returns
//     the row id (so the route can mark `usedAt`).
//   * An empty candidate list (which is what the route sees on a
//     replay attempt, after the row's `usedAt` has been stamped and
//     the `IS NULL` filter excludes it) returns `null`, so the route
//     responds with the same `Invalid verification code` it would
//     for a wrong code.
//
// Locking those properties here means a future refactor that breaks
// either half (e.g. accidentally returning the first row regardless
// of match, or short-circuiting on an empty array with a non-null
// sentinel) trips a deterministic, fast unit test instead of waiting
// for an operator to discover their backup codes are unsafe.

import { describe, expect, it } from "vitest";
import {
  findMatchingUnusedRecoveryCode,
  hashRecoveryCode,
} from "../mfaUtils";

describe("findMatchingUnusedRecoveryCode (Task #595)", () => {
  it("returns the matching row id when the submitted code matches one of the unused hashes", async () => {
    // Three stored hashes — only the middle one matches the
    // submitted plaintext. The helper must scan the list, find the
    // bcrypt match, and surface the row id so the caller can mark
    // its `usedAt`.
    const submitted = "ABCD-EF01-2345-6789-ABCD-EF01-2345-6789";
    const candidates = [
      { id: "row-1", codeHash: await hashRecoveryCode("0000-0000-0000-0000-0000-0000-0000-0000") },
      { id: "row-2", codeHash: await hashRecoveryCode(submitted) },
      { id: "row-3", codeHash: await hashRecoveryCode("FFFF-FFFF-FFFF-FFFF-FFFF-FFFF-FFFF-FFFF") },
    ];

    const result = await findMatchingUnusedRecoveryCode(candidates, submitted);
    expect(result).toEqual({ id: "row-2" });
  });

  it("returns null when the submitted code does not match any stored hash", async () => {
    // Wrong-code path: no bcrypt comparison succeeds, so the helper
    // must return `null` and the route returns 400 to the operator.
    const candidates = [
      { id: "row-1", codeHash: await hashRecoveryCode("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA") },
      { id: "row-2", codeHash: await hashRecoveryCode("BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB") },
    ];

    const result = await findMatchingUnusedRecoveryCode(candidates, "WRONG-CODE-XXXX");
    expect(result).toBeNull();
  });

  it("returns null when the candidate list is empty (replay-attempt branch)", async () => {
    // Replay scenario: the route's `IS NULL` filter drops the row
    // that was just consumed, so the helper sees an empty list. The
    // operator's already-used backup code must NOT satisfy a second
    // challenge — the helper must return `null` even when the
    // submitted code was previously valid.
    const result = await findMatchingUnusedRecoveryCode([], "ABCD-EF01-2345-6789-ABCD-EF01-2345-6789");
    expect(result).toBeNull();
  });

  it("returns null for an empty submitted code without scanning candidates", async () => {
    // Defensive: the route already pulls `recoveryCode` from the
    // request body, but a future caller wrapper could pass an empty
    // string. We must never bcrypt-compare against `''` — that would
    // succeed against any hash whose plaintext also happened to be
    // empty (none exist today, but the check is cheap insurance and
    // makes the contract explicit).
    const candidates = [
      { id: "row-1", codeHash: await hashRecoveryCode("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA") },
    ];

    const result = await findMatchingUnusedRecoveryCode(candidates, "");
    expect(result).toBeNull();
  });

  it("does not mutate the candidates array", async () => {
    // The route maps the DB rows into the helper's input shape; we
    // pin that the helper treats it as read-only so a future caller
    // who shares the array with downstream code (e.g. logging the
    // remaining unused count) is not surprised by a hidden splice.
    const submitted = "1234-5678-90AB-CDEF-1234-5678-90AB-CDEF";
    const candidates = [
      { id: "row-1", codeHash: await hashRecoveryCode(submitted) },
      { id: "row-2", codeHash: await hashRecoveryCode("DEAD-BEEF-DEAD-BEEF-DEAD-BEEF-DEAD-BEEF") },
    ];
    const snapshot = candidates.map((c) => ({ ...c }));

    await findMatchingUnusedRecoveryCode(candidates, submitted);
    expect(candidates).toEqual(snapshot);
  });
});
