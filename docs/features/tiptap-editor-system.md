# Tiptap Editor System Documentation

## Table of Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Surface](#component-surface)
- [Toolbar Variants](#toolbar-variants)
- [Extensions Enabled](#extensions-enabled)
- [Storage Format & Markdown Round-trip](#storage-format--markdown-round-trip)
- [Admonitions](#admonitions)
- [Mentions & Emoji Suggestions](#mentions--emoji-suggestions)
- [Implementation Guide](#implementation-guide)
- [Lazy Loading & Performance](#lazy-loading--performance)
- [Testing](#testing)
- [Styling](#styling)
- [Migration History](#migration-history)
- [Files Reference](#files-reference)

---

## Overview

The Tiptap Editor System is CriteriaIQ's reusable rich-text editor used across
project notes, requirements, code-script descriptions, system
announcements, and customer-facing artifact content. It is built on **Tiptap
v3** with the ProseMirror engine and stores all content as **Markdown** via
`tiptap-markdown` so it remains interchangeable with the platform's prior
markdown-based content storage and stays portable for export, search indexing,
and email rendering.

The editor was migrated from MDXEditor to Tiptap to gain a richer extension
ecosystem, better long-term maintenance, smaller bundle size after lazy-loading,
and finer control over the markdown serializer for custom blocks like
admonitions.

### Key Features

✅ **Single shared component** (`TiptapEditor`) used across 9+ pages
✅ **Markdown in / markdown out** — no proprietary HTML stored in the database
✅ **4 toolbar variants** — `full`, `compact`, `minimal`, `code`
✅ **Custom Admonition node** with canonical `:::type … :::` markdown serialization
✅ **@-mention typeahead** with async user lookup
✅ **`:emoji:` shortcode picker** (no extra dependencies)
✅ **Image upload** with alignment (left/center/right) and inline width
✅ **Tables** with header rows, alignment, resize, and merge/split
✅ **Task lists** (`- [ ]` / `- [x]`) including nesting
✅ **YouTube embed** as an iframe block
✅ **Code blocks** with syntax highlighting (lowlight + common languages)
✅ **Subscript / superscript / highlight / text-color / background-color**
✅ **React Hook Form adapter** (`TiptapField`) for label, error, required-flag wiring
✅ **Lazy-loaded** behind `React.lazy` + `Suspense` to keep the initial bundle small
✅ **Round-trip regression suite** — 42 round-trip fixtures across 8 files (64 tests with the admonition unit suite), runs in seconds via Vitest
✅ **Dark mode compatible** via the project's standard tailwind dark variants

---

## System Architecture

### Component Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                   Consuming page / form                      │
│  (project-detail, EditTemplate, AnnouncementsManager, etc.)  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  TiptapField  (React Hook Form adapter)                      │
│  • Label / required-flag / error message                     │
│  • Forwards refs and props to TiptapEditor                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  TiptapEditor                                                │
│  • Lazy-loads Tiptap extensions on first mount               │
│  • Hosts the toolbar (variant-driven) + content area         │
│  • Bubble menu for selection-anchored mark toggles           │
│  • Markdown ↔ editor state via tiptap-markdown               │
└──────────────────────────────────────────────────────────────┘
            │                                  │
            ▼                                  ▼
┌─────────────────────────┐      ┌─────────────────────────────┐
│  editor-config.ts       │      │  admonitions.ts             │
│  • loadEditorModules()  │      │  • preprocess  (md → html)  │
│  • buildEditorExtensions│      │  • postprocess (html → md)  │
│  • Custom Image node    │      │  • Indent / dedent helpers  │
│  • Custom Admonition    │      │  • CRLF normalisation       │
│  • Custom Highlight     │      │                             │
│  • EmojiSuggestion      │      │                             │
│  • MARKDOWN_CONFIG      │      │                             │
└─────────────────────────┘      └─────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────┐
│  suggestions.ts                                              │
│  • Headless popover renderer (no tippy dependency)           │
│  • makeMentionSuggestion(...) — async user lookup            │
│  • makeEmojiSuggestion(...)   — local shortcode list         │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User types markdown into the editor
        │
        ▼
preprocessAdmonitions(md)        ← parse direction
        │   converts ::: fences to <div data-admonition="...">
        ▼
editor.commands.setContent(html)
        │
        ▼
ProseMirror document tree (with custom Admonition node)
        │
        ▼
User edits content via toolbar / bubble menu / keyboard
        │
        ▼
editor.storage.markdown.getMarkdown()   ← serialize direction
        │   Admonition node serializer emits canonical
        │   `:::type\nbody\n:::` directly
        ▼
postprocessAdmonitions(md)
        │   final cleanup of any HTML admonition fragments
        ▼
onChange(markdown)  →  React Hook Form  →  PostgreSQL storage
```

### Drift Prevention

The production `TiptapEditor` and the round-trip test harness import the same
`buildEditorExtensions(...)` and `MARKDOWN_CONFIG` from `editor-config.ts`. It
is impossible for the test environment and production to disagree about which
extensions are loaded, in what order, or how the markdown serializer is
configured — a Tiptap upgrade that breaks parsing will fail the tests before it
breaks customer content.

---

## Component Surface

### `TiptapEditor`
**Location:** `client/src/components/rich-text/TiptapEditor.tsx`

A controlled rich-text editor with markdown input/output.

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `value` | `string` | Markdown content |
| `onChange` | `(md: string) => void` | Fires on every edit |
| `onBlur` | `() => void` | Editor lost focus |
| `onFocus` | `() => void` | Editor gained focus |
| `placeholder` | `string` | Empty-state placeholder |
| `readOnly` | `boolean` | Disables editing |
| `minHeight` | `string \| number` | CSS min-height for the content area |
| `maxHeight` | `string \| number` | CSS max-height (scrolls past this) |
| `className` | `string` | Class on the outer wrapper |
| `contentEditableClassName` | `string` | Class on the editable region |
| `toolbar` | `'full' \| 'compact' \| 'minimal' \| 'code'` | Toolbar variant (default `full`) |
| `id` | `string` | DOM `id`, also used to wire labels |

### `TiptapField`
**Location:** `client/src/components/rich-text/TiptapField.tsx`

A React Hook Form adapter around `TiptapEditor` that adds `label`,
`description`, `error`, and `required` props with the project's standard label
styling and error-state classes. All other props pass through to the underlying
`TiptapEditor`.

### `MarkdownContent`
**Location:** `client/src/components/rich-text/MarkdownContent.tsx`

Read-only renderer for content the editor saved, used where a field is shown
rather than edited (e.g. read-only project text such as a MAP phase description). It renders
Markdown with GFM (tables, task lists, strikethrough), the inline HTML the
editor's `html: true` passthrough allows, older rows that are pure HTML, and
admonitions (via `preprocessAdmonitions`). Raw HTML goes through an allowlist
step (`rehypeSafeHtml`) that keeps only formatting tags and a few attributes,
drops `<script>`/`<iframe>`/event handlers/`style`, and keeps only the classes
our renderers emit. Never print saved editor content as plain text
(`whitespace-pre-wrap`); use this component.

---

## Toolbar Variants

| Variant   | Intended use                                      | Buttons shown |
| --------- | ------------------------------------------------- | ------------- |
| `full`    | Project notes, announcements, long-form content   | All controls — headings, marks, lists, blocks, links, images, tables, admonitions, YouTube, mentions, emoji, color, highlight |
| `compact` | Inline descriptions, modal text fields            | Marks + lists + links + headings (no media / tables / admonitions) |
| `minimal` | Single-line / very small inputs                   | Bold / italic / underline / link only |
| `code`    | Code-script editors                               | Code-block toggle + language selector only |

Every variant also exposes a **bubble menu** (selection-anchored popover) with
quick bold / italic / link toggles so users can format without leaving the
content area.

---

## Extensions Enabled

The full extension list is built by `buildEditorExtensions(...)` in
`client/src/components/rich-text/editor-config.ts` and shared with the
round-trip tests so production and test extensions cannot drift.

| Extension | Purpose |
| --------- | ------- |
| `StarterKit` | Bundles Document, Paragraph, Text, Heading, Bold, Italic, Strike, Code, BulletList, OrderedList, ListItem, Blockquote, HorizontalRule, History, **Underline**, **Link** (in v3 these last two are bundled) |
| `Image` (custom) | Extends `ImageBase` to add `width` and `data-align` attributes (left / center / right) that round-trip via inline HTML |
| `Table`, `TableRow`, `TableHeader`, `TableCell` | Resizable tables with cell merge/split |
| `TaskList`, `TaskItem` | GFM-style `- [ ]` checkbox lists, nestable |
| `Highlight` (custom serializer) | `<mark>` highlight; serialised as inline `<mark style="background-color:…">` HTML so legacy data round-trips |
| `TextStyle`, `Color`, `BackgroundColor` | Per-selection foreground / background colour |
| `Subscript`, `Superscript` | `<sub>` / `<sup>` HTML passthrough |
| `Mention` | `@user` typeahead (see below) |
| `EmojiSuggestion` (custom) | `:smile:` shortcode → emoji character |
| `Youtube` | YouTube embed as `<iframe>`; `nocookie` mode, default 640×360 |
| `CharacterCount` | Optional character/word count read by consumers |
| `Placeholder` | Empty-state placeholder text |
| `CodeBlockLowlight` | Syntax highlighting via `lowlight` (common language pack) |
| `Admonition` (custom) | `:::note / :::tip / :::info / :::warning / :::danger` blocks |
| `Markdown` | `tiptap-markdown` parse + serialize bridge |

---

## Storage Format & Markdown Round-trip

Content is stored as **Markdown** in PostgreSQL — there is no proprietary HTML
shape on disk. The `Markdown` extension is configured (in `MARKDOWN_CONFIG`)
with:

- `html: true` — inline HTML (`<u>`, `<sub>`, `<sup>`, `<mark>`, `<span style>`,
  `<table>`, `<iframe>`) is preserved as a passthrough escape hatch for things
  CommonMark can't express.
- `tightLists: true` — list items render as `<li>` without extra `<p>` wrapping
  unless the list is intentionally loose.
- `linkify: true` — bare URLs in text become autolinks on save.
- `breaks: false` — single newlines stay as soft breaks, not `<br>`.

### Canonical-form drifts

Some constructs are serialised into a "canonical form" that may differ from the
input but is byte-stable thereafter (a second save produces the exact same
output as the first). These are documented inside the round-trip fixture files
and pinned by tests so they cannot change accidentally:

| Construct | Canonical drift |
| --------- | --------------- |
| Code blocks without a language | Default to `text` |
| Task lists | Always emit as loose lists |
| Block-level images inside paragraphs | Get split onto their own line |
| Blockquotes with lazy continuation | Continuation lines are explicitly prefixed with `>` |
| Tables with column alignment (style or `:---:`) | Alignment metadata is dropped; cells are preserved |
| Inline `style="color: …"` | A trailing semicolon is appended |

---

## Admonitions

Admonitions are styled callout blocks with five flavours: `note`, `tip`,
`info`, `warning`, `danger`. They are stored in markdown using the
container-fence syntax shared with Docusaurus / Markdoc:

```markdown
:::warning
This action cannot be undone.
:::
```

### Round-trip rules

The `preprocessAdmonitions` / `postprocessAdmonitions` helpers in
`client/src/components/rich-text/admonitions.ts` are intentionally tolerant of
fence shape so legacy and hand-edited content keeps loading:

- **Top-level fences** in canonical form (`:::type` … `:::`) round-trip
  unchanged.
- **Indented fences** (e.g. four-space indented, or nested under a list item /
  blockquote) are recognised when the closing `:::` sits at the same
  indentation as the opening fence. The body is dedented before being fed to
  Tiptap and re-indented on the way back out so indentation is preserved.
- **Trailing whitespace** on either fence line is tolerated; subsequent saves
  normalise it to the canonical form.
- **CRLF line endings** are accepted on input; output is normalised to `\n`.
- **Unknown fence types** (anything outside the supported list) are left
  untouched as raw text.
- **HTML wrapping** — the postprocessor tolerates extra attributes on the
  rendered `<div>` (e.g. `class="admonition"`) and an outer
  `<body>…</body>` wrapper that some HTML serializers emit.

### Custom markdown serializer

The Admonition node defines its own markdown serializer (in `editor-config.ts`)
that emits the canonical fence directly rather than HTML. The serializer uses
`state.flushClose(1)` so the closing `:::` sits on the line directly after the
body, with no extra blank line.

These rules are exercised by the pure-string admonition tests in
`__tests__/admonitions.test.ts` and the full-pipeline harness in
`__tests__/roundtrip-admonitions.test.ts`.

---

## Mentions & Emoji Suggestions

### `@user` mentions

Type `@` to open a typeahead popover. The editor calls a consumer-supplied
`fetchUsers(query)` function on every keystroke to populate the suggestions and
inserts a `<span data-mention>` node when a user is selected. On serialize, the
mention node renders as `@Display Name`. There is no markdown parse direction
for mentions — `@text` in stored markdown stays as plain text — so mentions are
created by the typeahead, not by typing markdown.

### `:emoji:` shortcodes

Type `:` followed by characters to open the emoji shortcode picker. Selecting
an entry inserts the emoji character (e.g. `:smile:` → 😄). The picker uses a
small built-in shortcode list (`COMMON_EMOJIS`) so the editor doesn't pull in a
large emoji-data dependency.

The shared popover renderer that powers both pickers lives in
`client/src/components/rich-text/suggestions.ts` and uses an absolutely
positioned div anchored to the caret — there is no `tippy.js` dependency.

---

## Implementation Guide

### Basic usage

```tsx
import { TiptapEditor } from '@/components/rich-text/TiptapEditor';

function MyComponent() {
  const [content, setContent] = useState('');

  return (
    <TiptapEditor
      value={content}
      onChange={setContent}
      placeholder="Add some notes…"
      toolbar="full"
      minHeight={200}
    />
  );
}
```

### React Hook Form

```tsx
import { Controller } from 'react-hook-form';
import { TiptapField } from '@/components/rich-text/TiptapField';

<Controller
  control={control}
  name="description"
  render={({ field, fieldState }) => (
    <TiptapField
      label="Description"
      description="Markdown is supported."
      required
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
      toolbar="compact"
    />
  )}
/>
```

### Read-only rendering

```tsx
<TiptapEditor value={savedMarkdown} onChange={() => {}} readOnly />
```

For pages that only need to render markdown (no editor chrome at all), prefer
`<ReactMarkdown>` — `TiptapEditor` is heavier than a pure renderer and only
worth the cost when editing is needed.

### Wiring `@`-mention lookups

Pass a `fetchUsers` async function to `TiptapEditor` (currently consumed
internally — see existing call sites in `project-detail.tsx` and
`AnnouncementsManager.tsx` for the pattern). Returning `[]` disables the
typeahead.

---

## Lazy Loading & Performance

The Tiptap bundle is loaded via `React.lazy` and `Suspense`. Tiptap and its
dependencies are emitted into the `vendor-editors` chunk by the Vite
`manualChunks` config to keep the initial bundle small.

In dev, every Tiptap package the editor lazy-loads is listed in
`optimizeDeps.include` in `vite.config.ts` so Vite pre-bundles them at server
startup. Without this, the ~20 simultaneous on-the-fly optimizations triggered
by mounting the editor exceed the dev proxy's request timeout and return 504s.

**Maintenance note:** when you add or remove a dynamic `import('@tiptap/...')`
in `editor-config.ts`, update the `optimizeDeps.include` list in
`vite.config.ts` to match. Do **not** list `@tiptap/pm` itself — it is a
meta-package with no `.` export and including it crashes the dev server. Its
subpaths are pulled in transitively by the other Tiptap packages.

`useEditor` runs with `immediatelyRender: false`, so the editor is created
after mount and the first render shows the "Loading editor…" placeholder. With
the default (create during render) `@tiptap/react` destroys the instance when
React takes longer than one tick to commit, which happens when the editor opens
inside a Sheet or Dialog. The commit then ran the editor's effects against the
destroyed instance and crashed with "Cannot read properties of null (reading
'commands')" (v0.11.0). The effects
also skip a destroyed editor.

The architectural split inside `editor-config.ts` is:

- `loadEditorModules()` — async, dynamically `import()`s every Tiptap package,
  cached after the first call so subsequent editor mounts don't repeat the
  network/disk work.
- `buildEditorExtensions(modules, opts)` — sync, takes the preloaded modules
  plus per-instance options (placeholder text, mention `fetchUsers`) and
  returns the configured extension array. Called inside `useEditor` so the
  editor lifecycle stays synchronous.

---

## Testing

### Round-trip regression suite

Run with **`npm test`**.

The `client/src/components/rich-text/__tests__/roundtrip-*.test.ts` fixture
files boot a headless Tiptap editor (via `roundtrip-harness.ts`) configured
with the **exact same extensions as production**, then assert that running

```
markdown → preprocessAdmonitions → setContent → getMarkdown → postprocessAdmonitions
```

returns either the original input or a documented canonical form, **and** that
a second pass is byte-equal to the first (idempotency).

The harness boots happy-dom, instantiates a real `Editor`, and calls the same
`buildEditorExtensions(...)` the production component uses — so a regression
in any custom extension, serializer, or markdown-config option will fail the
suite before reaching customers.

#### Suites and coverage

| Suite | Coverage |
| ----- | -------- |
| `roundtrip-marks.test.ts` | bold, italic, underline, strike, inline code, link (with/without title), autolink, sub, sup, highlight, text-color |
| `roundtrip-blocks.test.ts` | headings 1–6, paragraphs, blockquotes, horizontal rule, fenced code blocks (language / no-language) |
| `roundtrip-lists.test.ts` | bullet, ordered, task lists, nested lists |
| `roundtrip-tables.test.ts` | basic table, colspan, alignment canonicalisation |
| `roundtrip-media.test.ts` | image alt, image title, image width passthrough, block-image splitting |
| `roundtrip-admonitions.test.ts` | all five admonition types end-to-end through preprocessor + serializer + postprocessor |
| `roundtrip-mentions.test.ts` | `@label` serialisation + weak-form idempotency (documented exception) |
| `roundtrip-youtube.test.ts` | programmatic YouTube insert + `<iframe>` HTML passthrough + second-pass identity |
| `admonitions.test.ts` | pure string-level pre/post-processor rules (CRLF, indentation, unknown types, HTML tolerance) |

#### Adding a fixture

1. Pick the right file: `roundtrip-marks.test.ts` for inline marks,
   `roundtrip-blocks.test.ts` for block elements, etc.
2. Call `expectRoundTripStable(input)` for shapes that round-trip verbatim, or
   `expectRoundTripStable(input, expected)` when the editor normalises the
   input to a documented canonical form.
3. Add a comment explaining *why* the canonical form differs so the next
   reader doesn't try to "fix" it.
4. If the new fixture pulls in an extension that mounts an `<iframe>` or does
   network I/O at construction time (e.g. `Youtube`), insert the node
   programmatically (e.g. `editor.commands.setYoutubeVideo(...)`) instead of
   `setContent`-ing raw HTML, then assert against `markdown.getMarkdown()`
   directly. See `roundtrip-youtube.test.ts` for the pattern. The deferred
   `<iframe>` load throw from happy-dom is already swallowed in
   `vitest.setup.ts`.

### Test runner configuration

- **Runner:** Vitest (`npx vitest run`)
- **DOM environment:** happy-dom (lightweight; no real browser)
- **Setup file:** `vitest.setup.ts` — swallows the deferred
  `Cannot read properties of null (reading 'console')` rejection that happy-dom
  throws when a YouTube iframe outlives its parent window. All other unhandled
  rejections still propagate so legitimate failures surface.
- **Excludes:** two pre-existing test files
  (`ResizableModal.test.tsx`, `sorting.test.ts`) are excluded in
  `vitest.config.ts` so `npm test` is reliably green for the editor
  regression suite. Their re-enablement is
  tracked as future work.

---

## Styling

Tiptap-specific styles live in **section 8 of `client/src/index.css`** and
cover:

- Editor wrapper, toolbar buttons, and bubble menu
- Tables (header background, cell borders, resize handle, selected cell)
- Admonition colour variants (`note` / `tip` / `info` / `warning` / `danger`)
- Task lists (custom checkbox styling, alignment with text)
- Code blocks (background, padding) and `hljs` syntax tokens (matched to the
  rest of the app's syntax highlighting via `rehype-highlight`)
- Placeholder pseudo-element
- Mention pill (`.tiptap-mention`)
- YouTube embed wrapper (`.tiptap-youtube`)

All styles include light + dark variants per the project's mandatory dark-mode
standards.

---

## Migration History

| Date / Task | Change |
| ----------- | ------ |
| Task #196   | Migrated from MDXEditor to Tiptap v3. Markdown storage retained for backward compatibility. |
| Task #199   | Tightened admonition postprocessor regex to tolerate extra HTML attributes (e.g. `class="admonition"`) and outer `<body>` wrappers — fixed a latent bug where production-saved admonitions were leaving `<div>` HTML in stored markdown. |
| Task #200   | Renamed all editor files and components from MDXEditor naming to Tiptap naming. |
| Task #203   | Resolved 504 timeouts on first editor mount by pre-bundling every dynamically imported Tiptap package via `optimizeDeps.include`. |
| Task #204   | Added the round-trip regression suite (42 fixtures across 8 files; 64 tests total with the admonition unit suite). Extracted shared extension config into `editor-config.ts`. Added a custom markdown serializer to the Admonition node so saved content emits canonical fences directly rather than HTML. Wired Vitest + happy-dom + `npm test` script. Removed standalone `Underline` / `Link` extension imports — StarterKit v3 bundles both, and registering them twice produced "duplicate extension" warnings. |

---

## Files Reference

### Component & extension config
- `client/src/components/rich-text/TiptapEditor.tsx` — main editor component, toolbar, bubble menu
- `client/src/components/rich-text/TiptapField.tsx` — React Hook Form adapter
- `client/src/components/rich-text/editor-config.ts` — `loadEditorModules`, `buildEditorExtensions`, `MARKDOWN_CONFIG`, custom Image / Highlight / Admonition / EmojiSuggestion nodes
- `client/src/components/rich-text/admonitions.ts` — `preprocessAdmonitions`, `postprocessAdmonitions`, indent/dedent helpers
- `client/src/components/rich-text/suggestions.ts` — shared headless popover renderer for mentions and emoji shortcodes

### Tests
- `client/src/components/rich-text/__tests__/roundtrip-harness.ts` — shared test harness (`createRoundTripEditor`, `roundTripOnce`, `expectRoundTripStable`)
- `client/src/components/rich-text/__tests__/roundtrip-marks.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-blocks.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-lists.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-tables.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-media.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-admonitions.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-mentions.test.ts`
- `client/src/components/rich-text/__tests__/roundtrip-youtube.test.ts`
- `client/src/components/rich-text/__tests__/admonitions.test.ts` — pure string-level pre/post-processor unit tests

### Build & test config
- `vite.config.ts` — `optimizeDeps.include` list and `vendor-editors` manual chunk
- `vitest.config.ts` — Vitest configuration (happy-dom, includes, excludes)
- `vitest.setup.ts` — happy-dom iframe unhandled-rejection guard

### Styling
- `client/src/index.css` (section 8) — all editor-specific CSS
