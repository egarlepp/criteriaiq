import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { trimEdgeChar } from './trim-edge';

// ─── Allowed MIME types with per-type size limits ─────────────────────────────

export interface AllowedType {
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
  label: string;
}

export const ALLOWED_TYPES: AllowedType[] = [
  {
    label: 'PDF',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    maxBytes: 10 * 1024 * 1024,
  },
  {
    label: 'Word document',
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    extensions: ['.doc', '.docx'],
    maxBytes: 10 * 1024 * 1024,
  },
  {
    label: 'PowerPoint',
    mimeTypes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    extensions: ['.ppt', '.pptx'],
    maxBytes: 10 * 1024 * 1024,
  },
  {
    label: 'Excel spreadsheet',
    mimeTypes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    extensions: ['.xls', '.xlsx'],
    maxBytes: 10 * 1024 * 1024,
  },
  {
    label: 'PNG image',
    mimeTypes: ['image/png'],
    extensions: ['.png'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'JPEG image',
    mimeTypes: ['image/jpeg'],
    extensions: ['.jpg', '.jpeg'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'GIF image',
    mimeTypes: ['image/gif'],
    extensions: ['.gif'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'Plain text',
    mimeTypes: ['text/plain'],
    extensions: ['.txt'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'CSV',
    mimeTypes: ['text/csv', 'application/csv'],
    extensions: ['.csv'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'WEBP image',
    mimeTypes: ['image/webp'],
    extensions: ['.webp'],
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: 'SVG image',
    mimeTypes: ['image/svg+xml'],
    extensions: ['.svg'],
    // SVG is text-based vector — even complex logos are small.
    // Cap matches the logo-context limit (3 MB) so a graphic-file
    // path uses the same budget as the logo path.
    maxBytes: 3 * 1024 * 1024,
  },
];

// Flat sets for fast lookup
export const ALLOWED_EXTENSIONS = new Set(
  ALLOWED_TYPES.flatMap(t => t.extensions),
);
export const ALLOWED_MIME_TYPES = new Set(
  ALLOWED_TYPES.flatMap(t => t.mimeTypes),
);

// Blocked archive extensions (explicitly denied)
export const BLOCKED_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']);

// Global hard cap
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Logo-specific limits (used by logo upload route).
//
// SVG is included here because logos are commonly delivered as vector
// art. SVG uploads pass through `sanitizeSvg()` in upload-processor.ts
// before storage — `<script>`, inline event handlers, `javascript:`
// URIs, `<foreignObject>` blocks, and external `<use>` refs are all
// stripped at upload time. See server/lib/svg-sanitizer.ts for the
// full threat list.
//
// LOGO_MAX_BYTES is 3 MB to match the long-standing UI promise
// ("Max 3MB, …") — previously the server allowed 5 MB while the UI
// said 3 MB, a real inconsistency a power user could exploit by
// bypassing the client check.
export const LOGO_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
export const LOGO_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
export const LOGO_MAX_BYTES = 3 * 1024 * 1024;

// Support attachment limits
export const SUPPORT_MAX_BYTES = 5 * 1024 * 1024;

// Branding asset limits — per-slot. Logos get a small budget (2 MB) because
// they're packaged into the page chrome; background images get 5 MB since
// they cover the viewport. Both categories accept PNG/JPEG/WebP/SVG — GIF
// is intentionally NOT allowed (branding shouldn't animate). SVG uploads
// pass through sanitizeSvg() before storage, same as customer logos.
export const BRANDING_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
export const BRANDING_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_BG_MAX_BYTES = 5 * 1024 * 1024;

// Flight Deck banners — header (224x96) and footer (160x48) images rendered
// in tip notifications. 2 MB budget matches branding logos. PNG/JPEG/WebP/SVG;
// GIF excluded (banners shouldn't animate). SVG passes through sanitizeSvg().
export const FLIGHT_DECK_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
export const FLIGHT_DECK_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export const FLIGHT_DECK_MAX_BYTES = 2 * 1024 * 1024;

// Email design assets — shared logos and graphics uploaded via Create Email
// Design dialog and referenced across one or more designs. 2 MB cap; PNG/
// JPEG/WebP/GIF (GIF kept because animated email banners exist in the wild).
// SVG excluded — most email clients silently drop inline SVG, so allowing
// it would let admins ship images that render in preview but disappear in
// recipient inboxes.
export const EMAIL_ASSET_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const EMAIL_ASSET_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
export const EMAIL_ASSET_MAX_BYTES = 2 * 1024 * 1024;

// Solution icons — small square images (256x256 typical) shown in the
// Solutions dropdown and on project cards. 1 MB cap because the rendered
// size is tiny; PNG/WebP only — GIF and SVG are excluded because icons are
// rendered at fixed small dimensions where animation and vector flexibility
// don't add value.
export const SOLUTION_ICON_ALLOWED_MIMES = new Set(['image/png', 'image/webp']);
export const SOLUTION_ICON_ALLOWED_EXTENSIONS = new Set(['.png', '.webp']);
export const SOLUTION_ICON_MAX_BYTES = 1 * 1024 * 1024;

// ─── GCS Path helpers ─────────────────────────────────────────────────────────

/**
 * Build a GCS object path for a document.
 *   accounts/{accountId}/documents/{filename}  — when accountId is provided
 *   system/documents/{userId}/{filename}        — general upload by a specific user
 *   system/documents/{filename}                 — legacy fallback (no account, no user)
 */
export function buildDocumentPath(
  accountId: number | null | undefined,
  filename: string,
  userId?: string | null,
): string {
  if (accountId) return `accounts/${accountId}/documents/${filename}`;
  if (userId) return `system/documents/${userId}/${filename}`;
  return `system/documents/${filename}`;
}

/**
 * Build a GCS object path for a customer logo.
 * accounts/{accountId}/logo/{filename}
 */
export function buildLogoPath(accountId: number, filename: string): string {
  return `accounts/${accountId}/logo/${filename}`;
}

/**
 * Build a GCS object path for an email asset.
 * system/email-assets/{filename}
 */
export function buildEmailAssetPath(filename: string): string {
  return `system/email-assets/${filename}`;
}

/**
 * Build a GCS object path for rich-text images.
 * system/rich-text/{filename}
 */
export function buildRichTextPath(filename: string): string {
  return `system/rich-text/${filename}`;
}

/**
 * Build a GCS object path for support/feature-request attachments.
 *   accounts/{customerId}/support-attachments/{filename}  — when linked to a customer
 *   system/support-attachments/{filename}                 — not linked to any customer
 */
export function buildSupportPath(filename: string, customerId?: number | null): string {
  if (customerId) return `accounts/${customerId}/support-attachments/${filename}`;
  return `system/support-attachments/${filename}`;
}

/**
 * Build a GCS object path for admin-uploaded global branding assets
 * (login logo, sidebar logos, page backgrounds). Slot+mode pair is unique
 * per the branding_assets table — overwrites the prior object key on
 * re-upload so we don't accumulate orphaned files.
 *
 *   system/branding/{slot}/{mode}/{filename}
 *
 * On the LocalDriver this materializes under attached_assets/system/branding/...
 * On S3/GCS/Azure the same key becomes the object key in the configured bucket.
 */
export function buildBrandingPath(slot: string, mode: string, filename: string): string {
  return `system/branding/${slot}/${mode}/${filename}`;
}

/**
 * Build a GCS object path for a Flight Deck banner image (header/footer
 * shown in tip notifications). Shared across rules — no rule scoping in
 * the path so the same banner can be referenced from multiple rules.
 *   system/flight-deck/{filename}
 */
export function buildFlightDeckPath(filename: string): string {
  return `system/flight-deck/${filename}`;
}

/**
 * Build a GCS object path for a solution icon (rendered in the Solutions
 * dropdown and on project cards). Filename-keyed because solution rows
 * reference the icon by bare filename, mirroring the legacy convention.
 *   system/solution-icons/{filename}
 */
export function buildSolutionIconPath(filename: string): string {
  return `system/solution-icons/${filename}`;
}

// ─── File validation ──────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a file's extension and size against the allowed types list.
 * Context selects the per-feature size/MIME budget:
 *   document       — broad allowlist (PDF/Office/CSV/images), per-type cap
 *   logo           — customer account logo (3 MB, PNG/JPEG/WEBP/GIF/SVG)
 *   support        — support-ticket attachments (5 MB, document allowlist)
 *   image          — generic image (5 MB, raster only)
 *   flight-deck    — FD banner header/footer (2 MB, PNG/JPEG/WEBP/SVG)
 *   email-asset    — shared email design asset (2 MB, PNG/JPEG/WEBP/GIF — no SVG)
 *   solution-icon  — Solutions-dropdown icon (1 MB, PNG/WEBP only)
 */
export function validateFileAllowed(
  filename: string,
  mimeType: string,
  fileSizeBytes: number,
  context:
    | 'document'
    | 'logo'
    | 'support'
    | 'image'
    | 'flight-deck'
    | 'email-asset'
    | 'solution-icon' = 'document',
): ValidationResult {
  const ext = path.extname(filename).toLowerCase();

  // Block archives explicitly
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Archive files (${ext}) are not allowed` };
  }

  if (context === 'logo') {
    if (!LOGO_ALLOWED_EXTENSIONS.has(ext)) {
      return { valid: false, reason: `Logo files must be PNG, JPEG, WEBP, GIF, or SVG` };
    }
    if (fileSizeBytes > LOGO_MAX_BYTES) {
      return { valid: false, reason: `Logo file must be smaller than 3 MB` };
    }
    return { valid: true };
  }

  if (context === 'support') {
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { valid: false, reason: `File type ${ext} is not supported for support attachments` };
    }
    if (fileSizeBytes > SUPPORT_MAX_BYTES) {
      return { valid: false, reason: `Support attachment must be smaller than 5 MB` };
    }
    return { valid: true };
  }

  if (context === 'image') {
    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
    if (!imageExts.has(ext)) {
      return { valid: false, reason: `Image files must be PNG, JPEG, GIF, or WEBP` };
    }
    if (fileSizeBytes > 5 * 1024 * 1024) {
      return { valid: false, reason: `Image file must be smaller than 5 MB` };
    }
    return { valid: true };
  }

  if (context === 'flight-deck') {
    if (!FLIGHT_DECK_ALLOWED_EXTENSIONS.has(ext)) {
      return { valid: false, reason: `Flight Deck banners must be PNG, JPEG, WEBP, or SVG` };
    }
    if (fileSizeBytes > FLIGHT_DECK_MAX_BYTES) {
      return { valid: false, reason: `Flight Deck banner must be smaller than 2 MB` };
    }
    return { valid: true };
  }

  if (context === 'email-asset') {
    if (!EMAIL_ASSET_ALLOWED_EXTENSIONS.has(ext)) {
      return { valid: false, reason: `Email assets must be PNG, JPEG, WEBP, or GIF` };
    }
    if (fileSizeBytes > EMAIL_ASSET_MAX_BYTES) {
      return { valid: false, reason: `Email asset must be smaller than 2 MB` };
    }
    return { valid: true };
  }

  if (context === 'solution-icon') {
    if (!SOLUTION_ICON_ALLOWED_EXTENSIONS.has(ext)) {
      return { valid: false, reason: `Solution icons must be PNG or WEBP` };
    }
    if (fileSizeBytes > SOLUTION_ICON_MAX_BYTES) {
      return { valid: false, reason: `Solution icon must be smaller than 1 MB` };
    }
    return { valid: true };
  }

  // document context
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `File type ${ext} is not supported. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` };
  }

  // Find per-type limit
  const typeConfig = ALLOWED_TYPES.find(t => t.extensions.includes(ext));
  const limit = typeConfig?.maxBytes ?? MAX_FILE_SIZE_BYTES;
  if (fileSizeBytes > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return { valid: false, reason: `${typeConfig?.label ?? 'File'} must be smaller than ${limitMB} MB` };
  }

  return { valid: true };
}

// ─── Magic bytes validation ───────────────────────────────────────────────────

interface MagicSignature {
  ext: string;
  bytes: number[];
  offset?: number;
  secondary?: { bytes: number[]; offset: number };
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { ext: '.pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                          // %PDF
  {
    ext: '.docx',
    bytes: [0x50, 0x4B, 0x03, 0x04],                                          // PK (ZIP/Office)
  },
  {
    ext: '.xlsx',
    bytes: [0x50, 0x4B, 0x03, 0x04],
  },
  {
    ext: '.pptx',
    bytes: [0x50, 0x4B, 0x03, 0x04],
  },
  { ext: '.doc',  bytes: [0xD0, 0xCF, 0x11, 0xE0] },                          // OLE2
  { ext: '.xls',  bytes: [0xD0, 0xCF, 0x11, 0xE0] },
  { ext: '.ppt',  bytes: [0xD0, 0xCF, 0x11, 0xE0] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4E, 0x47] },                          // PNG
  { ext: '.jpg',  bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.gif',  bytes: [0x47, 0x49, 0x46, 0x38] },                          // GIF8
  {
    ext: '.webp',
    bytes: [0x52, 0x49, 0x46, 0x46],                                           // RIFF
    secondary: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },                // WEBP
  },
  // TXT/CSV: no magic bytes — text files, skip signature check
];

/**
 * Read enough bytes from a file to check magic bytes.
 * Returns true if signature matches OR if extension has no known signature.
 */
export async function validateMagicBytes(filePath: string, ext: string): Promise<ValidationResult> {
  const normalizedExt = ext.toLowerCase();

  // Text-based files: skip magic bytes check, just ensure not null-prefixed binary
  if (normalizedExt === '.txt' || normalizedExt === '.csv') {
    try {
      const buf = Buffer.alloc(16);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (bytesRead > 0 && buf[0] === 0x00) {
        return { valid: false, reason: 'Text file appears to contain binary data' };
      }
    } catch {
      // If we can't read, pass through
    }
    return { valid: true };
  }

  // SVG is text-based XML. No binary signature, but a valid SVG MUST
  // start with either `<?xml` or `<svg` somewhere in the first kilobyte
  // (whitespace + BOM permitted). Use a textual probe so a binary file
  // renamed `.svg` (Word doc, EXE) is rejected before the sanitizer
  // even runs. The sanitizer's own structural check is the second
  // line of defence; this is the cheap first pass.
  if (normalizedExt === '.svg') {
    try {
      const buf = Buffer.alloc(1024);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buf, 0, 1024, 0);
      fs.closeSync(fd);
      if (bytesRead < 5) {
        return { valid: false, reason: 'SVG file is too small to be valid' };
      }
      const head = buf.toString('utf8', 0, bytesRead).toLowerCase();
      if (!head.includes('<svg') && !head.includes('<?xml')) {
        return {
          valid: false,
          reason: 'File does not appear to be a valid SVG (missing <svg> or <?xml> at start)',
        };
      }
    } catch {
      // Read failure → pass through; the sanitizer step will catch it.
    }
    return { valid: true };
  }

  const sigs = MAGIC_SIGNATURES.filter(s => s.ext === normalizedExt);
  if (sigs.length === 0) {
    // No known signature for this extension — pass through
    return { valid: true };
  }

  try {
    const bufSize = 16;
    const buf = Buffer.alloc(bufSize);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, bufSize, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) {
      return { valid: false, reason: 'File is too small to be valid' };
    }

    for (const sig of sigs) {
      const offset = sig.offset ?? 0;
      const primary = sig.bytes.every((b, i) => buf[offset + i] === b);
      if (!primary) continue;

      if (sig.secondary) {
        const sec = sig.secondary;
        const secondary = sec.bytes.every((b, i) => buf[sec.offset + i] === b);
        if (!secondary) continue;
      }

      return { valid: true };
    }

    return {
      valid: false,
      reason: `File content does not match the expected format for ${normalizedExt}`,
    };
  } catch (err: any) {
    console.error('[upload-config] Magic bytes check error:', err.message);
    return { valid: true }; // Fail open if we can't read the file (let other checks catch issues)
  }
}

// ─── File hash ────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a file. Returns hex string.
 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ─── Filename normalization ───────────────────────────────────────────────────

/**
 * Normalize an uploaded filename: strip unsafe chars, limit length,
 * preserve extension.
 */
export function normalizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, ext);

  // Remove everything that is not alphanumeric, dash, underscore, or dot
  const safeBase = trimEdgeChar(
    base.replace(/[^a-zA-Z0-9\-_.]/g, '_').replace(/_{2,}/g, '_'),
    '_',
  ).substring(0, 100);

  const timestamp = Date.now();
  const uuid = crypto.randomBytes(6).toString('hex');

  return `${safeBase || 'file'}_${timestamp}_${uuid}${ext}`;
}

// ─── Quarantine directory ─────────────────────────────────────────────────────

export const QUARANTINE_DIR = path.join(process.cwd(), 'attached_assets', 'quarantine');
/**
 * QUARANTINE_DIR resolved, with a trailing separator. Every multer disk
 * upload lands in QUARANTINE_DIR, so code that touches `req.file.path`
 * checks `path.resolve(p).startsWith(QUARANTINE_ROOT)` first.
 */
export const QUARANTINE_ROOT = path.resolve(QUARANTINE_DIR) + path.sep;

/**
 * The absolute path of a multer upload, or null when it isn't inside
 * QUARANTINE_DIR. Multer picks the name and folder itself, so null only
 * happens if an upload was misconfigured; callers refuse the request.
 */
export function quarantinedUploadPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(QUARANTINE_ROOT) ? resolved : null;
}

/** Deletes a multer upload from quarantine; ignores paths outside it and missing files. */
export function discardQuarantinedUpload(filePath: unknown): void {
  const safePath = quarantinedUploadPath(filePath);
  if (!safePath) return;
  try {
    fs.unlinkSync(safePath);
  } catch {
    // Already gone.
  }
}

export function ensureQuarantineDir(): void {
  if (!fs.existsSync(QUARANTINE_DIR)) {
    fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  }
}
