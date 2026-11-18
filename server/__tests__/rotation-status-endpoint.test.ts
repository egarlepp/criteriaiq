// @vitest-environment node
//
// Coverage for the admin "rotation in progress" surface introduced by
// Task #734:
//
//   - GET /api/system/secrets/rotation-status (admin-only)
//   - recordRotationCompletion / getRotationStatus bookkeeping in
//     server/lib/app-config.ts
//
// We exercise the bookkeeping helpers directly (no HTTP) AND mount the
// route handler against an in-process express server so we can assert the
// admin gate, the steady-state payload shape (no rotation yet), and the
// "active tail" payload shape — all without spinning up a real Postgres,
// the rotation handler, or any of its dependencies.
//
// The bookkeeping is intentionally simple (a single in-memory slot keyed
// off `Date.now()`) so the test can mock the clock with `vi.useFakeTimers()`
// to step through the tail window deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

import {
  __resetRotationStatusForTests,
  getRotationStatus,
  recordRotationCompletion,
} from "../lib/app-config";
import { registerSystemRoutes } from "../routes/system-routes";

let server: Server | null = null;
let baseUrl = "";

const sessionUser: {
  current: { role?: string; id?: string; email?: string | null } | null;
} = { current: null };

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUser.current ? { user: sessionUser.current } : {};
    next();
  });
  registerSystemRoutes(app);
  return app;
}

beforeEach(async () => {
  __resetRotationStatusForTests();
  sessionUser.current = null;

  const app = buildApp();
  await new Promise<void>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      server = httpServer;
      const addr = httpServer.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  __resetRotationStatusForTests();
  vi.useRealTimers();
});

async function getRotationStatusOverHttp() {
  const res = await fetch(`${baseUrl}/api/system/secrets/rotation-status`);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return { status: res.status, body: parsed as Record<string, unknown> };
}

describe("recordRotationCompletion / getRotationStatus bookkeeping (Task #734)", () => {
  it("returns null in steady state (no rotation has run in this process)", () => {
    expect(getRotationStatus()).toBeNull();
  });

  it("returns active=true while inside the tail window and active=false after it expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));

    recordRotationCompletion({ tables: 3, rows: 11, tailDurationMs: 5000 });

    // T+0: full tail in flight.
    const initial = getRotationStatus();
    expect(initial).not.toBeNull();
    expect(initial!.active).toBe(true);
    expect(initial!.tailRemainingMs).toBe(5000);
    expect(initial!.tailDurationMs).toBe(5000);
    expect(initial!.lastCompletedAt).toBe("2026-04-30T12:00:00.000Z");
    expect(initial!.reencrypted).toEqual({ tables: 3, rows: 11 });

    // T+2s: still active, half-ish remaining.
    vi.advanceTimersByTime(2000);
    const mid = getRotationStatus()!;
    expect(mid.active).toBe(true);
    expect(mid.tailRemainingMs).toBe(3000);

    // T+5s: tail boundary — remaining clamps to zero, active flips false.
    vi.advanceTimersByTime(3000);
    const atBoundary = getRotationStatus()!;
    expect(atBoundary.active).toBe(false);
    expect(atBoundary.tailRemainingMs).toBe(0);

    // T+10s: completion data is preserved (UI can still surface "rotation
    // completed N seconds ago" tooltips even after the tail closes).
    vi.advanceTimersByTime(5000);
    const post = getRotationStatus()!;
    expect(post.active).toBe(false);
    expect(post.tailRemainingMs).toBe(0);
    expect(post.lastCompletedAt).toBe("2026-04-30T12:00:00.000Z");
    expect(post.reencrypted).toEqual({ tables: 3, rows: 11 });
  });

  it("a second rotation overwrites the slot (new completion time + counts + tail)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));

    recordRotationCompletion({ tables: 1, rows: 2, tailDurationMs: 5000 });
    vi.advanceTimersByTime(1000);
    recordRotationCompletion({ tables: 7, rows: 19, tailDurationMs: 8000 });

    const snap = getRotationStatus()!;
    expect(snap.active).toBe(true);
    expect(snap.tailDurationMs).toBe(8000);
    expect(snap.tailRemainingMs).toBe(8000);
    expect(snap.lastCompletedAt).toBe("2026-04-30T12:00:01.000Z");
    expect(snap.reencrypted).toEqual({ tables: 7, rows: 19 });
  });

  it("clamps a negative tailDurationMs to zero so a misbehaving caller never produces nonsense remaining values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));

    recordRotationCompletion({ tables: 1, rows: 1, tailDurationMs: -100 });
    const snap = getRotationStatus()!;
    expect(snap.active).toBe(false);
    expect(snap.tailRemainingMs).toBe(0);
    expect(snap.tailDurationMs).toBe(0);
  });
});

describe("GET /api/system/secrets/rotation-status (Task #734)", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { status, body } = await getRotationStatusOverHttp();
    expect(status).toBe(401);
    expect(body).toMatchObject({ errorCode: "unauthenticated" });
  });

  it("rejects non-admin sessions with 403", async () => {
    sessionUser.current = { id: "u-1", email: "user@example.com", role: "User" };
    const { status, body } = await getRotationStatusOverHttp();
    expect(status).toBe(403);
    expect(body).toMatchObject({ errorCode: "forbidden" });
  });

  it("returns the steady-state payload (active=false, no completion data) when no rotation has run", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    const { status, body } = await getRotationStatusOverHttp();
    expect(status).toBe(200);
    expect(body).toEqual({
      active: false,
      tailRemainingMs: 0,
      tailDurationMs: 0,
      lastCompletedAt: null,
      reencrypted: null,
    });
  });

  it("surfaces the live tail snapshot when a rotation is in flight", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };

    // Real timers — vi.useFakeTimers() interferes with Node's HTTP server
    // the express app is listening on. The tail is wide enough (10s) that
    // the request round-trip won't push us off the active window.
    recordRotationCompletion({ tables: 2, rows: 5, tailDurationMs: 10_000 });

    const { status, body } = await getRotationStatusOverHttp();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      active: true,
      tailDurationMs: 10_000,
      reencrypted: { tables: 2, rows: 5 },
    });
    expect(typeof body.lastCompletedAt).toBe("string");
    // tailRemainingMs is a wall-clock subtraction so we can only assert
    // the plausible band rather than an exact value.
    expect(body.tailRemainingMs).toBeGreaterThan(0);
    expect(body.tailRemainingMs).toBeLessThanOrEqual(10_000);
  });

  it("never includes raw secret values in the payload", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    recordRotationCompletion({ tables: 4, rows: 13, tailDurationMs: 5000 });
    const { body } = await getRotationStatusOverHttp();
    // Defensive contract: any future change that accidentally widens the
    // payload to include encryption keys would trip this. The shape we
    // deliberately ship is metadata-only.
    const allowed = new Set([
      "active",
      "tailRemainingMs",
      "tailDurationMs",
      "lastCompletedAt",
      "reencrypted",
    ]);
    for (const key of Object.keys(body)) {
      expect(allowed.has(key)).toBe(true);
    }
    const reencrypted = body.reencrypted as { tables: number; rows: number };
    for (const key of Object.keys(reencrypted)) {
      expect(["tables", "rows"]).toContain(key);
    }
  });
});
