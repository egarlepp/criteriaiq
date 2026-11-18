import { describe, expect, it } from "vitest";
import { sortRows } from "../sorting";

// The sort key comes from the page URL, so a key naming an
// Object.prototype member must never be called as an accessor.
describe("sortRows with a key from the URL", () => {
  const rows = [{ name: "b" }, { name: "a" }];

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "ignores the inherited %s member",
    (key) => {
      expect(() => sortRows(rows, { key, direction: "asc" }, { name: (r) => r.name })).not.toThrow();
    },
  );

  it("still uses the table's own accessor", () => {
    const sorted = sortRows(rows, { key: "name", direction: "asc" }, { name: (r) => r.name });
    expect(sorted.map((r) => r.name)).toEqual(["a", "b"]);
  });
});
