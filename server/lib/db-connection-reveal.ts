// Handler for POST /api/db-connections/:id/reveal — Admin-only,
// audit-logged, decrypt-once secret reveal.
//
// Lifted out of server/routes.ts so route-level guard tests in
// server/__tests__/secret-reveal-guards.test.ts can mount it on a
// minimal Express app without standing up the rest of
// `registerRoutes`. routes.ts re-exports this symbol for backwards-
// compatibility with the existing test import path.
//
// Audit contract: every branch — unauthenticated probe, non-admin
// caller, invalid id, missing row, decrypt failure, internal error,
// AND success — writes a row to `audit_logins` tagged
// `event_type='secret_reveal'` via the defensive `auditReveal`
// wrapper. The wrapper swallows BOTH lazy-import failures of
// `../auth/simpleAuth` AND audit-row insert failures so a transient
// audit-side problem can never convert a clean reveal-rejection
// into a 500.
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { dbConnections } from "@shared/schema";

export async function revealDbConnectionHandler(
  req: any,
  res: any,
): Promise<void> {
  const rawId = req.params.id;
  const subjectKey = `db-connection:${rawId}`;

  const DENY = {
    UNAUTHENTICATED: 'unauthenticated',
    NOT_ADMIN: 'not_admin',
    INVALID_ID: 'invalid_id',
    NOT_FOUND: 'not_found',
    DECRYPT_FAILED: 'decrypt_failed',
    INTERNAL_ERROR: 'internal_error',
  } as const;
  const auditReveal = async (params: {
    key: string;
    success: boolean;
    reason?: string | null;
  }): Promise<void> => {
    try {
      const { recordSecretRevealAudit } = await import('../auth/simpleAuth');
      await recordSecretRevealAudit(req, params);
    } catch (auditError) {
      console.error(
        '[admin/db-connections:reveal] audit-row insert failed (swallowed):',
        auditError,
      );
    }
  };

  // Inlined auth guard — see route comment above. Replaces the
  // previous `isAuthenticated` middleware so unauthenticated probes
  // also write an audit row before the 401 is returned.
  if (!req.session?.user) {
    await auditReveal({
      key: subjectKey,
      success: false,
      reason: DENY.UNAUTHENTICATED,
    });
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    if (req.session.user.role !== 'Admin') {
      await auditReveal({
        key: subjectKey,
        success: false,
        reason: DENY.NOT_ADMIN,
      });
      res.status(403).json({ message: 'Admin only' });
      return;
    }
    const id = parseInt(rawId as string);
    if (isNaN(id)) {
      await auditReveal({
        key: subjectKey,
        success: false,
        reason: DENY.INVALID_ID,
      });
      res.status(400).json({ message: 'Invalid ID' });
      return;
    }
    const rows = await storage.db
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.id, id));
    if (!rows.length) {
      await auditReveal({
        key: `db-connection:${id}`,
        success: false,
        reason: DENY.NOT_FOUND,
      });
      res.status(404).json({ message: 'Connection not found' });
      return;
    }
    const { decryptText } = await import('../auth/mfaUtils');
    let plaintext: string;
    try {
      plaintext = decryptText(rows[0].connectionUrl);
    } catch (e: any) {
      await auditReveal({
        key: `db-connection:${id}`,
        success: false,
        reason: DENY.DECRYPT_FAILED,
      });
      res.status(500).json({
        message:
          'Could not decrypt the stored URL — the encryption key may have changed since this row was saved.',
      });
      return;
    }
    console.log(
      `[admin/db-connections:reveal] user=${req.session.user.id} connectionId=${id} name=${rows[0].name}`,
    );
    await auditReveal({
      key: `db-connection:${id}`,
      success: true,
    });
    res.json({ id, name: rows[0].name, connectionUrl: plaintext });
  } catch (error: any) {
    console.error('Error revealing db connection:', error);
    await auditReveal({
      key: subjectKey,
      success: false,
      reason: DENY.INTERNAL_ERROR,
    });
    res.status(500).json({ message: 'Failed to reveal connection URL' });
  }
}
