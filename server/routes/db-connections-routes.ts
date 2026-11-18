// Database Connection Management routes (Phase 8 extraction #11l).
//
// 11 admin handlers managing the live-DB-switching surface — this is
// the connection registry that controls which Postgres instance the
// app talks to at runtime. CRUD + reveal + test + activate + the
// pending-active queue (file-driven cross-process handshake):
//
//   GET    /api/db-connections
//   POST   /api/db-connections
//   PUT    /api/db-connections/:id
//   DELETE /api/db-connections/:id
//   POST   /api/db-connections/:id/reveal       (admin-only, audit-logged)
//   POST   /api/db-connections/:id/test
//   POST   /api/db-connections/:id/activate
//   GET    /api/db-connections/pending-active
//   POST   /api/db-connections/:id/set-pending-active
//   DELETE /api/db-connections/pending-active
//   POST   /api/db-connections/test-url
//   POST   /api/db-connections/restart
//
// Notes:
//   - The reveal handler is imported from lib/db-connection-reveal so
//     the route-level guard tests in
//     server/__tests__/secret-reveal-guards.test.ts can keep mounting
//     it on a minimal Express app. routes.ts also re-exports it for
//     backwards compatibility with the existing test import path.
//   - maskConnectionUrl lives in lib/connection-url.
//   - Static `/pending-active` routes registered before parameterized
//     `/:id` routes so Express route-matching picks the static path
//     first (Task #740).
import type { Express } from "express";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { dbConnections } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { encryptText } from "../auth/mfaUtils";
import { maskConnectionUrl } from "../lib/connection-url";
import { revealDbConnectionHandler } from "../lib/db-connection-reveal";

export function registerDbConnectionsRoutes(app: Express) {
  // GET /api/db-connections — list all connections (masked URLs) + active source info
  app.get("/api/db-connections", isAuthenticated, async (req: any, res) => {
    try {
      const { decryptText } = await import('../auth/mfaUtils');
      // Surface the operator's "Database Driver" dropdown choice on
      // each row (Task #484) so the UI can render an Auto / Neon /
      // Postgres badge and seed the Edit dialog back to that same
      // value. Computed from the decrypted URL via the same helper
      // the pool selector uses, so the wire field tracks what
      // `selectDriver` will actually pick.
      const { readDriverOverride } = await import('../lib/db-driver');
      const rows = await storage.db.select().from(dbConnections).orderBy(dbConnections.createdAt);
      const result = rows.map((row) => {
        let preview = '(encrypted)';
        let driverOverride: 'auto' | 'neon' | 'pg' = 'auto';
        try {
          const decrypted = decryptText(row.connectionUrl);
          preview = maskConnectionUrl(decrypted);
          driverOverride = readDriverOverride(decrypted);
        } catch {}
        return {
          id: row.id,
          name: row.name,
          connectionUrlPreview: preview,
          driverOverride,
          branch: row.branch,
          isActive: row.isActive,
          isDefault: row.isDefault,
          isSystem: row.isSystem,
          notes: row.notes,
          lastTestedAt: row.lastTestedAt,
          lastTestSuccess: row.lastTestSuccess,
          lastTestLatencyMs: row.lastTestLatencyMs,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
      res.json({ connections: result });
    } catch (error: any) {
      console.error('Error listing db connections:', error);
      res.status(500).json({ message: 'Failed to list database connections' });
    }
  });

  // POST /api/db-connections — add a new named connection
  // Task #739: writes go through the file-canonical store
  // (data/db-config.json's `connections[]`) and the db_connections
  // table is then refreshed via syncConnectionsToDb. The GET handler
  // continues to read from the table so existing clients keep working.
  app.post("/api/db-connections", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
      const { encryptText } = await import('../auth/mfaUtils');
      const {
        addConnection,
        ALLOWED_BRANCHES,
        getConnectionByName,
        isAllowedBranch,
      } = await import('../db-bootstrap');
      const { syncConnectionsToDb } = await import('../storage');
      const { name, connectionUrl, notes, branch, isDefault } = req.body;
      if (!name || !connectionUrl) return res.status(400).json({ message: 'name and connectionUrl are required' });

      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'name is required' });
      }
      const branchInput = branch === undefined || branch === null || branch === '' ? 'production' : String(branch);
      if (!isAllowedBranch(branchInput)) {
        return res.status(400).json({
          message: `Invalid branch. Allowed: ${ALLOWED_BRANCHES.join(', ')}`,
        });
      }
      const resolvedBranch = branchInput;
      // Friendly duplicate-name check before we lazy-generate any
      // secrets — avoids minting fresh keys for a request that's
      // about to fail validation.
      if (getConnectionByName(trimmedName)) {
        return res.status(409).json({
          message: `A connection named "${trimmedName}" already exists`,
        });
      }

      // Lazy-generate bootstrap secrets if neither the host env nor the
      // wizard-managed file has them yet (Task #719). Adding a connection
      // is the very first admin-side write that REQUIRES encryptText to
      // work — we used to throw "ENCRYPTION_KEY not configured" here on
      // installs where the operator skipped the secrets step or wired
      // up the app outside the wizard. Generate-and-persist mirrors the
      // wizard's Phase 2 behavior, and the freshly minted values are
      // returned ONCE in `generatedSecrets` so the UI can pop a copy
      // dialog before they vanish behind the masked Reveal flow.
      const generatedSecrets: { sessionSecret?: string; encryptionKey?: string } = {};
      const {
        getBootstrapSnapshot,
        setSessionSecret,
        setEncryptionKey,
        generateSessionSecret,
        generateEncryptionKey,
      } = await import('../lib/app-config');
      const preSnap = getBootstrapSnapshot();
      if (preSnap.sessionSecretSource === 'none') {
        const v = generateSessionSecret();
        setSessionSecret(v);
        generatedSecrets.sessionSecret = v;
        console.log(`[admin/db-connections:create] Auto-generated SESSION_SECRET user=${req.session.user.id}`);
      }
      if (preSnap.encryptionKeySource === 'none') {
        const v = generateEncryptionKey();
        setEncryptionKey(v);
        generatedSecrets.encryptionKey = v;
        console.log(`[admin/db-connections:create] Auto-generated ENCRYPTION_KEY user=${req.session.user.id}`);
      }

      const trimmedUrl = String(connectionUrl).trim();

      // Server-side connectivity test BEFORE persisting (Task #739
      // done-criteria: "On save, server validates and Tests the URL
      // before persisting"). Saves the operator a round-trip and
      // prevents a typo'd URL from sitting in the file. The test
      // can be skipped with `?skipTest=1` for the rare case the
      // target DB is intentionally unreachable from this host
      // (e.g. saving a record for a future region).
      const skipTest = String(req.query.skipTest ?? '') === '1';
      if (!skipTest) {
        const { createPool } = await import('../lib/db-driver');
        const probePool = createPool(trimmedUrl, { connectionTimeoutMillis: 10_000, max: 1 });
        let probeOk = false;
        let probeErr: string | undefined;
        try {
          const c = await probePool.connect();
          await c.query('SELECT 1');
          c.release();
          probeOk = true;
        } catch (e: any) {
          probeErr = e?.message ?? 'connection failed';
        } finally {
          try { await probePool.end(); } catch {}
        }
        if (!probeOk) {
          return res.status(400).json({
            message: `Could not reach this database — ${probeErr}. Fix the URL and try again, or pass ?skipTest=1 to save anyway.`,
          });
        }
      }

      const encrypted = encryptText(trimmedUrl);
      let createdRecord;
      try {
        createdRecord = addConnection({
          name: trimmedName,
          encryptedUrl: encrypted,
          branch: resolvedBranch,
          isDefault: !!isDefault,
          notes: notes || null,
        });
      } catch (e: any) {
        return res.status(409).json({ message: e?.message ?? 'Could not save connection' });
      }
      await syncConnectionsToDb();

      // Look up the freshly mirrored table row so the response
      // carries the integer id the existing clients expect.
      const [row] = await storage.db
        .select()
        .from(dbConnections)
        .where(eq(dbConnections.name, createdRecord.name));
      const { readDriverOverride } = await import('../lib/db-driver');
      const responseBody: Record<string, unknown> = {
        id: row?.id,
        name: createdRecord.name,
        connectionUrlPreview: maskConnectionUrl(trimmedUrl),
        driverOverride: readDriverOverride(trimmedUrl),
        branch: createdRecord.branch,
        isActive: row?.isActive ?? false,
        isDefault: createdRecord.isDefault,
        isSystem: createdRecord.isSystem,
        notes: createdRecord.notes,
        lastTestedAt: row?.lastTestedAt ?? null,
        lastTestSuccess: row?.lastTestSuccess ?? null,
        lastTestLatencyMs: row?.lastTestLatencyMs ?? null,
        createdAt: row?.createdAt ?? createdRecord.createdAt,
        updatedAt: row?.updatedAt ?? createdRecord.updatedAt,
      };
      if (generatedSecrets.sessionSecret || generatedSecrets.encryptionKey) {
        responseBody.generatedSecrets = generatedSecrets;
      }
      res.status(201).json(responseBody);
    } catch (error: any) {
      console.error('Error creating db connection:', error);
      res.status(500).json({ message: 'Failed to create database connection' });
    }
  });

  // PUT /api/db-connections/:id — update name/notes/branch/isDefault and optionally connection URL
  // Task #739: writes flow through the file helpers; URL changes on
  // the currently active row return `errorCode: pending_active_required`
  // (Task #740 will replace this rejection with the real
  // typed-confirm pendingActive flow).
  app.put("/api/db-connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
      const { encryptText, decryptText } = await import('../auth/mfaUtils');
      const {
        ALLOWED_BRANCHES,
        readConnections,
        getConnectionByName,
        updateConnection,
        isAllowedBranch,
      } = await import('../db-bootstrap');
      type UpdatePatch = import('../db-bootstrap').UpdateConnectionInput;
      const { syncConnectionsToDb } = await import('../storage');
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const { name, connectionUrl, notes, branch, isDefault } = req.body;

      const existing = await storage.db.select().from(dbConnections).where(eq(dbConnections.id, id));
      if (!existing.length) return res.status(404).json({ message: 'Connection not found' });
      const tableRow = existing[0];

      // Resolve the file record by name (the canonical key shared
      // between file and table mirror).
      const fileRecord = getConnectionByName(tableRow.name);
      if (!fileRecord) {
        return res.status(409).json({
          message:
            'This connection is not present in the encrypted config file. Restart the server to re-sync, then try again.',
        });
      }

      if (branch !== undefined && !isAllowedBranch(String(branch))) {
        return res.status(400).json({
          message: `Invalid branch. Allowed: ${ALLOWED_BRANCHES.join(', ')}`,
        });
      }

      // URL change on the active row requires the typed-confirm
      // pending-active flow (Task #740). Without
      // `?confirmPendingActive=1` we still emit the typed-error code
      // so the client opens its typed-confirm modal; with the flag
      // set, the operator has confirmed and we capture the prior
      // URL, write the new one, and set `pendingActiveConnectionId`
      // to the same row. The next boot will run migrations against
      // the new URL via `resolveConnectionUrl`'s pending branch and
      // commit the swap. No system_announcements row is created —
      // see the section header below `/activate` for the rationale.
      const wantsUrlChange = !!(connectionUrl && String(connectionUrl).trim());
      const stateBefore = readConnections();
      const isActiveRecord = stateBefore.activeConnectionId === fileRecord.id;
      const confirmPendingActive = String(req.query.confirmPendingActive ?? '') === '1';

      if (wantsUrlChange && isActiveRecord && !confirmPendingActive) {
        return res.status(409).json({
          errorCode: 'pending_active_required',
          message:
            'This is the currently active connection. Confirm the typed-name modal to queue the URL change for the next restart.',
        });
      }

      const patch: UpdatePatch = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (notes !== undefined) patch.notes = notes || null;
      if (branch !== undefined) {
        const branchStr = String(branch);
        // Re-narrow with the type guard so the assignment below
        // matches `UpdateConnectionInput.branch: ConnectionBranch`
        // without an `as` cast.
        if (isAllowedBranch(branchStr)) {
          patch.branch = branchStr;
        }
      }
      if (isDefault !== undefined) patch.isDefault = !!isDefault;
      if (wantsUrlChange) {
        patch.encryptedUrl = encryptText(String(connectionUrl).trim());
      }

      // Capture the prior ciphertext URL on the active row before we
      // overwrite it — `cancelPendingActive` uses this to revert,
      // and the rollback path below uses it to restore the row if
      // `setPendingActiveState` fails after we've already written
      // the new URL to disk.
      const priorActiveCiphertext =
        wantsUrlChange && isActiveRecord && confirmPendingActive
          ? fileRecord.connectionUrl
          : null;

      let updatedRecord;
      try {
        updatedRecord = updateConnection(fileRecord.id, patch);
      } catch (e: any) {
        return res.status(409).json({ message: e?.message ?? 'Could not update connection' });
      }

      // Typed-confirm URL edit on active row: register the pending
      // switch now that the new URL is on disk. We deliberately
      // skip system_announcements: the announcement would land in
      // the *old* DB and become unreachable from the *new* DB after
      // a successful restart, so we'd either leak a stale row or
      // delete an unrelated row whose id collided. The yellow banner
      // in the panel is already file-driven via GET pending-active —
      // every admin who loads the page sees it without needing a
      // cross-DB row to back it.
      if (priorActiveCiphertext) {
        const { setPendingActiveState, updateConnection: revertConnection } =
          await import('../db-bootstrap');
        try {
          setPendingActiveState({
            pendingId: fileRecord.id,
            previousActiveUrl: priorActiveCiphertext,
          });
        } catch (e: any) {
          // Application-level rollback: the URL is already on disk
          // but the pending markers never got written. Without
          // markers, the next restart would silently apply the new
          // URL with no way to cancel — which violates the queued +
          // cancelable contract. Restore the prior ciphertext on
          // the active row and re-sync the DB mirror so the user
          // gets a clean 409 with no half-applied state.
          try {
            revertConnection(fileRecord.id, { encryptedUrl: priorActiveCiphertext });
            await syncConnectionsToDb();
          } catch (revertErr) {
            console.error(
              '[admin/db-connections:put] CRITICAL: pending-state write failed AND URL revert failed — file may be inconsistent:',
              revertErr,
            );
          }
          return res.status(409).json({
            message: e?.message ?? 'Could not register the pending URL change',
          });
        }
        console.log(
          `[admin/db-connections:put] queued URL change on active connection user=${req.session.user.id} pendingId=${fileRecord.id}`,
        );
      }

      await syncConnectionsToDb();

      // Look up the post-mirror row to return the canonical shape.
      const [row] = await storage.db
        .select()
        .from(dbConnections)
        .where(eq(dbConnections.name, updatedRecord.name));
      const { readDriverOverride } = await import('../lib/db-driver');
      let preview = '(encrypted)';
      let driverOverride: 'auto' | 'neon' | 'pg' = 'auto';
      try {
        const decrypted = decryptText(updatedRecord.connectionUrl);
        preview = maskConnectionUrl(decrypted);
        driverOverride = readDriverOverride(decrypted);
      } catch {}
      res.json({
        id: row?.id ?? id,
        name: updatedRecord.name,
        connectionUrlPreview: preview,
        driverOverride,
        branch: updatedRecord.branch,
        isActive: row?.isActive ?? false,
        isDefault: updatedRecord.isDefault,
        isSystem: updatedRecord.isSystem,
        notes: updatedRecord.notes,
        lastTestedAt: row?.lastTestedAt ?? null,
        lastTestSuccess: row?.lastTestSuccess ?? null,
        lastTestLatencyMs: row?.lastTestLatencyMs ?? null,
        createdAt: row?.createdAt ?? updatedRecord.createdAt,
        updatedAt: row?.updatedAt ?? updatedRecord.updatedAt,
      });
    } catch (error: any) {
      console.error('Error updating db connection:', error);
      res.status(500).json({ message: 'Failed to update database connection' });
    }
  });

  // DELETE /api/db-connections/:id — remove a connection (cannot delete active or system connection)
  // Task #739: deletes flow through the file helpers, then refresh
  // the table mirror.
  app.delete("/api/db-connections/:id", isAuthenticated, async (req: any, res, next) => {
    try {
      // Task #740: the static route DELETE /api/db-connections/pending-active
      // is registered after this dynamic route, so Express matches `:id` =
      // "pending-active" first. Defer to the next handler in that case.
      if (req.params.id === 'pending-active') return next();
      if (req.session.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
      const { getConnectionByName, removeConnection, readConnections } = await import('../db-bootstrap');
      const { syncConnectionsToDb } = await import('../storage');
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const existing = await storage.db.select().from(dbConnections).where(eq(dbConnections.id, id));
      if (!existing.length) return res.status(404).json({ message: 'Connection not found' });
      const tableRow = existing[0];

      if (tableRow.isSystem) {
        return res.status(400).json({
          message:
            'Cannot delete a system connection. Rename it if you no longer recognise the name, but the install needs at least one bootstrap row.',
        });
      }
      if (tableRow.isActive) {
        return res.status(400).json({
          message:
            'Cannot delete the currently active connection. Activate a different connection first.',
        });
      }

      const fileRecord = getConnectionByName(tableRow.name);
      if (fileRecord) {
        // Defensive — refuse to delete an active or system file
        // record even if the table flags say otherwise (covers the
        // window where a stale mirror disagrees with the file).
        const state = readConnections();
        if (fileRecord.isSystem) {
          return res.status(400).json({
            message: 'Cannot delete a system connection',
          });
        }
        if (state.activeConnectionId === fileRecord.id) {
          return res.status(400).json({
            message: 'Cannot delete the currently active connection',
          });
        }
        try {
          removeConnection(fileRecord.id);
        } catch (e: any) {
          return res.status(409).json({ message: e?.message ?? 'Could not delete connection' });
        }
      }
      await syncConnectionsToDb();
      res.json({ message: 'Connection deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting db connection:', error);
      res.status(500).json({ message: 'Failed to delete database connection' });
    }
  });

  // POST /api/db-connections/:id/reveal — Admin: return decrypted URL ONCE.
  // Task #739: client re-masks the value after 10s; the server
  // response is single-use only (no caching) which mirrors the
  // existing Bootstrap Secrets reveal pattern.
  // Task #767: every reveal — successful OR denied — also writes a
  // row to `audit_logins` tagged event_type='secret_reveal' so an
  // incident review can answer "who looked at this connection's URL
  // and when?" beyond what host log rotation preserves. The handler
  // body is the exported `revealDbConnectionHandler` below so the
  // route-level guard tests can mount it on a minimal app without
  // pulling in the rest of `registerRoutes`.
  app.post("/api/db-connections/:id/reveal", revealDbConnectionHandler);

  // POST /api/db-connections/:id/test — test a stored connection
  // Task #739: persists lastTested* to the file too so the next
  // boot's mirror reflects the test results without an extra round
  // trip.
  app.post("/api/db-connections/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const { decryptText } = await import('../auth/mfaUtils');
      // Task #479: pick the matching driver per URL — a stored
      // connection record can point at any Postgres flavor.
      const { createPool } = await import('../lib/db-driver');
      const { getConnectionByName, updateConnection } = await import('../db-bootstrap');
      const rows = await storage.db.select().from(dbConnections).where(eq(dbConnections.id, id));
      if (!rows.length) return res.status(404).json({ message: 'Connection not found' });
      const decrypted = decryptText(rows[0].connectionUrl);
      const testPool = createPool(decrypted, { connectionTimeoutMillis: 10_000, max: 1 });
      const start = Date.now();
      let success = false;
      let errorMsg: string | undefined;
      try {
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        success = true;
      } catch (err: any) {
        errorMsg = err.message;
      }
      try { await testPool.end(); } catch {}
      const latencyMs = Date.now() - start;
      const testedAt = new Date();
      await storage.db.update(dbConnections).set({
        lastTestedAt: testedAt,
        lastTestSuccess: success,
        lastTestLatencyMs: latencyMs,
        updatedAt: new Date(),
      }).where(eq(dbConnections.id, id));
      // Mirror to the file so the next boot's syncConnectionsToDb
      // doesn't overwrite the timestamps with stale nulls. Best-effort
      // — if the file write fails (read-only volume, etc.) we still
      // return the test result.
      try {
        const fileRecord = getConnectionByName(rows[0].name);
        if (fileRecord) {
          updateConnection(fileRecord.id, {
            lastTestedAt: testedAt.toISOString(),
            lastTestSuccess: success,
            lastTestLatencyMs: latencyMs,
          });
        }
      } catch (e: any) {
        console.warn('[admin/db-connections:test] Could not mirror test result to file:', e?.message ?? e);
      }
      res.json({ success, latencyMs, error: errorMsg });
    } catch (error: any) {
      console.error('Error testing db connection:', error);
      res.status(500).json({ message: 'Failed to test database connection' });
    }
  });

  // POST /api/db-connections/:id/activate — mark connection as active; write to bootstrap file
  // Task #739: writes flow through the file (setActiveConnectionId)
  // so the next boot's resolveConnectionUrl picks up the new active
  // record. Task #740 will introduce the pendingActive flow on top of
  // this.
  app.post("/api/db-connections/:id/activate", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const {
        getConnectionByName,
        setActiveConnectionId,
      } = await import('../db-bootstrap');
      const { syncConnectionsToDb } = await import('../storage');
      const rows = await storage.db.select().from(dbConnections).where(eq(dbConnections.id, id));
      if (!rows.length) return res.status(404).json({ message: 'Connection not found' });

      const fileRecord = getConnectionByName(rows[0].name);
      if (!fileRecord) {
        return res.status(409).json({
          message:
            'This connection is not present in the encrypted config file. Restart the server to re-sync, then try again.',
        });
      }
      try {
        setActiveConnectionId(fileRecord.id);
      } catch (e: any) {
        return res.status(409).json({ message: e?.message ?? 'Could not activate connection' });
      }
      await syncConnectionsToDb();
      res.json({
        success: true,
        restartRequired: true,
        message: 'Connection activated and saved. Restart the server to start using this database.',
      });
    } catch (error: any) {
      console.error('Error activating db connection:', error);
      res.status(500).json({ message: 'Failed to activate database connection' });
    }
  });

  // ---------------------------------------------------------------
  // Task #740 — Pending-active ("Set Active for next restart")
  // GET /api/db-connections/pending-active — Admin: returns the
  // queued switch (or null), driving the yellow banner in the panel.
  // No system_announcements row is created for queued switches —
  // it would land in the OLD DB and be unreachable after a
  // successful restart. The file-driven banner is sufficient.
  app.get(
    '/api/db-connections/pending-active',
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== 'Admin') {
          return res.status(403).json({ message: 'Admin only' });
        }
        const { readConnections } = await import('../db-bootstrap');
        const state = readConnections();
        if (!state.pendingActiveConnectionId) {
          return res.json({ pending: null });
        }
        const target = state.connections.find(
          (c) => c.id === state.pendingActiveConnectionId,
        );
        if (!target) {
          return res.json({ pending: null });
        }
        // Distinguish "edit-active-url" from "swap-to-different-row"
        // so the banner can render the right wording.
        const isUrlEdit =
          state.activeConnectionId === state.pendingActiveConnectionId;
        // The file uses slug ids; the panel's connections list uses
        // numeric DB row ids. Look up the matching row by name so
        // `pending.id` matches `conn.id` for client-side comparison.
        let dbRowId: number | null = null;
        try {
          const matched = await storage.db
            .select({ id: dbConnections.id })
            .from(dbConnections)
            .where(eq(dbConnections.name, target.name));
          if (matched.length > 0) dbRowId = matched[0].id;
        } catch (lookupErr) {
          console.warn('[pending-active] DB-row id lookup failed:', lookupErr);
        }
        res.json({
          pending: {
            id: dbRowId,
            name: target.name,
            branch: target.branch,
            kind: isUrlEdit ? 'url-edit' : 'switch',
          },
        });
      } catch (error: any) {
        console.error('Error reading pending-active state:', error);
        res.status(500).json({ message: 'Failed to read pending-active state' });
      }
    },
  );

  // POST /api/db-connections/:id/set-pending-active — Admin: queue
  // this connection for the NEXT boot. Refuses if it's already
  // active. No system_announcements row is created — see the GET
  // pending-active comment above for why the cross-DB write was
  // removed. Other admin tabs pick up the queued switch via the
  // file-driven GET /api/db-connections/pending-active poll.
  app.post(
    '/api/db-connections/:id/set-pending-active',
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== 'Admin') {
          return res.status(403).json({ message: 'Admin only' });
        }
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
        const {
          getConnectionByName,
          readConnections,
          setPendingActiveState,
        } = await import('../db-bootstrap');
        const rows = await storage.db
          .select()
          .from(dbConnections)
          .where(eq(dbConnections.id, id));
        if (!rows.length) return res.status(404).json({ message: 'Connection not found' });
        const tableRow = rows[0];
        const fileRecord = getConnectionByName(tableRow.name);
        if (!fileRecord) {
          return res.status(409).json({
            message:
              'This connection is not present in the encrypted config file. Restart the server to re-sync, then try again.',
          });
        }
        const state = readConnections();
        if (state.activeConnectionId === fileRecord.id) {
          return res.status(409).json({
            message:
              'This connection is already active. Edit its URL via the typed-confirm dialog if you need to change where it points.',
          });
        }
        try {
          setPendingActiveState({
            pendingId: fileRecord.id,
            previousActiveUrl: null,
          });
        } catch (e: any) {
          return res
            .status(409)
            .json({ message: e?.message ?? 'Could not queue the switch' });
        }

        console.log(
          `[admin/db-connections:set-pending-active] user=${req.session.user.id} pendingId=${fileRecord.id}`,
        );
        res.json({
          success: true,
          pending: {
            id: tableRow.id,
            name: fileRecord.name,
            branch: fileRecord.branch,
            kind: 'switch',
          },
          message:
            'Switch queued. Restart the server to boot against this connection.',
        });
      } catch (error: any) {
        console.error('Error queuing pending-active connection:', error);
        res.status(500).json({ message: 'Failed to queue pending-active connection' });
      }
    },
  );

  // DELETE /api/db-connections/pending-active — Admin: cancel a
  // queued switch (and revert any typed-confirm URL edit).
  app.delete(
    '/api/db-connections/pending-active',
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== 'Admin') {
          return res.status(403).json({ message: 'Admin only' });
        }
        const { cancelPendingActive } = await import('../db-bootstrap');
        const { syncConnectionsToDb } = await import('../storage');
        cancelPendingActive();
        // Re-mirror the file → table so any reverted URL shows up
        // in the GET /api/db-connections list.
        try {
          await syncConnectionsToDb();
        } catch (syncErr) {
          console.warn(
            '[admin/db-connections:cancel-pending-active] sync failed (continuing):',
            syncErr,
          );
        }
        console.log(
          `[admin/db-connections:cancel-pending-active] user=${req.session.user.id}`,
        );
        res.json({ success: true, message: 'Pending switch cancelled.' });
      } catch (error: any) {
        console.error('Error cancelling pending-active connection:', error);
        res.status(500).json({ message: 'Failed to cancel pending-active connection' });
      }
    },
  );

  // POST /api/db-connections/test-url — test an ad-hoc connection URL (not stored)
  app.post("/api/db-connections/test-url", isAuthenticated, async (req: any, res) => {
    try {
      const { connectionUrl } = req.body;
      if (!connectionUrl) return res.status(400).json({ message: 'connectionUrl is required' });
      // Task #479: pick the matching driver per URL — an ad-hoc
      // operator-supplied URL might point anywhere.
      const { createPool } = await import('../lib/db-driver');
      const testPool = createPool(connectionUrl, { connectionTimeoutMillis: 10_000, max: 1 });
      const start = Date.now();
      let success = false;
      let errorMsg: string | undefined;
      try {
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        success = true;
      } catch (err: any) {
        errorMsg = err.message;
      }
      try { await testPool.end(); } catch {}
      res.json({ success, latencyMs: Date.now() - start, error: errorMsg });
    } catch (error: any) {
      res.status(500).json({ message: 'Failed to test connection' });
    }
  });

  // POST /api/db-connections/restart — Admin: restart server
  app.post("/api/db-connections/restart", isAuthenticated, async (req: any, res) => {
    if (req.session.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
    res.json({ success: true, message: 'Server restarting...' });
    setTimeout(() => process.exit(0), 500);
  });
}
