/**
 * virus-scanner.ts
 * 
 * Thin wrapper around ClamAV via the `clamscan` npm package.
 * Gracefully degrades if the ClamAV daemon is not running:
 *  - Logs a warning
 *  - Returns { clean: true } so uploads still succeed in dev environments
 *
 * In production, ensure ClamAV is installed and running:
 *   apt-get install clamav clamav-daemon && clamd
 */

export interface ScanResult {
  clean: boolean;
  reason?: string;
}

let clamAvailable: boolean | null = null;
let NodeClam: any = null;
let clamInstance: any = null;

async function initClam(): Promise<boolean> {
  if (clamAvailable !== null) return clamAvailable;

  try {
    const mod = await import('clamscan' as any);
    NodeClam = mod.default ?? mod;

    clamInstance = await new NodeClam().init({
      removeInfected: false,
      quarantineInfected: false,
      scanLog: null,
      debugMode: false,
      fileList: null,
      scanRecursively: false,
      clamscan: {
        path: '/usr/bin/clamscan',
        db: null,
        scanArchives: true,
        active: false, // prefer clamdscan (daemon)
      },
      clamdscan: {
        socket: '/var/run/clamav/clamd.ctl',
        host: '127.0.0.1',
        port: 3310,
        timeout: 10000,
        localFallback: true,
        path: '/usr/bin/clamdscan',
        multiscan: false,
        reloadDb: false,
        active: true,
        bypassTest: false,
      },
      preference: 'clamdscan',
    });

    clamAvailable = true;
    console.log('[virus-scanner] ClamAV initialized successfully');
  } catch (err: any) {
    clamAvailable = false;
    console.warn(
      '[virus-scanner] ClamAV not available — virus scanning is DISABLED.',
      'To enable, install and start the ClamAV daemon (clamd).',
      err?.message ?? '',
    );
  }

  return clamAvailable;
}

/**
 * Scan a file on disk with ClamAV.
 * If ClamAV is not available, returns { clean: true } with a warning.
 */
export async function scanFile(filePath: string): Promise<ScanResult> {
  const available = await initClam();

  if (!available || !clamInstance) {
    // Graceful fallback — scanning skipped
    return { clean: true };
  }

  try {
    const { isInfected, viruses } = await clamInstance.scanFile(filePath);

    if (isInfected) {
      const reason = viruses?.join(', ') ?? 'Unknown threat';
      console.warn(`[virus-scanner] Infected file detected: ${filePath} — ${reason}`);
      return { clean: false, reason };
    }

    return { clean: true };
  } catch (err: any) {
    // If daemon times out or disconnects mid-scan, fail open with a warning
    console.error('[virus-scanner] Scan error (failing open):', err.message);
    return { clean: true };
  }
}
