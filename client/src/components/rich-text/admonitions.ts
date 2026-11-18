// ─────────────────────────────────────────────────────────────────────────────
// ADMONITION ROUND-TRIP HELPERS
// Convert :::type ... ::: blocks <-> <div data-admonition="type">...</div>
// so existing markdown content keeps round-tripping after the migration to
// the Tiptap editor. The helpers are intentionally tolerant of:
//   - leading indentation (e.g. fences nested under list items / blockquotes)
//   - trailing whitespace on the fence lines
//   - CRLF line endings
// The closing fence must be at the same indentation as the opening fence.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMONITION_TYPES = [
  'note',
  'tip',
  'info',
  'warning',
  'danger',
] as const;
export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

const TYPE_ALT = ADMONITION_TYPES.join('|');

// Opening fence: optional indent, then ":::type" with optional trailing ws.
// Body: lazily captured until a matching closing fence at the same indent.
const FENCE_RE = new RegExp(
  `^([ \\t]*):::(${TYPE_ALT})[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\\1:::[ \\t]*(?=\\r?\\n|$)`,
  'gim',
);

// Tolerant of additional attributes the renderHTML pass adds (e.g.
// `class="admonition"`) and of `<body>...</body>` wrapping that HTML
// serialisers sometimes emit.
const HTML_RE = new RegExp(
  `^([ \\t]*)<div\\b[^>]*?\\bdata-admonition="(${TYPE_ALT})"[^>]*?>[ \\t]*\\r?\\n?` +
    `([\\s\\S]*?)` +
    `\\r?\\n?[ \\t]*</div>[ \\t]*(?=\\r?\\n|$)`,
  'gim',
);

const BODY_WRAPPER_RE = /^<body>\r?\n?([\s\S]*?)\r?\n?<\/body>$/i;

function dedent(body: string, indent: string): string {
  if (!indent) return body;
  // Remove up to `indent.length` leading spaces/tabs from each line.
  const stripRe = new RegExp(`^[ \\t]{0,${indent.length}}`, 'gm');
  return body.replace(stripRe, '');
}

function reindent(body: string, indent: string): string {
  if (!indent) return body;
  return body
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n');
}

/**
 * Convert canonical `:::type … :::` admonition fences into the HTML form
 * that the Tiptap `Admonition` node parses. Tolerant of indentation and
 * trailing whitespace on the fence lines.
 */
export function preprocessAdmonitions(markdown: string): string {
  if (!markdown) return markdown;
  return markdown.replace(FENCE_RE, (_m, indent: string, type: string, body: string) => {
    const innerBody = dedent(body, indent);
    const opening = `${indent}<div data-admonition="${type}">`;
    const closing = `${indent}</div>`;
    // Blank lines around the body so any markdown inside is parsed normally.
    const indentedBody = reindent(innerBody, indent);
    return `${opening}\n\n${indentedBody}\n\n${closing}`;
  });
}

/**
 * Convert the HTML form serialized by tiptap-markdown back into the
 * canonical `:::type … :::` fence syntax. Preserves the original
 * indentation of the wrapping div so nested fences round-trip cleanly.
 */
export function postprocessAdmonitions(markdown: string): string {
  if (!markdown) return markdown;
  // Strip the `<body>...</body>` wrapper that some HTML serialisers emit so
  // the per-block regex below can match against the inner content.
  const bodyMatch = markdown.match(BODY_WRAPPER_RE);
  const inner = bodyMatch ? bodyMatch[1] : markdown;
  return inner.replace(HTML_RE, (_m, indent: string, type: string, body: string) => {
    const trimmed = String(body).replace(/^[\r\n]+|[\r\n]+$/g, '');
    const dedented = dedent(trimmed, indent);
    const innerBody = reindent(dedented, indent);
    return `${indent}:::${type}\n${innerBody}\n${indent}:::`;
  });
}
