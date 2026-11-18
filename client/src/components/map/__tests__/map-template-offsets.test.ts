import { describe, expect, it } from "vitest";
import { absoluteOffsets, parseOffsetInput, readOffsets } from "../map-template-offset-fields";
import { templateOffset } from "../../../../../server/routes/map-templates-routes";

describe("MAP template offsets", () => {
  it("reads missing offsets as start 0, due 7 and keeps 0", () => {
    expect(readOffsets({})).toEqual({ start: 0, due: 7 });
    expect(readOffsets({ defaultStartOffsetDays: 2, defaultDueOffsetDays: 0 })).toEqual({ start: 2, due: 0 });
  });

  it("parses inputs to whole non-negative numbers", () => {
    expect(parseOffsetInput("3")).toBe(3);
    expect(parseOffsetInput("2.7")).toBe(2);
    expect(parseOffsetInput("-4")).toBe(0);
    expect(parseOffsetInput("")).toBe(0);
  });

  it("adds a parent's start to the item's offsets, never due before start", () => {
    expect(absoluteOffsets(0, { defaultStartOffsetDays: 2, defaultDueOffsetDays: 5 })).toEqual({ start: 2, due: 5 });
    expect(absoluteOffsets(4, { defaultStartOffsetDays: 1, defaultDueOffsetDays: 3 })).toEqual({ start: 5, due: 7 });
    expect(absoluteOffsets(4, { defaultStartOffsetDays: 3, defaultDueOffsetDays: 1 })).toEqual({ start: 7, due: 7 });
  });

  it("saves 0 as 0 on the server instead of the default", () => {
    expect(templateOffset(0, 7)).toBe(0);
    expect(templateOffset(undefined, 7)).toBe(7);
    expect(templateOffset(null, 0)).toBe(0);
    expect(templateOffset("5", 7)).toBe(5);
    expect(templateOffset(-2, 7)).toBe(0);
    expect(templateOffset("abc", 7)).toBe(7);
  });
});
