import { describe, expect, it } from "vitest";
import { isMapItemComplete, mapItemStatusSchema, mapItemUpdateSchema, withCompletionDate } from "../map-status";

describe("MAP item status", () => {
  it("counts both spellings of complete as done", () => {
    expect(isMapItemComplete("complete")).toBe(true);
    expect(isMapItemComplete("completed")).toBe(true);
    expect(isMapItemComplete("in_progress")).toBe(false);
    expect(isMapItemComplete(null)).toBe(false);
  });

  it("accepts every status the MAP screens offer and saves the old spelling as complete", () => {
    for (const status of ["not_started", "in_progress", "blocked", "complete", "deferred", "stalled", "at_risk", "cancelled"]) {
      expect(mapItemStatusSchema.parse(status)).toBe(status);
    }
    expect(mapItemStatusSchema.parse("completed")).toBe("complete");
    expect(mapItemStatusSchema.safeParse("done").success).toBe(false);
  });
});

describe("MAP item updates", () => {
  const now = new Date("2026-11-02T10:00:00.000Z");

  it("accepts the additional internal assignment", () => {
    expect(mapItemUpdateSchema.parse({ additionalInternalUserId: "user_1" })).toEqual({ additionalInternalUserId: "user_1" });
    expect(mapItemUpdateSchema.parse({ additionalInternalUserId: null })).toEqual({ additionalInternalUserId: null });
  });

  it("accepts Our team as a positive team id or null", () => {
    expect(mapItemUpdateSchema.safeParse({ assignedToTeamId: 4 }).success).toBe(true);
    expect(mapItemUpdateSchema.safeParse({ assignedToTeamId: null }).success).toBe(true);
    expect(mapItemUpdateSchema.safeParse({ assignedToTeamId: "4" }).success).toBe(false);
    expect(mapItemUpdateSchema.safeParse({ assignedToTeamId: 0 }).success).toBe(false);
  });

  it("rejects a blank name and an unknown status", () => {
    expect(mapItemUpdateSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(mapItemUpdateSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("stamps the completed date when an item is finished", () => {
    expect(withCompletionDate({ status: "in_progress" }, { status: "complete" }, now)).toEqual({
      status: "complete",
      completedDate: now.toISOString(),
    });
  });

  it("stamps the end date when an item is cancelled, and clears it when reopened", () => {
    expect(withCompletionDate({ status: "in_progress" }, { status: "cancelled" }, now)).toEqual({
      status: "cancelled",
      completedDate: now.toISOString(),
    });
    expect(withCompletionDate({ status: "cancelled" }, { status: "in_progress" }, now)).toEqual({
      status: "in_progress",
      completedDate: null,
    });
    expect(withCompletionDate({ status: "complete" }, { status: "cancelled" }, now)).toEqual({ status: "cancelled" });
  });

  it("stamps the start date when work leaves Not Started", () => {
    // No start yet, or only a planned future one: start today.
    expect(withCompletionDate({ status: "not_started", startDate: null }, { status: "in_progress" }, now)).toEqual({
      status: "in_progress",
      startDate: now.toISOString(),
    });
    expect(
      withCompletionDate({ status: "not_started", startDate: new Date("2026-11-22T12:00:00.000Z") }, { status: "complete" }, now),
    ).toEqual({ status: "complete", completedDate: now.toISOString(), startDate: now.toISOString() });
    // An earlier start is kept, and a start sent with the request wins.
    expect(withCompletionDate({ status: "not_started", startDate: "2026-10-20T12:00:00.000Z" }, { status: "in_progress" }, now)).toEqual({
      status: "in_progress",
    });
    expect(
      withCompletionDate({ status: "not_started" }, { status: "in_progress", startDate: "2026-10-01T00:00:00.000Z" }, now),
    ).toEqual({ status: "in_progress", startDate: "2026-10-01T00:00:00.000Z" });
    // Moving between started statuses doesn't touch it.
    expect(withCompletionDate({ status: "in_progress", startDate: null }, { status: "blocked" }, now)).toEqual({ status: "blocked" });
  });

  it("clears the completed date when an item is reopened", () => {
    expect(withCompletionDate({ status: "completed" }, { status: "in_progress" }, now)).toEqual({
      status: "in_progress",
      completedDate: null,
    });
  });

  it("leaves dates alone when the status doesn't cross complete or the request sets the date", () => {
    expect(withCompletionDate({ status: "complete" }, { status: "complete" }, now)).toEqual({ status: "complete" });
    expect(withCompletionDate({ status: "in_progress" }, { status: "blocked" }, now)).toEqual({ status: "blocked" });
    expect(withCompletionDate({ status: "in_progress" }, { status: "complete", completedDate: null }, now)).toEqual({
      status: "complete",
      completedDate: null,
    });
    expect(withCompletionDate({ status: "not_started" }, { name: "x" }, now)).toEqual({ name: "x" });
  });
});
