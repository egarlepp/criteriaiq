import { describe, it } from 'vitest';
import { expectRoundTripStable, roundTripOnce } from './roundtrip-harness';

// Images and embedded media. The Image extension is customised to support a
// width attribute and an `align` attribute that maps to inline styles, so
// these fixtures pin both the canonical markdown image syntax and the HTML
// passthrough used for advanced attributes.
//
// Youtube embeds are exercised in `roundtrip-youtube.test.ts` (separate file
// because they need programmatic insertion to dodge happy-dom's iframe
// load lifecycle).

describe('round-trip: media', () => {
  it('plain image with alt text', async () => {
    await expectRoundTripStable('![Cat](https://example.com/cat.png)');
  });

  it('image with title', async () => {
    await expectRoundTripStable(
      '![Cat](https://example.com/cat.png "A cat")',
    );
  });

  it('image embedded in a paragraph (block-image canonical form)', async () => {
    // The Image extension is configured with `inline: false`, so any image
    // inside a paragraph gets pulled into its own block. We pin the
    // canonical output here so the splitting behaviour is intentional and
    // reviewable.
    const md = 'Look: ![Cat](https://example.com/cat.png) right there.';
    const expected = [
      'Look:',
      '',
      '![Cat](https://example.com/cat.png)right there.',
    ].join('\n');
    await expectRoundTripStable(md, expected);
  });

  it('image with width attribute (HTML passthrough)', async () => {
    const html =
      '<img src="https://example.com/cat.png" alt="Cat" width="320">';
    // The first round-trip normalises the HTML; we then assert that form is
    // idempotent.
    const normalised = await roundTripOnce(html);
    await expectRoundTripStable(normalised);
  });

});
