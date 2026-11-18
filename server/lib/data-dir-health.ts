import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Boot-time + on-demand sanity check that the `data/` directory the
 * app uses for the encrypted bootstrap store (`data/db-config.json`)
 * is actually writable (Task #741).
 *
 * Catches the "volume not mounted" footgun on Dokploy / Azure App
 * Service / similar container orchestrators: when the operator forgets
 * to wire up a persistent volume mount, the path exists (because we
 * `mkdir`'d it), looks fine to the casual `ls`, but is owned by a UID
 * the running process can't write to — every promote-to-file or
 * regenerate operation will then fail at the very last `fs.writeFile`
 * step, after the operator clicked through several confirmation
 * dialogs. Surfacing this up front in the System Health rollup gives
 * the operator a chance to fix the mount before they ever attempt
 * those flows.
 *
 * The check is cheap (a single touch-file create+unlink under the
 * data dir) so it's safe to call repeatedly from the rollup endpoint.
 * Each call uses a unique filename to avoid colliding with concurrent
 * checks (e.g. two admins polling /api/system/health at the same
 * instant on different replicas pointing at the same volume).
 *
 * Returns `{ ok: true }` on success and `{ ok: false, reason }` with
 * a single-line diagnostic message on any failure (mkdir, write,
 * unlink, or stat). The reason is safe to surface in the UI: it never
 * includes secret material; only filesystem error names + the data
 * dir path.
 */
export interface DataDirHealth {
  ok: boolean;
  reason?: string;
  dataDir: string;
}

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

export function checkDataDirWritable(opts: { dataDir?: string } = {}): DataDirHealth {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;

  // mkdir -p is idempotent and safe on every platform we ship to,
  // so a missing dir alone isn't a failure — we mkdir then try the
  // write. A failure to mkdir IS a hard failure (read-only mount,
  // permissions wrong on the parent, etc.).
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      dataDir,
      reason: `Cannot create data directory: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // Unique touch-file so concurrent checks never collide. The
  // randomness is purely for filename uniqueness, not security — a
  // 6-byte hex token is plenty.
  const probeName = `.health-touch-${process.pid}-${crypto
    .randomBytes(6)
    .toString('hex')}`;
  const probePath = path.join(dataDir, probeName);

  try {
    fs.writeFileSync(probePath, 'ok', 'utf8');
  } catch (err) {
    return {
      ok: false,
      dataDir,
      reason: `Cannot write to data directory: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  try {
    fs.unlinkSync(probePath);
  } catch (err) {
    // Write succeeded, unlink failed — odd but possible (e.g. some
    // FUSE mounts on shared volumes). Surface it but don't pretend
    // the dir is unwritable: the orphan touch-file is harmless and
    // a future probe will overwrite it via the unique-name scheme.
    return {
      ok: false,
      dataDir,
      reason: `Wrote probe but could not remove it: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return { ok: true, dataDir };
}
