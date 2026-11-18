// ─────────────────────────────────────────────────────────────────────────────
// SHARED TIPTAP EDITOR CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
// Both the production `TiptapEditor` React component and the round-trip test
// suite import their extension list and `Markdown.configure(...)` options
// from this module so the two cannot drift out of sync. If you add or change
// an extension, change it here and both surfaces pick it up.
//
// The module is split into two halves:
//   - `loadEditorModules()` — async, dynamically imports every Tiptap
//     package the editor needs. Cached internally so repeated calls are
//     cheap. The production component awaits this once inside its
//     `React.lazy` boundary so the packages stay out of the initial JS
//     bundle. Tests can `await` it the same way.
//   - `buildEditorExtensions(modules, opts)` — synchronous. Takes the
//     preloaded modules plus per-instance options (placeholder text, the
//     mention typeahead callback) and returns the configured extensions
//     array. Synchronous so it can be called directly inside a React render
//     when wiring `useEditor`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Editor as TiptapEditorBase } from '@tiptap/core';

export interface MentionUserSuggestion {
  id: string;
  label: string;
  detail?: string;
}

export interface BuildEditorExtensionsOptions {
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /**
   * Async lookup for the @-mention typeahead. Defaults to returning an empty
   * list so non-app environments (tests, storybook) don't have to mock fetch.
   */
  fetchUsers?: (query: string) => Promise<MentionUserSuggestion[]>;
}

/**
 * `tiptap-markdown` configuration. Exported separately so tests can re-use
 * the exact same options when building a stand-alone Markdown extension.
 */
export const MARKDOWN_CONFIG = {
  html: true,
  tightLists: true,
  tightListClass: 'tight',
  bulletListMarker: '-' as const,
  linkify: true,
  breaks: false,
  transformPastedText: true,
  transformCopiedText: true,
};

// Declare the custom Admonition commands so `editor.chain().setAdmonition(...)`
// is fully typed at every call site (no `any` cast needed).
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    admonition: {
      setAdmonition: (
        type: 'note' | 'tip' | 'info' | 'warning' | 'danger',
      ) => ReturnType;
      unsetAdmonition: () => ReturnType;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module loader
// ─────────────────────────────────────────────────────────────────────────────

let cachedModulesPromise: Promise<EditorModules> | null = null;

export async function loadEditorModules(): Promise<EditorModules> {
  if (!cachedModulesPromise) {
    cachedModulesPromise = loadEditorModulesUncached();
  }
  return cachedModulesPromise;
}

async function loadEditorModulesUncached(): Promise<EditorModules> {
  const [
    core,
    starterKit,
    imageMod,
    tableMod,
    taskListMod,
    taskItemMod,
    highlightMod,
    textStyleMod,
    colorMod,
    mentionMod,
    youtubeMod,
    subscriptMod,
    superscriptMod,
    characterCountMod,
    placeholderMod,
    codeBlockMod,
    markdownMod,
    lowlightMod,
    suggestionMod,
    suggestions,
  ] = await Promise.all([
    import('@tiptap/core'),
    import('@tiptap/starter-kit'),
    import('@tiptap/extension-image'),
    import('@tiptap/extension-table'),
    import('@tiptap/extension-task-list'),
    import('@tiptap/extension-task-item'),
    import('@tiptap/extension-highlight'),
    import('@tiptap/extension-text-style'),
    import('@tiptap/extension-color'),
    import('@tiptap/extension-mention'),
    import('@tiptap/extension-youtube'),
    import('@tiptap/extension-subscript'),
    import('@tiptap/extension-superscript'),
    import('@tiptap/extension-character-count'),
    import('@tiptap/extension-placeholder'),
    import('@tiptap/extension-code-block-lowlight'),
    import('tiptap-markdown'),
    import('lowlight'),
    import('@tiptap/suggestion'),
    import('./suggestions'),
  ]);

  return {
    Node: core.Node,
    Extension: core.Extension,
    mergeAttributes: core.mergeAttributes,
    StarterKit: starterKit.default,
    ImageBase: imageMod.default,
    Table: tableMod.Table,
    TableRow: tableMod.TableRow,
    TableHeader: tableMod.TableHeader,
    TableCell: tableMod.TableCell,
    TaskList: taskListMod.default,
    TaskItem: taskItemMod.default,
    Highlight: highlightMod.default,
    TextStyle: textStyleMod.TextStyle,
    BackgroundColor: textStyleMod.BackgroundColor,
    Color: colorMod.Color,
    Mention: mentionMod.Mention,
    Youtube: youtubeMod.default,
    Subscript: subscriptMod.default,
    Superscript: superscriptMod.default,
    CharacterCount: characterCountMod.default,
    Placeholder: placeholderMod.default,
    CodeBlockLowlight: codeBlockMod.default,
    Markdown: markdownMod.Markdown,
    createLowlight: lowlightMod.createLowlight,
    common: lowlightMod.common,
    Suggestion: suggestionMod.default,
    makeMentionSuggestion: suggestions.makeMentionSuggestion,
    makeEmojiSuggestion: suggestions.makeEmojiSuggestion,
    COMMON_EMOJIS: suggestions.COMMON_EMOJIS,
  };
}

export type EditorModules = {
  Node: typeof import('@tiptap/core').Node;
  Extension: typeof import('@tiptap/core').Extension;
  mergeAttributes: typeof import('@tiptap/core').mergeAttributes;
  StarterKit: typeof import('@tiptap/starter-kit').default;
  ImageBase: typeof import('@tiptap/extension-image').default;
  Table: typeof import('@tiptap/extension-table').Table;
  TableRow: typeof import('@tiptap/extension-table').TableRow;
  TableHeader: typeof import('@tiptap/extension-table').TableHeader;
  TableCell: typeof import('@tiptap/extension-table').TableCell;
  TaskList: typeof import('@tiptap/extension-task-list').default;
  TaskItem: typeof import('@tiptap/extension-task-item').default;
  Highlight: typeof import('@tiptap/extension-highlight').default;
  TextStyle: typeof import('@tiptap/extension-text-style').TextStyle;
  BackgroundColor: typeof import('@tiptap/extension-text-style').BackgroundColor;
  Color: typeof import('@tiptap/extension-color').Color;
  Mention: typeof import('@tiptap/extension-mention').Mention;
  Youtube: typeof import('@tiptap/extension-youtube').default;
  Subscript: typeof import('@tiptap/extension-subscript').default;
  Superscript: typeof import('@tiptap/extension-superscript').default;
  CharacterCount: typeof import('@tiptap/extension-character-count').default;
  Placeholder: typeof import('@tiptap/extension-placeholder').default;
  CodeBlockLowlight: typeof import('@tiptap/extension-code-block-lowlight').default;
  Markdown: typeof import('tiptap-markdown').Markdown;
  createLowlight: typeof import('lowlight').createLowlight;
  common: typeof import('lowlight').common;
  Suggestion: typeof import('@tiptap/suggestion').default;
  makeMentionSuggestion: typeof import('./suggestions').makeMentionSuggestion;
  makeEmojiSuggestion: typeof import('./suggestions').makeEmojiSuggestion;
  COMMON_EMOJIS: typeof import('./suggestions').COMMON_EMOJIS;
};

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous extension builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildEditorExtensions(
  modules: EditorModules,
  opts: BuildEditorExtensionsOptions = {},
) {
  const { placeholder, fetchUsers } = opts;
  const {
    Node,
    Extension,
    mergeAttributes,
    StarterKit,
    ImageBase,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem,
    Highlight,
    TextStyle,
    BackgroundColor,
    Color,
    Mention,
    Youtube,
    Subscript,
    Superscript,
    CharacterCount,
    Placeholder,
    CodeBlockLowlight,
    Markdown,
    createLowlight,
    common,
    Suggestion,
    makeMentionSuggestion,
    makeEmojiSuggestion,
    COMMON_EMOJIS,
  } = modules;

  const lowlight = createLowlight(common);

  // Extend the base image node with alignment + width attributes so the editor
  // supports image alignment (left/center/right) and resize. Both round-trip
  // through markdown via tiptap-markdown's html: true passthrough.
  const Image = ImageBase.extend({
    addAttributes() {
      const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
      return {
        ...parent,
        width: {
          default: null,
          parseHTML: (el: HTMLElement) =>
            el.getAttribute('width') || el.style.width || null,
          renderHTML: (attrs: { width?: string | number | null }) =>
            attrs.width ? { width: String(attrs.width) } : {},
        },
        align: {
          default: null,
          parseHTML: (el: HTMLElement) =>
            el.getAttribute('data-align') || el.style.textAlign || null,
          renderHTML: (attrs: { align?: string | null }) => {
            if (!attrs.align) return {};
            const styleByAlign: Record<string, string> = {
              left: 'float:left;margin:0 1em 1em 0;',
              right: 'float:right;margin:0 0 1em 1em;',
              center: 'display:block;margin-left:auto;margin-right:auto;',
            };
            return {
              'data-align': attrs.align,
              style: styleByAlign[attrs.align] ?? '',
            };
          },
        },
      };
    },
  });

  const defaultFetchUsers = async (
    _query: string,
  ): Promise<MentionUserSuggestion[]> => [];
  const mentionFetch = fetchUsers ?? defaultFetchUsers;

  // Standalone Emoji shortcode suggestion extension (`:smile:` -> 😄).
  const EmojiSuggestion = Extension.create({
    name: 'emojiSuggestion',
    addProseMirrorPlugins() {
      const ctx = this as { editor: TiptapEditorBase };
      const config = makeEmojiSuggestion({ emojis: COMMON_EMOJIS });
      type SuggestionPluginOptions = Parameters<typeof Suggestion>[0];
      const pluginOpts: SuggestionPluginOptions = {
        editor: ctx.editor,
        char: config.char,
        allowSpaces: config.allowSpaces,
        startOfLine: config.startOfLine,
        items: config.items as SuggestionPluginOptions['items'],
        command: config.command as SuggestionPluginOptions['command'],
        render: config.render as SuggestionPluginOptions['render'],
      };
      return [Suggestion(pluginOpts)];
    },
  });

  // Custom Admonition node — renders as a styled <div> in the editor, but
  // serialises directly to canonical `:::type … :::` markdown so saved
  // content is clean (no inline HTML) without relying on the legacy
  // post-processor in `admonitions.ts`. The pre-processor is still used on
  // the parse direction so existing markdown content keeps loading.
  type AdmonitionMarkdownState = {
    write: (s: string) => void;
    flushClose: (size?: number) => void;
    closeBlock: (n: unknown) => void;
    renderContent: (n: unknown) => void;
  };
  const Admonition = Node.create({
    name: 'admonition',
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
      return {
        type: {
          default: 'note',
          parseHTML: (el: HTMLElement) =>
            el.getAttribute('data-admonition') || 'note',
          renderHTML: (attrs: { type: string }) => ({
            'data-admonition': attrs.type,
          }),
        },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-admonition]' }];
    },
    renderHTML({
      HTMLAttributes,
    }: {
      HTMLAttributes: Record<string, unknown>;
    }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { class: 'admonition' }),
        0,
      ];
    },
    addStorage() {
      return {
        markdown: {
          serialize(
            state: AdmonitionMarkdownState,
            node: { attrs: { type: string } },
          ) {
            state.write(`:::${node.attrs.type}\n`);
            state.renderContent(node);
            // After renderContent the inner block leaves a pending close of
            // size 2 (a blank line). For the closing fence we only want a
            // single newline so the canonical form is `:::type\nbody\n:::`.
            state.flushClose(1);
            state.write(':::');
            state.closeBlock(node);
          },
          parse: { setup() {} },
        },
      } as Record<string, unknown>;
    },
    addCommands(this: { name: string }) {
      const name = this.name;
      type CommandCtx = {
        commands: {
          wrapIn: (n: string, a?: Record<string, unknown>) => boolean;
          lift: (n: string) => boolean;
        };
      };
      return {
        setAdmonition:
          (type: 'note' | 'tip' | 'info' | 'warning' | 'danger') =>
          ({ commands }: CommandCtx) =>
            commands.wrapIn(name, { type }),
        unsetAdmonition:
          () =>
          ({ commands }: CommandCtx) =>
            commands.lift(name),
      } as Record<string, (...args: unknown[]) => (ctx: CommandCtx) => boolean>;
    },
  });

  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
      // StarterKit v3 bundles Underline and Link, so configure them here
      // rather than registering them separately (which would log a duplicate
      // extension warning).
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    Subscript,
    Superscript,
    Image.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.extend({
      // Round-trip with the legacy <mark style="background-color: ..."> format
      // by serializing to inline HTML rather than the default `==text==` syntax.
      addStorage() {
        return {
          markdown: {
            serialize: {
              open(_state: unknown, mark: { attrs: { color?: string } }) {
                const color = mark.attrs.color;
                return color
                  ? `<mark style="background-color: ${color}">`
                  : '<mark>';
              },
              close: '</mark>',
              mixable: true,
              expelEnclosingWhitespace: true,
            },
            parse: { setup() {} },
          },
        } as Record<string, unknown>;
      },
    }).configure({ multicolor: true }),
    TextStyle,
    Color,
    BackgroundColor,
    Youtube.configure({
      width: 640,
      height: 360,
      nocookie: true,
      HTMLAttributes: { class: 'tiptap-youtube' },
    }),
    EmojiSuggestion,
    Mention.configure({
      HTMLAttributes: { class: 'tiptap-mention' },
      renderText({
        node,
      }: {
        node: { attrs: { label?: string; id?: string } };
      }) {
        return `@${node.attrs.label ?? node.attrs.id ?? ''}`;
      },
      suggestion: makeMentionSuggestion({ fetchItems: mentionFetch }),
    }),
    CharacterCount,
    Placeholder.configure({
      placeholder: placeholder || 'Start writing…',
      showOnlyWhenEditable: true,
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'text' }),
    Admonition,
    Markdown.configure(MARKDOWN_CONFIG),
  ];
}
