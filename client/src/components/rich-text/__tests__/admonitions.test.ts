import { describe, it, expect } from 'vitest';
import {
  preprocessAdmonitions,
  postprocessAdmonitions,
} from '../admonitions';

// The pre/post processors are pure string transforms so we can test them in
// isolation without spinning up a Tiptap editor. Each fixture documents one
// of the supported admonition shapes and asserts that:
//   markdown -> html -> markdown
// is a stable identity round-trip.
const roundTrip = (md: string) =>
  postprocessAdmonitions(preprocessAdmonitions(md));

describe('admonition markdown round-trip', () => {
  it('handles the canonical top-level fence', () => {
    const md = [':::note', 'Hello world.', ':::'].join('\n');
    const html = preprocessAdmonitions(md);
    expect(html).toContain('<div data-admonition="note">');
    expect(html).toContain('Hello world.');
    expect(html).toContain('</div>');
    expect(roundTrip(md)).toBe(md);
  });

  it('round-trips every supported admonition type', () => {
    for (const type of ['note', 'tip', 'info', 'warning', 'danger'] as const) {
      const md = [`:::${type}`, `Body for ${type}.`, ':::'].join('\n');
      expect(roundTrip(md)).toBe(md);
    }
  });

  it('tolerates trailing whitespace on the fence lines', () => {
    const md = [':::tip   ', 'Trim me.', ':::  '].join('\n');
    const canonical = [':::tip', 'Trim me.', ':::'].join('\n');
    // Whitespace is normalised on first pass; subsequent round-trips are stable.
    const first = roundTrip(md);
    expect(first).toBe(canonical);
    expect(roundTrip(first)).toBe(canonical);
  });

  it('survives CRLF line endings', () => {
    const md = [':::info', 'Windows line endings.', ':::'].join('\r\n');
    const canonical = [':::info', 'Windows line endings.', ':::'].join('\n');
    expect(roundTrip(md)).toBe(canonical);
  });

  it('handles indented fences and dedents the body', () => {
    const md = [
      '    :::warning',
      '    Indented body.',
      '    :::',
    ].join('\n');
    const html = preprocessAdmonitions(md);
    // Opening div retains the original indentation.
    expect(html).toMatch(/^ {4}<div data-admonition="warning">/m);
    // Body is dedented inside the div so markdown inside parses normally.
    expect(html).toContain('Indented body.');
    expect(roundTrip(md)).toBe(md);
  });

  it('handles fences nested inside a list item', () => {
    const md = [
      '- Step one',
      '',
      '  :::danger',
      '  Watch out!',
      '  :::',
      '',
      '- Step two',
    ].join('\n');
    const html = preprocessAdmonitions(md);
    expect(html).toMatch(/^ {2}<div data-admonition="danger">/m);
    expect(html).toContain('Watch out!');
    expect(roundTrip(md)).toBe(md);
  });

  it('preserves text outside the fences untouched', () => {
    const md = [
      'Intro paragraph.',
      '',
      ':::note',
      'Inside.',
      ':::',
      '',
      'Outro paragraph.',
    ].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('leaves unknown fence types alone', () => {
    const md = [':::custom', 'unknown', ':::'].join('\n');
    expect(preprocessAdmonitions(md)).toBe(md);
    expect(postprocessAdmonitions(md)).toBe(md);
  });

  it('post-processes raw HTML divs back into fences', () => {
    const html = '<div data-admonition="tip">\n\nBe nice.\n\n</div>';
    expect(postprocessAdmonitions(html)).toBe(':::tip\nBe nice.\n:::');
  });

  it('post-processes indented HTML divs back into indented fences', () => {
    const html = [
      '  <div data-admonition="info">',
      '',
      '  Indented note.',
      '',
      '  </div>',
    ].join('\n');
    const expected = [
      '  :::info',
      '  Indented note.',
      '  :::',
    ].join('\n');
    expect(postprocessAdmonitions(html)).toBe(expected);
  });

  it('returns falsy input unchanged', () => {
    expect(preprocessAdmonitions('')).toBe('');
    expect(postprocessAdmonitions('')).toBe('');
  });
});
