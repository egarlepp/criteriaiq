// SVG sanitizer — strip script-injection vectors before storing an
// uploaded SVG.
//
// Why we need this: SVG is text-based XML and can carry executable
// content that PNG/JPEG/WebP cannot:
//
//   1. `<script>...</script>` blocks (run when the SVG is opened
//      directly in a tab, or embedded inline via
//      dangerouslySetInnerHTML)
//   2. Inline event-handler attributes (`onclick=`, `onload=`,
//      `onerror=`, `onmouseover=`, …) which fire in the same
//      contexts as scripts
//   3. `javascript:` URIs in href / xlink:href / src / action
//   4. `<foreignObject>` blocks that embed arbitrary HTML — full
//      script-execution surface
//   5. External `<use xlink:href="https://attacker/...#path">` refs
//      that fetch malicious SVG fragments at render time
//
// Logo upload context: when a customer's branded logo is displayed
// via `<img src="logo.svg">` the browser DOES sandbox it (scripts
// don't run from inside an img element). BUT:
//
//   * An admin who right-clicks → "View image" / "Open in new tab"
//     loads the SVG as a top-level same-origin document — scripts
//     WILL run there with full session cookie access.
//   * Any future feature that inlines the logo via
//     dangerouslySetInnerHTML or as a CSS `mask-image` shorthand
//     would also expose script execution.
//
// So we sanitize at upload, store the cleaned SVG, never persist the
// original. One-time cost on the upload path, zero per-request
// runtime overhead afterwards.
//
// Why not DOMPurify here: DOMPurify needs a DOM (it's a client
// library; on the server it requires JSDOM as a heavyweight
// dependency, ~5 MB). The threats this scrubber covers are small in
// number and well-known — a focused regex pass is more legible to
// reviewers and avoids the JSDOM dep. The same approach is what
// `svg-sanitizer` / `sanitize-svg` packages use under the hood for
// their core logic.

// The `<` that opens any `<script` or `</script` tag, however written.
const SCRIPT_TAG_OPEN_RE = /<(?=\/?script)/gi;
// Match any `on*` attribute (event handler) regardless of quote style
// or absence. We capture the leading space so we keep tag structure
// readable, but the replacement just drops the entire attribute.
const EVENT_HANDLER_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// `javascript:` (and its mixed-case variants) appearing inside an
// href/xlink:href/src/action attribute value. We rewrite the WHOLE
// attribute value to a fragment-ref to the current document (`#`)
// so the link still renders but navigates to nowhere. Simpler scheme-
// only substitution (e.g. `javascript:` → `about:blank`) left the
// rest of the payload concatenated to the safe scheme producing
// nonsense URLs like `about:blankalert('xss')` — harmless but ugly.
const JAVASCRIPT_URI_ATTR_RE =
  /\b((?:xlink:)?(?:href|src|action))\s*=\s*(?:"\s*javascript\s*:[^"]*"|'\s*javascript\s*:[^']*'|javascript\s*:[^\s>]*)/gi;
// `<foreignObject>` embeds arbitrary HTML — including <script> tags
// the regex above wouldn't reach because they're nested under a
// different element. Drop the whole block.
const FOREIGN_OBJECT_RE = /<foreignObject\b[\s\S]*?<\/foreignObject\b[^>]*>/gi;
const FOREIGN_OBJECT_SELF_CLOSING_RE = /<foreignObject\b[^>]*\/>/gi;
// External `<use href="https://...">` / `<use xlink:href="...">`
// refs fetch arbitrary URLs at render time. Allow only same-document
// references (those starting with `#`). We strip the href attr from
// any `<use>` whose href doesn't start with `#`.
const USE_TAG_RE = /<use\b([^>]*?)>/gi;

export interface SanitizeSvgResult {
  ok: boolean;
  /** Cleaned SVG content. Empty string on parse failure. */
  content: string;
  /** Human-readable reason when ok=false. */
  reason?: string;
  /** What we stripped, for logging / auditing. */
  removed: {
    scripts: number;
    eventHandlers: number;
    javascriptUris: number;
    foreignObjects: number;
    externalUseRefs: number;
  };
}

/**
 * Returns a cleaned copy of an SVG string with known script-injection
 * vectors removed. Conservative: when in doubt, strip.
 *
 * The first 1 KB of the input is checked for `<svg` or `<?xml` so a
 * file that lies about its extension (e.g. a Word doc renamed to
 * `.svg`) is rejected before we even attempt to sanitize.
 */
export function sanitizeSvg(input: string): SanitizeSvgResult {
  const removed = {
    scripts: 0,
    eventHandlers: 0,
    javascriptUris: 0,
    foreignObjects: 0,
    externalUseRefs: 0,
  };

  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, content: '', reason: 'SVG file is empty', removed };
  }

  // Structural sanity check — first 1 KB should contain either `<svg`
  // or the XML prolog. This catches "I renamed a .docx to .svg".
  const head = input.slice(0, 1024).toLowerCase();
  if (!head.includes('<svg') && !head.includes('<?xml')) {
    return {
      ok: false,
      content: '',
      reason: 'File does not appear to be a valid SVG (missing <svg> or <?xml> at start).',
      removed,
    };
  }

  let cleaned = input;
  // Removing one match can join the text around it into a new one
  // (`<scr<script></script>ipt>`, `o<x onload=1>nclick=`), so steps 1-4
  // repeat until a pass changes nothing.
  let previous: string;
  do {
    previous = cleaned;

    // 1. Escape the `<` of every `<script>` / `</script>` tag. Escaping
    //    a single character can't join text into a new tag the way
    //    deleting a match can; the script becomes inert text.
    cleaned = cleaned.replace(SCRIPT_TAG_OPEN_RE, () => {
      removed.scripts++;
      return '&lt;';
    });

    // 2. Replace inline event-handler attributes (onclick / onload / …)
    //    with an inert placeholder attribute.
    cleaned = cleaned.replace(EVENT_HANDLER_ATTR_RE, () => {
      removed.eventHandlers++;
      return ' data-removed-handler=""';
    });

    // 3. Neutralise `javascript:` URIs in href/xlink:href/src/action.
    //    Rewrite the whole attribute value to `#` (fragment to current
    //    document) so the link still renders but navigates nowhere.
    cleaned = cleaned.replace(JAVASCRIPT_URI_ATTR_RE, (_match, attrName: string) => {
      removed.javascriptUris++;
      return `${attrName}="#"`;
    });

    // 4. Drop `<foreignObject>` blocks entirely.
    cleaned = cleaned.replace(FOREIGN_OBJECT_RE, () => {
      removed.foreignObjects++;
      return '';
    });
    cleaned = cleaned.replace(FOREIGN_OBJECT_SELF_CLOSING_RE, () => {
      removed.foreignObjects++;
      return '';
    });
  } while (cleaned !== previous);

  // Last guard: refuse the file outright if an event handler survived.
  if (/\son[a-z]+\s*=/i.test(cleaned)) {
    return {
      ok: false,
      content: '',
      reason: 'SVG contains an event handler that could not be removed safely.',
      removed,
    };
  }

  // 5. For `<use>` tags, only allow same-document references
  //    (`href="#path"` / `xlink:href="#path"`). Anything else gets
  //    its href stripped — the tag stays but renders nothing,
  //    preserving the document tree.
  cleaned = cleaned.replace(USE_TAG_RE, (match, attrs: string) => {
    const hrefMatch = attrs.match(/\b(?:xlink:href|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefMatch) return match;
    const value = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '';
    if (value.startsWith('#')) return match;
    removed.externalUseRefs++;
    const stripped = attrs.replace(/\s+(?:xlink:href|href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<use${stripped}>`;
  });

  return { ok: true, content: cleaned, removed };
}
