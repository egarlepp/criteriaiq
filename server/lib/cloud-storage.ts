/**
 * cloud-storage.ts
 *
 * Provider-agnostic cloud storage driver.
 * Supports GCS, AWS S3, Azure Blob Storage, and local disk.
 *
 * Priority order (highest wins):
 *   1. DB-backed configuration (storage_configuration table, enabled = true)
 *   2. Environment variables (GCS_BUCKET_NAME / AWS_* / AZURE_*)
 *   3. Local disk fallback (attached_assets/)
 *
 * Exports the same surface as the old gcs-storage.ts so callers need
 * only change their import path.
 */

import fs from 'fs';
import path from 'path';
import type { Storage as GcsStorage, StorageOptions as GcsStorageOptions } from '@google-cloud/storage';
import type { S3Client } from '@aws-sdk/client-s3';
import type { BlobServiceClient } from '@azure/storage-blob';
import {
  getUploadedFile,
  putUploadedFile,
  deleteUploadedFile,
  getUploadedFileSize,
  pingFilesDb,
} from './files-db';

// ─── Public result type ───────────────────────────────────────────────────────

export interface UploadResult {
  gcsPath: string;
  url: string;
  isGcs: boolean;
}

// ─── Provider types ───────────────────────────────────────────────────────────

export type StorageProvider = 'gcs' | 'aws' | 'azure' | 'local' | 'db';
export type ConfigSource = 'db' | 'env' | 'local';

/** Shape of a DB storage_configuration row as consumed by initStorageDriver. */
export interface StorageDbConfig {
  provider: string;
  enabled: boolean | null;
  gcsBucketName?: string | null;
  gcsKeyJson?: string | null;
  awsRegion?: string | null;
  awsBucketName?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  azureAccountName?: string | null;
  azureContainerName?: string | null;
  azureAccountKey?: string | null;
  azureSasToken?: string | null;
}

// ─── StorageDriver interface ──────────────────────────────────────────────────

interface StorageDriver {
  upload(sourcePath: string, objectKey: string, mimeType: string): Promise<UploadResult>;
  generateUrl(objectKey: string, expiryMinutes?: number): Promise<string>;
  delete(objectKey: string): Promise<void>;
  ping(): Promise<{ ok: boolean; latencyMs: number }>;
  getFileSize(objectKey: string): Promise<number | null>;
}

// ─── Local disk driver ────────────────────────────────────────────────────────
//
// Admin uploads land under `<cwd>/uploads/` — the path that's declared as a
// persistent volume in BOTH the Dockerfile (`VOLUME ["/app/uploads"]`) AND
// docker-compose.yml (`app_uploads:/app/uploads`). Every Dokploy / Coolify /
// raw-docker-compose deploy reliably mounts that volume, so uploads survive
// container rebuilds without operator intervention.
//
// Bundled defaults shipped IN the image (criteriaiq-logo_white.png, the 5A
// framework PNGs, etc.) still live under `<cwd>/attached_assets/` — those
// are baked into the read-only image layer and don't need a volume. The
// `/api/files/<key>` route at server/routes/misc-routes.ts checks `uploads/` first,
// then falls back to `attached_assets/` so existing URLs in the DB resolve
// transparently after this migration (no DB migration required).
const UPLOADS_BASE = path.join(process.cwd(), 'uploads');
const BUNDLED_BASE = path.join(process.cwd(), 'attached_assets');

function localPath(objectKey: string): string {
  return path.join(UPLOADS_BASE, objectKey);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class LocalDriver implements StorageDriver {
  async upload(sourcePath: string, objectKey: string): Promise<UploadResult> {
    const dest = localPath(objectKey);
    ensureDir(dest);
    fs.copyFileSync(sourcePath, dest);
    return { gcsPath: objectKey, url: `/api/files/${encodeURIComponent(objectKey)}`, isGcs: false };
  }

  async generateUrl(objectKey: string): Promise<string> {
    return `/api/files/${encodeURIComponent(objectKey)}`;
  }

  async delete(objectKey: string): Promise<void> {
    // Try the uploads volume first (where new uploads live), then fall
    // back to the bundled path so legacy DB rows that point at files
    // still left in attached_assets/ from an older install get cleaned
    // up if the admin hits Reset. Either-or; never both.
    const uploadsPath = path.join(UPLOADS_BASE, objectKey);
    if (fs.existsSync(uploadsPath)) {
      fs.unlinkSync(uploadsPath);
      return;
    }
    const bundledPath = path.join(BUNDLED_BASE, objectKey);
    if (fs.existsSync(bundledPath)) fs.unlinkSync(bundledPath);
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    // Health check writes into the SAME root where real uploads go so
    // a permissions/mount problem with the uploads volume surfaces in
    // the storage health check rather than hiding until an admin
    // actually uploads.
    if (!fs.existsSync(UPLOADS_BASE)) {
      try { fs.mkdirSync(UPLOADS_BASE, { recursive: true }); } catch { /* surfaced below */ }
    }
    const testFile = path.join(UPLOADS_BASE, '.ping_test');
    try {
      fs.writeFileSync(testFile, 'ping');
      const content = fs.readFileSync(testFile, 'utf8');
      if (content !== 'ping') throw new Error('Read verification failed');
      fs.unlinkSync(testFile);
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async getFileSize(objectKey: string): Promise<number | null> {
    // Mirror the /api/files lookup order: uploads first, bundled fallback.
    const uploadsPath = path.join(UPLOADS_BASE, objectKey);
    if (fs.existsSync(uploadsPath)) return fs.statSync(uploadsPath).size;
    const bundledPath = path.join(BUNDLED_BASE, objectKey);
    if (fs.existsSync(bundledPath)) return fs.statSync(bundledPath).size;
    return null;
  }
}

// ─── Database blob driver ─────────────────────────────────────────────────────
//
// Stores uploaded files as BYTEA rows in the separate `<main>_files`
// database (see server/lib/files-db.ts). Returns the same `/api/files/<key>`
// URL shape as LocalDriver, so the existing URL handling and the
// `/api/files` route serve DB-backed files transparently. This is the
// zero-deploy-config persistence option: files ride the Postgres volume.

class DatabaseBlobDriver implements StorageDriver {
  async upload(sourcePath: string, objectKey: string, mimeType: string): Promise<UploadResult> {
    const data = fs.readFileSync(sourcePath);
    await putUploadedFile({ objectKey, data, mimeType, sizeBytes: data.length });
    return { gcsPath: objectKey, url: `/api/files/${encodeURIComponent(objectKey)}`, isGcs: false };
  }

  async generateUrl(objectKey: string): Promise<string> {
    return `/api/files/${encodeURIComponent(objectKey)}`;
  }

  async delete(objectKey: string): Promise<void> {
    await deleteUploadedFile(objectKey);
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return pingFilesDb();
  }

  async getFileSize(objectKey: string): Promise<number | null> {
    return getUploadedFileSize(objectKey);
  }
}

// ─── GCS driver ───────────────────────────────────────────────────────────────

class GcsDriver implements StorageDriver {
  private client: GcsStorage | null = null;
  private bucket: string;

  constructor(private bucketName: string, private keyJson?: string) {
    this.bucket = bucketName;
  }

  private async getClient(): Promise<GcsStorage> {
    if (this.client) return this.client;
    const { Storage } = await import('@google-cloud/storage');
    const options: GcsStorageOptions = {};
    if (this.keyJson) {
      try {
        options.credentials = JSON.parse(this.keyJson);
      } catch { /* rely on ADC */ }
    }
    this.client = new Storage(options);
    return this.client;
  }

  async upload(sourcePath: string, objectKey: string, mimeType: string): Promise<UploadResult> {
    const client = await this.getClient();
    const file = client.bucket(this.bucket).file(objectKey);
    await file.save(fs.readFileSync(sourcePath), {
      metadata: { contentType: mimeType },
      resumable: false,
    });
    const url = await this.generateUrl(objectKey);
    return { gcsPath: objectKey, url, isGcs: true };
  }

  async generateUrl(objectKey: string, expiryMinutes = 60): Promise<string> {
    const client = await this.getClient();
    const [url] = await client
      .bucket(this.bucket)
      .file(objectKey)
      .getSignedUrl({ action: 'read', expires: Date.now() + expiryMinutes * 60 * 1000 });
    return url;
  }

  async delete(objectKey: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.bucket(this.bucket).file(objectKey).delete();
    } catch (err: unknown) {
      console.warn(`[cloud-storage/gcs] delete failed for ${objectKey}:`, err instanceof Error ? err.message : String(err));
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      const testKey = `.ping_test_${Date.now()}`;
      const fileRef = client.bucket(this.bucket).file(testKey);
      await fileRef.save('ping', { resumable: false });
      const [contents] = await fileRef.download();
      if (contents.toString() !== 'ping') throw new Error('Read verification failed');
      await fileRef.delete();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async getFileSize(objectKey: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      const [metadata] = await client.bucket(this.bucket).file(objectKey).getMetadata();
      const sizeVal = metadata.size;
      return sizeVal !== undefined ? parseInt(String(sizeVal), 10) : null;
    } catch {
      return null;
    }
  }
}

// ─── AWS S3 driver ────────────────────────────────────────────────────────────

class AwsS3Driver implements StorageDriver {
  private client: S3Client | null = null;

  constructor(
    private region: string,
    private bucket: string,
    private accessKeyId: string,
    private secretAccessKey: string,
  ) {}

  private async getClient(): Promise<S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: this.region,
      credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
    });
    return this.client;
  }

  async upload(sourcePath: string, objectKey: string, mimeType: string): Promise<UploadResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: fs.readFileSync(sourcePath),
      ContentType: mimeType,
    }));
    const url = await this.generateUrl(objectKey);
    return { gcsPath: objectKey, url, isGcs: true };
  }

  async generateUrl(objectKey: string, expiryMinutes = 60): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: expiryMinutes * 60 },
    );
  }

  async delete(objectKey: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.getClient();
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch (err: unknown) {
      console.warn(`[cloud-storage/s3] delete failed for ${objectKey}:`, err instanceof Error ? err.message : String(err));
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.getClient();
      const testKey = `.ping_test_${Date.now()}`;
      await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: testKey, Body: Buffer.from('ping') }));
      const getResp = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: testKey }));
      const chunks: Buffer[] = [];
      for await (const chunk of getResp.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      if (Buffer.concat(chunks).toString() !== 'ping') throw new Error('Read verification failed');
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: testKey }));
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async getFileSize(objectKey: string): Promise<number | null> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.getClient();
      const resp = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return resp.ContentLength ?? null;
    } catch {
      return null;
    }
  }
}

// ─── Azure Blob driver ────────────────────────────────────────────────────────

class AzureDriver implements StorageDriver {
  private client: BlobServiceClient | null = null;

  constructor(
    private accountName: string,
    private container: string,
    private accountKey?: string,
    private sasToken?: string,
  ) {}

  private async getClient(): Promise<BlobServiceClient> {
    if (this.client) return this.client;
    const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');
    if (this.accountKey) {
      const cred = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      this.client = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        cred,
      );
    } else if (this.sasToken) {
      // Normalize: strip leading '?' so the URL doesn't become '??...'
      const normalizedSas = this.sasToken.startsWith('?') ? this.sasToken.slice(1) : this.sasToken;
      this.client = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net?${normalizedSas}`,
      );
    } else {
      throw new Error('[cloud-storage/azure] Neither accountKey nor sasToken provided');
    }
    return this.client;
  }

  async upload(sourcePath: string, objectKey: string, mimeType: string): Promise<UploadResult> {
    const client = await this.getClient();
    const cc = client.getContainerClient(this.container);
    const bc = cc.getBlockBlobClient(objectKey);
    await bc.uploadData(fs.readFileSync(sourcePath), { blobHTTPHeaders: { blobContentType: mimeType } });
    const url = await this.generateUrl(objectKey);
    return { gcsPath: objectKey, url, isGcs: true };
  }

  async generateUrl(objectKey: string, expiryMinutes = 60): Promise<string> {
    const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import('@azure/storage-blob');
    if (this.accountKey) {
      // Account key → generate per-blob SAS
      const cred = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.container,
          blobName: objectKey,
          permissions: BlobSASPermissions.parse('r'),
          expiresOn: new Date(Date.now() + expiryMinutes * 60 * 1000),
        },
        cred,
      ).toString();
      return `https://${this.accountName}.blob.core.windows.net/${this.container}/${objectKey}?${sasToken}`;
    }
    if (this.sasToken) {
      // SAS token supplied directly — append it so the URL is authenticated
      const token = this.sasToken.startsWith('?') ? this.sasToken.slice(1) : this.sasToken;
      return `https://${this.accountName}.blob.core.windows.net/${this.container}/${objectKey}?${token}`;
    }
    return `https://${this.accountName}.blob.core.windows.net/${this.container}/${objectKey}`;
  }

  async delete(objectKey: string): Promise<void> {
    try {
      const client = await this.getClient();
      const cc = client.getContainerClient(this.container);
      await cc.getBlockBlobClient(objectKey).deleteIfExists();
    } catch (err: unknown) {
      console.warn(`[cloud-storage/azure] delete failed for ${objectKey}:`, err instanceof Error ? err.message : String(err));
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      const cc = client.getContainerClient(this.container);
      const testKey = `.ping_test_${Date.now()}`;
      const bc = cc.getBlockBlobClient(testKey);
      await bc.uploadData(Buffer.from('ping'));
      const downloadResp = await bc.download(0);
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResp.readableStreamBody as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      if (Buffer.concat(chunks).toString() !== 'ping') throw new Error('Read verification failed');
      await bc.deleteIfExists();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async getFileSize(objectKey: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      const props = await client
        .getContainerClient(this.container)
        .getBlockBlobClient(objectKey)
        .getProperties();
      return props.contentLength ?? null;
    } catch {
      return null;
    }
  }
}

// ─── Active driver state ──────────────────────────────────────────────────────

let _activeDriver: StorageDriver = new LocalDriver();
let _activeProvider: StorageProvider = 'local';
let _configSource: ConfigSource = 'local';
let _activeBucketName: string | null = null;

export function getActiveProvider(): StorageProvider {
  return _activeProvider;
}

export function getConfigSource(): ConfigSource {
  return _configSource;
}

/** Returns the active bucket/container name (null for local disk). */
export function getActiveBucketName(): string | null {
  return _activeBucketName;
}

/**
 * (Re-)initialise the active driver.
 * Called at startup and again when admin saves new config via API.
 * Priority: DB-config → env vars → local disk.
 *
 * When the DB config has enabled=true and provider='local', local storage
 * is explicitly selected and env cloud credentials are NOT used.
 */
export async function initStorageDriver(dbConfig?: StorageDbConfig | null): Promise<void> {
  // 1. DB config (highest priority, including explicit local selection)
  if (dbConfig && dbConfig.enabled && dbConfig.provider) {
    // Explicit local selection from DB — skip env cloud fallback
    if (dbConfig.provider === 'local') {
      _activeDriver = new LocalDriver();
      _activeProvider = 'local';
      _configSource = 'db';
      _activeBucketName = null;
      console.log('[cloud-storage] Using local disk storage (DB config)');
      return;
    }

    // Database-blob selection — files persist as BYTEA rows in the
    // separate <main>_files database (server/lib/files-db.ts), surviving
    // redeploys with no volume mount. No credentials; skip env fallback.
    if (dbConfig.provider === 'db') {
      _activeDriver = new DatabaseBlobDriver();
      _activeProvider = 'db';
      _configSource = 'db';
      _activeBucketName = null;
      console.log('[cloud-storage] Using database blob storage (DB config)');
      return;
    }

    try {
      const { decryptText } = await import('../auth/mfaUtils');
      const provider = dbConfig.provider as StorageProvider;

      if (provider === 'gcs' && dbConfig.gcsBucketName) {
        const keyJson = dbConfig.gcsKeyJson ? decryptText(dbConfig.gcsKeyJson) : undefined;
        _activeDriver = new GcsDriver(dbConfig.gcsBucketName, keyJson);
        _activeProvider = 'gcs';
        _configSource = 'db';
        _activeBucketName = dbConfig.gcsBucketName;
        console.log('[cloud-storage] Initialised GCS driver from DB config');
        return;
      }

      if (provider === 'aws' && dbConfig.awsBucketName && dbConfig.awsRegion && dbConfig.awsAccessKeyId && dbConfig.awsSecretAccessKey) {
        _activeDriver = new AwsS3Driver(
          dbConfig.awsRegion,
          dbConfig.awsBucketName,
          decryptText(dbConfig.awsAccessKeyId),
          decryptText(dbConfig.awsSecretAccessKey),
        );
        _activeProvider = 'aws';
        _configSource = 'db';
        _activeBucketName = dbConfig.awsBucketName;
        console.log('[cloud-storage] Initialised AWS S3 driver from DB config');
        return;
      }

      if (provider === 'azure' && dbConfig.azureAccountName && dbConfig.azureContainerName && (dbConfig.azureAccountKey || dbConfig.azureSasToken)) {
        const accountKey = dbConfig.azureAccountKey ? decryptText(dbConfig.azureAccountKey) : undefined;
        const sasToken = dbConfig.azureSasToken ? decryptText(dbConfig.azureSasToken) : undefined;
        _activeDriver = new AzureDriver(dbConfig.azureAccountName, dbConfig.azureContainerName, accountKey, sasToken);
        _activeProvider = 'azure';
        _configSource = 'db';
        _activeBucketName = dbConfig.azureContainerName;
        console.log('[cloud-storage] Initialised Azure Blob driver from DB config');
        return;
      }
    } catch (err: unknown) {
      console.error('[cloud-storage] Failed to init from DB config:', err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Environment variables
  if (process.env.GCS_BUCKET_NAME) {
    _activeDriver = new GcsDriver(process.env.GCS_BUCKET_NAME, process.env.GCS_KEY_JSON);
    _activeProvider = 'gcs';
    _configSource = 'env';
    _activeBucketName = process.env.GCS_BUCKET_NAME;
    console.log('[cloud-storage] Initialised GCS driver from env vars');
    return;
  }

  if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    _activeDriver = new AwsS3Driver(
      process.env.AWS_REGION,
      process.env.AWS_S3_BUCKET,
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
    );
    _activeProvider = 'aws';
    _configSource = 'env';
    _activeBucketName = process.env.AWS_S3_BUCKET;
    console.log('[cloud-storage] Initialised AWS S3 driver from env vars');
    return;
  }

  if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_CONTAINER && (process.env.AZURE_STORAGE_KEY || process.env.AZURE_STORAGE_SAS_TOKEN)) {
    _activeDriver = new AzureDriver(
      process.env.AZURE_STORAGE_ACCOUNT,
      process.env.AZURE_STORAGE_CONTAINER,
      process.env.AZURE_STORAGE_KEY,
      process.env.AZURE_STORAGE_SAS_TOKEN,
    );
    _activeProvider = 'azure';
    _configSource = 'env';
    _activeBucketName = process.env.AZURE_STORAGE_CONTAINER;
    console.log('[cloud-storage] Initialised Azure Blob driver from env vars');
    return;
  }

  // 3. Local disk fallback
  _activeDriver = new LocalDriver();
  _activeProvider = 'local';
  _configSource = 'local';
  _activeBucketName = null;
  console.log('[cloud-storage] Using local disk storage (no cloud config found)');
}

// ─── Public API (drop-in replacement for gcs-storage.ts) ─────────────────────

export async function uploadFile(
  sourcePath: string,
  objectKey: string,
  mimeType: string,
): Promise<UploadResult> {
  return _activeDriver.upload(sourcePath, objectKey, mimeType);
}

export async function generateSignedUrl(
  objectKey: string,
  expiryMinutes = 60,
): Promise<string> {
  return _activeDriver.generateUrl(objectKey, expiryMinutes);
}

export async function deleteFile(objectKey: string): Promise<void> {
  return _activeDriver.delete(objectKey);
}

export async function testConnection(): Promise<{ ok: boolean; latencyMs: number; provider: StorageProvider; source: ConfigSource }> {
  const result = await _activeDriver.ping();
  return { ...result, provider: _activeProvider, source: _configSource };
}

/** Plaintext (already-decrypted) credential bag used to build a throwaway
 *  driver for Test Connection — lets an admin validate typed creds BEFORE
 *  saving, without mutating the active driver. */
export interface PlainStorageConfig {
  gcsBucketName?: string | null;
  gcsKeyJson?: string | null;
  awsRegion?: string | null;
  awsBucketName?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  azureAccountName?: string | null;
  azureContainerName?: string | null;
  azureAccountKey?: string | null;
  azureSasToken?: string | null;
}

/**
 * Build a one-off driver from plaintext config WITHOUT touching the active
 * driver/globals, and ping it. Used by POST /api/admin/storage/test so the
 * result reflects the credentials the admin just typed (merged with stored
 * secrets for masked fields) rather than the currently-saved provider.
 * Throws on missing required fields so the route returns a clear message.
 */
export async function testDriverConnection(
  provider: StorageProvider,
  cfg: PlainStorageConfig,
): Promise<{ ok: boolean; latencyMs: number; provider: StorageProvider }> {
  let driver: StorageDriver;
  switch (provider) {
    case 'local':
      driver = new LocalDriver();
      break;
    case 'db':
      driver = new DatabaseBlobDriver();
      break;
    case 'gcs':
      if (!cfg.gcsBucketName) throw new Error('GCS bucket name is required.');
      driver = new GcsDriver(cfg.gcsBucketName, cfg.gcsKeyJson ?? undefined);
      break;
    case 'aws':
      if (!cfg.awsRegion || !cfg.awsBucketName || !cfg.awsAccessKeyId || !cfg.awsSecretAccessKey) {
        throw new Error('AWS configuration is missing required fields.');
      }
      driver = new AwsS3Driver(cfg.awsRegion, cfg.awsBucketName, cfg.awsAccessKeyId, cfg.awsSecretAccessKey);
      break;
    case 'azure':
      if (!cfg.azureAccountName || !cfg.azureContainerName || (!cfg.azureAccountKey && !cfg.azureSasToken)) {
        throw new Error('Azure configuration requires account name, container, and an account key or SAS token.');
      }
      driver = new AzureDriver(cfg.azureAccountName, cfg.azureContainerName, cfg.azureAccountKey ?? undefined, cfg.azureSasToken ?? undefined);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
  const result = await driver.ping();
  return { ...result, provider };
}

/** @deprecated Use isCloudConfigured() */
export function isGcsConfigured(): boolean {
  return _activeProvider !== 'local';
}

/** Returns true when a cloud provider (GCS, AWS, Azure) is active. */
export function isCloudConfigured(): boolean {
  return _activeProvider !== 'local';
}

/**
 * Returns the byte size of the stored object at the given key using the
 * already-initialised active driver (same credentials as initStorageDriver).
 * Returns null if the object does not exist or cannot be stat'd.
 */
export async function getFileSize(objectKey: string): Promise<number | null> {
  return _activeDriver.getFileSize(objectKey);
}
