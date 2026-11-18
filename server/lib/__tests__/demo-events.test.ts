import { describe, it, expect } from "vitest";
import { buildDemoEventViews, demoEventPerson, parseDemoEventData } from "../demo-events";

describe("parseDemoEventData", () => {
  it("reads target, counts and wiped", () => {
    const data = parseDemoEventData(JSON.stringify({
      targetUserId: "u2",
      counts: { customers: 10, projects: 50, bogus: "x" },
      wiped: { projects: 12 },
    }));
    expect(data).toEqual({ targetUserId: "u2", counts: { customers: 10, projects: 50 }, wiped: { projects: 12 } });
  });

  it("gives {} for empty, non-JSON or non-object details", () => {
    expect(parseDemoEventData(null)).toEqual({});
    expect(parseDemoEventData("Seeded demo data: {}")).toEqual({});
    expect(parseDemoEventData("[1,2]")).toEqual({});
    expect(parseDemoEventData(JSON.stringify({ counts: {} }))).toEqual({});
  });
});

describe("demoEventPerson", () => {
  it("uses the full name, else the email, else the id", () => {
    expect(demoEventPerson({ id: "a", firstName: "Elena", lastName: "Sokolova", email: "e@x.test" }).name).toBe("Elena Sokolova");
    expect(demoEventPerson({ id: "a", firstName: " ", lastName: null, email: "e@x.test" }).name).toBe("e@x.test");
    expect(demoEventPerson({ id: "a", firstName: null, lastName: null, email: null }).name).toBe("a");
  });
});

describe("buildDemoEventViews", () => {
  const people = new Map([
    ["admin", { id: "admin", name: "Ada Admin", email: "ada@x.test" }],
    ["u2", { id: "u2", name: "Ben Brown", email: "ben@x.test" }],
  ]);

  it("names the actor and the target and passes the counts through", () => {
    const createdAt = new Date("2026-11-17T19:48:42.781Z");
    const [userEvent, reseed] = buildDemoEventViews([
      { id: 2, userId: "admin", action: "demo_user_enter", details: JSON.stringify({ targetUserId: "u2" }), createdAt },
      { id: 1, userId: "admin", action: "demo_reseed", details: JSON.stringify({ counts: { projects: 50 }, wiped: { projects: 12 } }), createdAt },
    ], people);
    expect(userEvent).toMatchObject({
      action: "demo_user_enter",
      createdAt: "2026-11-17T19:48:42.781Z",
      actor: { name: "Ada Admin" },
      target: { name: "Ben Brown" },
      counts: null,
      wiped: null,
    });
    expect(reseed).toMatchObject({ target: null, counts: { projects: 50 }, wiped: { projects: 12 } });
  });

  it("keeps an id when its person is gone, and null when there is none", () => {
    const [row] = buildDemoEventViews([
      { id: 3, userId: null, action: "demo_user_exit", details: JSON.stringify({ targetUserId: "gone" }), createdAt: null },
    ], people);
    expect(row.actor).toBeNull();
    expect(row.target).toEqual({ id: "gone", name: "gone", email: null });
    expect(row.createdAt).toBeNull();
  });
});
