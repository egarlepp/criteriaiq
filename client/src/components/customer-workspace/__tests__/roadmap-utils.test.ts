import { describe, expect, it } from "vitest";
import { layoutRoadmap, phaseTone, toRoadmapDate } from "../roadmap-utils";

const today = new Date(2026, 10, 9); // Nov 9, 2026

describe("layoutRoadmap", () => {
  it("returns null when nothing has a date", () => {
    expect(layoutRoadmap([{ key: "a", label: "A", segments: [{ key: "s", label: "S", start: null, end: null, tone: "next" }] }], today)).toBeNull();
  });

  it("spans whole months and places bars and today in order", () => {
    const layout = layoutRoadmap(
      [
        {
          key: "p",
          label: "Planning",
          segments: [
            { key: "plan", label: "Planning", start: "2026-09-25", end: "2026-10-09", tone: "done" },
            { key: "impl", label: "Implementation", start: "2026-10-09", end: "2026-11-20", tone: "now" },
          ],
        },
      ],
      today,
    )!;
    expect(layout.months.map((m) => m.date.getMonth())).toEqual([8, 9, 10]);
    expect(layout.months[0].left).toBe(0);
    const [plan, impl] = layout.rows[0].segments;
    expect(plan.left).toBeGreaterThan(0);
    expect(impl.left).toBeGreaterThan(plan.left);
    expect(impl.left + impl.width).toBeLessThanOrEqual(100);
    expect(layout.todayLeft).not.toBeNull();
    expect(layout.todayLeft!).toBeGreaterThan(impl.left);
  });

  it("drops segments whose end is before their start", () => {
    const layout = layoutRoadmap(
      [{ key: "a", label: "A", segments: [
        { key: "ok", label: "ok", start: "2026-10-01", end: "2026-10-05", tone: "next" },
        { key: "bad", label: "bad", start: "2026-10-10", end: "2026-10-01", tone: "next" },
      ] }],
      today,
    )!;
    expect(layout.rows[0].segments.map((s) => s.key)).toEqual(["ok"]);
  });

  it("stretches the range to today when today is just outside it", () => {
    const layout = layoutRoadmap([{ key: "a", label: "A", segments: [{ key: "s", label: "s", start: "2026-12-02", end: "2026-12-20", tone: "next" }] }], today)!;
    expect(layout.months[0].date.getMonth()).toBe(10);
    expect(layout.todayLeft).not.toBeNull();
  });

  it("leaves today out when it is far from the range", () => {
    const layout = layoutRoadmap([{ key: "a", label: "A", segments: [{ key: "s", label: "s", start: "2026-03-01", end: "2026-03-20", tone: "done" }] }], today)!;
    expect(layout.todayLeft).toBeNull();
  });

  it("gives a one-day segment a visible width", () => {
    const layout = layoutRoadmap([{ key: "a", label: "A", segments: [{ key: "s", label: "s", start: "2026-11-01", end: "2026-11-01", tone: "next" }] }], today)!;
    expect(layout.rows[0].segments[0].width).toBeGreaterThan(0);
  });
});

describe("phaseTone", () => {
  it("is done for a complete phase, even when past due", () => {
    expect(phaseTone("complete", "2026-10-01", today)).toBe("done");
    expect(phaseTone("completed", "2026-10-01", today)).toBe("done");
  });
  it("is late for an open phase past its due date", () => {
    expect(phaseTone("in_progress", "2026-11-01", today)).toBe("late");
  });
  it("is now for an active phase and next for one not started", () => {
    expect(phaseTone("in_progress", "2026-11-20", today)).toBe("now");
    expect(phaseTone("not_started", "2026-12-20", today)).toBe("next");
  });
});

describe("toRoadmapDate", () => {
  it("returns null for empty input", () => {
    expect(toRoadmapDate(null)).toBeNull();
    expect(toRoadmapDate("")).toBeNull();
  });
});

describe("layoutRoadmap row badge", () => {
  it("keeps a row's badge", () => {
    const badge = { iconName: "CircleCheck", color: "#16a34a", title: "On Time" };
    const layout = layoutRoadmap(
      [{ key: "p1", label: "P1", badge, segments: [{ key: "s", label: "P1", start: "2026-11-01", end: "2026-12-01", tone: "now" }] }],
      today,
    );
    expect(layout!.rows[0].badge).toEqual(badge);
  });
});
