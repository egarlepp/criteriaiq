// Server-side defence in depth for admin-authored email HTML. Emails are
// sanitized again with DOMPurify wherever the app renders them
// (client/src/lib/safeHtml.ts), and mail clients don't run scripts; this
// only keeps <script> elements out of what is stored.
//
// A single regex pass is not enough: removing one match can join the
// text around it into a new tag (`<scr<script></script>ipt>`). So the
// passes repeat until nothing changes, and any opening or closing script
// tag left without a partner is removed too.

const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;
const SCRIPT_TAG_RE = /<\/?script\b[^>]*>?/gi;

export function stripScriptTags(html: string): string {
  let previous: string;
  let current = html;
  do {
    previous = current;
    current = current.replace(SCRIPT_BLOCK_RE, "").replace(SCRIPT_TAG_RE, "");
  } while (current !== previous);
  return current;
}
