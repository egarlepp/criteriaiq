import { describe, it } from 'vitest';
import { expectRoundTripStable } from './roundtrip-harness';

// Inline marks: bold, italic, underline, strikethrough, inline code, links,
// subscript / superscript, highlight, color. These are the marks users apply
// most frequently inside otherwise-plain paragraphs so drift is highly
// visible.

describe('round-trip: inline marks', () => {
  it('bold', async () => {
    await expectRoundTripStable('Hello **bold** world.');
  });

  it('italic', async () => {
    await expectRoundTripStable('Hello *italic* world.');
  });

  it('strikethrough', async () => {
    await expectRoundTripStable('Hello ~~struck~~ world.');
  });

  it('inline code', async () => {
    await expectRoundTripStable('Use `npm install` to begin.');
  });

  it('combined bold + italic', async () => {
    await expectRoundTripStable('Hello ***bold-italic*** world.');
  });

  it('link without title', async () => {
    await expectRoundTripStable('See [the docs](https://example.com).');
  });

  it('link with title', async () => {
    await expectRoundTripStable(
      'See [the docs](https://example.com "Docs site").',
    );
  });

  it('autolink', async () => {
    // tiptap-markdown's `linkify: true` serialises bare URLs as autolinks.
    await expectRoundTripStable(
      'Visit <https://example.com> for details.',
    );
  });

  it('underline (HTML passthrough)', async () => {
    // Underline serialises as inline HTML <u> via tiptap-markdown's html: true.
    await expectRoundTripStable('Hello <u>under</u> world.');
  });

  it('subscript', async () => {
    await expectRoundTripStable('H<sub>2</sub>O is water.');
  });

  it('superscript', async () => {
    await expectRoundTripStable('E = mc<sup>2</sup>.');
  });

  it('highlight without color', async () => {
    await expectRoundTripStable('A <mark>highlighted</mark> phrase.');
  });

  it('highlight with color', async () => {
    await expectRoundTripStable(
      'A <mark style="background-color: #ffeb3b">yellow</mark> phrase.',
    );
  });

  it('text color (HTML passthrough)', async () => {
    // The Color extension stores its colour as a `color` attribute on the
    // text-style mark, which tiptap-markdown serialises (with html: true) as
    // an inline <span style="color: …"> tag. We pin that exact form so
    // future Tiptap upgrades can't quietly switch to a different style key
    // (e.g. CSS custom property) and break stored content.
    // Tiptap normalises the inline style by appending a trailing semicolon,
    // which is the canonical form persisted to storage.
    await expectRoundTripStable(
      'Status: <span style="color: #d32f2f">critical</span>.',
      'Status: <span style="color: #d32f2f;">critical</span>.',
    );
  });
});
