// Suggestion plugins shared between Tiptap Mention (@user) and emoji shortcodes.
// Renders a simple absolutely-positioned popover at the caret — no tippy dep.
import type { Editor, Range } from '@tiptap/core';

export type SuggestionItem = {
  id: string;
  label: string;
  detail?: string;
};

type SuggestionState = {
  items: SuggestionItem[];
  index: number;
  query: string;
  range: Range;
  command: (item: SuggestionItem) => void;
  clientRect: (() => DOMRect | null) | null;
};

// Subset of the Tiptap Suggestion plugin renderer hook arguments we actually
// use. Typed structurally so we don't depend on the internal generics.
type SuggestionRenderProps = {
  items: SuggestionItem[];
  query: string;
  range: Range;
  command: (item: { id: string; label?: string }) => void;
  clientRect?: (() => DOMRect | null) | null;
};
type SuggestionKeyDownProps = { event: KeyboardEvent };
type SuggestionCommandProps = {
  editor: Editor;
  range: Range;
  props: { id: string };
};

class PopoverRenderer {
  el: HTMLDivElement;
  state: SuggestionState | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.setAttribute('data-tiptap-suggestion-popover', '');
    this.el.style.position = 'fixed';
    this.el.style.zIndex = '9999';
    this.el.style.minWidth = '220px';
    this.el.style.maxWidth = '320px';
    this.el.style.maxHeight = '260px';
    this.el.style.overflowY = 'auto';
    this.el.style.background = 'var(--popover, #fff)';
    this.el.style.color = 'var(--popover-foreground, #111)';
    this.el.style.border = '1px solid var(--border, #e5e7eb)';
    this.el.style.borderRadius = '6px';
    this.el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
    this.el.style.padding = '4px';
    this.el.style.fontSize = '13px';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  show(state: SuggestionState) {
    this.state = state;
    this.render();
  }

  update(state: SuggestionState) {
    this.state = state;
    this.render();
  }

  hide() {
    this.el.style.display = 'none';
    this.state = null;
  }

  destroy() {
    this.el.remove();
  }

  render() {
    const s = this.state;
    if (!s) return;
    if (!s.items.length) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';
    this.el.innerHTML = '';
    s.items.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.textContent = item.detail ? `${item.label}  ·  ${item.detail}` : item.label;
      row.style.display = 'block';
      row.style.width = '100%';
      row.style.textAlign = 'left';
      row.style.padding = '6px 8px';
      row.style.borderRadius = '4px';
      row.style.background = i === s.index ? 'var(--muted, #f3f4f6)' : 'transparent';
      row.style.cursor = 'pointer';
      row.onmouseenter = () => {
        if (this.state) {
          this.state.index = i;
          this.render();
        }
      };
      row.onmousedown = (ev) => {
        ev.preventDefault();
        s.command(item);
      };
      this.el.appendChild(row);
    });

    const rect = s.clientRect?.();
    if (rect) {
      const top = Math.min(window.innerHeight - 280, rect.bottom + 4);
      const left = Math.min(window.innerWidth - 340, rect.left);
      this.el.style.top = `${top}px`;
      this.el.style.left = `${left}px`;
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (!this.state) return false;
    const s = this.state;
    if (event.key === 'ArrowDown') {
      s.index = (s.index + 1) % s.items.length;
      this.render();
      return true;
    }
    if (event.key === 'ArrowUp') {
      s.index = (s.index - 1 + s.items.length) % s.items.length;
      this.render();
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = s.items[s.index];
      if (item) s.command(item);
      return true;
    }
    if (event.key === 'Escape') {
      this.hide();
      return true;
    }
    return false;
  }
}

export function makeMentionSuggestion(opts: {
  fetchItems: (query: string) => Promise<SuggestionItem[]>;
}) {
  return {
    char: '@',
    items: async ({ query }: { query: string }) => {
      try {
        return await opts.fetchItems(query);
      } catch {
        return [];
      }
    },
    render: () => {
      let renderer: PopoverRenderer | null = null;
      return {
        onStart: (props: SuggestionRenderProps) => {
          renderer = new PopoverRenderer();
          renderer.show({
            items: props.items,
            index: 0,
            query: props.query,
            range: props.range,
            command: (item: SuggestionItem) =>
              props.command({ id: item.id, label: item.label }),
            clientRect: props.clientRect ?? null,
          });
        },
        onUpdate: (props: SuggestionRenderProps) => {
          if (!renderer) return;
          renderer.update({
            items: props.items,
            index: 0,
            query: props.query,
            range: props.range,
            command: (item: SuggestionItem) =>
              props.command({ id: item.id, label: item.label }),
            clientRect: props.clientRect ?? null,
          });
        },
        onKeyDown: (props: SuggestionKeyDownProps) => renderer?.onKeyDown(props.event) ?? false,
        onExit: () => {
          renderer?.destroy();
          renderer = null;
        },
      };
    },
  };
}

export function makeEmojiSuggestion(opts: {
  emojis: { name: string; char: string }[];
}) {
  return {
    char: ':',
    allowSpaces: false,
    startOfLine: false,
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return opts.emojis
        .filter((e) => e.name.startsWith(q))
        .slice(0, 8)
        .map((e) => ({ id: e.char, label: `:${e.name}:`, detail: e.char }));
    },
    command: ({ editor, range, props }: SuggestionCommandProps) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, props.id + ' ')
        .run();
    },
    render: () => {
      let renderer: PopoverRenderer | null = null;
      return {
        onStart: (props: SuggestionRenderProps) => {
          renderer = new PopoverRenderer();
          renderer.show({
            items: props.items,
            index: 0,
            query: props.query,
            range: props.range,
            command: (item: SuggestionItem) =>
              props.command({ id: item.detail ?? item.label }),
            clientRect: props.clientRect ?? null,
          });
        },
        onUpdate: (props: SuggestionRenderProps) => {
          if (!renderer) return;
          renderer.update({
            items: props.items,
            index: 0,
            query: props.query,
            range: props.range,
            command: (item: SuggestionItem) =>
              props.command({ id: item.detail ?? item.label }),
            clientRect: props.clientRect ?? null,
          });
        },
        onKeyDown: (props: SuggestionKeyDownProps) => renderer?.onKeyDown(props.event) ?? false,
        onExit: () => {
          renderer?.destroy();
          renderer = null;
        },
      };
    },
  };
}

export const COMMON_EMOJIS = [
  { name: 'smile', char: '😄' },
  { name: 'grin', char: '😁' },
  { name: 'joy', char: '😂' },
  { name: 'heart', char: '❤️' },
  { name: 'thumbsup', char: '👍' },
  { name: 'thumbsdown', char: '👎' },
  { name: 'fire', char: '🔥' },
  { name: 'sparkles', char: '✨' },
  { name: 'rocket', char: '🚀' },
  { name: 'tada', char: '🎉' },
  { name: 'check', char: '✅' },
  { name: 'cross', char: '❌' },
  { name: 'warning', char: '⚠️' },
  { name: 'info', char: 'ℹ️' },
  { name: 'bulb', char: '💡' },
  { name: 'eyes', char: '👀' },
  { name: 'wave', char: '👋' },
  { name: 'clap', char: '👏' },
  { name: 'pray', char: '🙏' },
  { name: 'star', char: '⭐' },
  { name: 'bug', char: '🐛' },
  { name: 'wrench', char: '🔧' },
  { name: 'hammer', char: '🔨' },
  { name: 'package', char: '📦' },
  { name: 'memo', char: '📝' },
  { name: 'book', char: '📖' },
  { name: 'lock', char: '🔒' },
  { name: 'key', char: '🔑' },
  { name: 'mag', char: '🔍' },
  { name: 'zap', char: '⚡' },
];

