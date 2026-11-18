// Locks how scripts/version-patch.mjs turns a merge commit into an interim
// update row (shown by the sidebar version link and About → Introduction).
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script with no type declarations
import { CATEGORIES, categorizeUpdate, describeCommit } from "./version-patch.mjs";
import { UPDATE_CATEGORIES } from "../shared/version-updates";

describe("describeCommit", () => {
  it("uses the PR title from a GitHub merge commit body", () => {
    expect(
      describeCommit(
        "Merge pull request #368 from egarlepp/claude/project-thread-a6v8qe",
        "Per-user Outlook sign-in on Profile Settings › Integrations\n",
      ),
    ).toEqual({ pr: 368, title: "Per-user Outlook sign-in on Profile Settings › Integrations" });
  });

  it("falls back to the subject when a merge commit has no body", () => {
    expect(describeCommit("Merge pull request #5 from o/b", "")).toEqual({
      pr: 5,
      title: "Merge pull request #5 from o/b",
    });
  });

  it("strips the (#N) suffix from a squash-merge subject", () => {
    expect(describeCommit("Fix Safari export button (#412)", "* wip\n* more")).toEqual({
      pr: 412,
      title: "Fix Safari export button",
    });
  });

  it("keeps a direct commit's subject with no PR number", () => {
    expect(describeCommit("chore(docs): refresh doc dates", "")).toEqual({
      pr: null,
      title: "chore(docs): refresh doc dates",
    });
  });

  it("clips very long titles", () => {
    const { title } = describeCommit("x".repeat(500), "");
    expect(title.length).toBe(200);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("categorizeUpdate", () => {
  const c = (subject: string, body = "") => ({ subject, body });

  it("keeps the same categories, in the same order, as shared/version-updates.ts", () => {
    expect(CATEGORIES).toEqual([...UPDATE_CATEGORIES]);
  });

  it("uses a Release-Category trailer first, newest commit winning", () => {
    expect(
      categorizeUpdate("Fix the export button", [
        c("feat(x): one", "Release-Category: feature"),
        c("fix(x): two", "Details.\n\nRelease-Category: Security\n"),
      ]),
    ).toEqual({ category: "security", title: "Fix the export button" });
  });

  it("takes a [Category] tag from the PR title and removes it from the shown title", () => {
    expect(categorizeUpdate("[Security] Accounts need edit access to archive", [c("feat: x")])).toEqual({
      category: "security",
      title: "Accounts need edit access to archive",
    });
    expect(categorizeUpdate("Teams page tidy-up [fix]", [])).toEqual({ category: "fix", title: "Teams page tidy-up" });
  });

  it("files dependency updates under Security", () => {
    expect(
      categorizeUpdate(
        "chore(deps): Bump vite from 8.0.1 to 8.0.2",
        [c("chore(deps): Bump vite from 8.0.1 to 8.0.2")],
        "Merge pull request #9 from egarlepp/dependabot/npm_and_yarn/vite-8.0.2",
      ).category,
    ).toBe("security");
  });

  it("files security words in the title under Security", () => {
    expect(categorizeUpdate("Harden CSRF checks on webhook routes", [c("feat(webhooks): x")]).category).toBe("security");
  });

  it("treats a title starting with Fix, even after an Area: label, as a Fix", () => {
    expect(categorizeUpdate("Fix MAP drawer crashing", [c("feat: x")]).category).toBe("fix");
    expect(categorizeUpdate("Manage Projects: fix sorting by date", [c("feat: x")]).category).toBe("fix");
  });

  it("uses the first real commit's conventional type, skipping docs and chore commits", () => {
    expect(categorizeUpdate("Teams page", [c("docs: refresh doc dates"), c("feat(teams): add Teams")]).category).toBe("feature");
    expect(categorizeUpdate("Templates save everything", [c("fix(templates): save every feature")]).category).toBe("fix");
    expect(categorizeUpdate("Faster board", [c("perf(board): cache columns")]).category).toBe("improvement");
    expect(categorizeUpdate("Reports are staff only", [c("fix(security): reports")]).category).toBe("security");
  });

  it("reads a plain first commit that starts with Add as a New Feature", () => {
    expect(categorizeUpdate("ImpactIQ setup steps", [c("Add ImpactIQ setup steps to the card")]).category).toBe("feature");
  });

  it("falls back to Improvements", () => {
    expect(categorizeUpdate("Hide Evaluation Requests on internal accounts", [c("Hide Evaluation Requests")]).category).toBe(
      "improvement",
    );
    expect(categorizeUpdate("Something", []).category).toBe("improvement");
  });
});
