// @vitest-environment node
//
// Backup & Restore is Admin only (a backup holds password hashes and
// encrypted secrets; a restore replaces the database), and a restore needs
// a pending upload of the caller's own plus the typed confirmation.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "a1", role: "Admin", email: "a@example.com" } as { id: string; role: string; email: string },
}));

const engine = vi.hoisted(() => ({
  previewBackup: vi.fn(),
  restoreBackup: vi.fn(async (_db: unknown, _f: unknown, _a: unknown, opts?: { mask?: unknown }) => ({
    counts: { users: 1 },
    masking: opts?.mask ? { emptiedTables: 1, maskedRows: 2, clearedSecretTables: 3, keptAdmins: 1 } : null,
  })),
  syncConnectionsToDb: vi.fn(async () => undefined),
  writeBackup: vi.fn(async (_db: unknown, _o: unknown, write: (c: string) => Promise<void>) => {
    await write("CRITERIAIQ-BACKUP\t1\n");
  }),
}));

vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../storage", () => ({
  storage: { createAuditLogin: vi.fn(async () => undefined) },
  syncConnectionsToDb: engine.syncConnectionsToDb,
}));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
  SESSION_COOKIE_NAME: "connect.sid",
}));
vi.mock("../../lib/migrations-runner", () => ({ listKnownMigrationFiles: () => ["001_a.sql", "094_b.sql"] }));
vi.mock("../../services/backup/backup-engine", async (orig) => {
  const real = await orig<typeof import("../../services/backup/backup-engine")>();
  return {
    ...real,
    previewBackup: engine.previewBackup,
    restoreBackup: engine.restoreBackup,
    writeBackup: engine.writeBackup,
    listAppTables: async () => ["users", "sessions"],
    countRows: async () => ({ users: 3 }),
  };
});

const { registerBackupRoutes, maxUploadBytes } = await import("../backup-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user, destroy: (cb: () => void) => cb() } });
    next();
  });
  registerBackupRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const okPreview = () => ({
  header: { schema: { lastMigration: "094_b.sql", migrationCount: 2 }, appVersion: "0.10.16", createdAt: "x" },
  tables: [],
  errors: [],
  warnings: [],
  adminsInBackup: [{ email: "a@example.com", name: "A" }],
  importerInBackup: true,
  keyMatches: true,
});

beforeEach(() => {
  state.user = { id: "a1", role: "Admin", email: "a@example.com" };
  vi.clearAllMocks();
  engine.previewBackup.mockImplementation(async () => okPreview());
});

const upload = (body: string | Uint8Array = "data") =>
  fetch(`${baseUrl}/api/admin/backup/import`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
const apply = (token: string, confirmation?: string, mask?: unknown) =>
  fetch(`${baseUrl}/api/admin/backup/import/${token}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation, mask }),
  });

describe("backup routes", () => {
  it("refuse everyone but Admin", async () => {
    for (const role of ["Engineer", "Manager", "Customer", "Partner", "Guest"]) {
      state.user = { id: "u1", role, email: "u@example.com" };
      expect((await fetch(`${baseUrl}/api/admin/backup/info`)).status, role).toBe(403);
      expect((await fetch(`${baseUrl}/api/admin/backup/export`)).status, role).toBe(403);
      expect((await upload()).status, role).toBe(403);
      expect((await apply("t", "RESTORE")).status, role).toBe(403);
    }
    expect(engine.writeBackup).not.toHaveBeenCalled();
    expect(engine.previewBackup).not.toHaveBeenCalled();
    expect(engine.restoreBackup).not.toHaveBeenCalled();
  });

  it("lets an Admin see the overview and download a backup", async () => {
    const info = await (await fetch(`${baseUrl}/api/admin/backup/info`)).json();
    expect(info).toMatchObject({ schema: { lastMigration: "094_b.sql", migrationCount: 2 }, tableCount: 1, totalRows: 3 });
    const res = await fetch(`${baseUrl}/api/admin/backup/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/criteriaiq-backup-.*\.cqbackup\.gz/);
    expect(engine.writeBackup).toHaveBeenCalledOnce();
  });

  it("needs the typed confirmation and the caller's own upload", async () => {
    const empty = await upload(new Uint8Array());
    expect(empty.status).toBe(400);

    const { token } = await (await upload()).json();
    expect((await apply(token)).status).toBe(400);
    expect((await apply(token, "restore")).status).toBe(400);

    state.user = { id: "a2", role: "Admin", email: "b@example.com" };
    expect((await apply(token, "RESTORE")).status).toBe(404);
    expect(engine.restoreBackup).not.toHaveBeenCalled();

    state.user = { id: "a1", role: "Admin", email: "a@example.com" };
    const done = await apply(token, "RESTORE");
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ counts: { users: 1 }, masking: null, signedOut: true });
    expect(engine.restoreBackup.mock.calls[0][3]).toEqual({});
    expect(engine.syncConnectionsToDb).not.toHaveBeenCalled();
    expect((await apply(token, "RESTORE")).status).toBe(404);
  });

  it("restores with masking when asked, and only with a boolean", async () => {
    const { token } = await (await upload()).json();
    expect((await apply(token, "RESTORE", "yes")).status).toBe(400);
    expect(engine.restoreBackup).not.toHaveBeenCalled();

    const done = await apply(token, "RESTORE", true);
    expect(done.status).toBe(200);
    expect((await done.json()).masking).toMatchObject({ keptAdmins: 1 });
    const opts = engine.restoreBackup.mock.calls[0][3] as { mask?: { encrypted: { table: string }[] } };
    expect(opts.mask?.encrypted.some((s) => s.table === "users")).toBe(true);
    // The source's saved database connections were deleted; this install's own come back.
    expect(engine.syncConnectionsToDb).toHaveBeenCalledOnce();
  });

  it("refuses to restore a backup the preview blocked", async () => {
    engine.previewBackup.mockImplementation(async () => ({ ...okPreview(), errors: [{ code: "no_admin" }] }));
    const { token } = await (await upload()).json();
    expect((await apply(token, "RESTORE")).status).toBe(409);
    expect(engine.restoreBackup).not.toHaveBeenCalled();
  });

  it("reads the upload limit from BACKUP_MAX_UPLOAD_MB", () => {
    expect(maxUploadBytes({})).toBe(2048 * 1024 * 1024);
    expect(maxUploadBytes({ BACKUP_MAX_UPLOAD_MB: "10" })).toBe(10 * 1024 * 1024);
    expect(maxUploadBytes({ BACKUP_MAX_UPLOAD_MB: "nope" })).toBe(2048 * 1024 * 1024);
  });
});
