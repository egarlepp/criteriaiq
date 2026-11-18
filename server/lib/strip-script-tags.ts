// Server-side defence in depth for admin-authored email HTML. Emails are
// sanitized again with DOMPurify wherever the app renders them
// (client/src/lib/safeHtml.ts), and mail clients don't run scripts; this
// only keeps working <script> elements out of what is stored.
//
// Removing tags with a regex is fragile: deleting one match can join the
// text around it into a new tag (`<scr<script></script>ipt>`). Escaping
// the `<` that opens any script tag can't create a new one, so a script
// ends up as harmless visible text instead.

const SCRIPT_TAG_OPEN_RE = /<(?=\/?script)/gi;

export function stripScriptTags(html: string): string {
  return html.replace(SCRIPT_TAG_OPEN_RE, "&lt;");
}
