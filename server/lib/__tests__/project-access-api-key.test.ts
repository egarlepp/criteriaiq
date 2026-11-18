// @vitest-environment node
//
// Non-admin API keys (role "ApiKey") pass the project edit check: their
// scopes are enforced earlier by checkApiKeyAccess, and they are never
// project members, so without this "Read and write" keys could not write.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../storage", () => ({
  storage: {
    getProjectById: vi.fn(async (id: number) =>
      id === 1 ? { id: 1, primaryEngineerId: "someone", customerUsers: [], additionalAccess: [] } : undefined,
    ),
  },
}));

const { hasProjectEditAccess, hasProjectAccess } = await import("../project-access");

describe("project access for API keys", () => {
  it("lets ApiKey sessions edit and read an existing project", async () => {
    expect(await hasProjectEditAccess("u-key", "ApiKey", null, 1)).toBe(true);
    expect(await hasProjectAccess("u-key", "ApiKey", null, 1)).toBe(true);
  });

  it("still refuses an unknown project", async () => {
    expect(await hasProjectEditAccess("u-key", "ApiKey", null, 99)).toBe(false);
  });

  it("does not change the Customer rule", async () => {
    expect(await hasProjectEditAccess("u-c", "Customer", "c@example.com", 1)).toBe(false);
  });
});
