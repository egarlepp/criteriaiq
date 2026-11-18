/**
 * Cross-context clipboard write with an `execCommand('copy')` fallback.
 *
 * Why this exists:
 *   `navigator.clipboard` is gated on a "secure context" (HTTPS or
 *   localhost). Self-hosted CriteriaIQ deployments frequently run on plain
 *   HTTP (Dokploy default `*.traefik.me` test domain, internal LANs,
 *   etc.) where `navigator.clipboard` is `undefined` — calling
 *   `.writeText()` on it throws an uncaught TypeError that we have seen
 *   bubble up as a generic "Script error" in the wizard's Copy buttons.
 *
 *   The fallback selects an off-screen <textarea> and uses the legacy
 *   `document.execCommand('copy')` API, which works in insecure contexts
 *   in every browser the wizard targets. We return a boolean so callers
 *   can show a localized toast on failure instead of silently appearing
 *   to succeed.
 */
export async function safeCopyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the execCommand fallback below
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    // Off-screen but still focusable. `position: fixed` keeps it from
    // shifting page layout if the calling component sits inside a
    // scrollable container.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.boxShadow = "none";
    textarea.style.background = "transparent";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    const previousActive = document.activeElement as HTMLElement | null;
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    if (previousActive && typeof previousActive.focus === "function") {
      previousActive.focus();
    }
    return ok;
  } catch {
    return false;
  }
}
