import { describe, expect, it } from "vitest";
import { getAccountSelectionMode } from "../create-user-utils";

describe("getAccountSelectionMode", () => {
  it("gives Customer and Guest a single account and Partner several", () => {
    expect(getAccountSelectionMode("Customer")).toBe("single");
    expect(getAccountSelectionMode("Guest")).toBe("single");
    expect(getAccountSelectionMode("Partner")).toBe("multi");
  });

  it("treats Admin and every other role as internal staff", () => {
    expect(getAccountSelectionMode("Admin")).toBe("all");
    expect(getAccountSelectionMode("Engineer")).toBe("all");
    expect(getAccountSelectionMode("Custom Ops")).toBe("all");
  });

  it("asks for an account until a role is picked", () => {
    expect(getAccountSelectionMode("")).toBe("single");
  });
});
