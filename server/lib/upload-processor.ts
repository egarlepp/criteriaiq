/**
 * upload-processor.ts
 *
 * The centralized quarantine-first upload pipeline.
 *
 * Flow:
 *   1. Multer saves file to attached_assets/quarantine/
 *   2. validateMagicBytes()  — ensure content matches declared type
 *   3. hashFile()            — compute SHA-256 for dedup / audit
 *   4. scanFile()            — ClamAV (graceful fallback if daemon offline)
 *   5. uploadFile()          — promote to GCS (or local fallback)
 *   6. Quarantine file removed regardless of outcome
 *
 * Returns a ProcessedFile with the GCS object key, public URL,
 * scan status, and SHA-256 hash ready for database insertion.
 */

import fs from 'fs';
import path from 'path';
import { validateMagicBytes, hashFile, validateFileAllowed, normalizeFilename, QUARANTINE_DIR, ensureQuarantineDir } from './upload-config';
import { scanFile } from './virus-scanner';
import { uploadFile } from './cloud-storage';

export type UploadContext =
  | 'document'
  | 'logo'
  | 'support'
  | 'image'
  | 'flight-deck'
  | 'email-asset'
  | 'solution-icon';
export type ScanStatus = 'pending' | 'clean' | 'blocked' | 'quarantined';

export interface ProcessedFile {
  /** GCS object key (or local path key) */
  gcsPath: string;
  /** Publicly accessible URL (signed for GCS, local /api/files/ for dev) */
  url: string;
  /** Whether file is stored in GCS or on local disk */
  isGcs: boolean;
  /** SHA-256 hex string */
  fileHash: string;
  /** ClamAV scan result */
  scanStatus: ScanStatus;
  /** Virus name / reason if blocked */
  quarantineReason?: string;
  /** Original filename (sanitized) */
  originalName: string;
  /** Server-generated safe filename */
  safeFilename: string;
  /** MIME type as reported by multer */
  mimeType: string;
  /** File size in bytes */
  fileSize: number;
}

/**
 * Process a multer-uploaded file through the quarantine pipeline.
 *
 * @param multerFile   The file object from req.file (multer DiskStorage)
 * @param gcsObjectKey The desired GCS object key (use buildXxxPath helpers)
 * @param context      Upload context for size/type validation
 */
export async function processUpload(
  multerFile: Express.Multer.File,
  gcsObjectKey: string,
  context: UploadContext = 'document',
): Promise<{ ok: true; file: ProcessedFile } | { ok: false; reason: string; status: number }> {
  const quarantinePath = multerFile.path;
  let cleaned = false;

  const cleanup = () => {
    if (!cleaned && fs.existsSync(quarantinePath)) {
      try { fs.unlinkSync(quarantinePath); } catch { /* ignore */ }
      cleaned = true;
    }
  };

  try {
    const ext = path.extname(multerFile.originalname).toLowerCase();

    // 1. Extension / size validation (double-check after multer)
    const allowed = validateFileAllowed(
      multerFile.originalname,
      multerFile.mimetype,
      multerFile.size,
      context,
    );
    if (!allowed.valid) {
      cleanup();
      return { ok: false, reason: allowed.reason!, status: 400 };
    }

    // 2. Magic bytes check
    const magic = await validateMagicBytes(quarantinePath, ext);
    if (!magic.valid) {
      cleanup();
      return { ok: false, reason: magic.reason!, status: 400 };
    }

    // 2b. SVG sanitization. SVG is text-based XML and can carry
    // `<script>`, inline event handlers, `javascript:` URIs,
    // `<foreignObject>` blocks, and external `<use>` refs — all
    // script-injection vectors that the magic-byte check can't see.
    // We strip them here, BEFORE the file goes anywhere else in
    // the pipeline, and overwrite the quarantine file with the
    // cleaned content so every downstream step (hash, virus scan,
    // upload to storage) operates on the safe version. The
    // original SVG bytes are never persisted.
    //
    // See server/lib/svg-sanitizer.ts for the threat list and the
    // sanitizer's full rule set.
    if (ext === '.svg') {
      const { sanitizeSvg } = await import('./svg-sanitizer');
      try {
        const raw = fs.readFileSync(quarantinePath, 'utf8');
        const result = sanitizeSvg(raw);
        if (!result.ok) {
          cleanup();
          return { ok: false, reason: result.reason ?? 'SVG sanitization failed', status: 400 };
        }
        const totalStripped =
          result.removed.scripts +
          result.removed.eventHandlers +
          result.removed.javascriptUris +
          result.removed.foreignObjects +
          result.removed.externalUseRefs;
        if (totalStripped > 0) {
          console.warn(
            `[upload-processor] SVG sanitizer stripped ${totalStripped} item(s) from ${multerFile.originalname}: ` +
              `scripts=${result.removed.scripts} ` +
              `eventHandlers=${result.removed.eventHandlers} ` +
              `javascriptUris=${result.removed.javascriptUris} ` +
              `foreignObjects=${result.removed.foreignObjects} ` +
              `externalUseRefs=${result.removed.externalUseRefs}`,
          );
        }
        fs.writeFileSync(quarantinePath, result.content, 'utf8');
      } catch (err: any) {
        cleanup();
        console.error('[upload-processor] SVG sanitize error:', err.message);
        return { ok: false, reason: 'Failed to sanitize SVG file', status: 500 };
      }
    }

    // 3. SHA-256 hash
    const fileHash = await hashFile(quarantinePath);

    // 4. ClamAV scan
    const scanResult = await scanFile(quarantinePath);
    if (!scanResult.clean) {
      cleanup();
      return {
        ok: false,
        reason: `File blocked by virus scanner: ${scanResult.reason ?? 'unknown threat'}`,
        status: 422,
      };
    }

    // 5. Promote to GCS (or local fallback)
    const uploadResult = await uploadFile(quarantinePath, gcsObjectKey, multerFile.mimetype);

    cleanup();

    const processed: ProcessedFile = {
      gcsPath: uploadResult.gcsPath,
      url: uploadResult.url,
      isGcs: uploadResult.isGcs,
      fileHash,
      scanStatus: 'clean',
      originalName: multerFile.originalname,
      safeFilename: path.basename(gcsObjectKey),
      mimeType: multerFile.mimetype,
      fileSize: multerFile.size,
    };

    return { ok: true, file: processed };
  } catch (err: any) {
    cleanup();
    console.error('[upload-processor] Unexpected error:', err.message);
    return { ok: false, reason: 'Internal upload error', status: 500 };
  }
}
