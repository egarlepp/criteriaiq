// @vitest-environment node
//
// Okta SSO + Azure SSO provider rules in server/auth/oidcAuth.ts: which
// identity the callback trusts, which tenant and redirect URI values the
// admin form accepts, and which issuer URLs discovery tries. These are
// the security-relevant decisions; the OIDC exchange itself is
// openid-client's job.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SsoConfig } from "@shared/schema";

// oidcAuth imports storage → db, and simpleAuth → email. None of it runs
// in these pure helpers, so stub the modules that would open connections.
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../db-bootstrap", () => ({}));
vi.mock("../../email/email", () => ({ sendWelcomeEmail: vi.fn() }));

const { readIdentity, validateIssuerSource, validateRedirectUri, issuerCandidates, checkTeamMapping, syncTeamsFromGroups } =
  await import("../oidcAuth");
const { storage } = (await import("../../storage")) as unknown as { storage: Record<string, unknown> };

type SaveBody = Parameters<typeof validateIssuerSource>[1];

describe("readIdentity", () => {
  it("Okta trusts sub and requires email_verified === true", () => {
    expect(readIdentity("okta", { sub: "00u1", email: "A@Acme.com", email_verified: true })).toEqual({
      externalId: "00u1",
      email: "a@acme.com",
      emailVerified: true,
    });
    expect(readIdentity("okta", { sub: "00u1", email: "a@acme.com" }).emailVerified).toBe(false);
    expect(readIdentity("okta", { sub: "00u1", email: "a@acme.com", email_verified: "true" }).emailVerified).toBe(false);
  });

  it("Azure keys the user by oid, not the per-app sub", () => {
    const id = readIdentity("azure", { sub: "per-app", oid: "tenant-wide", preferred_username: "a@acme.com" });
    expect(id.externalId).toBe("tenant-wide");
  });

  it("Azure treats a member's UPN as verified when it is the email", () => {
    expect(readIdentity("azure", { oid: "o", preferred_username: "A@acme.com" })).toMatchObject({
      email: "a@acme.com",
      emailVerified: true,
    });
  });

  it("Azure does not trust a guest UPN or an email that differs from the UPN", () => {
    expect(
      readIdentity("azure", { oid: "o", preferred_username: "a_gmail.com#EXT#@acme.onmicrosoft.com" }).emailVerified,
    ).toBe(false);
    expect(
      readIdentity("azure", { oid: "o", preferred_username: "a@acme.com", email: "ceo@acme.com" }).emailVerified,
    ).toBe(false);
  });

  it("Azure accepts an explicit verified-domain claim", () => {
    expect(
      readIdentity("azure", { oid: "o", preferred_username: "a@acme.com", email: "a@other.com", xms_edov: true })
        .emailVerified,
    ).toBe(true);
  });
});

describe("validateIssuerSource", () => {
  it("refuses Azure multi-tenant endpoints", () => {
    for (const tenantId of ["common", "Organizations", "consumers"]) {
      expect(validateIssuerSource("azure", { provider: "azure", tenantId } as SaveBody)).not.toBeNull();
    }
  });

  it("accepts a tenant GUID or a domain, and refuses path characters", () => {
    expect(
      validateIssuerSource("azure", { provider: "azure", tenantId: "8f1c2d3e-0000-4a5b-9c8d-123456789abc" } as SaveBody),
    ).toBeNull();
    expect(validateIssuerSource("azure", { provider: "azure", tenantId: "acme.onmicrosoft.com" } as SaveBody)).toBeNull();
    expect(validateIssuerSource("azure", { provider: "azure", tenantId: "acme/../common" } as SaveBody)).not.toBeNull();
  });

  it("requires https for the Okta domain", () => {
    expect(validateIssuerSource("okta", { provider: "okta", issuerUrl: "acme.okta.com" } as SaveBody)).toBeNull();
    expect(validateIssuerSource("okta", { provider: "okta", issuerUrl: "http://acme.okta.com" } as SaveBody)).not.toBeNull();
  });
});

describe("validateRedirectUri", () => {
  it("requires https and the provider's own callback path", () => {
    expect(validateRedirectUri("okta", "https://app.example.com/api/auth/sso/callback")).toBeNull();
    expect(validateRedirectUri("azure", "https://app.example.com/api/auth/sso/azure/callback")).toBeNull();
    expect(validateRedirectUri("azure", "https://app.example.com/api/auth/sso/callback")).not.toBeNull();
    expect(validateRedirectUri("okta", "http://app.example.com/api/auth/sso/callback")).not.toBeNull();
    expect(validateRedirectUri("okta", "https://app.example.com/api/auth/sso/callback?next=/x")).not.toBeNull();
  });

  it("allows plain http only for localhost", () => {
    expect(validateRedirectUri("okta", "http://localhost:5000/api/auth/sso/callback")).toBeNull();
  });
});

describe("issuerCandidates", () => {
  afterEach(() => vi.unstubAllGlobals());

  const row = (over: Partial<SsoConfig>) => ({ provider: "okta", issuerUrl: null, tenantId: null, ...over }) as SsoConfig;

  it("Okta bare domain tries the org server, then /oauth2/default", async () => {
    const urls = await issuerCandidates(row({ issuerUrl: "acme.okta.com/" }));
    expect(urls.map(String)).toEqual(["https://acme.okta.com/", "https://acme.okta.com/oauth2/default"]);
  });

  it("Okta custom authorization server is used as-is", async () => {
    const urls = await issuerCandidates(row({ issuerUrl: "https://acme.okta.com/oauth2/aus1" }));
    expect(urls.map(String)).toEqual(["https://acme.okta.com/oauth2/aus1"]);
  });

  it("Azure GUID tenant maps straight to the v2.0 issuer without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const guid = "8f1c2d3e-0000-4a5b-9c8d-123456789abc";
    const urls = await issuerCandidates(row({ provider: "azure", tenantId: guid }));
    expect(urls.map(String)).toEqual([`https://login.microsoftonline.com/${guid}/v2.0`]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Azure domain tenant resolves to the GUID issuer and rejects a foreign issuer", async () => {
    const guidIssuer = "https://login.microsoftonline.com/8f1c2d3e-0000-4a5b-9c8d-123456789abc/v2.0";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ issuer: guidIssuer }))));
    const urls = await issuerCandidates(row({ provider: "azure", tenantId: "acme.com" }));
    expect(urls.map(String)).toEqual([guidIssuer]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ issuer: "https://evil.example/v2.0" }))));
    await expect(issuerCandidates(row({ provider: "azure", tenantId: "acme.com" }))).rejects.toThrow();
  });
});

describe("SSO Group → Team table", () => {
  const teams = [
    { id: 1, name: "SE", isActive: true, members: [], subteams: [{ id: 11 }] },
    { id: 2, name: "Channel", isActive: true, members: [], subteams: [] },
  ];

  afterEach(() => {
    delete storage.listTeams;
    delete storage.syncSourcedTeams;
  });

  it("refuses unknown teams and subteams from another team", async () => {
    storage.listTeams = vi.fn(async () => teams);
    expect(await checkTeamMapping([{ group: "g", teamId: 1, subteamId: 11 }])).toBeNull();
    expect(await checkTeamMapping([{ group: "g", teamId: 9, subteamId: null }])).toMatch(/Unknown team/);
    expect(await checkTeamMapping([{ group: "g", teamId: 2, subteamId: 11 }])).toMatch(/not part of Channel/);
  });

  it("syncs the mapped teams as SSO places, removing stale ones", async () => {
    const sync = vi.fn(async () => ({ added: 1, removed: 0 }));
    storage.syncSourcedTeams = sync;
    await syncTeamsFromGroups("okta", "u1", ["SE-North", "x"], [{ group: "SE-North", teamId: 1, subteamId: 11 }]);
    expect(sync).toHaveBeenCalledWith("u1", "sso", { teamIds: [1], subteamIds: [11] }, { removeStale: true });
  });

  it("never fails the sign-in when the sync throws", async () => {
    storage.syncSourcedTeams = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(syncTeamsFromGroups("azure", "u1", [], [])).resolves.toBeUndefined();
  });
});
