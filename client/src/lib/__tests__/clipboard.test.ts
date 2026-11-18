// @vitest-environment happy-dom
//
// Locks the contract for `safeCopyToClipboard` — the wizard's shared
// clipboard helper. The whole point of this helper is that Copy buttons
// do not throw "Script error" overlays on plain-HTTP self-hosted
// CriteriaIQ deployments where `navigator.clipboard` is `undefined`. We
// assert each branch:
//   1. Secure context: navigator.clipboard.writeText is awaited and
//      returns true.
//   2. Insecure context (no navigator.clipboard): we fall back to an
//      off-screen textarea + execCommand('copy') and return its result.
//   3. navigator.clipboard.writeText rejects: we still try the fallback
//      and return its result instead of letting the rejection bubble.
//   4. Both paths fail: we return false (callers render a toast).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeCopyToClipboard } from "../clipboard";

let execMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // happy-dom does not implement document.execCommand at all (the
  // property is absent, not just unimplemented), so vi.spyOn refuses to
  // attach. Define it directly with `any` to bypass the lib-dom
  // deprecation warning.
  execMock = vi.fn().mockReturnValue(true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: execMock,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

describe("safeCopyToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const ok = await safeCopyToClipboard("hello");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when navigator.clipboard is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const ok = await safeCopyToClipboard("fallback-value");
    expect(ok).toBe(true);
    expect(execMock).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when navigator.clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const ok = await safeCopyToClipboard("denied-then-ok");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledWith("copy");
  });

  it("returns false when both clipboard paths fail", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    execMock.mockReturnValue(false);
    const ok = await safeCopyToClipboard("nope");
    expect(ok).toBe(false);
  });
});
