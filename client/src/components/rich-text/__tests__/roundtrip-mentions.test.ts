import { describe, it, expect } from 'vitest';
import { createRoundTripEditor } from './roundtrip-harness';
import { postprocessAdmonitions } from '../admonitions';

// Mentions are a serialize-only fixture (intentional exception to the
// "every fixture asserts idempotency" rule). The Mention extension has no
// markdown parser direction — `@Name` text in markdown does NOT reparse
// into a mention node, it stays as plain text. The data-integrity risk we
// guard against here is the *first* save of a mention dropped into the
// editor by the typeahead plugin: it must serialise to the canonical
// `@label` form expected by downstream consumers (notification dispatch,
// search index, etc). After the first save, the serialised text is a
// stable plain-text fragment and reparses as itself, which we verify
// explicitly below as a weaker form of idempotency.

interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string };
}

describe('round-trip: mentions (serialize-only)', () => {
  it('mention node serialises to @label', async () => {
    const editor = await createRoundTripEditor();
    try {
      editor.commands.setContent(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Ping ' },
                {
                  type: 'mention',
                  attrs: { id: 'u_42', label: 'Ada Lovelace' },
                },
                { type: 'text', text: ' for review.' },
              ],
            },
          ],
        },
        { emitUpdate: false },
      );
      const storage = editor.storage as unknown as MarkdownStorage;
      const md = storage.markdown?.getMarkdown?.() ?? '';
      const result = postprocessAdmonitions(md);
      expect(result).toContain('@Ada Lovelace');
      expect(result).toContain('Ping ');
      expect(result).toContain(' for review.');

      // Weak-form idempotency: feed the serialised plain-text form back in
      // and confirm a second pass equals the first. The `@Ada Lovelace`
      // fragment will round-trip as text, not as a mention node — that's
      // expected (see file-level comment) and pinned here.
      const second = await createRoundTripEditor();
      try {
        second.commands.setContent(result, { emitUpdate: false });
        const secondStorage = second.storage as unknown as MarkdownStorage;
        const md2 = postprocessAdmonitions(
          secondStorage.markdown?.getMarkdown?.() ?? '',
        );
        expect(md2).toBe(result);
      } finally {
        second.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});
