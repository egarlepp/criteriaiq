// ─────────────────────────────────────────────────────────────────────────────
// ROUND-TRIP TEST HARNESS
// ─────────────────────────────────────────────────────────────────────────────
// Creates a headless Tiptap editor configured exactly like the production
// `TiptapEditor` (via the shared `editor-config` module) and runs the full
// pipeline:
//
//   markdown -> preprocessAdmonitions -> editor.setContent
//            -> editor.storage.markdown.getMarkdown
//            -> postprocessAdmonitions -> markdown
//
// Tests assert that the output matches the input (or a documented canonical
// form) and that a second pass is idempotent.
//
// The harness is shared across every fixture file so coverage stays in sync
// with the production extension list.
// ─────────────────────────────────────────────────────────────────────────────

import { Editor } from '@tiptap/core';
import { expect } from 'vitest';
import {
  loadEditorModules,
  buildEditorExtensions,
  type EditorModules,
  type MentionUserSuggestion,
} from '../editor-config';
import {
  preprocessAdmonitions,
  postprocessAdmonitions,
} from '../admonitions';

let cachedModules: EditorModules | null = null;

async function getModules(): Promise<EditorModules> {
  if (!cachedModules) {
    cachedModules = await loadEditorModules();
  }
  return cachedModules;
}

export interface RoundTripEditorOptions {
  fetchUsers?: (query: string) => Promise<MentionUserSuggestion[]>;
}

/**
 * Construct a stand-alone Tiptap editor wired with the shared production
 * extensions. The caller is responsible for `editor.destroy()`.
 */
export async function createRoundTripEditor(
  opts: RoundTripEditorOptions = {},
): Promise<Editor> {
  const modules = await getModules();
  const extensions = buildEditorExtensions(modules, {
    fetchUsers: opts.fetchUsers,
  });
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({ element, extensions, content: '' });
}

interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string };
}

function readMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as MarkdownStorage;
  return storage.markdown?.getMarkdown?.() ?? '';
}

/**
 * Run the full markdown round-trip pipeline once and return the result.
 */
export async function roundTripOnce(
  markdown: string,
  opts: RoundTripEditorOptions = {},
): Promise<string> {
  const editor = await createRoundTripEditor(opts);
  try {
    const html = preprocessAdmonitions(markdown);
    editor.commands.setContent(html, { emitUpdate: false });
    const md = readMarkdown(editor);
    return postprocessAdmonitions(md);
  } finally {
    editor.destroy();
  }
}

/**
 * Assert that `input` round-trips through the editor without drift, and that
 * a second pass is idempotent (so re-saving never produces a noisy diff).
 *
 * If `expected` is omitted the input is compared against itself. Use
 * `expected` to document a canonical form (e.g. when the pipeline normalises
 * trailing whitespace).
 */
export async function expectRoundTripStable(
  input: string,
  expected?: string,
  opts: RoundTripEditorOptions = {},
): Promise<void> {
  const target = expected ?? input;
  const first = await roundTripOnce(input, opts);
  expect(first, 'first round-trip should match expected').toBe(target);
  const second = await roundTripOnce(first, opts);
  expect(second, 'second round-trip should be idempotent').toBe(target);
}
