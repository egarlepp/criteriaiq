import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import { preprocessAdmonitions } from './admonitions';

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY RENDERER FOR TIPTAP-AUTHORED CONTENT
// ─────────────────────────────────────────────────────────────────────────────
// The Tiptap editor saves Markdown, but tiptap-markdown runs with
// `html: true`, so saved content can carry inline HTML (underline, colors,
// tables, admonitions) and older rows can be pure HTML. This renders both
// as formatted content, styled like the editor surface (`tiptap-content`
// picks up the admonition styles in index.css).
//
// Raw HTML is parsed by rehype-raw and then passed through `rehypeSafeHtml`
// below, which keeps only a fixed set of tags and attributes. These fields
// are editable by lower-privilege users and shown to everyone on the
// project, so nothing that can run script (event handlers, <script>,
// <iframe>, javascript: URLs) may survive. react-markdown's default
// `urlTransform` additionally strips unsafe href/src protocols.

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'li', 'mark', 'ol', 'p', 'pre',
  's', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

// hast property names (camelCase), not HTML attribute names.
const ALLOWED_PROPS = new Set([
  'href', 'title', 'alt', 'src', 'width', 'height', 'colSpan', 'rowSpan',
  'align', 'className', 'dataAdmonition', 'type', 'checked', 'disabled',
  'start',
]);

const SAFE_CLASS_RE = /^(admonition|language-[\w-]+|contains-task-list|task-list-item|hljs[\w-]*)$/;

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function cleanChildren(node: HastNode): void {
  if (!node.children) return;
  const kept: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === 'raw' || child.type === 'comment') continue;
    if (child.type === 'element') {
      const tag = child.tagName ?? '';
      if (!ALLOWED_TAGS.has(tag)) {
        // Drop script-like containers entirely; unwrap anything else so its
        // text still shows.
        if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
          continue;
        }
        cleanChildren(child);
        kept.push(...(child.children ?? []));
        continue;
      }
      // Only task-list checkboxes are allowed as inputs.
      if (tag === 'input' && child.properties?.type !== 'checkbox') continue;
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(child.properties ?? {})) {
        if (!ALLOWED_PROPS.has(key)) continue;
        if (key === 'className') {
          // Keep only the classes our own renderers emit, so pasted HTML
          // can't use app utility classes (e.g. a full-screen overlay).
          const classes = (Array.isArray(value) ? value : String(value).split(/\s+/))
            .map(String)
            .filter((c) => SAFE_CLASS_RE.test(c));
          if (classes.length) props.className = classes;
          continue;
        }
        props[key] = value;
      }
      if (tag === 'input') props.disabled = true;
      child.properties = props;
      cleanChildren(child);
    }
    kept.push(child);
  }
  node.children = kept;
}

function rehypeSafeHtml() {
  return (tree: HastNode) => {
    cleanChildren(tree);
  };
}

export interface MarkdownContentProps {
  content: string | null | undefined;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div
      className={cn(
        'tiptap-content prose prose-sm max-w-none dark:prose-invert',
        'text-gray-900 dark:text-slate-300',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSafeHtml]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {preprocessAdmonitions(content)}
      </ReactMarkdown>
    </div>
  );
}
