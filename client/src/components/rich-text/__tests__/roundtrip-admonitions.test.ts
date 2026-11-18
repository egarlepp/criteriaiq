import { describe, it } from 'vitest';
import { expectRoundTripStable } from './roundtrip-harness';

// Full-pipeline admonition round-trip. The pure-string pre/post-processor
// behaviour is covered in `admonitions.test.ts`. These fixtures exercise the
// complete flow through the live Tiptap editor + custom Admonition node so
// any drift in the parse / serialise wiring is caught.

describe('round-trip: admonitions (full pipeline)', () => {
  it.each(['note', 'tip', 'info', 'warning', 'danger'] as const)(
    'top-level %s admonition',
    async (type) => {
      const md = [`:::${type}`, `Body for ${type}.`, ':::'].join('\n');
      await expectRoundTripStable(md);
    },
  );

  it('admonition with multiple paragraphs', async () => {
    const md = [
      ':::note',
      'First paragraph inside the note.',
      '',
      'Second paragraph inside the note.',
      ':::',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('admonition surrounded by other blocks', async () => {
    const md = [
      'Intro paragraph.',
      '',
      ':::tip',
      'Be considerate.',
      ':::',
      '',
      'Outro paragraph.',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('admonition containing an inline mark', async () => {
    const md = [':::warning', 'This is **important** to read.', ':::'].join(
      '\n',
    );
    await expectRoundTripStable(md);
  });
});
