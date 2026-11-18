// @vitest-environment node
//
// Task #681 / #690: post-install Reconfigure flow gains a runtime-aware
// "Open env-var editor" deep link plus, for Coolify and Dokploy with a
// token configured, an admin-confirmed "Apply DATABASE_URL & restart"
// path. Both endpoints sit behind the same admin gate as
// `/api/setup/test-connection` (Task #676's pattern). This file pins:
//
//   1. GET  /api/admin/runtime-info — admin gate (401/403/200)
//   2. POST /api/admin/runtime-apply-database-url
//        - admin gate (401/403)
//        - confirmRequired without `confirm: true`
//        - controlApiUnavailable when runtime is standalone or token missing
//        - happy path against a Coolify env that has token+UUID
//        - happy path against a Dokploy env that has token+app id
//        - controlApiUnavailable for Dokploy without DOKPLOY_API_TOKEN
//        - preflight failure short-circuits before the host API call
//   3. server/index.ts post-install branch wires the gated mount
//      (mirrors the `setup-test-connection-admin-gate.test.ts` pin).
//
// What's NOT covered (delegated to the unit-level test in
// `server/lib/__tests__/runtime-info.test.ts`):
//   - The detection precedence + every individual deep-link URL shape
//   - The PATCH/restart sequencing inside `applyDatabaseUrlViaCoolify`
//   - The fetch/save/deploy sequencing inside `applyDatabaseUrlViaDokploy`
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

const mockConnect = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/db-driver", async () => {
  const actual = await vi.importActual<typeof import("../lib/db-driver")>(
    "../lib/db-driver",
  );
  class FakePool {
    connect = mockConnect;
    end = mockEnd;
    on = vi.fn();
    query = vi.fn();
    constructor(_opts?: unknown) {}
  }
  return {
    ...actual,
    createPool: vi.fn(() => new FakePool()),
  };
});

interface FakeUser {
  id: string;
  email: string;
  role: string;
}

interface BuildAppOptions {
  env?: Record<string, string | undefined>;
  dockerEnvFileExists?: () => boolean;
  fetchImpl?: typeof fetch;
}

async function buildApp(
  currentUser: { value: FakeUser | null },
  opts: BuildAppOptions = {},
) {
  const { registerRuntimeInfoRoutes } = await import("../routes/setup-routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session?: { user?: FakeUser } }).session = currentUser
      .value
      ? { user: currentUser.value }
      : {};
    next();
  });
  registerRuntimeInfoRoutes(app, {
    requireAdmin: true,
    env: opts.env,
    dockerEnvFileExists: opts.dockerEnvFileExists,
    fetchImpl: opts.fetchImpl,
  });
  return app;
}

interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

async function listen(app: express.Express): Promise<RunningServer> {
  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe("GET /api/admin/runtime-info — admin gate (Task #681)", () => {
  let server: RunningServer;
  let currentUser: { value: FakeUser | null };

  beforeEach(async () => {
    currentUser = { value: null };
    const app = await buildApp(currentUser, {
      env: {},
      dockerEnvFileExists: () => false,
    });
    server = await listen(app);
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 401 unauthenticated when no session is present", async () => {
    currentUser.value = null;
    const res = await fetch(`${server.url}/api/admin/runtime-info`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: "Authentication required",
      errorCode: "unauthenticated",
    });
  });

  it("returns 403 forbidden for non-Admin sessions", async () => {
    currentUser.value = { id: "u1", email: "editor@example.com", role: "Editor" };
    const res = await fetch(`${server.url}/api/admin/runtime-info`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      error: "Admin role required",
      errorCode: "forbidden",
    });
  });

  it("returns the detected runtime payload for an Admin", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await fetch(`${server.url}/api/admin/runtime-info`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runtime).toBe("standalone");
    expect(body.envEditorUrl).toBeNull();
    expect(body.controlApi.available).toBe(false);
  });
});

describe("POST /api/admin/runtime-apply-database-url — admin gate + confirm + control-API path (Task #681)", () => {
  let server: RunningServer;
  let currentUser: { value: FakeUser | null };
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });
    currentUser = { value: null };
    fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const app = await buildApp(currentUser, {
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
  });
  afterEach(async () => {
    await server.close();
  });

  async function post(body: unknown) {
    return fetch(`${server.url}/api/admin/runtime-apply-database-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when no session is present (no DB pool opened)", async () => {
    currentUser.value = null;
    const res = await post({
      connectionUrl: "postgres://x",
      confirm: true,
    });
    expect(res.status).toBe(401);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 403 for non-Admin sessions", async () => {
    currentUser.value = { id: "u1", email: "editor@example.com", role: "Editor" };
    const res = await post({
      connectionUrl: "postgres://x",
      confirm: true,
    });
    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 400 confirmRequired when an Admin omits confirm:true", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await post({ connectionUrl: "postgres://x" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe("confirmRequired");
    expect(mockConnect).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 400 connectionUrlRequired when an Admin omits the URL", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await post({ confirm: true });
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("connectionUrlRequired");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("PATCHes Coolify env then POSTs restart on the happy path", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await post({
      connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      confirm: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("coolify");
    // Pre-flight test ran (connect+SELECT 1) before any Coolify call.
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/api/v1/applications/app-abc-123/envs",
    );
    expect(String(fetchImpl.mock.calls[1][0])).toContain(
      "/api/v1/applications/app-abc-123/restart",
    );
  });

  it("forwards Retry-After (seconds + errorParams + response header) when Coolify returns 429", async () => {
    // Task #700: parallel to the Dokploy version below — verifies
    // that the Coolify branch surfaces the same shape so the wizard
    // can drive an identical countdown UI for both runtimes.
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    fetchImpl.mockReset();
    fetchImpl.mockImplementation(async () =>
      new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    );
    const res = await post({
      connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      confirm: true,
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("controlApiRateLimited");
    expect(body.retryAfterSeconds).toBe(60);
    expect(body.errorParams?.seconds).toBe(60);
  });

  it("returns controlApiRateLimited WITHOUT retryAfterSeconds (and no Retry-After response header) when Coolify 429s with no Retry-After hint", async () => {
    // Task #700: defensive coverage for the "rate-limited but the
    // host didn't tell us how long to wait" case. The wizard's
    // generic-fallback path keys off `retryAfterSeconds` being
    // absent, so we MUST NOT mint a default seconds value here —
    // doing so would lock the operator into a guessed cooldown the
    // host never actually requested.
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    fetchImpl.mockReset();
    fetchImpl.mockImplementation(async () =>
      new Response("rate limit", { status: 429 }),
    );
    const res = await post({
      connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      confirm: true,
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBeNull();
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("controlApiRateLimited");
    expect(body.retryAfterSeconds).toBeUndefined();
    expect(body.errorParams?.seconds).toBeUndefined();
  });

  it("returns 400 preflightTestFailed when the candidate URL doesn't connect (no Coolify call)", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    mockConnect.mockReset();
    mockConnect.mockRejectedValueOnce(
      new Error('password authentication failed for user "app"'),
    );
    const res = await post({
      connectionUrl: "postgres://app:wrong@db.example.com:5432/prod",
      confirm: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe("preflightTestFailed");
    expect(body.errorParams?.detail).toContain("password authentication failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/runtime-apply-database-url — controlApi unavailable paths (Task #681)", () => {
  let server: RunningServer;
  const adminUser = { id: "u1", email: "admin@example.com", role: "Admin" };

  afterEach(async () => {
    if (server) await server.close();
  });

  it("returns 409 controlApiUnavailable on standalone runtimes", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const app = await buildApp({ value: adminUser }, {
      env: {},
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://x",
          confirm: true,
        }),
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("controlApiUnavailable");
    expect(body.runtime).toBe("standalone");
    expect(fetchImpl).not.toHaveBeenCalled();
    // We MUST short-circuit before the pre-flight DB connect — operators
    // should learn "your host doesn't support this" before we burn a
    // pool slot on a candidate URL we can't even apply.
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("returns 409 controlApiUnavailable for Coolify without COOLIFY_API_TOKEN", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const app = await buildApp({ value: adminUser }, {
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        // COOLIFY_API_TOKEN intentionally absent
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://x",
          confirm: true,
        }),
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("controlApiUnavailable");
    expect(body.runtime).toBe("coolify");
    expect(body.unavailableReason).toBe("missingToken");
    expect(body.tokenEnvVar).toBe("COOLIFY_API_TOKEN");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 409 controlApiUnavailable for Dokploy without DOKPLOY_API_TOKEN (Task #690)", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const app = await buildApp({ value: adminUser }, {
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_APPLICATION_ID: "app_99",
        // DOKPLOY_API_TOKEN intentionally absent
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://x",
          confirm: true,
        }),
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("controlApiUnavailable");
    expect(body.runtime).toBe("dokploy");
    expect(body.unavailableReason).toBe("missingToken");
    expect(body.tokenEnvVar).toBe("DOKPLOY_API_TOKEN");
    expect(fetchImpl).not.toHaveBeenCalled();
    // Same short-circuit guarantee as the standalone branch above —
    // operators learn "set DOKPLOY_API_TOKEN" before we burn a pool
    // slot on a candidate URL we can't apply yet.
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/runtime-apply-database-url — Dokploy happy path (Task #690)", () => {
  let server: RunningServer;
  let fetchImpl: ReturnType<typeof vi.fn>;
  const adminUser = { id: "u1", email: "admin@example.com", role: "Admin" };

  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });
    fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        // Existing env returned by Dokploy — sibling vars must survive.
        return new Response(
          JSON.stringify({ env: "NODE_ENV=production\n" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    const app = await buildApp({ value: adminUser }, {
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_PROJECT_ID: "proj_42",
        DOKPLOY_APPLICATION_ID: "app_99",
        DOKPLOY_API_TOKEN: "tok_dokploy_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
  });
  afterEach(async () => {
    await server.close();
  });

  async function post(body: unknown) {
    return fetch(`${server.url}/api/admin/runtime-apply-database-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("fetches env, saves env, then triggers deploy on the happy path", async () => {
    const res = await post({
      connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      confirm: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("dokploy");
    // Pre-flight test ran (connect+SELECT 1) before any Dokploy call.
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/api/application.one",
    );
    expect(String(fetchImpl.mock.calls[1][0])).toContain(
      "/api/application.saveEnvironment",
    );
    expect(String(fetchImpl.mock.calls[2][0])).toContain(
      "/api/application.deploy",
    );
    // The save call carries the merged env, not just DATABASE_URL.
    const saveBody = JSON.parse(
      String((fetchImpl.mock.calls[1][1] as RequestInit).body),
    );
    expect(saveBody.env).toContain("NODE_ENV=production");
    expect(saveBody.env).toContain(
      "DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
  });

  it("forwards Retry-After (seconds + errorParams) when Dokploy returns 429", async () => {
    // Task #700: when the host's control API rate-limits us, the
    // route must forward BOTH the parsed seconds (so the wizard can
    // start a countdown) and an `errorParams.seconds` (so the
    // localized `controlApiRateLimited` message can interpolate it
    // inline). Mirroring the value into the response's own
    // `Retry-After` header is also required so a polling proxy
    // honors the same backoff window the JSON body advertises.
    fetchImpl.mockReset();
    fetchImpl.mockImplementation(async () =>
      new Response("rate limit", {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    );
    const res = await post({
      connectionUrl: "postgres://x@db/y",
      confirm: true,
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("controlApiRateLimited");
    expect(body.retryAfterSeconds).toBe(45);
    expect(body.errorParams?.seconds).toBe(45);
  });

  it("returns 502 with stable errorCode when the Dokploy deploy step fails", async () => {
    fetchImpl.mockReset();
    fetchImpl.mockImplementation(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(JSON.stringify({ env: "" }), { status: 200 });
      }
      if (target.endsWith("/api/application.saveEnvironment")) {
        return new Response("{}", { status: 200 });
      }
      // deploy fails
      return new Response("kaboom", { status: 502 });
    });
    const res = await post({
      connectionUrl: "postgres://x@db/y",
      confirm: true,
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("controlApiFailed");
    expect(body.step).toBe("restart");
  });
});

// Static mount-regression pin (architect comment pattern from
// setup-test-connection-admin-gate.test.ts). The handler-level tests
// above prove the gate behaves correctly, but they don't pin the wiring —
// a future "tighten the setup-routes gating" change could drop the
// post-install registration line and the runtime helper would
// silently disappear from the Reconfigure callout. This test reads the
// boot file and asserts both the import and the gated mount call live
// inside the `if (!_setupNeedsBootstrap) { ... }` block.
describe("server/index.ts post-install branch wires the runtime-info routes", () => {
  it("imports registerRuntimeInfoRoutes and mounts it with requireAdmin: true", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const indexPath = path.resolve(__dirname, "../index.ts");
    const indexSrc = await fs.readFile(indexPath, "utf8");
    const branchMatch = indexSrc.match(
      /if\s*\(\s*!_setupNeedsBootstrap\s*\)\s*\{([\s\S]*?)\n\s{0,4}\}/,
    );
    expect(
      branchMatch,
      "could not locate the `if (!_setupNeedsBootstrap)` post-install branch in server/index.ts",
    ).not.toBeNull();
    const branchBody = branchMatch![1];
    expect(
      branchBody,
      "post-install branch must import registerRuntimeInfoRoutes (Task #681)",
    ).toMatch(/registerRuntimeInfoRoutes/);
    expect(
      branchBody,
      "post-install branch must mount the runtime-info routes with requireAdmin: true (Task #681)",
    ).toMatch(
      /registerRuntimeInfoRoutes\s*\(\s*app\s*,\s*\{\s*requireAdmin:\s*true\s*\}\s*\)/,
    );
  });
});

describe("POST /api/admin/runtime-apply-database-url — dry-run preview (Task #701)", () => {
  let server: RunningServer;
  const adminUser = { id: "u1", email: "admin@example.com", role: "Admin" };

  afterEach(async () => {
    if (server) await server.close();
  });

  it("Coolify: dryRun GETs envs, returns merged text + diff, NO PATCH/restart, NO preflight DB connect, NO confirm required", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method ?? "GET";
      if (target.endsWith("/envs") && method === "GET") {
        return new Response(
          JSON.stringify([
            { key: "NODE_ENV", value: "production" },
            { key: "DATABASE_URL", value: "postgres://old@db/old" },
          ]),
          { status: 200 },
        );
      }
      // Failing loud here means the dry-run path leaked into a write.
      throw new Error(`unexpected call: ${method} ${target}`);
    });
    const app = await buildApp({ value: adminUser }, {
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    // NB: no `confirm: true` — dry-run is allowed to bypass.
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
          dryRun: true,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.runtime).toBe("coolify");
    expect(typeof body.currentEnvText).toBe("string");
    expect(typeof body.mergedEnvText).toBe("string");
    expect(body.diff).toContain("--- current");
    expect(body.diff).toContain("+++ merged");
    expect(body.diff).toContain("-DATABASE_URL=postgres://old@db/old");
    expect(body.diff).toContain(
      "+DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
    // Exactly one network call (the env-list GET) and no DB connect.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("Dokploy: dryRun fetches env, returns merged text + diff, NO save/deploy, NO preflight DB connect", async () => {
    mockConnect.mockReset();
    const existingEnv = "NODE_ENV=production\nDATABASE_URL=postgres://old@db/old\n";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/api/application.one")) {
        return new Response(
          JSON.stringify({ applicationId: "app_99", env: existingEnv }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected call: ${target}`);
    });
    const app = await buildApp({ value: adminUser }, {
      env: {
        DOKPLOY_URL: "https://dokploy.example.com",
        DOKPLOY_APPLICATION_ID: "app_99",
        DOKPLOY_API_TOKEN: "tok_dokploy_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
          dryRun: true,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.runtime).toBe("dokploy");
    expect(body.currentEnvText).toBe(existingEnv);
    expect(body.mergedEnvText).toContain(
      "DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
    expect(body.diff).toContain("-DATABASE_URL=postgres://old@db/old");
    expect(body.diff).toContain(
      "+DATABASE_URL=postgres://app:hunter2@db.example.com:5432/prod",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("dryRun is still admin-gated: returns 401 with no session and 403 for non-Admin", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const userRef: { value: FakeUser | null } = { value: null };
    const app = await buildApp(userRef, {
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const post = (body: unknown) =>
      fetch(`${server.url}/api/admin/runtime-apply-database-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    // 401 unauth.
    userRef.value = null;
    let res = await post({ connectionUrl: "postgres://x", dryRun: true });
    expect(res.status).toBe(401);
    // 403 non-admin.
    userRef.value = { id: "u2", email: "editor@example.com", role: "Editor" };
    res = await post({ connectionUrl: "postgres://x", dryRun: true });
    expect(res.status).toBe(403);
    // No leakage to control API in either branch.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("dryRun is still rejected with controlApiUnavailable when the runtime can't apply", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const app = await buildApp({ value: adminUser }, {
      // No host vars — runtime detects as standalone.
      env: {},
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: "postgres://x",
          dryRun: true,
        }),
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("controlApiUnavailable");
    expect(body.runtime).toBe("standalone");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("dryRun still requires connectionUrl (no preview without a candidate URL)", async () => {
    mockConnect.mockReset();
    const fetchImpl = vi.fn();
    const app = await buildApp({ value: adminUser }, {
      env: {
        COOLIFY_URL: "https://coolify.example.com",
        COOLIFY_RESOURCE_UUID: "app-abc-123",
        COOLIFY_API_TOKEN: "tok_secret",
      },
      dockerEnvFileExists: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    server = await listen(app);
    const res = await fetch(
      `${server.url}/api/admin/runtime-apply-database-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe("connectionUrlRequired");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
