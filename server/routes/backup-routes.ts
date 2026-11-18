// Backup & Restore routes (Admin › Monitoring & Audit › Backup & Restore).
// Ported from ImpactIQ's routes/backup.ts; see docs/features/backup-restore.md.
//
//   GET    /api/admin/backup/info                 table and row counts, schema version, upload limit
//   GET    /api/admin/backup/export               the whole database as one gzip download (?masked=1: masked copy)
//   POST   /api/admin/backup/import               raw upload, then a preview (writes nothing)
//   DELETE /api/admin/backup/import/:token        drop a pending upload
//   POST   /api/admin/backup/import/:token/apply  replace the database, body { confirmation: "RESTORE", mask?: boolean }
//
// Admin role only: a backup holds the whole database (password hashes and
// encrypted secrets included) and a restore replaces it.
import type { Express, Request } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { isAuthenticated, SESSION_COOKIE_NAME } from "../auth/simpleAuth";
import { requireAdmin } from "../lib/section-permissions";
import { db } from "../db";
import { storage } from "../storage";
import { getVersionInfo } from "../lib/version-info";
import { listKnownMigrationFiles } from "../lib/migrations-runner";
import {
  writeBackup,
  previewBackup,
  restoreBackup,
  countRows,
  listAppTables,
  schemaVersionOf,
  encryptionKeyCheck,
  BackupFormatError,
  EXCLUDED_TABLES,
  type BackupDb,
  type BackupPreview,
  type SchemaVersion,
} from "../services/backup/backup-engine";
import { resetAllSessionAuthState } from "../auth/session-revocation";
import { clearCrmProviderCache } from "../crm/provider-setting";
import { clearHubspotProviderCaches } from "../crm/hubspot-provider";
import { clearHubspotMetadataCache } from "../hubspot/metadata";
import { invalidateOidcConfigCache } from "../auth/oidcAuth";
import { clearImpactiqCache } from "../impactiq/client";
import { clearSendWindowCache } from "../email/send-window";
import { loadRateLimitSettings } from "../lib/rate-limit-settings";
import { syncConnectionsToDb } from "../storage";
import { ENCRYPTED_COLUMN_MANIFEST } from "../lib/encrypted-columns";

export const RESTORE_CONFIRMATION = "RESTORE";
const PENDING_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_UPLOAD_MB = 2048;

const backupDb = db as unknown as BackupDb;

interface SessionUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function sessionUser(req: Request): SessionUser {
  return (req as unknown as { session: { user: SessionUser } }).session.user;
}

function currentSchemaVersion(): SchemaVersion {
  return schemaVersionOf(listKnownMigrationFiles());
}

function appVersion(): string {
  return getVersionInfo(process.cwd(), fs, process.env, () => {}).version;
}

export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const mb = Number(env.BACKUP_MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}

interface PendingImport {
  filePath: string;
  userId: string;
  uploadedAt: number;
  preview: BackupPreview;
  originalName: string | null;
}

// In memory, so per process: the preview and the apply must reach the same
// replica (see the doc).
const pending = new Map<string, PendingImport>();

function discard(token: string): void {
  const p = pending.get(token);
  if (!p) return;
  pending.delete(token);
  fs.rm(path.dirname(p.filePath), { recursive: true, force: true }, () => {});
}

setInterval(() => {
  const now = Date.now();
  for (const [token, p] of pending) if (now - p.uploadedAt > PENDING_TTL_MS) discard(token);
}, 5 * 60 * 1000).unref();

class UploadError extends Error {}

async function saveUpload(req: Request, dest: string): Promise<void> {
  const limit = maxUploadBytes();
  let received = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > limit) cb(new UploadError("too_large"));
      else cb(null, chunk);
    },
  });
  await pipeline(req, guard, fs.createWriteStream(dest));
  if (received === 0) throw new UploadError("empty_upload");
}

function auditEvent(req: Request, eventType: string, subject: string, success = true, failureReason: string | null = null) {
  const user = sessionUser(req);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return storage
    .createAuditLogin({
      userId: user.id,
      userEmail: user.email ?? "",
      userName: name || user.email || "",
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      loginMethod: "admin",
      success,
      failureReason,
      eventType,
      eventSubject: subject,
    })
    .catch((err: unknown) => {
      console.warn("[backup] could not write the audit row:", err instanceof Error ? err.message : String(err));
    });
}

// Settings the server keeps in memory now come from the restored database.
async function clearCachesAfterRestore(): Promise<void> {
  resetAllSessionAuthState();
  clearCrmProviderCache();
  clearHubspotProviderCaches();
  clearHubspotMetadataCache();
  invalidateOidcConfigCache();
  clearImpactiqCache();
  clearSendWindowCache();
  await loadRateLimitSettings();
}

export function registerBackupRoutes(app: Express) {
  const guard = [isAuthenticated, requireAdmin];

  app.get("/api/admin/backup/info", ...guard, async (_req, res) => {
    try {
      const tables = (await listAppTables(db)).filter((t) => !EXCLUDED_TABLES.has(t));
      const counts = await countRows(db, tables);
      res.json({
        appVersion: appVersion(),
        schema: currentSchemaVersion(),
        tableCount: tables.length,
        totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
        maxUploadMb: Math.round(maxUploadBytes() / 1024 / 1024),
      });
    } catch (err) {
      console.error("[backup] info failed:", err);
      res.status(500).json({ message: "Could not read the database" });
    }
  });

  app.get("/api/admin/backup/export", ...guard, async (req, res) => {
    const maskedParam = req.query.masked;
    if (maskedParam !== undefined && maskedParam !== "1" && maskedParam !== "0") {
      res.status(400).json({ code: "invalid_request", message: "masked must be 1 or 0" });
      return;
    }
    const masked = maskedParam === "1";
    const version = appVersion();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `criteriaiq-backup${masked ? "-masked" : ""}-v${version}-${stamp}.cqbackup.gz`;
    await auditEvent(req, "database_backup_exported", `v${version}${masked ? ", masked" : ""}`);

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    const gzip = createGzip();
    gzip.pipe(res);
    const write = (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (res.destroyed) {
          reject(new Error("Client disconnected"));
          return;
        }
        if (gzip.write(chunk)) resolve();
        else gzip.once("drain", resolve);
      });
    try {
      await writeBackup(
        backupDb,
        {
          appVersion: version,
          schema: currentSchemaVersion(),
          keyCheck: encryptionKeyCheck(),
          ...(masked ? { mask: { encrypted: ENCRYPTED_COLUMN_MANIFEST } } : {}),
        },
        write,
      );
      gzip.end();
    } catch (err) {
      console.error("[backup] export failed:", err);
      // Headers are already sent: abort the download so the browser shows a
      // failure. A truncated file lacks its end line and is refused on restore.
      gzip.destroy();
      res.destroy();
    }
  });

  app.post("/api/admin/backup/import", ...guard, async (req, res) => {
    const user = sessionUser(req);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "criteriaiq-restore-"));
    const filePath = path.join(dir, "upload.cqbackup.gz");
    try {
      await saveUpload(req, filePath);
      const preview = await previewBackup(db, filePath, {
        schema: currentSchemaVersion(),
        keyCheck: encryptionKeyCheck(),
        importerEmail: user.email ?? null,
      });
      // One pending upload per admin: a new one replaces the last.
      for (const [token, p] of pending) if (p.userId === user.id) discard(token);
      const token = randomBytes(24).toString("hex");
      const rawName = req.headers["x-file-name"];
      let originalName: string | null = null;
      if (typeof rawName === "string") {
        try {
          originalName = decodeURIComponent(rawName).slice(0, 200);
        } catch {
          originalName = null;
        }
      }
      pending.set(token, { filePath, userId: user.id, uploadedAt: Date.now(), preview, originalName });
      res.json({ token, preview });
    } catch (err) {
      fs.rm(dir, { recursive: true, force: true }, () => {});
      if (err instanceof BackupFormatError) {
        res.status(400).json({ code: "invalid_file", message: err.message });
      } else if (err instanceof UploadError) {
        res.status(err.message === "too_large" ? 413 : 400).json({ code: err.message, message: err.message });
      } else {
        console.error("[backup] upload/preview failed:", err);
        res.status(500).json({ code: "server_error", message: "Could not read the upload" });
      }
    }
  });

  app.delete("/api/admin/backup/import/:token", ...guard, (req, res) => {
    const token = String(req.params.token ?? "");
    const p = pending.get(token);
    if (p && p.userId === sessionUser(req).id) discard(token);
    res.json({ ok: true });
  });

  app.post("/api/admin/backup/import/:token/apply", ...guard, async (req, res) => {
    const user = sessionUser(req);
    const token = String(req.params.token ?? "");
    const p = pending.get(token);
    if (!p || p.userId !== user.id) {
      res.status(404).json({ code: "upload_expired", message: "The upload expired. Upload the file again." });
      return;
    }
    const body = req.body as { confirmation?: unknown; mask?: unknown } | undefined;
    if (body?.mask !== undefined && typeof body.mask !== "boolean") {
      res.status(400).json({ code: "invalid_request", message: "mask must be true or false" });
      return;
    }
    const mask = body?.mask === true;
    if (body?.confirmation !== RESTORE_CONFIRMATION) {
      res.status(400).json({ code: "confirmation_required", message: `Type ${RESTORE_CONFIRMATION} to confirm` });
      return;
    }
    // Re-checked at apply time: the server may have been upgraded since the preview.
    if (p.preview.errors.length > 0 || p.preview.header.schema.lastMigration !== currentSchemaVersion().lastMigration) {
      res.status(409).json({ code: "not_restorable", message: "This backup can't be restored here" });
      return;
    }
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    try {
      const { counts, masking } = await restoreBackup(
        backupDb,
        p.filePath,
        {
          userId: user.id,
          email: user.email ?? null,
          name: name || null,
          ip: req.ip ?? null,
          userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
        },
        mask ? { mask: { encrypted: ENCRYPTED_COLUMN_MANIFEST } } : {},
      );
      discard(token);
      await clearCachesAfterRestore().catch((err: unknown) => {
        console.warn("[backup] cache reload after restore:", err instanceof Error ? err.message : String(err));
      });
      // Masking (now, or when a masked download was made) dropped the
      // source's saved database connections (their URLs are credentials); put
      // this install's own back from data/db-config.json.
      if (masking || p.preview.header.masked) await syncConnectionsToDb();
      // The restore removed every session, the caller's included. Destroying
      // it here stops the session store saving it back at the end of the
      // response; the client goes to the sign-in page next.
      const session = (req as unknown as { session?: { destroy?: (cb: (err?: unknown) => void) => void } }).session;
      await new Promise<void>((resolve) => (session?.destroy ? session.destroy(() => resolve()) : resolve()));
      res.clearCookie(SESSION_COOKIE_NAME);
      res.json({ counts, masking, signedOut: true });
    } catch (err) {
      console.error("[backup] restore failed (rolled back):", err);
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      await auditEvent(req, "database_restore_failed", p.originalName ?? "backup", false, message);
      res.status(500).json({ code: "restore_failed", message });
    }
  });
}
