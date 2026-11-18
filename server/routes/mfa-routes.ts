// MFA routes (Phase 8 extraction #20).
//
// 8 handlers covering MFA status / TOTP setup+verify / current-user
// security info / recovery-code regenerate / MFA disable / admin
// per-user security view + admin MFA reset:
//
//   GET  /api/mfa/status/:userId
//   POST /api/mfa/totp/setup                       (no auth — uses temp token)
//   POST /api/mfa/totp/verify                      (no auth — uses temp token)
//   GET  /api/me/security
//   POST /api/mfa/recovery/regenerate
//   POST /api/mfa/disable
//   GET  /api/admin/users/:id/security
//   POST /api/admin/users/:id/mfa/reset
//
// The shared `verifyMfaAuth(req)` helper accepts either a Bearer
// temp token (for the still-unauthenticated post-login MFA exchange)
// or an authenticated session, returning the resolved userId either
// way. Mechanical sed extraction.
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { eq, and, or, isNull, lt, sql } from "drizzle-orm";
import { storage } from "../storage";
import {
  mfaRecoveryCodes,
  webauthnCredentials,
  trustedDevices,
  mfaEvents,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { registerMfaChallengeRoute } from "../auth/mfaChallengeRoute";
import {
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  calculateSecurityHealth,
  verifyTempToken,
  encryptText,
  decryptText,
  checkRateLimit,
  recordAttemptResult,
} from "../auth/mfaUtils";

export function registerMfaRoutes(app: Express) {
  function verifyMfaAuth(req: any): { userId: string; fromTempToken: boolean } | null {
    // Check for temp token first
    const tempToken = req.headers.authorization?.replace('Bearer ', '');
    if (tempToken) {
      const tokenData = verifyTempToken(tempToken);
      if (tokenData) {
        return { userId: tokenData.userId, fromTempToken: true };
      }
    }
    
    // Check for authenticated session
    if (req.session?.user?.id) {
      return { userId: req.session.user.id, fromTempToken: false };
    }
    
    return null;
  }

  // MFA Status - get current MFA status and security health for a user
  app.get('/api/mfa/status/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const targetUserId = req.params.userId;
      const currentUserId = req.session.user.id;
      
      // Check authorization: user accessing self or admin accessing any user
      const currentUser = await storage.getUser(currentUserId);
      const canAccess = currentUserId === targetUserId || 
                       (currentUser && currentUser.role === 'Admin');
      
      if (!canAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get user MFA data from storage
      const userMfaData = await storage.getUserMfaData(targetUserId);
      
      if (!userMfaData) {
        // Return default status for user with no MFA data
        return res.json({
          enabled: false,
          method: null,
          enrolledAt: null,
          recoveryCount: 0,
          passkeyCount: 0,
          securityHealth: {
            enabled: false,
            method: null,
            enrolledAt: null,
            recoveryCount: 0,
            passkeyCount: 0,
            health: 'red'
          }
        });
      }

      // Calculate security health using static import
      const securityHealth = calculateSecurityHealth(
        userMfaData.enabled,
        userMfaData.method,
        userMfaData.enrolledAt,
        userMfaData.recoveryCount,
        userMfaData.passkeyCount
      );

      // Return only safe, whitelisted fields (no object spread)
      res.json({
        enabled: userMfaData.enabled,
        method: userMfaData.method,
        enrolledAt: userMfaData.enrolledAt,
        recoveryCount: userMfaData.recoveryCount,
        passkeyCount: userMfaData.passkeyCount,
        securityHealth
      });

    } catch (error: any) {
      console.error('MFA status error:', error);
      res.status(500).json({ message: 'Failed to fetch MFA status' });
    }
  });

  // TOTP Setup - generates secret and QR code
  app.post('/api/mfa/totp/setup', async (req: any, res) => {
    try {
      const auth = verifyMfaAuth(req);
      if (!auth) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const user = await storage.getUser(auth.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Generate TOTP secret
      const secret = generateTotpSecret();
      const otpauthUrl = generateTotpUri(user.email ?? '', secret);
      const qrPngDataUrl = await generateQrCodeDataUrl(otpauthUrl);

      // Encrypt and store the secret (temporarily, until verification)
      const encryptedSecret = encryptText(secret);
      await storage.updateUser(auth.userId, { 
        totpSecretEnc: encryptedSecret 
      });

      res.json({
        otpauthUrl,
        qrPngDataUrl,
        secret
      });
    } catch (error: any) {
      console.error('TOTP setup error:', error);
      res.status(500).json({ message: 'Failed to setup TOTP' });
    }
  });

  // TOTP Verification - verifies code and completes MFA setup
  app.post('/api/mfa/totp/verify', async (req: any, res) => {
    try {
      const { code } = req.body;
      const auth = verifyMfaAuth(req);
      
      if (!auth || !code) {
        return res.status(400).json({ message: 'Authentication and verification code required' });
      }

      // Rate limiting
      const rateLimitKey = `totp_verify:${auth.userId}`;
      if (!(await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000))) {
        return res.status(429).json({ message: 'Too many verification attempts. Please try again later.' });
      }

      const user = await storage.getUser(auth.userId);
      if (!user || !user.totpSecretEnc) {
        return res.status(400).json({ message: 'TOTP setup not initialized' });
      }

      // Decrypt secret and verify code
      const secret = decryptText(user.totpSecretEnc);
      const isValid = verifyTotpCode(code, secret);
      
      if (!isValid) {
        await recordAttemptResult(rateLimitKey, false);
        return res.status(400).json({ message: 'Invalid verification code' });
      }

      // Record successful attempt
      await recordAttemptResult(rateLimitKey, true);

      // Generate recovery codes
      const recoveryCodes = generateRecoveryCodes(10);
      const hashedCodes = await Promise.all(
        recoveryCodes.map(code => hashRecoveryCode(code))
      );

      // Store recovery codes in database
      for (const hashedCode of hashedCodes) {
        await storage.insertMfaRecoveryCode(auth.userId, hashedCode);
      }

      // Enable MFA
      await storage.updateUser(auth.userId, {
        mfaEnabled: true,
        mfaMethod: 'totp',
        mfaEnrolledAt: new Date(),
        securitySetupRequired: false
      });

      // Create session if from temp token
      if (auth.fromTempToken) {
        req.session.user = { id: auth.userId, email: user.email, role: user.role };
      }

      res.json({
        recoveryCodes,
        message: 'MFA setup completed successfully'
      });
    } catch (error: any) {
      console.error('TOTP verification error:', error);
      res.status(500).json({ message: 'Failed to verify TOTP' });
    }
  });

  // MFA Challenge - handles TOTP code, recovery code, or WebAuthn verification
  // Implementation lives in `server/auth/mfaChallengeRoute.ts` so the
  // password→MFA login flow can be exercised end-to-end by the
  // integration test in `server/auth/__tests__/login-mfa-flow.integration.test.ts`
  // without booting the full route surface (Task #597). The
  // post-challenge audit + login-stats + session-tracking bookkeeping
  // for MFA-gated logins (Task #596) lives in that same module.
  registerMfaChallengeRoute(app);
  // Stash the obsolete inline implementation under an `if (false)` so

  // Security Health API
  app.get('/api/me/security', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Count unused recovery codes
      let recoveryCount = 0;
      try {
        const recoveryResult = await storage.db
          .select({ count: sql`count(*)` })
          .from(mfaRecoveryCodes)
          .where(and(
            eq(mfaRecoveryCodes.userId, userId),
            isNull(mfaRecoveryCodes.usedAt)
          ));
        recoveryCount = parseInt((recoveryResult[0]?.count as string) || '0');
      } catch (error: any) {
        console.error('Error counting recovery codes:', error);
        recoveryCount = 0;
      }

      // Count WebAuthn credentials
      let passkeyCount = 0;
      try {
        const passkeyResult = await storage.db
          .select({ count: sql`count(*)` })
          .from(webauthnCredentials)
          .where(eq(webauthnCredentials.userId, userId));
        passkeyCount = parseInt((passkeyResult[0]?.count as string) || '0');
      } catch (error: any) {
        console.error('Error counting passkeys:', error);
        passkeyCount = 0;
      }

      const securityHealth = calculateSecurityHealth(
        user.mfaEnabled || false,
        user.mfaMethod,
        user.mfaEnrolledAt,
        recoveryCount,
        passkeyCount
      );

      res.json(securityHealth);
    } catch (error: any) {
      console.error('Security health error:', error);
      res.status(500).json({ message: 'Failed to fetch security health' });
    }
  });

  // Regenerate Recovery Codes
  app.post('/api/mfa/recovery/regenerate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.mfaEnabled) {
        return res.status(400).json({ message: 'MFA not enabled' });
      }

      // Delete existing recovery codes
      await storage.db
        .delete(mfaRecoveryCodes)
        .where(eq(mfaRecoveryCodes.userId, userId));

      // Generate new recovery codes
      const recoveryCodes = generateRecoveryCodes(10);
      const hashedCodes = await Promise.all(
        recoveryCodes.map(code => hashRecoveryCode(code))
      );

      // Store new recovery codes
      for (const hashedCode of hashedCodes) {
        await storage.db.insert(mfaRecoveryCodes).values({
          userId,
          codeHash: hashedCode
        });
      }

      res.json({ recoveryCodes });
    } catch (error: any) {
      console.error('Recovery codes regeneration error:', error);
      res.status(500).json({ message: 'Failed to regenerate recovery codes' });
    }
  });

  // Disable MFA
  app.post('/api/mfa/disable', isAuthenticated, async (req: any, res) => {
    try {
      const { password } = req.body;
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.mfaEnabled) {
        return res.status(400).json({ message: 'MFA not enabled' });
      }

      // Verify password
      if (!password || !user.password || !await bcrypt.compare(password, user.password)) {
        return res.status(400).json({ message: 'Invalid password' });
      }

      // Disable MFA and clean up
      await storage.updateUser(userId, {
        mfaEnabled: false,
        mfaMethod: null,
        totpSecretEnc: null,
        mfaEnrolledAt: null
      });

      // Delete recovery codes, trusted devices, and WebAuthn credentials
      await Promise.all([
        storage.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId)),
        storage.db.delete(trustedDevices).where(eq(trustedDevices.userId, userId)),
        storage.db.delete(webauthnCredentials).where(eq(webauthnCredentials.userId, userId))
      ]);

      res.json({ message: 'MFA disabled successfully' });
    } catch (error: any) {
      console.error('MFA disable error:', error);
      res.status(500).json({ message: 'Failed to disable MFA' });
    }
  });

  // Admin - Get user security info
  app.get('/api/admin/users/:id/security', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.session.user.id);
      if (!currentUser || currentUser.role !== 'Admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const targetUserId = req.params.id;
      const user = await storage.getUser(targetUserId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Count unused recovery codes
      const recoveryCount = await storage.db
        .select({ count: sql`count(*)` })
        .from(mfaRecoveryCodes)
        .where(and(
          eq(mfaRecoveryCodes.userId, targetUserId),
          isNull(mfaRecoveryCodes.usedAt)
        ))
        .then((result: any) => parseInt((result[0]?.count as string) || '0'));

      // Count WebAuthn credentials
      const passkeyCount = await storage.db
        .select({ count: sql`count(*)` })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, targetUserId))
        .then(result => parseInt((result[0]?.count as string) || '0'));

      const securityHealth = calculateSecurityHealth(
        user.mfaEnabled || false,
        user.mfaMethod,
        user.mfaEnrolledAt,
        recoveryCount,
        passkeyCount
      );

      res.json(securityHealth);
    } catch (error: any) {
      console.error('Admin security info error:', error);
      res.status(500).json({ message: 'Failed to fetch user security info' });
    }
  });

  // Admin - Reset user MFA
  app.post('/api/admin/users/:id/mfa/reset', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.session.user.id);
      if (!currentUser || currentUser.role !== 'Admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const targetUserId = req.params.id;
      const user = await storage.getUser(targetUserId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Reset MFA settings
      await storage.updateUser(targetUserId, {
        securitySetupRequired: true,
        mfaEnabled: false,
        mfaMethod: null,
        totpSecretEnc: null,
        mfaEnrolledAt: null
      });

      // Clean up MFA data
      await Promise.all([
        storage.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, targetUserId)),
        storage.db.delete(trustedDevices).where(eq(trustedDevices.userId, targetUserId)),
        storage.db.delete(webauthnCredentials).where(eq(webauthnCredentials.userId, targetUserId))
      ]);

      res.json({ message: 'User MFA reset successfully' });
    } catch (error: any) {
      console.error('Admin MFA reset error:', error);
      res.status(500).json({ message: 'Failed to reset user MFA' });
    }
  });
}
