import { describe, it } from 'vitest';
import { expectRoundTripStable } from './roundtrip-harness';

// Block-level constructs: paragraphs, headings, blockquotes, horizontal rules,
// fenced code blocks. These are the most common shapes saved by users so any
// drift here would show up immediately in customer content.

describe('round-trip: block elements', () => {
  it('plain paragraphs', async () => {
    await expectRoundTripStable(
      ['First paragraph.', '', 'Second paragraph.'].join('\n'),
    );
  });

  it.each([1, 2, 3, 4, 5, 6])('heading level %i', async (level) => {
    const md = `${'#'.repeat(level)} Heading ${level}`;
    await expectRoundTripStable(md);
  });

  it('mixed headings and paragraphs', async () => {
    const md = [
      '# Top heading',
      '',
      'Intro paragraph.',
      '',
      '## Sub-heading',
      '',
      'Body paragraph.',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('blockquote — single line', async () => {
    await expectRoundTripStable('> Quoted text.');
  });

  it('blockquote — multiple lines collapse to one paragraph', async () => {
    // Tiptap's blockquote treats consecutive `>` lines as one paragraph (the
    // markdown spec's "lazy continuation" behaviour). Documenting the
    // canonical form here so we notice if it ever changes.
    const md = ['> First line.', '> Second line.'].join('\n');
    await expectRoundTripStable(md, '> First line. Second line.');
  });

  it('blockquote — multiple paragraphs (blank line separated)', async () => {
    const md = ['> First paragraph.', '>', '> Second paragraph.'].join('\n');
    await expectRoundTripStable(md);
  });

  it('horizontal rule', async () => {
    const md = ['Before.', '', '---', '', 'After.'].join('\n');
    await expectRoundTripStable(md);
  });

  it('fenced code block — no language defaults to "text"', async () => {
    // CodeBlockLowlight is configured with `defaultLanguage: 'text'` so
    // unfenced blocks pick up that language on the round-trip.
    const md = ['```', 'console.log("hi");', '```'].join('\n');
    const expected = ['```text', 'console.log("hi");', '```'].join('\n');
    await expectRoundTripStable(md, expected);
  });

  it('fenced code block — with language', async () => {
    const md = [
      '```ts',
      'const greeting: string = "hello";',
      'console.log(greeting);',
      '```',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('fenced code block — preserves indentation inside', async () => {
    const md = [
      '```python',
      'def hello():',
      '    return "world"',
      '```',
    ].join('\n');
    await expectRoundTripStable(md);
  });
});
