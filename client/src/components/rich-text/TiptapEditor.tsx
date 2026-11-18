import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { cn } from '@/lib/utils';
import { HexColorPicker } from 'react-colorful';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code as CodeIcon,
  Code2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Highlighter,
  Palette,
  Type,
  PaintBucket,
  Smile,
  Search as SearchIcon,
  AtSign,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Info,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  AlertOctagon,
  Trash2,
  Plus,
  Minus as MinusIcon,
  Merge,
  Split,
  X,
  Film as YoutubeIcon,
} from 'lucide-react';

// Admonition round-trip helpers live in a sibling module so they can be
// unit-tested without pulling in the full Tiptap editor surface.
import {
  preprocessAdmonitions,
  postprocessAdmonitions,
  type AdmonitionType,
} from './admonitions';

// ─────────────────────────────────────────────────────────────────────────────
// LAZY-LOADED TIPTAP EDITOR
// ─────────────────────────────────────────────────────────────────────────────
// We use Tiptap's actual `Editor` class type for our editor surface — the
// `import type` above is erased at runtime so the lazy chunk boundary is
// preserved. The extra `storage` shape extension below adds the typed accessors
// for the `tiptap-markdown` and `character-count` extension storages.
export type TiptapEditor = Editor & {
  storage: Editor['storage'] & {
    markdown?: { getMarkdown?: () => string };
    characterCount?: { characters?: () => number; words?: () => number };
  };
};
type LucideIcon = React.ComponentType<{ className?: string }>;

const LazyTiptapEditor = React.lazy(async () => {
  const { useEditor, EditorContent } = await import('@tiptap/react');
  const { BubbleMenu } = await import('@tiptap/react/menus');
  const { loadEditorModules, buildEditorExtensions } = await import(
    './editor-config'
  );

  // Pre-load every extension package once at lazy boundary so the per-instance
  // call to `buildEditorExtensions` below can stay synchronous (and `useEditor`
  // can be wired without an extra async loading phase).
  const editorModules = await loadEditorModules();

  // Typed accessor for the markdown storage (added by tiptap-markdown).
  const getMarkdown = (e: TiptapEditor): string =>
    e?.storage?.markdown?.getMarkdown?.() ?? '';

  // Cache for the /api/users typeahead so quick typing doesn't hammer the server.
  let userCache: { fetched: number; users: { id: string; label: string; detail?: string }[] } | null = null;
  const fetchUsers = async (query: string) => {
    const now = Date.now();
    if (!userCache || now - userCache.fetched > 60_000) {
      try {
        const res = await fetch('/api/users', { credentials: 'include' });
        if (!res.ok) {
          userCache = { fetched: now, users: [] };
        } else {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.users ?? []);
          userCache = {
            fetched: now,
            users: list.map((u: { id?: string | number; email?: string; name?: string; firstName?: string; lastName?: string }) => {
              const fullName = u.name
                || [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
                || u.email
                || String(u.id ?? '');
              return {
                id: String(u.id ?? u.email ?? fullName),
                label: fullName,
                detail: u.email,
              };
            }),
          };
        }
      } catch {
        userCache = { fetched: now, users: [] };
      }
    }
    const q = query.toLowerCase();
    return userCache.users
      .filter((u) =>
        u.label.toLowerCase().includes(q)
        || (u.detail ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  };

  interface InnerProps {
    value: string;
    onChange: (markdown: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    toolbar?: 'full' | 'compact' | 'minimal' | 'code';
    minHeight?: string;
    maxHeight?: string;
    imageUploadHandler?: (file: File) => Promise<string>;
    className?: string;
    contentEditableClassName?: string;
    autoFocus?: boolean;
    onBlur?: () => void;
    onFocus?: () => void;
    id?: string;
  }

  function TiptapInner({
    value,
    onChange,
    placeholder,
    readOnly,
    disabled,
    size = 'md',
    toolbar = 'full',
    minHeight,
    maxHeight,
    imageUploadHandler,
    className,
    contentEditableClassName,
    autoFocus,
    onBlur,
    onFocus,
    id,
  }: InnerProps) {
    const editable = !readOnly && !disabled;
    const [findOpen, setFindOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const editor = useEditor({
      // Create the editor after mount, not during render. With the default
      // (create during render) @tiptap/react destroys the instance if React
      // has not committed within one tick, which happens when the editor
      // opens inside a slow-to-mount Sheet/Dialog. The commit then runs our
      // effects against the destroyed editor and `editor.commands` throws
      // "Cannot read properties of null (reading 'commands')".
      immediatelyRender: false,
      editable,
      autofocus: autoFocus ? 'end' : false,
      extensions: buildEditorExtensions(editorModules, {
        placeholder,
        fetchUsers,
      }),
      content: preprocessAdmonitions(value || ''),
      editorProps: {
        attributes: {
          ...(id ? { id } : {}),
          class: cn(
            'tiptap-content prose prose-sm max-w-none dark:prose-invert focus:outline-none',
            'p-4',
            contentEditableClassName,
          ),
        },
        // Drag-and-drop / paste image upload. Uses the provided handler when
        // available, otherwise falls back to a base64 data URL so dropped
        // images still render even without an upload backend.
        handleDrop(view, event) {
          const dt = (event as DragEvent).dataTransfer;
          if (!dt || !dt.files || !dt.files.length) return false;
          const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          event.preventDefault();
          const coords = view.posAtCoords({
            left: (event as DragEvent).clientX,
            top: (event as DragEvent).clientY,
          });
          const insertPos = coords?.pos ?? view.state.selection.from;
          void Promise.all(
            files.map(async (file) => {
              const url = imageUploadHandler
                ? await imageUploadHandler(file)
                : await new Promise<string>((resolve) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result));
                    r.readAsDataURL(file);
                  });
              const node = view.state.schema.nodes.image?.create({ src: url, alt: file.name });
              if (node) {
                view.dispatch(view.state.tr.insert(insertPos, node));
              }
            }),
          );
          return true;
        },
        handlePaste(view, event) {
          const items = event.clipboardData?.items;
          if (!items) return false;
          const files: File[] = [];
          for (const it of Array.from(items)) {
            if (it.kind === 'file') {
              const f = it.getAsFile();
              if (f && f.type.startsWith('image/')) files.push(f);
            }
          }
          if (!files.length) return false;
          event.preventDefault();
          void Promise.all(
            files.map(async (file) => {
              const url = imageUploadHandler
                ? await imageUploadHandler(file)
                : await new Promise<string>((resolve) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result));
                    r.readAsDataURL(file);
                  });
              const node = view.state.schema.nodes.image?.create({ src: url, alt: file.name });
              if (node) {
                view.dispatch(view.state.tr.insert(view.state.selection.from, node));
              }
            }),
          );
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        const md = getMarkdown(editor);
        onChange(postprocessAdmonitions(md));
      },
      onBlur: () => onBlur?.(),
      onFocus: () => onFocus?.(),
    });

    // Sync external value changes (e.g. form reset)
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      const md = getMarkdown(editor);
      const current = postprocessAdmonitions(md);
      if ((value || '') !== current) {
        editor.commands.setContent(
          preprocessAdmonitions(value || ''),
          { emitUpdate: false },
        );
      }
    }, [value, editor]);

    // Toggle editable on prop changes
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      editor.setEditable(editable);
    }, [editable, editor]);

    if (!editor || editor.isDestroyed) {
      return (
        <div className="flex items-center justify-center p-8 border border-input rounded-md bg-muted/50">
          <div className="text-sm text-muted-foreground">Loading editor…</div>
        </div>
      );
    }

    const sizeMin: Record<string, string> = {
      sm: '150px',
      md: '200px',
      lg: '300px',
    };

    const containerStyle: React.CSSProperties = {
      minHeight: minHeight || sizeMin[size] || sizeMin.md,
      maxHeight: maxHeight,
    };

    return (
      <TooltipProvider delayDuration={200}>
        <div
          ref={containerRef}
          className={cn(
            'tiptap-editor-container',
            toolbar === 'code' && 'tiptap-editor-code-mode',
            'border border-input rounded-md overflow-hidden',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            'bg-white dark:bg-[var(--card)]',
            'dark:border-[var(--border)]',
            className,
          )}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
              if (containerRef.current?.contains(e.target as Node)) {
                e.preventDefault();
                setFindOpen(true);
              }
            }
          }}
        >
          {editable && (
            <Toolbar
              editor={editor}
              variant={toolbar}
              imageUploadHandler={imageUploadHandler}
              onOpenFindReplace={() => setFindOpen((o) => !o)}
            />
          )}
          {editable && (
            <FindReplaceBar
              editor={editor}
              open={findOpen}
              onClose={() => setFindOpen(false)}
            />
          )}
          <div
            className="overflow-auto"
            style={{
              maxHeight: maxHeight,
            }}
          >
            <div style={containerStyle}>
              {editor && (
                <BubbleMenu
                  editor={editor}
                  className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
                >
                  <ToolbarButton
                    icon={Bold}
                    label="Bold"
                    active={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  />
                  <ToolbarButton
                    icon={Italic}
                    label="Italic"
                    active={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  />
                  <ToolbarButton
                    icon={UnderlineIcon}
                    label="Underline"
                    active={editor.isActive('underline')}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                  />
                  <ToolbarButton
                    icon={Strikethrough}
                    label="Strikethrough"
                    active={editor.isActive('strike')}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                  />
                  <ToolbarButton
                    icon={CodeIcon}
                    label="Inline code"
                    active={editor.isActive('code')}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                  />
                  <LinkPopover editor={editor} compact />
                </BubbleMenu>
              )}
              {editor && (
                <BubbleMenu
                  editor={editor}
                  className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
                  shouldShow={({ editor }: { editor: TiptapEditor }) =>
                    editor.isActive('image')
                  }
                >
                  <ImageAlignmentControls editor={editor} />
                </BubbleMenu>
              )}
              <EditorContent editor={editor} />
            </div>
          </div>
          <Footer editor={editor} />
        </div>
      </TooltipProvider>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TOOLBAR
  // ───────────────────────────────────────────────────────────────────────────
  function Toolbar({
    editor,
    variant,
    imageUploadHandler,
    onOpenFindReplace,
  }: {
    editor: TiptapEditor;
    variant: 'full' | 'compact' | 'minimal' | 'code';
    imageUploadHandler?: (file: File) => Promise<string>;
    onOpenFindReplace?: () => void;
  }) {
    // Per-variant capability matrix — mirrors the documented spec exactly.
    // | full    | UR · BIUStrike · Sub/Sup · Code · Highlight · Text · BG · H · Lists · Task · Link · Img · Table · Code block · HR · Admonition · Emoji |
    // | compact | UR · BIU · Highlight · Text · BG · H · Lists · Task · Link · Img · Emoji |
    // | minimal | UR · BIU · Highlight · Text · BG · H |
    // | code    | UR · BIU · Highlight · Text · BG · H · Lists · Link · Code block · Emoji |
    const matrix = {
      full: {
        bold: true, italic: true, underline: true, strike: true, inlineCode: true,
        subSuper: true,
        highlight: true, textColor: true, bgColor: true,
        blockType: true,
        bulletList: true, orderedList: true, taskList: true,
        link: true, image: true, youtube: true,
        table: true, blockquote: true, hr: true,
        codeBlock: true,
        admonition: true,
        emoji: true,
      },
      compact: {
        bold: true, italic: true, underline: true, strike: false, inlineCode: false,
        subSuper: false,
        highlight: true, textColor: true, bgColor: true,
        blockType: true,
        bulletList: true, orderedList: true, taskList: true,
        link: true, image: true, youtube: false,
        table: false, blockquote: false, hr: false,
        codeBlock: false,
        admonition: false,
        emoji: true,
      },
      minimal: {
        bold: true, italic: true, underline: true, strike: false, inlineCode: false,
        subSuper: false,
        highlight: true, textColor: true, bgColor: true,
        blockType: true,
        bulletList: false, orderedList: false, taskList: false,
        link: false, image: false, youtube: false,
        table: false, blockquote: false, hr: false,
        codeBlock: false,
        admonition: false,
        emoji: false,
      },
      code: {
        bold: true, italic: true, underline: true, strike: false, inlineCode: false,
        subSuper: false,
        highlight: true, textColor: true, bgColor: true,
        blockType: true,
        bulletList: true, orderedList: true, taskList: false,
        link: true, image: false, youtube: false,
        table: false, blockquote: false, hr: false,
        codeBlock: true,
        admonition: false,
        emoji: true,
      },
    } as const;
    const m = matrix[variant];

    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5',
          'bg-gray-50 dark:bg-[var(--card)] dark:border-[var(--border)]',
        )}
      >
        <ToolbarButton
          icon={Undo2}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <Divider />
        {m.bold && (
          <ToolbarButton
            icon={Bold}
            label="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
        )}
        {m.italic && (
          <ToolbarButton
            icon={Italic}
            label="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        )}
        {m.underline && (
          <ToolbarButton
            icon={UnderlineIcon}
            label="Underline"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
        )}
        {m.strike && (
          <ToolbarButton
            icon={Strikethrough}
            label="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
        )}
        {m.inlineCode && (
          <ToolbarButton
            icon={CodeIcon}
            label="Inline code"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
        )}
        {m.subSuper && (
          <>
            <ToolbarButton
              icon={SubscriptIcon}
              label="Subscript"
              active={editor.isActive('subscript')}
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            />
            <ToolbarButton
              icon={SuperscriptIcon}
              label="Superscript"
              active={editor.isActive('superscript')}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            />
          </>
        )}

        {(m.highlight || m.textColor || m.bgColor) && <Divider />}
        {m.highlight && <HighlightPopover editor={editor} />}
        {m.textColor && <ColorPopover editor={editor} kind="text" />}
        {m.bgColor && <ColorPopover editor={editor} kind="background" />}

        {m.blockType && (
          <>
            <Divider />
            <BlockTypeSelect editor={editor} />
          </>
        )}

        {(m.bulletList || m.orderedList || m.taskList) && <Divider />}
        {m.bulletList && (
          <ToolbarButton
            icon={List}
            label="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
        )}
        {m.orderedList && (
          <ToolbarButton
            icon={ListOrdered}
            label="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        )}
        {m.taskList && (
          <ToolbarButton
            icon={ListChecks}
            label="Task list"
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          />
        )}

        {(m.link || m.image) && <Divider />}
        {m.link && <LinkPopover editor={editor} />}
        {m.image && imageUploadHandler && (
          <ImageUploadButton editor={editor} handler={imageUploadHandler} />
        )}
        {m.youtube && <YoutubeEmbedButton editor={editor} />}

        {(m.table || m.blockquote || m.hr) && <Divider />}
        {m.table && <TableMenu editor={editor} />}
        {m.blockquote && (
          <ToolbarButton
            icon={Quote}
            label="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        )}
        {m.hr && (
          <ToolbarButton
            icon={Minus}
            label="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
        )}

        {m.codeBlock && (
          <>
            <Divider />
            <CodeBlockMenu editor={editor} />
          </>
        )}

        {m.admonition && (
          <>
            <Divider />
            <AdmonitionMenu editor={editor} />
          </>
        )}

        {m.emoji && (
          <>
            <Divider />
            <EmojiPicker editor={editor} />
          </>
        )}

        {onOpenFindReplace && (
          <>
            <Divider />
            <ToolbarButton
              icon={SearchIcon}
              label="Find & replace (Ctrl/Cmd+F)"
              onClick={onOpenFindReplace}
            />
          </>
        )}
      </div>
    );
  }

  function Footer({ editor }: { editor: TiptapEditor }) {
    if (!editor) return null;
    const chars = editor.storage.characterCount?.characters?.() ?? 0;
    const words = editor.storage.characterCount?.words?.() ?? 0;
    return (
      <div className="px-3 py-1 border-t text-xs text-muted-foreground flex justify-end gap-3 dark:border-[var(--border)]">
        <span>{words} words</span>
        <span>{chars} chars</span>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHARED TOOLBAR PIECES
  // ───────────────────────────────────────────────────────────────────────────
  function ToolbarButton({
    icon: Icon,
    label,
    onClick,
    active,
    disabled,
  }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
  }) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
              'h-8 w-8 inline-flex items-center justify-center rounded text-sm',
              'hover:bg-muted disabled:opacity-40 disabled:pointer-events-none',
              'text-muted-foreground hover:text-foreground',
              active && 'bg-muted text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  function Divider() {
    return <div className="mx-1 h-5 w-px bg-border" />;
  }

  function BlockTypeSelect({ editor }: { editor: TiptapEditor }) {
    const current = (() => {
      for (let l = 1; l <= 6; l++) {
        if (editor.isActive('heading', { level: l })) return `h${l}`;
      }
      if (editor.isActive('blockquote')) return 'quote';
      if (editor.isActive('codeBlock')) return 'code';
      return 'p';
    })();

    return (
      <Select
        value={current}
        onValueChange={(v) => {
          const c = editor.chain().focus();
          if (v === 'p') c.setParagraph().run();
          else if (v.startsWith('h')) {
            const level = Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
            c.toggleHeading({ level }).run();
          } else if (v === 'quote') c.toggleBlockquote().run();
          else if (v === 'code') c.toggleCodeBlock().run();
        }}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Paragraph</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
          <SelectItem value="h3">Heading 3</SelectItem>
          <SelectItem value="h4">Heading 4</SelectItem>
          <SelectItem value="h5">Heading 5</SelectItem>
          <SelectItem value="h6">Heading 6</SelectItem>
          <SelectItem value="quote">Quote</SelectItem>
          <SelectItem value="code">Code block</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  function HighlightPopover({ editor }: { editor: TiptapEditor }) {
    const [color, setColor] = useState('#ffff00');
    const [open, setOpen] = useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Highlight"
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                  editor.isActive('highlight') && 'bg-muted text-foreground',
                )}
              >
                <Highlighter className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Highlight</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-3 space-y-3">
          <p className="text-sm font-medium">Highlight color</p>
          <HexColorPicker color={color} onChange={setColor} />
          <div className="flex items-center gap-2 text-sm">
            <div
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: color }}
            />
            <span>{color}</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => {
                editor.chain().focus().toggleHighlight({ color }).run();
                setOpen(false);
              }}
            >
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function ColorPopover({
    editor,
    kind,
  }: {
    editor: TiptapEditor;
    kind: 'text' | 'background';
  }) {
    const isBg = kind === 'background';
    const [color, setColor] = useState(isBg ? '#fff59d' : '#000000');
    const [open, setOpen] = useState(false);
    const Icon = isBg ? PaintBucket : Type;
    const label = isBg ? 'Background color' : 'Text color';
    const apply = () => {
      const c = editor.chain().focus();
      if (isBg) c.setBackgroundColor(color).run();
      else c.setColor(color).run();
      setOpen(false);
    };
    const clear = () => {
      const c = editor.chain().focus();
      if (isBg) c.unsetBackgroundColor().run();
      else c.unsetColor().run();
      setOpen(false);
    };
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={label}
                className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-4 w-4" style={{ color }} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-3 space-y-3">
          <p className="text-sm font-medium">{label}</p>
          <HexColorPicker color={color} onChange={setColor} />
          <div className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" style={{ color }} />
            <span>{color}</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={apply}
            >
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clear}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function EmojiPicker({ editor }: { editor: TiptapEditor }) {
    const [open, setOpen] = useState(false);
    const emoji = [
      '😀','😄','😁','😂','🤣','😊','😍','😘','🤔','🙂','🙃','😉','😎','🤩','😇','🥳',
      '😢','😭','😡','😱','😴','🤯','🤗','🤝','👍','👎','👏','🙌','💪','🙏','👀','💯',
      '✅','❌','⚠️','❓','❗','💡','📌','📎','🔥','✨','🚀','🎉','🎯','🏆','📅','⏰',
      '❤️','💔','💜','💚','💙','🧡','🤍','🖤','📝','📈','📉','📊','🔒','🔓','🔑','📂',
    ];
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Emoji"
                className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Emoji</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-2">
          <div className="grid grid-cols-8 gap-1 max-h-56 overflow-auto">
            {emoji.map((e) => (
              <button
                key={e}
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-base"
                onClick={() => {
                  editor.chain().focus().insertContent(e).run();
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function FindReplaceBar({
    editor,
    open,
    onClose,
  }: {
    editor: TiptapEditor;
    open: boolean;
    onClose: () => void;
  }) {
    const [query, setQuery] = useState('');
    const [replacement, setReplacement] = useState('');
    const [matchCount, setMatchCount] = useState(0);

    const findAll = (q: string): { from: number; to: number }[] => {
      if (!q) return [];
      const matches: { from: number; to: number }[] = [];
      const lower = q.toLowerCase();
      editor.state.doc.descendants((node: { isText: boolean; text?: string }, pos: number) => {
        if (!node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        let idx = 0;
        while ((idx = text.indexOf(lower, idx)) !== -1) {
          matches.push({ from: pos + idx, to: pos + idx + q.length });
          idx += q.length;
        }
      });
      return matches;
    };

    // Recompute the match count whenever the query changes OR the document
    // changes — so the count stays live as the user types or replaces text.
    useEffect(() => {
      const recompute = () => setMatchCount(findAll(query).length);
      recompute();
      if (!open) return;
      editor.on('update', recompute);
      editor.on('selectionUpdate', recompute);
      return () => {
        editor.off('update', recompute);
        editor.off('selectionUpdate', recompute);
      };
    }, [query, editor, open]);

    const findNext = () => {
      const matches = findAll(query);
      if (!matches.length) return;
      const sel = editor.state.selection;
      const next =
        matches.find((m) => m.from >= sel.to) ?? matches[0];
      editor.chain().focus().setTextSelection(next).scrollIntoView().run();
    };

    const replaceCurrent = () => {
      const matches = findAll(query);
      if (!matches.length) return;
      const sel = editor.state.selection;
      const target =
        matches.find((m) => m.from === sel.from && m.to === sel.to) ??
        matches.find((m) => m.from >= sel.from) ??
        matches[0];
      editor
        .chain()
        .focus()
        .insertContentAt(target, replacement)
        .run();
    };

    const replaceAll = () => {
      const matches = findAll(query);
      if (!matches.length) return;
      // Replace from last to first so positions stay valid.
      const tr = editor.state.tr;
      for (let i = matches.length - 1; i >= 0; i--) {
        tr.insertText(replacement, matches[i].from, matches[i].to);
      }
      editor.view.dispatch(tr);
    };

    if (!open) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5 dark:border-[var(--border)]">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find"
          className="h-7 w-40 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              findNext();
            }
          }}
          autoFocus
        />
        <Input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with"
          className="h-7 w-40 text-xs"
        />
        <span className="text-xs text-muted-foreground">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={findNext}>
          Find next
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={replaceCurrent}>
          Replace
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={replaceAll}>
          Replace all
        </Button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close find/replace"
          className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function LinkPopover({
    editor,
    compact,
  }: {
    editor: TiptapEditor;
    compact?: boolean;
  }) {
    const [open, setOpen] = useState(false);
    const [href, setHref] = useState('');
    useEffect(() => {
      if (open) setHref(editor.getAttributes('link').href || '');
    }, [open, editor]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Link"
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                  editor.isActive('link') && 'bg-muted text-foreground',
                )}
              >
                <LinkIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Link</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-72 p-3 space-y-2">
          <Label className="text-xs">URL</Label>
          <Input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (href) {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .setLink({ href })
                    .run();
                }
                setOpen(false);
              }
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (href) {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .setLink({ href })
                    .run();
                }
                setOpen(false);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setOpen(false);
              }}
            >
              Remove
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function ImageUploadButton({
    editor,
    handler,
  }: {
    editor: TiptapEditor;
    handler: (file: File) => Promise<string>;
  }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const url = await handler(file);
              editor.chain().focus().setImage({ src: url }).run();
            } catch (err) {
              console.error('Image upload failed', err);
            } finally {
              if (inputRef.current) inputRef.current.value = '';
            }
          }}
        />
        <ToolbarButton
          icon={ImageIcon}
          label="Insert image (or drag and drop / paste)"
          onClick={() => inputRef.current?.click()}
        />
      </>
    );
  }

  function ImageAlignmentControls({ editor }: { editor: TiptapEditor }) {
    const attrs = editor.getAttributes('image') as { width?: string | null; align?: string | null };
    const setAlign = (align: 'left' | 'center' | 'right' | null) =>
      editor.chain().focus().updateAttributes('image', { align }).run();
    const setWidth = (width: string | null) =>
      editor.chain().focus().updateAttributes('image', { width }).run();
    const widthOptions: { label: string; value: string | null }[] = [
      { label: 'S', value: '200' },
      { label: 'M', value: '400' },
      { label: 'L', value: '640' },
      { label: 'Full', value: '100%' },
      { label: 'Auto', value: null },
    ];
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Align left"
          className={cn(
            'h-7 px-2 text-xs rounded hover:bg-muted',
            attrs.align === 'left' && 'bg-muted',
          )}
          onClick={() => setAlign('left')}
        >L</button>
        <button
          type="button"
          aria-label="Align center"
          className={cn(
            'h-7 px-2 text-xs rounded hover:bg-muted',
            attrs.align === 'center' && 'bg-muted',
          )}
          onClick={() => setAlign('center')}
        >C</button>
        <button
          type="button"
          aria-label="Align right"
          className={cn(
            'h-7 px-2 text-xs rounded hover:bg-muted',
            attrs.align === 'right' && 'bg-muted',
          )}
          onClick={() => setAlign('right')}
        >R</button>
        <div className="h-5 w-px bg-border mx-1" />
        {widthOptions.map((w) => (
          <button
            key={w.label}
            type="button"
            className={cn(
              'h-7 px-2 text-xs rounded hover:bg-muted',
              String(attrs.width ?? '') === String(w.value ?? '') && 'bg-muted',
            )}
            onClick={() => setWidth(w.value)}
          >
            {w.label}
          </button>
        ))}
      </div>
    );
  }

  function YoutubeEmbedButton({ editor }: { editor: TiptapEditor }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const submit = () => {
      const trimmed = url.trim();
      if (!trimmed) return;
      editor.chain().focus().setYoutubeVideo({ src: trimmed }).run();
      setUrl('');
      setOpen(false);
    };
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Embed YouTube video"
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                <YoutubeIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Embed YouTube video</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-80 p-3 space-y-2">
          <Label htmlFor="yt-url" className="text-xs">YouTube URL</Label>
          <Input
            id="yt-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            autoFocus
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!url.trim()}>
              Embed
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function TableMenu({ editor }: { editor: TiptapEditor }) {
    const [open, setOpen] = useState(false);
    const inTable = editor.isActive('table');
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Table"
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                  inTable && 'bg-muted text-foreground',
                )}
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Table</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-2 space-y-1">
          <CustomTableInsert
            onInsert={(rows, cols, header) => {
              editor
                .chain()
                .focus()
                .insertTable({ rows, cols, withHeaderRow: header })
                .run();
              setOpen(false);
            }}
          />
          {inTable && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuRow
                onClick={() => editor.chain().focus().addRowBefore().run()}
                icon={Plus}
                label="Add row above"
              />
              <MenuRow
                onClick={() => editor.chain().focus().addRowAfter().run()}
                icon={Plus}
                label="Add row below"
              />
              <MenuRow
                onClick={() => editor.chain().focus().deleteRow().run()}
                icon={MinusIcon}
                label="Delete row"
              />
              <MenuRow
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                icon={Plus}
                label="Add column left"
              />
              <MenuRow
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                icon={Plus}
                label="Add column right"
              />
              <MenuRow
                onClick={() => editor.chain().focus().deleteColumn().run()}
                icon={MinusIcon}
                label="Delete column"
              />
              <MenuRow
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                icon={TableIcon}
                label="Toggle header row"
              />
              <div className="my-1 h-px bg-border" />
              <MenuRow
                onClick={() => editor.chain().focus().mergeCells().run()}
                icon={Merge}
                label="Merge cells"
              />
              <MenuRow
                onClick={() => editor.chain().focus().splitCell().run()}
                icon={Split}
                label="Split cell"
              />
              <MenuRow
                onClick={() => editor.chain().focus().mergeOrSplit().run()}
                icon={Merge}
                label="Merge or split"
              />
              <div className="my-1 h-px bg-border" />
              <MenuRow
                onClick={() => editor.chain().focus().deleteTable().run()}
                icon={Trash2}
                label="Delete table"
              />
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  function MenuRow({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2 text-left text-sm rounded px-2 py-1 hover:bg-muted"
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  function CustomTableInsert({
    onInsert,
  }: {
    onInsert: (rows: number, cols: number, header: boolean) => void;
  }) {
    const [rows, setRows] = useState(3);
    const [cols, setCols] = useState(3);
    const [header, setHeader] = useState(true);
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground px-1">Insert table</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="tbl-rows" className="text-xs">Rows</Label>
            <Input
              id="tbl-rows"
              type="number"
              min={1}
              max={50}
              value={rows}
              onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="h-8"
            />
          </div>
          <div>
            <Label htmlFor="tbl-cols" className="text-xs">Columns</Label>
            <Input
              id="tbl-cols"
              type="number"
              min={1}
              max={20}
              value={cols}
              onChange={(e) => setCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="h-8"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs px-1">
          <input
            type="checkbox"
            checked={header}
            onChange={(e) => setHeader(e.target.checked)}
          />
          Include header row
        </label>
        <Button size="sm" className="w-full" onClick={() => onInsert(rows, cols, header)}>
          Insert {rows} × {cols}
        </Button>
      </div>
    );
  }

  function CodeBlockMenu({ editor }: { editor: TiptapEditor }) {
    const [open, setOpen] = useState(false);
    // Language set matches the legacy editor exactly so saved markdown stays
    // valid. The values are also valid lowlight language ids.
    const langs = [
      'text',
      'js',
      'jsx',
      'ts',
      'tsx',
      'css',
      'html',
      'json',
      'python',
      'bash',
      'sql',
      'yaml',
      'xml',
    ];
    const currentLang = editor.getAttributes('codeBlock').language || 'text';
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Code block"
                className={cn(
                  'h-8 px-2 inline-flex items-center justify-center rounded gap-1 text-xs',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                  editor.isActive('codeBlock') && 'bg-muted text-foreground',
                )}
              >
                <Code2 className="h-4 w-4" />
                {editor.isActive('codeBlock') && (
                  <span className="hidden sm:inline">{currentLang}</span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Code block</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-48 p-2 space-y-1 max-h-72 overflow-auto">
          <button
            type="button"
            className="w-full text-left text-sm rounded px-2 py-1 hover:bg-muted font-medium"
            onClick={() => {
              editor.chain().focus().toggleCodeBlock().run();
              setOpen(false);
            }}
          >
            {editor.isActive('codeBlock') ? 'Remove code block' : 'Insert code block'}
          </button>
          {editor.isActive('codeBlock') && (
            <>
              <div className="my-1 h-px bg-border" />
              <p className="text-xs text-muted-foreground px-2 py-1">Language</p>
              {langs.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={cn(
                    'w-full text-left text-sm rounded px-2 py-1 hover:bg-muted',
                    currentLang === l && 'bg-muted',
                  )}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .updateAttributes('codeBlock', { language: l })
                      .run();
                    setOpen(false);
                  }}
                >
                  {l}
                </button>
              ))}
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  function AdmonitionMenu({ editor }: { editor: TiptapEditor }) {
    const [open, setOpen] = useState(false);
    const items: { type: AdmonitionType; icon: LucideIcon; label: string }[] = [
      { type: 'note', icon: Info, label: 'Note' },
      { type: 'tip', icon: Lightbulb, label: 'Tip' },
      { type: 'info', icon: Info, label: 'Info' },
      { type: 'warning', icon: AlertTriangle, label: 'Warning' },
      { type: 'danger', icon: AlertOctagon, label: 'Danger' },
    ];
    const inAdm = editor.isActive('admonition');
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Admonition"
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded',
                  'hover:bg-muted text-muted-foreground hover:text-foreground',
                  inAdm && 'bg-muted text-foreground',
                )}
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Admonition</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-44 p-2 space-y-1">
          {items.map((it) => (
            <button
              key={it.type}
              type="button"
              className="w-full flex items-center gap-2 text-left text-sm rounded px-2 py-1 hover:bg-muted"
              onClick={() => {
                editor.chain().focus().setAdmonition(it.type).run();
                setOpen(false);
              }}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </button>
          ))}
          {inAdm && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="w-full text-left text-sm rounded px-2 py-1 hover:bg-muted"
                onClick={() => {
                  editor.chain().focus().unsetAdmonition().run();
                  setOpen(false);
                }}
              >
                Remove admonition
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  TiptapInner.displayName = 'TiptapInner';
  return { default: TiptapInner };
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export interface TiptapEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  toolbar?: 'full' | 'compact' | 'minimal' | 'code';
  minHeight?: string;
  maxHeight?: string;
  imageUploadHandler?: (file: File) => Promise<string>;
  className?: string;
  contentEditableClassName?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  id?: string;
}

export function TiptapEditor(props: TiptapEditorProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 border border-input rounded-md bg-muted/50 dark:border-[var(--border)]">
          <div className="text-sm text-muted-foreground">Loading editor…</div>
        </div>
      }
    >
      <LazyTiptapEditor {...props} />
    </Suspense>
  );
}

TiptapEditor.displayName = 'TiptapEditor';
