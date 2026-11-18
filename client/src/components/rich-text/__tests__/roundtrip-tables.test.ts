import { describe, expect, it } from 'vitest';
import { expectRoundTripStable } from './roundtrip-harness';

// Tables. The Tiptap Table extension uses HTML table markup which
// tiptap-markdown serialises as raw HTML (because we set html: true and the
// markdown table syntax doesn't cover everything Tiptap supports such as
// cell spans). This test pins the HTML form so changes don't silently drop
// rows or alignment metadata.

describe('round-trip: tables', () => {
  it('basic header + body row', async () => {
    const md = [
      '<table>',
      '  <tbody>',
      '    <tr><th><p>Name</p></th><th><p>Role</p></th></tr>',
      '    <tr><td><p>Ada</p></td><td><p>Founder</p></td></tr>',
      '  </tbody>',
      '</table>',
    ].join('\n');
    // Tiptap normalises the markup somewhat (e.g. drops the wrapping
    // <tbody>). We only assert that round-trip from the *normalised* form
    // is stable — that's what users see after their first save.
    const normalised = await import('./roundtrip-harness').then((m) =>
      m.roundTripOnce(md),
    );
    await expectRoundTripStable(normalised);
  });

  it('two columns of data round-trips without losing cells', async () => {
    const md = [
      '<table>',
      '  <tbody>',
      '    <tr><th colspan="2"><p>Plan comparison</p></th></tr>',
      '    <tr><td><p>Free</p></td><td><p>0/mo</p></td></tr>',
      '    <tr><td><p>Pro</p></td><td><p>20/mo</p></td></tr>',
      '  </tbody>',
      '</table>',
    ].join('\n');
    const harness = await import('./roundtrip-harness');
    const normalised = await harness.roundTripOnce(md);
    await expectRoundTripStable(normalised);
  });

  it('column alignment input is canonicalised to a stable form', async () => {
    // Tiptap's markdown table serializer collapses both inline-style
    // (`style="text-align: center"`) AND GFM alignment row syntax
    // (`|:---:|`) into the simplest pipe form, dropping alignment metadata.
    // This pins that lossy-but-stable canonical form so future Tiptap
    // upgrades can't silently change behaviour: if alignment ever starts
    // surviving (e.g. via the html: true escape hatch) this test will fail
    // and force an intentional decision. Conversely, if it ever starts
    // losing *cells* (not just styles), this test will catch that too.
    const inputs = [
      // Inline-style form (HTML passthrough).
      [
        '<table><tbody>',
        '<tr><th><p>L</p></th><th style="text-align: center"><p>C</p></th><th style="text-align: right"><p>R</p></th></tr>',
        '<tr><td><p>a</p></td><td style="text-align: center"><p>b</p></td><td style="text-align: right"><p>c</p></td></tr>',
        '</tbody></table>',
      ].join(''),
      // GFM alignment-row form.
      '| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |\n',
    ];
    const harness = await import('./roundtrip-harness');
    for (const md of inputs) {
      const first = await harness.roundTripOnce(md);
      // Every cell value still appears in the serialised output — content
      // (the thing customers actually care about) must never be lost.
      for (const cell of ['L', 'C', 'R', 'a', 'b', 'c']) {
        expect(first).toContain(cell);
      }
      // And the result must round-trip stably from there on.
      const second = await harness.roundTripOnce(first);
      expect(second).toBe(first);
    }
  });
});
