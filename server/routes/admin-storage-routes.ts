// Admin Storage Configuration routes (Phase 8 extraction #11d).
//
// Three admin-only handlers for the cloud-storage configuration UI:
//
//   GET  /api/admin/storage/config    (returns masked config + active provider)
//   POST /api/admin/storage/config    (upsert + reinitialise driver)
//   POST /api/admin/storage/test      (write/read/delete round-trip)
//
// Design notes:
//   - Per-provider credentials are stored encrypted-at-rest via
//     `encryptText` from auth/mfaUtils. The GET response masks them
//     with `••••••••` so the UI never sees raw secrets.
//   - The POST handler preserves credentials for providers other than
//     the one currently being saved, so an admin switching from AWS to
//     GCS doesn't lose their AWS keys.
//   - Cloud-storage runtime helpers (`initStorageDriver`,
//     `getActiveProvider`, `getConfigSource`, `testConnection`) are
//     dynamic-imported to avoid a top-level dependency cycle with the
//     storage configuration row that drives them.
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { encryptText, decryptText } from "../auth/mfaUtils";

interface StorageConfigData {
  provider: string;
  enabled: boolean;
  gcsBucketName: string | null;
  gcsKeyJson: string | null;
  awsRegion: string | null;
  awsBucketName: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  azureAccountName: string | null;
  azureAccountKey: string | null;
  azureContainerName: string | null;
  azureSasToken: string | null;
  updatedBy: string;
  createdBy: string;
}

const MASKED = '••••••••';
const SENSITIVE_STORAGE_FIELDS = ['gcsKeyJson', 'awsSecretAccessKey', 'azureAccountKey', 'azureSasToken', 'awsAccessKeyId'];

function maskStorageConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!config) return null;
  const masked: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_STORAGE_FIELDS) {
    if (masked[field]) masked[field] = MASKED;
  }
  return masked;
}

export function registerAdminStorageRoutes(app: Express) {
  // GET /api/admin/storage/config — masked config for UI display
  app.get('/api/admin/storage/config', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can view storage configuration' });
      }
      const { getActiveProvider, getConfigSource } = await import('../lib/cloud-storage');
      const { getFilesDbInfo } = await import('../lib/files-db');
      const config = await storage.getStorageConfiguration();
      res.json({
        dbConfig: maskStorageConfig(config),
        activeProvider: getActiveProvider(),
        configSource: getConfigSource(),
        // Used by the Database tab in Storage Providers to show which
        // Postgres database the `db` provider is backed by, where it
        // was derived from, and whether the auto-create succeeded.
        filesDb: getFilesDbInfo(),
      });
    } catch (error: any) {
      console.error('Error fetching storage config:', error);
      res.status(500).json({ message: 'Failed to fetch storage configuration' });
    }
  });

  // POST /api/admin/storage/config — save and reinitialise driver
  app.post('/api/admin/storage/config', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can configure storage' });
      }

      const {
        provider,
        enabled,
        gcsBucketName,
        gcsKeyJson,
        awsRegion,
        awsBucketName,
        awsAccessKeyId,
        awsSecretAccessKey,
        azureAccountName,
        azureAccountKey,
        azureContainerName,
        azureSasToken,
      } = req.body;

      if (!provider || !['gcs', 'aws', 'azure', 'local', 'db'].includes(provider)) {
        return res.status(400).json({ message: 'Invalid provider. Must be gcs, aws, azure, local, or db.' });
      }

      const existing = await storage.getStorageConfiguration();

      // Start with preserved values for ALL provider fields from existing config.
      // Only the fields that belong to the provider being saved will be overwritten
      // below, so credentials for other providers are never lost on a provider switch.
      const configData: StorageConfigData = {
        provider,
        enabled: enabled !== false,
        // Preserve existing values for all providers as baseline
        gcsBucketName: existing?.gcsBucketName ?? null,
        gcsKeyJson: existing?.gcsKeyJson ?? null,
        awsRegion: existing?.awsRegion ?? null,
        awsBucketName: existing?.awsBucketName ?? null,
        awsAccessKeyId: existing?.awsAccessKeyId ?? null,
        awsSecretAccessKey: existing?.awsSecretAccessKey ?? null,
        azureAccountName: existing?.azureAccountName ?? null,
        azureAccountKey: existing?.azureAccountKey ?? null,
        azureContainerName: existing?.azureContainerName ?? null,
        azureSasToken: existing?.azureSasToken ?? null,
        updatedBy: req.session.user.id,
        createdBy: existing?.createdBy ?? req.session.user.id,
      };

      // Now overwrite only the fields for the provider being configured
      if (provider === 'gcs') {
        if (gcsBucketName !== undefined) configData.gcsBucketName = gcsBucketName || null;
        if (gcsKeyJson !== undefined && gcsKeyJson !== MASKED) configData.gcsKeyJson = gcsKeyJson ? encryptText(gcsKeyJson) : null;
      } else if (provider === 'aws') {
        if (awsRegion !== undefined) configData.awsRegion = awsRegion || null;
        if (awsBucketName !== undefined) configData.awsBucketName = awsBucketName || null;
        if (awsAccessKeyId !== undefined && awsAccessKeyId !== MASKED) configData.awsAccessKeyId = awsAccessKeyId ? encryptText(awsAccessKeyId) : null;
        if (awsSecretAccessKey !== undefined && awsSecretAccessKey !== MASKED) configData.awsSecretAccessKey = awsSecretAccessKey ? encryptText(awsSecretAccessKey) : null;
      } else if (provider === 'azure') {
        if (azureAccountName !== undefined) configData.azureAccountName = azureAccountName || null;
        if (azureContainerName !== undefined) configData.azureContainerName = azureContainerName || null;
        if (azureAccountKey !== undefined && azureAccountKey !== MASKED) configData.azureAccountKey = azureAccountKey ? encryptText(azureAccountKey) : null;
        if (azureSasToken !== undefined && azureSasToken !== MASKED) configData.azureSasToken = azureSasToken ? encryptText(azureSasToken) : null;
      }
      // 'local' provider: no provider-specific credential fields to update

      // Provider-specific required-field validation (post-merge, so existing DB values count)
      if (provider === 'gcs' && configData.enabled) {
        if (!configData.gcsBucketName) {
          return res.status(400).json({ message: 'GCS bucket name is required.' });
        }
      } else if (provider === 'aws' && configData.enabled) {
        const missing = (['awsRegion', 'awsBucketName', 'awsAccessKeyId', 'awsSecretAccessKey'] as Array<keyof StorageConfigData>).filter(f => !configData[f]);
        if (missing.length > 0) {
          return res.status(400).json({ message: `AWS configuration is missing required fields: ${missing.join(', ')}.` });
        }
      } else if (provider === 'azure' && configData.enabled) {
        const missingBase = (['azureAccountName', 'azureContainerName'] as Array<keyof StorageConfigData>).filter(f => !configData[f]);
        if (missingBase.length > 0) {
          return res.status(400).json({ message: `Azure configuration is missing required fields: ${missingBase.join(', ')}.` });
        }
        if (!configData.azureAccountKey && !configData.azureSasToken) {
          return res.status(400).json({ message: 'Azure configuration requires either an account key or a SAS token.' });
        }
      }

      const saved = await storage.upsertStorageConfiguration(configData);

      // Reinitialise the driver with new config
      const { initStorageDriver } = await import('../lib/cloud-storage');
      await initStorageDriver(saved);

      res.json({ ...maskStorageConfig(saved), message: 'Storage configuration saved and applied.' });
    } catch (error: any) {
      console.error('Error saving storage config:', error);
      res.status(500).json({ message: 'Failed to save storage configuration' });
    }
  });

  // POST /api/admin/storage/test — validate the credentials in the request
  // body by building a THROWAWAY driver and pinging it, WITHOUT touching the
  // active/saved driver. This lets an admin verify creds before saving.
  //
  // Masked secret fields (the `••••••••` sentinel) or omitted fields fall
  // back to the stored, decrypted value — same preservation contract as the
  // save route — so "Test" works on a slot whose secret the admin hasn't
  // re-typed. Falls back to pinging the active driver when the body carries
  // no provider (e.g. the System Health status-mirror "test current" path).
  app.post('/api/admin/storage/test', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can test storage' });
      }

      const provider = req.body?.provider as string | undefined;

      // No provider in the body → legacy behavior: ping the active driver.
      if (!provider) {
        const { testConnection } = await import('../lib/cloud-storage');
        return res.json(await testConnection());
      }

      if (!['gcs', 'aws', 'azure', 'local', 'db'].includes(provider)) {
        return res.status(400).json({ ok: false, message: 'Invalid provider.' });
      }

      const existing = await storage.getStorageConfiguration();

      // For each sensitive field: use the typed plaintext unless it's
      // missing or the masked sentinel, in which case decrypt the stored
      // value. Non-sensitive fields take the typed value, falling back to
      // the stored value.
      const sensitive = (incoming: unknown, stored: string | null | undefined): string | null => {
        if (typeof incoming === 'string' && incoming.length > 0 && incoming !== MASKED) return incoming;
        if (stored) {
          try { return decryptText(stored); } catch { return null; }
        }
        return null;
      };
      const plainField = (incoming: unknown, stored: string | null | undefined): string | null => {
        if (typeof incoming === 'string' && incoming.length > 0) return incoming;
        return stored ?? null;
      };

      const b = req.body ?? {};
      const plain = {
        gcsBucketName: plainField(b.gcsBucketName, existing?.gcsBucketName),
        gcsKeyJson: sensitive(b.gcsKeyJson, existing?.gcsKeyJson),
        awsRegion: plainField(b.awsRegion, existing?.awsRegion),
        awsBucketName: plainField(b.awsBucketName, existing?.awsBucketName),
        awsAccessKeyId: sensitive(b.awsAccessKeyId, existing?.awsAccessKeyId),
        awsSecretAccessKey: sensitive(b.awsSecretAccessKey, existing?.awsSecretAccessKey),
        azureAccountName: plainField(b.azureAccountName, existing?.azureAccountName),
        azureContainerName: plainField(b.azureContainerName, existing?.azureContainerName),
        azureAccountKey: sensitive(b.azureAccountKey, existing?.azureAccountKey),
        azureSasToken: sensitive(b.azureSasToken, existing?.azureSasToken),
      };

      const { testDriverConnection } = await import('../lib/cloud-storage');
      const result = await testDriverConnection(provider as any, plain);
      res.json(result);
    } catch (error: any) {
      // Missing-required-field errors from testDriverConnection are 400s
      // (operator-fixable), everything else is a 500.
      const msg = error?.message ?? 'Connection test failed';
      const isValidation = /required|missing/i.test(msg);
      res.status(isValidation ? 400 : 500).json({ ok: false, message: msg });
    }
  });

  // GET /api/admin/storage/path-files?label=<Path Convention Label>
  //
  // Drill-down for the Storage Path Conventions table in System Health.
  // Unions main-DB `documents` (gcs_path) with files-DB `uploaded_files`
  // (object_key) under the same canonical label, returning the per-file
  // size + uploaded date so the UI can expand a context row.
  app.get('/api/admin/storage/path-files', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can view storage details' });
      }
      const label = String(req.query.label ?? '');
      if (!label) return res.status(400).json({ message: 'label query parameter required' });

      const { listFilesByPathLabel } = await import('../lib/files-db');
      const filesDb = await listFilesByPathLabel(label, 500);

      // documents-table side — mirror the CASE expression from
      // health-monitor.ts so the label-to-pattern mapping stays in sync.
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');

      // Customer Logos special case: the byte total in the Path
      // Conventions table is the SUM(customers.logo_size) of every
      // account with a logo set, not a documents/uploaded_files
      // aggregate. The actual blob path is whatever the upload pipeline
      // wrote into customers.logo_url at the time (could be a legacy
      // disk path, a cloud URL, or a files-DB key). Read directly from
      // customers so the drill-down lists one row per account regardless
      // of which storage tier the file ended up in.
      if (label === 'Customer Logos') {
        const customers = await db.execute(sql`
          SELECT account_name, logo_url, logo_size, updated_at
            FROM customers
           WHERE logo_url IS NOT NULL AND logo_url <> ''
           ORDER BY account_name
           LIMIT 500
        `);
        const customerRows = (customers.rows as any[]).map(r => ({
          // Surface the account name alongside the URL so an orphaned
          // logo_url (file no longer on disk / in cloud / in files DB)
          // still tells the admin WHICH account it belongs to.
          objectKey: `${r.account_name}: ${r.logo_url}`,
          sizeBytes: Number(r.logo_size) || 0,
          mimeType: null,
          uploadedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : (r.updated_at ?? null),
        }));
        const merged = [...customerRows, ...filesDb].sort((a, b) => a.objectKey.localeCompare(b.objectKey));
        return res.json({ label, files: merged });
      }

      const patternMap: Record<string, string> = {
        'Account Documents':     'accounts/%/documents/%',
        'General Documents':     'system/documents/%',
        'Customer Logos':        'accounts/%/logo/%',
        'Email Design Assets':   'system/email-assets/%',
        'Flight Deck Images':    'system/flight-deck/%',
        'Solution Icons':        'system/solution-icons/%',
        'Rich-Text Images':      'system/rich-text/%',
        'Branding':              'system/branding/%',
        'Support (account)':     'accounts/%/support-attachments/%',
        'Support (general)':     'system/support-attachments/%',
      };
      const pattern = patternMap[label];
      const docs: Array<{ objectKey: string; sizeBytes: number; mimeType: string | null; uploadedAt: string | null }> = [];
      if (pattern) {
        const result = await db.execute(sql`
          SELECT gcs_path AS object_key, file_size, file_type AS mime_type, created_at
            FROM documents
           WHERE deleted_at IS NULL
             AND gcs_path LIKE ${pattern}
           ORDER BY gcs_path
           LIMIT 500
        `);
        for (const r of result.rows as any[]) {
          docs.push({
            objectKey: r.object_key,
            sizeBytes: Number(r.file_size) || 0,
            mimeType: r.mime_type ?? null,
            uploadedAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at ?? null),
          });
        }
      }

      // Sort union by objectKey for stable display; the two sources never
      // overlap on a single object_key in practice (each upload pipeline
      // commits to one storage tier).
      const merged = [...docs, ...filesDb].sort((a, b) => a.objectKey.localeCompare(b.objectKey));
      res.json({ label, files: merged });
    } catch (error: any) {
      console.error('Error fetching path-files:', error);
      res.status(500).json({ message: 'Failed to fetch path file list' });
    }
  });

  // GET /api/admin/storage/files-db-list?prefix=<top-level>
  //
  // Drill-down for the Files Database card in System Health — lists the
  // raw object_keys + sizes under a single top-level prefix
  // (e.g. "system", "accounts", "branding"). Files-DB only; the main DB
  // documents table is not queried here.
  app.get('/api/admin/storage/files-db-list', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can view storage details' });
      }
      const prefix = String(req.query.prefix ?? '');
      if (!prefix) return res.status(400).json({ message: 'prefix query parameter required' });
      if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) {
        return res.status(400).json({ message: 'Invalid prefix' });
      }
      const { listFilesByTopLevelPrefix } = await import('../lib/files-db');
      const files = await listFilesByTopLevelPrefix(prefix, 500);
      res.json({ prefix, files });
    } catch (error: any) {
      console.error('Error fetching files-db-list:', error);
      res.status(500).json({ message: 'Failed to fetch files-DB list' });
    }
  });
}
