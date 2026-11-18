import { describe, it } from 'vitest';
import { expectRoundTripStable } from './roundtrip-harness';

// Lists: bullet, ordered, task, and nested combinations. tiptap-markdown is
// configured with tightLists + bulletListMarker: '-' so the canonical form
// uses '-' for bullets and tight (no blank line) layout.

describe('round-trip: lists', () => {
  it('bullet list — flat', async () => {
    const md = ['- First', '- Second', '- Third'].join('\n');
    await expectRoundTripStable(md);
  });

  it('ordered list — flat', async () => {
    const md = ['1. First', '2. Second', '3. Third'].join('\n');
    await expectRoundTripStable(md);
  });

  it('task list — unchecked and checked (loose canonical form)', async () => {
    // tiptap-markdown serialises task lists in loose form (blank line between
    // items) regardless of the input. Documenting the canonical output so we
    // notice if the serializer ever changes.
    const md = ['- [ ] Todo item', '- [x] Done item'].join('\n');
    const expected = ['- [ ] Todo item', '', '- [x] Done item'].join('\n');
    await expectRoundTripStable(md, expected);
  });

  it('bullet list — nested', async () => {
    const md = [
      '- Parent',
      '  - Child',
      '  - Another child',
      '- Sibling',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('ordered list — nested under bullet', async () => {
    const md = [
      '- Parent bullet',
      '  1. Nested ordered one',
      '  2. Nested ordered two',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('list items with inline marks', async () => {
    const md = [
      '- **Bold** item',
      '- *Italic* item',
      '- Item with [a link](https://example.com)',
    ].join('\n');
    await expectRoundTripStable(md);
  });

  it('task list with mixed nesting (loose canonical form)', async () => {
    const md = [
      '- [ ] Top todo',
      '  - [x] Done sub-task',
      '  - [ ] Pending sub-task',
    ].join('\n');
    // Same loose-form canonicalisation as the flat task list above. The
    // nested items also pick up the loose layout.
    const expected = [
      '- [ ] Top todo',
      '',
      '  - [x] Done sub-task',
      '',
      '  - [ ] Pending sub-task',
    ].join('\n');
    await expectRoundTripStable(md, expected);
  });
});
