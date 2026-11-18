import { describe, it, expect } from "vitest";
import {
  API_KEY_SCOPE_PRESETS,
  ISSUABLE_API_KEY_SCOPES,
  checkApiKeyAccess,
  resolveRequiredScope,
  resolveScopesForNewKey,
} from "../apiKeyScopes";

describe("resolveRequiredScope", () => {
  it("maps reads and writes to the area's scope", () => {
    expect(resolveRequiredScope("GET", "/api/projects")).toBe("projects:read");
    expect(resolveRequiredScope("PATCH", "/api/projects/42")).toBe("projects:write");
    expect(resolveRequiredScope("GET", "/api/map/projects/7/tasks")).toBe("map:read");
    expect(resolveRequiredScope("POST", "/api/success-criteria")).toBe("validation:write");
  });

  it("does not treat a shared prefix as a match", () => {
    // /api/mapping is not /api/map
    expect(resolveRequiredScope("GET", "/api/mapping")).toBeNull();
  });

  it("returns null for writes on read-only areas", () => {
    expect(resolveRequiredScope("GET", "/api/users")).toBe("users:read");
    expect(resolveRequiredScope("POST", "/api/users")).toBeNull();
  });

  it("uses fixed scopes for the trigger bridge and MCP", () => {
    expect(resolveRequiredScope("POST", "/api/n8n/trigger")).toBe("automation:execute");
    expect(resolveRequiredScope("POST", "/api/mcp")).toBe("mcp:read");
  });

  it("ignores query strings and trailing slashes", () => {
    expect(resolveRequiredScope("GET", "/api/customers/?page=2")).toBe("customers:read");
  });
});

describe("checkApiKeyAccess", () => {
  it("refuses identity and secret surfaces even for legacy admin keys", () => {
    for (const [method, path] of [
      ["POST", "/api/admin/api-keys"],
      ["GET", "/api/admin/api-keys"],
      ["POST", "/api/system/secrets/reveal"],
      ["PUT", "/api/users/abc"],
      ["POST", "/api/roles"],
      ["POST", "/api/admin/sso/config"],
      ["POST", "/api/admin/users/abc/mfa/reset"],
      ["PUT", "/api/admin/n8n/config"],
      ["PUT", "/api/admin/rate-limit"],
    ] as const) {
      expect(checkApiKeyAccess(["admin"], method, path).allowed).toBe(false);
    }
  });

  it("keeps legacy admin keys working elsewhere", () => {
    expect(checkApiKeyAccess(["admin"], "GET", "/api/dashboard/stats").allowed).toBe(true);
    expect(checkApiKeyAccess(["admin"], "GET", "/api/users").allowed).toBe(true);
    expect(checkApiKeyAccess(["admin"], "GET", "/api/admin/n8n/workflows").allowed).toBe(true);
  });

  it("denies unmapped paths for scoped keys", () => {
    const decision = checkApiKeyAccess(["projects:read"], "GET", "/api/dashboard/stats");
    expect(decision.allowed).toBe(false);
  });

  it("requires the matching scope", () => {
    expect(checkApiKeyAccess(["projects:read"], "GET", "/api/projects").allowed).toBe(true);
    const write = checkApiKeyAccess(["projects:read"], "POST", "/api/projects");
    expect(write).toEqual({ allowed: false, message: "API key missing required scope: projects:write" });
  });

  it("lets the automation preset fire triggers and nothing else", () => {
    const scopes = [...API_KEY_SCOPE_PRESETS.automation];
    expect(checkApiKeyAccess(scopes, "POST", "/api/n8n/trigger").allowed).toBe(true);
    expect(checkApiKeyAccess(scopes, "GET", "/api/projects").allowed).toBe(false);
  });
});

describe("resolveScopesForNewKey", () => {
  it("expands presets", () => {
    const result = resolveScopesForNewKey({ preset: "read-only" });
    expect(result).toEqual({ ok: true, scopes: [...API_KEY_SCOPE_PRESETS["read-only"]] });
  });

  it("rejects the retired admin scope and unknown scopes", () => {
    expect(resolveScopesForNewKey({ scopes: ["admin"] }).ok).toBe(false);
    expect(resolveScopesForNewKey({ scopes: ["projects:delete"] }).ok).toBe(false);
    expect(resolveScopesForNewKey({ preset: "superuser" }).ok).toBe(false);
  });

  it("requires a preset or scopes", () => {
    expect(resolveScopesForNewKey({}).ok).toBe(false);
    expect(resolveScopesForNewKey({ scopes: [] }).ok).toBe(false);
  });

  it("accepts explicit issuable scopes, including MCP keys", () => {
    expect(resolveScopesForNewKey({ scopes: ["mcp:read"] })).toEqual({ ok: true, scopes: ["mcp:read"] });
    expect(ISSUABLE_API_KEY_SCOPES).not.toContain("admin");
  });
});
