// @vitest-environment node
//
// The project list filter and GET /api/projects/:id decide whether an outside
// user is listed on a project. storage.getPoc returns customerUsers /
// additionalAccess enriched as user rows ({id, email, permission}); the stored
// form is {userId, userEmail?, permission}. Both shapes must match, emails
// case-insensitively, and an entry with no email must never match a user whose
// email is unknown.

import { describe, expect, it } from "vitest";
import { filterProjectsForViewer, findProjectAccessEntry, isListedOnProject } from "../project-list-access";

const enriched = {
  id: 1,
  primaryEngineerId: "eng",
  customerUsers: [{ id: "cust-1", email: "Jenny@Customer.com", permission: "View" }],
  additionalAccess: [{ id: "partner-1", email: "p@partner.com", permission: "Edit" }],
};

const stored = {
  id: 2,
  primaryEngineerId: "eng",
  customerUsers: [{ userId: "cust-2", userEmail: "sam@customer.com", permission: "View" }],
  additionalAccess: [{ userId: "guest-2", permission: "View" }],
};

const emailless = {
  id: 3,
  primaryEngineerId: "eng",
  customerUsers: [{ userId: "someone-else", permission: "Edit" }],
  additionalAccess: [{ id: "someone-else-2" }],
};

describe("findProjectAccessEntry", () => {
  it("matches the enriched {id, email} shape by id", () => {
    expect(findProjectAccessEntry(enriched.customerUsers, "cust-1", null)?.permission).toBe("View");
  });

  it("matches the enriched shape by email, ignoring case and spaces", () => {
    expect(findProjectAccessEntry(enriched.customerUsers, "other-id", " jenny@customer.COM ")).toBeDefined();
  });

  it("matches the stored {userId, userEmail} shape", () => {
    expect(findProjectAccessEntry(stored.customerUsers, "cust-2", null)).toBeDefined();
    expect(findProjectAccessEntry(stored.customerUsers, "x", "SAM@customer.com")).toBeDefined();
  });

  it("never matches on a missing email", () => {
    expect(findProjectAccessEntry(emailless.customerUsers, "me", undefined)).toBeUndefined();
    expect(findProjectAccessEntry(emailless.additionalAccess, "me", null)).toBeUndefined();
    expect(findProjectAccessEntry(emailless.customerUsers, "me", "")).toBeUndefined();
  });

  it("ignores non-arrays and junk entries", () => {
    expect(findProjectAccessEntry(null, "me", "me@x.com")).toBeUndefined();
    expect(findProjectAccessEntry({ id: "me" }, "me", null)).toBeUndefined();
    expect(findProjectAccessEntry([null, 7, "me"], "me", null)).toBeUndefined();
  });

  it("does not match an empty user id against entries missing an id", () => {
    expect(findProjectAccessEntry([{ email: "a@b.com" }], "", null)).toBeUndefined();
  });
});

describe("isListedOnProject", () => {
  it("checks both customerUsers and additionalAccess", () => {
    expect(isListedOnProject(enriched, "cust-1", null)).toBe(true);
    expect(isListedOnProject(enriched, "partner-1", null)).toBe(true);
    expect(isListedOnProject(stored, "guest-2", null)).toBe(true);
    expect(isListedOnProject(enriched, "stranger", "stranger@x.com")).toBe(false);
  });
});

describe("filterProjectsForViewer", () => {
  const all = [enriched, stored, emailless];

  it("shows a customer the projects that list them in either shape", () => {
    expect(filterProjectsForViewer(all, "cust-1", "Customer", "jenny@customer.com").map((p) => p.id)).toEqual([1]);
    expect(filterProjectsForViewer(all, "cust-2", "Customer", "sam@customer.com").map((p) => p.id)).toEqual([2]);
  });

  it("does not leak email-less entries to a user without an email", () => {
    expect(filterProjectsForViewer(all, "nobody", "Guest", undefined)).toEqual([]);
  });

  it("still shows assigned engineers their projects and leaves internal roles unfiltered", () => {
    expect(filterProjectsForViewer(all, "eng", "Sales", "eng@co.com")).toHaveLength(3);
    expect(filterProjectsForViewer(all, "anyone", "Admin", null)).toHaveLength(3);
  });
});
