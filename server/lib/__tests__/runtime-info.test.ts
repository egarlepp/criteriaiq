// @vitest-environment node
//
// Task #681 / #690: detect the hosting runtime so the wizard's
// Reconfigure-mode callout can offer a one-click "Open env-var editor"
// deep-link plus, for hosts with an operator-supplied API token, an
// "Apply DATABASE_URL & restart" flow. This test pins the detection
// precedence (Coolify > Dokploy > docker > standalone), the deep-link
// URL shape, the `controlApi.available` gate that drives the swap
// button, and the per-runtime apply call sequence (Coolify's two
// PATCH/POST steps, Dokploy's three fetch/save/deploy steps).
//
// What's covered:
//   1. Coolify with auto-injected vars → coolify runtime + deep link.
//   2. Coolify with token → controlApi.available = true.
//   3. Coolify without token → controlApi.available = false +
//      `unavailableReason: 'missingToken'`.
//   4. Dokploy with URL + project + app + token → controlApi.available
//      = true and a service-deep deep link.
//   5. Dokploy with URL + project + app but no token → available =
//      false, `unavailableReason: 'missingToken'`, deep link still
//      points at the service.
//   6. Dokploy with only DOKPLOY_URL → available = false,
//      `unavailableReason: 'missingResourceUuid'` (the API path
//      needs DOKPLOY_APPLICATION_ID), deep link falls back to base.
//   7. /.dockerenv present (no Coolify/Dokploy signals) → docker.
//   8. Nothing detected → standalone (no deep link, no API).
//   9. Coolify wins over docker (precedence regression).
//  10. Empty-string env values are treated as unset (no false detect).
//  11. applyDatabaseUrlViaCoolify happy path → both API calls fired.
//  12. applyDatabaseUrlViaCoolify env-update failure → bails before restart.
//  13. applyDatabaseUrlViaCoolify restart failure → reports `step: 'restart'`.
//  14. applyDatabaseUrlViaDokploy happy path → fetch + save + deploy
//      fired in order, x-api-key header set, env merged in place.
//  15. applyDatabaseUrlViaDokploy env-fetch failure → bails before save.
//  16. applyDatabaseUrlViaDokploy env-save failure → bails before deploy.
//  17. applyDatabaseUrlViaDokploy deploy failure → step: 'restart'.
//  18. mergeDatabaseUrlIntoEnvText preserves siblings + replaces
//      first match + appends when missing.
//
// What's NOT covered (out of scope):
//   - The route-layer admin gate — pinned in
//     `server/__tests__/setup-runtime-info-admin-gate.test.ts`.
//   - The Coolify / Dokploy dashboard URL patterns actually working
//     in a live install — the URL shape is documented in
//     self-hosting.md and any host upgrade that breaks it is
//     operator-visible.

import { describe, expect, it, vi } from "vitest";
import {
  applyDatabaseUrlViaCoolify,
  applyDatabaseUrlViaDokploy,
  buildEnvDiff,
  detectRuntimeInfo,
  mergeDatabaseUrlIntoEnvText,
  parseRetryAfterHeader,
  serializeCoolifyEnvList,
} from "../runtime-info";

describe("detectRuntimeInfo — runtime detection", () => {
  it("detects Coolify when COOLIFY_URL + COOLIFY_RESOURCE_UUID are present", () => {
    const info = detectRuntimeInfo({
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
      },
      dockerEnvFileExists: () => true, // docker marker also present — Coolify still wins
    });
    expect(info.runtime).toBe("coolify");
    expect(info.envEditorUrl).toBe(
      "https://coolify.example.com/applications/app-abc-123/environment-variables",
    );
    expect(info.signals).toContain("COOLIFY_URL present");
    expect(info.signals).toContain("COOLIFY_RESOURCE_UUID present");
  });

  it("flags controlApi.available=true for Coolify when COOLIFY_API_TOKEN is set", () => {
    const info = detectRuntimeInfo({
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.controlApi.available).toBe(true);
    expect(info.controlApi.capabilities).toEqual(["updateDatabaseUrl"]);
    expect(info.controlApi.tokenEnvVar).toBe("COOLIFY_API_TOKEN");
    expect(info.controlApi.unavailableReason).toBeNull();
  });

  it("flags controlApi.available=false with missingToken when COOLIFY_API_TOKEN is unset", () => {
    const info = detectRuntimeInfo({
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.controlApi.available).toBe(false);
    expect(info.controlApi.tokenEnvVar).toBe("COOLIFY_API_TOKEN");
    expect(info.controlApi.unavailableReason).toBe("missingToken");
    expect(info.controlApi.capabilities).toEqual([]);
  });

  it("flags controlApi.available=false with missingResourceUuid when only COOLIFY_URL is present", () => {
    const info = detectRuntimeInfo({
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("coolify");
    expect(info.controlApi.unavailableReason).toBe("missingResourceUuid");
    expect(info.controlApi.available).toBe(false);
    // Without the UUID we still get a usable deep link (the dashboard
    // root) so the operator at least lands inside Coolify.
    expect(info.envEditorUrl).toBe("https://coolify.example.com");
  });

  it("flags controlApi.available=true for Dokploy when URL + app id + DOKPLOY_API_TOKEN are all set", () => {
    const info = detectRuntimeInfo({
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_PROJECT_ID: "proj_42",
        DOKPLOY_APPLICATION_ID: "app_99",
        DOKPLOY_API_TOKEN: "tok_dokploy_secret",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("dokploy");
    expect(info.envEditorUrl).toBe(
      "https://dokploy.example.com/dashboard/project/proj_42/services/application/app_99",
    );
    expect(info.controlApi.available).toBe(true);
    expect(info.controlApi.capabilities).toEqual(["updateDatabaseUrl"]);
    expect(info.controlApi.tokenEnvVar).toBe("DOKPLOY_API_TOKEN");
    expect(info.controlApi.unavailableReason).toBeNull();
  });

  it("flags controlApi.available=false with missingToken when Dokploy URL + app id are set but DOKPLOY_API_TOKEN is unset", () => {
    const info = detectRuntimeInfo({
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_PROJECT_ID: "proj_42",
        DOKPLOY_APPLICATION_ID: "app_99",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("dokploy");
    // Deep link still resolves to the service even without the token.
    expect(info.envEditorUrl).toBe(
      "https://dokploy.example.com/dashboard/project/proj_42/services/application/app_99",
    );
    expect(info.controlApi.available).toBe(false);
    expect(info.controlApi.tokenEnvVar).toBe("DOKPLOY_API_TOKEN");
    expect(info.controlApi.unavailableReason).toBe("missingToken");
    expect(info.controlApi.capabilities).toEqual([]);
  });

  it("flags controlApi.available=false with missingResourceUuid for Dokploy when DOKPLOY_APPLICATION_ID is missing", () => {
    const info = detectRuntimeInfo({
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_API_TOKEN: "tok_dokploy_secret",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("dokploy");
    expect(info.controlApi.available).toBe(false);
    expect(info.controlApi.unavailableReason).toBe("missingResourceUuid");
    expect(info.controlApi.tokenEnvVar).toBe("DOKPLOY_API_TOKEN");
  });

  it("detects Dokploy with only DOKPLOY_URL and falls back to the base URL", () => {
    const info = detectRuntimeInfo({
      env: { DOKPLOY_URL: "https://dokploy.example.com/" }, // trailing slash
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("dokploy");
    // Trailing slash is stripped so the deep link doesn't get a
    // `https://host//path` rendering on hosts that 404 on that.
    expect(info.envEditorUrl).toBe("https://dokploy.example.com");
    // Without the app id we still surface the token env var name so
    // the wizard can render "set DOKPLOY_API_TOKEN and
    // DOKPLOY_APPLICATION_ID to enable one-click apply".
    expect(info.controlApi.tokenEnvVar).toBe("DOKPLOY_API_TOKEN");
    expect(info.controlApi.unavailableReason).toBe("missingResourceUuid");
  });

  it("falls back to docker when /.dockerenv is present and no host vars are set", () => {
    const info = detectRuntimeInfo({
      env: {},
      dockerEnvFileExists: () => true,
    });
    expect(info.runtime).toBe("docker");
    expect(info.envEditorUrl).toBeNull();
    expect(info.controlApi.available).toBe(false);
    expect(info.signals).toContain("/.dockerenv present");
  });

  it("falls back to standalone when no signals are detected at all", () => {
    const info = detectRuntimeInfo({
      env: {},
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("standalone");
    expect(info.envEditorUrl).toBeNull();
    expect(info.controlApi.available).toBe(false);
    expect(info.controlApi.tokenEnvVar).toBeNull();
    expect(info.signals).toEqual([]);
  });

  it("treats empty-string env values as unset (no false-positive detection)", () => {
    const info = detectRuntimeInfo({
      env: {
        COOLIFY_URL: "",
        COOLIFY_RESOURCE_UUID: "   ",
        DOKPLOY_URL: "",
      },
      dockerEnvFileExists: () => false,
    });
    expect(info.runtime).toBe("standalone");
    expect(info.signals).toEqual([]);
  });

  it("never crashes when dockerEnvFileExists throws", () => {
    const info = detectRuntimeInfo({
      env: {},
      dockerEnvFileExists: () => {
        throw new Error("EACCES: permission denied");
      },
    });
    expect(info.runtime).toBe("standalone");
  });
});

describe("applyDatabaseUrlViaCoolify — control API call sequence", () => {
  it("PATCHes the env then POSTs the restart on the happy path", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/envs")) {
        return new Response("{}", { status: 200 });
      }
      if (target.endsWith("/restart")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com/", // trailing slash on purpose
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.step).toBe("done");
    expect(typeof result.latencyMs).toBe("number");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [envCall, restartCall] = fetchImpl.mock.calls;
    expect(String(envCall[0])).toBe(
      "https://coolify.example.com/api/v1/applications/app-abc-123/envs",
    );
    expect((envCall[1] as RequestInit).method).toBe("PATCH");
    // The Bearer token rides ONLY in the Authorization header — never
    // in the URL or response payload.
    expect(
      ((envCall[1] as RequestInit).headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer tok_secret");
    const sentBody = JSON.parse(String((envCall[1] as RequestInit).body));
    expect(sentBody).toEqual({
      key: "DATABASE_URL",
      value: "postgres://app:hunter2@db.example.com:5432/prod",
      is_preview: false,
      is_build_time: false,
      is_literal: true,
    });
    expect(String(restartCall[0])).toBe(
      "https://coolify.example.com/api/v1/applications/app-abc-123/restart",
    );
    expect((restartCall[1] as RequestInit).method).toBe("POST");
  });

  it("bails on env-update failure WITHOUT calling restart", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("invalid token", { status: 401 }),
    );
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // restart NOT called
  });

  it("reports step='restart' when env-update succeeds but restart fails", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/envs")) return new Response("{}", { status: 200 });
      return new Response("kaboom", { status: 502 });
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("restart");
    expect(result.errorCode).toBe("controlApiFailed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("classifies network errors as controlApiUnreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND coolify.example.com");
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnreachable");
    expect(result.detail).toContain("ENOTFOUND");
  });
});

describe("applyDatabaseUrlViaDokploy — control API call sequence (Task #690)", () => {
  it("fetches the env, saves the merged env, then triggers the deploy on the happy path", async () => {
    // Existing env returned by Dokploy — sibling vars must survive the
    // merge so the operator's other secrets aren't clobbered.
    const existingEnv = "NODE_ENV=production\nSESSION_SECRET=keepme\n";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(
          JSON.stringify({
            applicationId: "app_99",
            env: existingEnv,
          }),
          { status: 200 },
        );
      }
      if (target.endsWith("/api/application.saveEnvironment")) {
        return new Response("{}", { status: 200 });
      }
      if (target.endsWith("/api/application.deploy")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com/", // trailing slash on purpose
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.step).toBe("done");
    expect(typeof result.latencyMs).toBe("number");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [oneCall, saveCall, deployCall] = fetchImpl.mock.calls;

    // The fetch-current-env call is POST application.one with the
    // application UUID as the only body field.
    expect(String(oneCall[0])).toBe(
      "https://dokploy.example.com/api/application.one",
    );
    expect((oneCall[1] as RequestInit).method).toBe("POST");
    // Token rides ONLY in the x-api-key header — never the URL.
    const oneHeaders = (oneCall[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(oneHeaders["x-api-key"]).toBe("tok_dokploy_secret");
    expect(oneHeaders["Authorization"]).toBeUndefined();
    expect(JSON.parse(String((oneCall[1] as RequestInit).body))).toEqual({
      applicationId: "app_99",
    });

    // The saveEnvironment call carries the FULL merged env — siblings
    // preserved verbatim, DATABASE_URL appended.
    expect(String(saveCall[0])).toBe(
      "https://dokploy.example.com/api/application.saveEnvironment",
    );
    expect((saveCall[1] as RequestInit).method).toBe("POST");
    const sentBody = JSON.parse(String((saveCall[1] as RequestInit).body));
    expect(sentBody.applicationId).toBe("app_99");
    expect(sentBody.env).toContain("NODE_ENV=production");
    expect(sentBody.env).toContain("SESSION_SECRET=keepme");
    expect(sentBody.env).toContain(
      "DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );

    // The deploy call carries only the application UUID.
    expect(String(deployCall[0])).toBe(
      "https://dokploy.example.com/api/application.deploy",
    );
    expect((deployCall[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((deployCall[1] as RequestInit).body))).toEqual({
      applicationId: "app_99",
    });
  });

  it("tolerates the tRPC-wrapped response shape on application.one", async () => {
    // Some Dokploy versions wrap the REST response in tRPC's envelope.
    // We accept either shape so an upgrade doesn't silently lose the
    // operator's existing env on the merge.
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(
          JSON.stringify({
            result: {
              data: {
                json: {
                  applicationId: "app_99",
                  env: "OTHER=keepme\n",
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    const saveCall = fetchImpl.mock.calls[1];
    const sentBody = JSON.parse(String((saveCall[1] as RequestInit).body));
    expect(sentBody.env).toContain("OTHER=keepme");
    expect(sentBody.env).toContain("DATABASE_URL=postgres://x@db/y");
  });

  it("bails on env-fetch failure WITHOUT calling save or deploy", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("invalid token", { status: 401 }),
    );
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bails on env-save failure WITHOUT calling deploy", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(JSON.stringify({ env: "" }), { status: 200 });
      }
      if (target.endsWith("/api/application.saveEnvironment")) {
        return new Response("rate limit", { status: 429 });
      }
      return new Response("{}", { status: 200 });
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // deploy NOT called
  });

  it("reports step='restart' when env save succeeds but deploy fails", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(JSON.stringify({ env: "" }), { status: 200 });
      }
      if (target.endsWith("/api/application.saveEnvironment")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("kaboom", { status: 502 });
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("restart");
    expect(result.errorCode).toBe("controlApiFailed");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("classifies network errors as controlApiUnreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND dokploy.example.com");
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnreachable");
    expect(result.detail).toContain("ENOTFOUND");
  });

  it("maps a 404 from any Dokploy step to controlApiAppNotFound", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not found", { status: 404 }),
    );
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "ghost",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("controlApiAppNotFound");
  });
});

describe("mergeDatabaseUrlIntoEnvText — env-text splice (Task #690)", () => {
  it("replaces the FIRST existing DATABASE_URL line and preserves siblings", () => {
    const existing =
      "NODE_ENV=production\nDATABASE_URL=postgres://old\nSESSION_SECRET=keepme\n";
    const merged = mergeDatabaseUrlIntoEnvText(existing, "postgres://new");
    expect(merged).toBe(
      "NODE_ENV=production\nDATABASE_URL=postgres://new\nSESSION_SECRET=keepme\n",
    );
  });

  it("appends a new DATABASE_URL line when none exists, preserving the trailing newline", () => {
    const existing = "NODE_ENV=production\nSESSION_SECRET=keepme\n";
    const merged = mergeDatabaseUrlIntoEnvText(existing, "postgres://new");
    expect(merged).toBe(
      "NODE_ENV=production\nSESSION_SECRET=keepme\nDATABASE_URL=postgres://new\n",
    );
  });

  it("appends without a leading newline gap when env has no trailing newline", () => {
    const existing = "NODE_ENV=production";
    const merged = mergeDatabaseUrlIntoEnvText(existing, "postgres://new");
    expect(merged).toBe("NODE_ENV=production\nDATABASE_URL=postgres://new");
  });

  it("handles an empty starting env by writing only the new line (with trailing newline)", () => {
    // Empty input is treated like "ends with \n" — split('') returns
    // [''], so we append the new line and preserve the trailing
    // empty element. This keeps the file dotenv-shaped instead of
    // producing a no-newline-at-end-of-file diff that confuses the
    // host's own env parser later.
    expect(mergeDatabaseUrlIntoEnvText("", "postgres://new")).toBe(
      "DATABASE_URL=postgres://new\n",
    );
  });

  it("does NOT replace lines whose value merely contains the substring DATABASE_URL", () => {
    const existing =
      "NOTE=set DATABASE_URL=foo elsewhere\nDATABASE_URL=postgres://old\n";
    const merged = mergeDatabaseUrlIntoEnvText(existing, "postgres://new");
    expect(merged).toBe(
      "NOTE=set DATABASE_URL=foo elsewhere\nDATABASE_URL=postgres://new\n",
    );
  });
});

// Task #700: the wizard's rate-limit countdown depends on the
// driver parsing the host's `Retry-After` header into a usable
// number of seconds. Cover both RFC 7231 shapes (delta-seconds and
// HTTP-date) plus the malformed/missing inputs that have to fall
// through to "no countdown".
describe("parseRetryAfterHeader — RFC 7231 shapes (Task #700)", () => {
  it("parses a bare delta-seconds integer", () => {
    expect(parseRetryAfterHeader("60")).toBe(60);
    expect(parseRetryAfterHeader("0")).toBe(0);
    // Leading zeros and surrounding whitespace are tolerated; the
    // raw `Retry-After` from a misbehaving proxy can include either.
    expect(parseRetryAfterHeader("  007 ")).toBe(7);
  });

  it("parses an HTTP-date as the remaining wait, rounded UP", () => {
    // Pin "now" so the assertion is deterministic; the test would
    // otherwise race a 1s wall clock at midnight.
    const now = () => Date.parse("2026-01-01T00:00:00Z");
    expect(
      parseRetryAfterHeader("Thu, 01 Jan 2026 00:01:30 GMT", now),
    ).toBe(90);
    // Sub-second remainders round UP so the operator never sees a
    // "0s" countdown that fires before the host is willing to accept
    // a retry.
    expect(
      parseRetryAfterHeader("Thu, 01 Jan 2026 00:00:00.500 GMT", now),
    ).toBe(1);
  });

  it("clamps past-dated HTTP-dates to 0 (caller treats 0 as 'retry now')", () => {
    const now = () => Date.parse("2026-01-01T00:01:00Z");
    expect(
      parseRetryAfterHeader("Thu, 01 Jan 2026 00:00:00 GMT", now),
    ).toBe(0);
  });

  it("returns undefined for missing / empty / malformed inputs", () => {
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader("   ")).toBeUndefined();
    // Negative integers, floats, and non-date garbage all fall
    // through to undefined — the wizard then renders the generic
    // "wait a moment" copy instead of a misleading countdown.
    expect(parseRetryAfterHeader("-5")).toBeUndefined();
    expect(parseRetryAfterHeader("1.5")).toBeUndefined();
    expect(parseRetryAfterHeader("not a date")).toBeUndefined();
  });
});

describe("apply* — Retry-After surfacing on 429 (Task #700)", () => {
  it("Coolify: surfaces retryAfterSeconds when the env-update step is rate-limited", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
    );
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "uuid_1",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(result.retryAfterSeconds).toBe(42);
  });

  it("Coolify: surfaces retryAfterSeconds when the restart step is rate-limited", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/envs")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "30" },
      });
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "uuid_1",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("restart");
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(result.retryAfterSeconds).toBe(30);
  });

  it("Coolify: omits retryAfterSeconds when the host sent no Retry-After", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limit", { status: 429 }),
    );
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "uuid_1",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it("Dokploy: surfaces retryAfterSeconds on a 429 from the env-fetch step", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_1",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(result.retryAfterSeconds).toBe(120);
  });

  it("Dokploy: surfaces retryAfterSeconds when the deploy (restart) step is rate-limited", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(JSON.stringify({ env: "" }), { status: 200 });
      }
      if (target.endsWith("/api/application.saveEnvironment")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "15" },
      });
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_1",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("restart");
    expect(result.errorCode).toBe("controlApiRateLimited");
    expect(result.retryAfterSeconds).toBe(15);
  });
});

describe("applyDatabaseUrlViaCoolify — dry-run preview (Task #701)", () => {
  it("GETs the env list, returns merged text + diff, and DOES NOT PATCH or restart", async () => {
    // Coolify returns the env list as either a bare array OR
    // `{data: [...]}`. Cover the bare-array shape here.
    const envList = [
      { key: "NODE_ENV", value: "production" },
      { key: "DATABASE_URL", value: "postgres://old@db/old" },
      { key: "SESSION_SECRET", value: "keepme" },
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method ?? "GET";
      if (target.endsWith("/envs") && method === "GET") {
        return new Response(JSON.stringify(envList), { status: 200 });
      }
      // Failing loud here means the dry-run path leaked into a write.
      throw new Error(`unexpected call: ${method} ${target}`);
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.step).toBe("done");
    expect(result.dryRun).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.currentEnvText).toBe(
      "NODE_ENV=production\nDATABASE_URL=postgres://old@db/old\nSESSION_SECRET=keepme\n",
    );
    expect(result.mergedEnvText).toBe(
      "NODE_ENV=production\nDATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod\nSESSION_SECRET=keepme\n",
    );
    // The diff must mention BOTH the old and new DATABASE_URL lines so
    // the operator sees what's being clobbered.
    expect(result.diff).toContain("--- current");
    expect(result.diff).toContain("+++ merged");
    expect(result.diff).toContain("-DATABASE_URL=postgres://old@db/old");
    expect(result.diff).toContain(
      "+DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
    expect(result.diff).toContain(" NODE_ENV=production");
    expect(result.diff).toContain(" SESSION_SECRET=keepme");
  });

  it("tolerates the {data: [...]} response shape", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ key: "NODE_ENV", value: "production" }] }),
        { status: 200 },
      ),
    );
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.currentEnvText).toBe("NODE_ENV=production\n");
    expect(result.mergedEnvText).toContain("DATABASE_URL=postgres://x@db/y");
  });

  it("propagates env-list HTTP errors with step='updateEnv' and dryRun=true", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("invalid token", { status: 401 }),
    );
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnauthorized");
    expect(result.dryRun).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies network errors as controlApiUnreachable on the dry-run path", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND coolify.example.com");
    });
    const result = await applyDatabaseUrlViaCoolify({
      baseUrl: "https://coolify.example.com",
      resourceUuid: "app-abc-123",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(result.errorCode).toBe("controlApiUnreachable");
    expect(result.dryRun).toBe(true);
  });
});

describe("applyDatabaseUrlViaDokploy — dry-run preview (Task #701)", () => {
  it("fetches env, returns merged text + diff, DOES NOT save or deploy", async () => {
    const existingEnv = "NODE_ENV=production\nDATABASE_URL=postgres://old@db/old\nSESSION_SECRET=keepme\n";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(
          JSON.stringify({ applicationId: "app_99", env: existingEnv }),
          { status: 200 },
        );
      }
      // Failing loud here means the dry-run path leaked into a write.
      throw new Error(`unexpected call: ${target}`);
    });
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_99",
      apiToken: "tok_dokploy_secret",
      databaseUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.step).toBe("done");
    expect(result.dryRun).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.currentEnvText).toBe(existingEnv);
    expect(result.mergedEnvText).toContain(
      "DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
    expect(result.mergedEnvText).toContain("SESSION_SECRET=keepme");
    expect(result.diff).toContain("--- current");
    expect(result.diff).toContain("+++ merged");
    expect(result.diff).toContain("-DATABASE_URL=postgres://old@db/old");
    expect(result.diff).toContain(
      "+DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
  });

  it("propagates env-fetch failure with step='updateEnv' and dryRun-style result", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("nope", { status: 404 }),
    );
    const result = await applyDatabaseUrlViaDokploy({
      baseUrl: "https://dokploy.example.com",
      applicationId: "app_404",
      apiToken: "tok_secret",
      databaseUrl: "postgres://x@db/y",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dryRun: true,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("updateEnv");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("serializeCoolifyEnvList — dry-run helper (Task #701)", () => {
  it("serializes a bare array to KEY=VALUE\\n lines with trailing newline", () => {
    expect(
      serializeCoolifyEnvList([
        { key: "A", value: "1" },
        { key: "B", value: "two" },
      ]),
    ).toBe("A=1\nB=two\n");
  });

  it("unwraps a {data: [...]} payload", () => {
    expect(
      serializeCoolifyEnvList({ data: [{ key: "X", value: "y" }] }),
    ).toBe("X=y\n");
  });

  it("skips entries missing a string key (never invents '=value' garbage)", () => {
    expect(
      serializeCoolifyEnvList([
        { key: "OK", value: "1" },
        { value: "no-key" },
        { key: 42, value: "bad-key-type" },
        { key: "", value: "empty-key" },
      ]),
    ).toBe("OK=1\n");
  });

  it("renders null/undefined values as the empty string (dotenv semantics)", () => {
    expect(
      serializeCoolifyEnvList([
        { key: "EMPTY", value: null },
        { key: "MISSING" },
      ]),
    ).toBe("EMPTY=\nMISSING=\n");
  });

  it("returns '' for non-list payloads instead of crashing", () => {
    expect(serializeCoolifyEnvList(null)).toBe("");
    expect(serializeCoolifyEnvList("not a list")).toBe("");
    expect(serializeCoolifyEnvList({ items: [] })).toBe("");
  });
});

describe("buildEnvDiff — unified line diff (Task #701)", () => {
  it("emits the --- current / +++ merged header followed by the edit script", () => {
    const out = buildEnvDiff("A=1\nB=2\n", "A=1\nB=3\n");
    const lines = out.split("\n");
    expect(lines[0]).toBe("--- current");
    expect(lines[1]).toBe("+++ merged");
    expect(lines).toContain(" A=1");
    expect(lines).toContain("-B=2");
    expect(lines).toContain("+B=3");
  });

  it("emits only the header when the two env texts are identical", () => {
    const out = buildEnvDiff("A=1\nB=2\n", "A=1\nB=2\n");
    expect(out.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")))
      .toEqual(["--- current", "+++ merged"]);
    expect(out).toContain(" A=1");
    expect(out).toContain(" B=2");
  });

  it("does NOT emit a trailing blank +/- line for the file-final newline", () => {
    const out = buildEnvDiff("A=1\n", "A=1\nB=2\n");
    // No spurious "-" or "+" with empty content right at the end.
    for (const line of out.split("\n")) {
      expect(line === "+" || line === "-").toBe(false);
    }
    expect(out).toContain("+B=2");
  });

  it("handles an empty current side (everything is an addition)", () => {
    const out = buildEnvDiff("", "DATABASE_URL=postgres://x@db/y\n");
    expect(out).toContain("+DATABASE_URL=postgres://x@db/y");
    expect(out).not.toContain("-DATABASE_URL");
  });
});
