import { describe, expect, it } from 'vitest';
import { createRoundTripEditor } from './roundtrip-harness';

// Youtube embeds are stored as raw `<iframe>` markup inside the markdown
// (tiptap-markdown's `html: true` passes them through verbatim). We can't
// drive this fixture through the standard `expectRoundTripStable` helper
// because parsing an iframe in happy-dom can throw a downstream error from
// the iframe load lifecycle (silenced by `vitest.setup.ts`). Instead we
// insert the YouTube node programmatically, read the markdown back, and
// assert the iframe markup survives — which is the regression we actually
// care about.

interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string };
}

describe('round-trip: youtube embeds', () => {
  it('youtube node serialises to an iframe and re-serialises identically', async () => {
    const editor = await createRoundTripEditor();
    try {
      // setYoutubeVideo is the public command added by @tiptap/extension-youtube.
      const commands = editor.commands as unknown as {
        setYoutubeVideo: (opts: {
          src: string;
          width?: number;
          height?: number;
        }) => boolean;
      };
      const inserted = commands.setYoutubeVideo({
        src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        width: 640,
        height: 360,
      });
      expect(inserted, 'setYoutubeVideo should succeed').toBe(true);

      const storage = editor.storage as unknown as MarkdownStorage;
      const md = storage.markdown?.getMarkdown?.() ?? '';

      // The markdown must contain an <iframe> pointing at the YouTube
      // embed URL — this is the contract for stored content.
      expect(md).toMatch(/<iframe[^>]*youtube[^>]*>/i);
      expect(md).toMatch(/dQw4w9WgXcQ/);

      // Idempotency: feeding the serialised markdown back into a fresh
      // editor must produce identical output.
      const second = await createRoundTripEditor();
      try {
        second.commands.setContent(md, { emitUpdate: false });
        const secondStorage = second.storage as unknown as MarkdownStorage;
        const md2 = secondStorage.markdown?.getMarkdown?.() ?? '';
        expect(md2).toBe(md);
      } finally {
        second.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});
