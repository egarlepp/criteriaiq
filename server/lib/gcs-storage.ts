/**
 * gcs-storage.ts
 *
 * Abstraction over Google Cloud Storage.
 * Falls back to local disk (attached_assets/) when GCS_BUCKET_NAME is not set,
 * so development and CI work without cloud credentials.
 *
 * Required env vars (for real GCS):
 *   GCS_BUCKET_NAME        — name of the GCS bucket
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account key JSON
 *     OR
 *   GCS_KEY_JSON           — inline service account JSON string (for secrets managers)
 */

import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** GCS object key, e.g. accounts/42/documents/report_123.pdf */
  gcsPath: string;
  /** Public-accessible URL (signed, expires) */
  url: string;
  /** Whether this file is stored in GCS (true) or local disk (false) */
  isGcs: boolean;
}

// ─── GCS client (lazy init) ───────────────────────────────────────────────────

let storageClient: any = null;
let bucketName: string | null = null;

async function getStorage(): Promise<{ storage: any; bucket: string } | null> {
  if (!process.env.GCS_BUCKET_NAME) return null;

  if (storageClient) return { storage: storageClient, bucket: bucketName! };

  try {
    const { Storage } = await import('@google-cloud/storage');

    let options: any = {};

    if (process.env.GCS_KEY_JSON) {
      // Inline JSON key (preferred for secret managers)
      const credentials = JSON.parse(process.env.GCS_KEY_JSON);
      options.credentials = credentials;
    }
    // Otherwise relies on GOOGLE_APPLICATION_CREDENTIALS env var or ADC

    storageClient = new Storage(options);
    bucketName = process.env.GCS_BUCKET_NAME;

    console.log(`[gcs-storage] Initialized with bucket: ${bucketName}`);
    return { storage: storageClient, bucket: bucketName! };
  } catch (err: any) {
    console.error('[gcs-storage] Failed to initialize GCS client:', err.message);
    return null;
  }
}

// ─── Local fallback helpers ────────────────────────────────────────────────────

const LOCAL_BASE = path.join(process.cwd(), 'attached_assets');

function localPathFor(gcsObjectKey: string): string {
  return path.join(LOCAL_BASE, gcsObjectKey);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a file from local disk to GCS (or local fallback).
 *
 * @param sourcePath   Absolute local path to the file (e.g. quarantine file)
 * @param gcsObjectKey Desired key in GCS, e.g. accounts/42/documents/foo.pdf
 * @param mimeType     MIME type of the file
 */
export async function uploadFile(
  sourcePath: string,
  gcsObjectKey: string,
  mimeType: string,
): Promise<UploadResult> {
  const gcs = await getStorage();

  if (gcs) {
    // Upload to GCS
    const file = gcs.storage.bucket(gcs.bucket).file(gcsObjectKey);
    await file.save(fs.readFileSync(sourcePath), {
      metadata: { contentType: mimeType },
      resumable: false,
    });

    const url = await generateSignedUrl(gcsObjectKey);
    return { gcsPath: gcsObjectKey, url, isGcs: true };
  }

  // Local fallback
  const dest = localPathFor(gcsObjectKey);
  ensureDir(dest);
  fs.copyFileSync(sourcePath, dest);

  const url = `/api/files/${encodeURIComponent(gcsObjectKey)}`;
  return { gcsPath: gcsObjectKey, url, isGcs: false };
}

/**
 * Generate a signed URL for a GCS object (or local serving URL).
 * Default expiry: 60 minutes.
 */
export async function generateSignedUrl(
  gcsObjectKey: string,
  expiryMinutes = 60,
): Promise<string> {
  const gcs = await getStorage();

  if (gcs) {
    const [url] = await gcs.storage
      .bucket(gcs.bucket)
      .file(gcsObjectKey)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + expiryMinutes * 60 * 1000,
      });
    return url;
  }

  // Local fallback URL
  return `/api/files/${encodeURIComponent(gcsObjectKey)}`;
}

/**
 * Delete a file from GCS (or local fallback).
 */
export async function deleteFile(gcsObjectKey: string): Promise<void> {
  const gcs = await getStorage();

  if (gcs) {
    try {
      await gcs.storage.bucket(gcs.bucket).file(gcsObjectKey).delete();
    } catch (err: any) {
      console.warn(`[gcs-storage] Could not delete ${gcsObjectKey}:`, err.message);
    }
    return;
  }

  // Local fallback
  const localPath = localPathFor(gcsObjectKey);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
}

/**
 * Check if GCS is configured.
 */
export function isGcsConfigured(): boolean {
  return !!process.env.GCS_BUCKET_NAME;
}
