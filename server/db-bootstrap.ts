import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');

// Branches the operator can pick from in the Add/Edit modal. Task
// #739 fixes this to the canonical triad (production/staging/
// development). Legacy values (testing/qa/sandbox/other) introduced
// in earlier prototypes are normalized via LEGACY_BRANCH_MAP on read
// and persisted to the canonical value the next time the row is
// saved (see migrateLegacyShape).
export const ALLOWED_BRANCHES = [
  'production',
  'staging',
  'development',
] as const;
export type ConnectionBranch = (typeof ALLOWED_BRANCHES)[number];

// Narrow an arbitrary string to a `ConnectionBranch` without using
// `as any`. Use this at every wire boundary that touches user input
// (routes, normalizers) so the rest of the code can rely on the
// branded type without re-validating.
export function isAllowedBranch(value: unknown): value is ConnectionBranch {
  return typeof value === 'string' && (ALLOWED_BRANCHES as readonly string[]).includes(value);
}

// Migration map for legacy 6-value branch labels that were briefly
// allowed before Task #739 narrowed the contract to the canonical
// production/staging/development triad. Anything outside the allowed
// set normalizes to 'production' on read so existing rows keep their
// most-conservative default rather than silently disappearing from
// validation; the next save will persist the normalized value.
const LEGACY_BRANCH_MAP: Record<string, ConnectionBranch> = {
  testing: 'staging',
  qa: 'staging',
  sandbox: 'development',
  other: 'production',
};

export interface ConnectionRecord {
  // Slug-style stable id (`bootstrap-initial-install`,
  // `production-2`, …). This is the canonical key inside the file —
  // the `db_connections` table mirror matches by `name`, since the
  // table doesn't carry a slug column.
  id: string;
  name: string;
  // AES-256-GCM ciphertext in `iv:cipher:tag` hex form (same wire
  // format `mfaUtils.encryptText` produces, so the table mirror can
  // copy the value through unchanged).
  connectionUrl: string;
  branch: ConnectionBranch;
  isSystem: boolean;
  isDefault: boolean;
  notes: string | null;
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

interface BootstrapStore {
  // Legacy single-URL field kept around for one boot post-migration
  // so a downgrade still finds something to point at. The migration
  // step in `readConnections()` drops it on first write.
  connectionUrl?: string;
  connections?: ConnectionRecord[];
  activeConnectionId?: string | null;
  // Task #740: when the operator clicks "Set Active for next
  // restart", we record the target connection id here. The boot
  // loader prefers this over `activeConnectionId` and, after
  // migrations succeed against the new DB, promotes it via
  // `consumePendingActive()` (clearing this field and updating
  // `activeConnectionId`). On failure the field stays so the admin
  // sees the warning banner on the next sign-in.
  pendingActiveConnectionId?: string | null;
  // Task #740: previous URL of the active row, captured ONLY when
  // the typed-confirm "edit active row's URL" path overwrites
  // `connectionUrl` on the active record. The cancel-pending
  // endpoint uses this to revert the URL atomically; on a
  // successful pending-consume it gets cleared.
  previousActiveUrl?: string | null;
  // Other fields owned by `server/lib/app-config.ts`
  // (sessionSecret/encryptionKey/publicAppUrl/smtp). We preserve
  // them on every write via the spread in `writeStore`.
  [k: string]: unknown;
}

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    return Buffer.from(raw, 'hex');
  } catch {
    return null;
  }
}

function encryptUrl(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptUrl(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;
  try {
    const [ivHex, encrypted, authTagHex] = ciphertext.split(':');
    if (!ivHex || !encrypted || !authTagHex) return ciphertext;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return ciphertext;
  }
}

function readRawStore(): BootstrapStore {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(next: BootstrapStore): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = { ...next, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2), 'utf8');
}

// ---------------------------------------------------------------------
// Connection record helpers (Task #739)
// ---------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(name: string, existing: Iterable<string>): string {
  const base = (name || 'connection')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safe = base.length > 0 ? base.slice(0, 60) : 'connection';
  const used = new Set(existing);
  if (!used.has(safe)) return safe;
  let i = 2;
  while (used.has(`${safe}-${i}`)) i++;
  return `${safe}-${i}`;
}

function normalizeRecord(raw: any): ConnectionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.connectionUrl !== 'string') {
    return null;
  }
  // Branch normalization: accept canonical values directly, remap
  // legacy 6-value names via LEGACY_BRANCH_MAP, fall back to
  // 'production' for anything else (typo, missing, etc).
  const rawBranch = typeof raw.branch === 'string' ? raw.branch : '';
  const branch: ConnectionBranch = isAllowedBranch(rawBranch)
    ? rawBranch
    : (LEGACY_BRANCH_MAP[rawBranch] ?? 'production');
  return {
    id: raw.id,
    name: raw.name,
    connectionUrl: raw.connectionUrl,
    branch,
    isSystem: !!raw.isSystem,
    isDefault: !!raw.isDefault,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    lastTestedAt: typeof raw.lastTestedAt === 'string' ? raw.lastTestedAt : null,
    lastTestSuccess: typeof raw.lastTestSuccess === 'boolean' ? raw.lastTestSuccess : null,
    lastTestLatencyMs: typeof raw.lastTestLatencyMs === 'number' ? raw.lastTestLatencyMs : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

// One-time migration: when an older install left only the single
// legacy `connectionUrl` field, fold it into a single
// `bootstrap-initial-install` record so the new helpers see a
// uniform shape from the very first read. Returns the migrated
// store; `readConnections` immediately persists the canonical shape
// (and drops the legacy field) when migration actually occurred so
// downstream callers never see the divergence twice. A downgrade
// path is no longer needed because `db_connections` is a mirror of
// the file; rolling back code to the pre-#739 era simply re-reads
// the active connection's URL via `resolveConnectionUrl`.
function migrateLegacyShape(store: BootstrapStore): BootstrapStore {
  if (Array.isArray(store.connections)) return store;
  if (!store.connectionUrl || typeof store.connectionUrl !== 'string') {
    return { ...store, connections: [] };
  }
  const ts = nowIso();
  const seeded: ConnectionRecord = {
    id: 'bootstrap-initial-install',
    name: 'Bootstrap (initial install)',
    connectionUrl: store.connectionUrl,
    branch: 'production',
    isSystem: true,
    isDefault: true,
    notes:
      'Auto-migrated from the legacy single-URL field. This row points at the database the app booted against.',
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestLatencyMs: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    ...store,
    connections: [seeded],
    activeConnectionId: seeded.id,
  };
}

/**
 * Read the connection list from `data/db-config.json`. Returns an
 * empty array on a missing/malformed file. Also handles the legacy
 * single-`connectionUrl` shape transparently — callers always see
 * a `connections[]` view.
 */
export interface ConnectionState {
  connections: ConnectionRecord[];
  activeConnectionId: string | null;
  pendingActiveConnectionId: string | null;
  // Task #740: ciphertext URL captured before a typed-confirm edit
  // overwrote the active row's URL. Lets `cancelPendingActive()`
  // revert atomically. `null` (or absent) when no URL edit is
  // pending.
  previousActiveUrl: string | null;
}

export function readConnections(): ConnectionState {
  const raw = readRawStore();
  const hadLegacyShape = !Array.isArray(raw.connections) && typeof raw.connectionUrl === 'string';
  const migrated = migrateLegacyShape(raw);
  // First-boot persistence: if the legacy single-URL shape was just
  // folded into connections[] this call, flush the canonical shape
  // back to disk immediately so the legacy `connectionUrl` field
  // disappears and there is exactly one source of truth from now on.
  if (hadLegacyShape && Array.isArray(migrated.connections) && migrated.connections.length > 0) {
    try {
      writeConnectionsBlock({
        connections: migrated.connections,
        activeConnectionId:
          typeof migrated.activeConnectionId === 'string' ? migrated.activeConnectionId : null,
        pendingActiveConnectionId:
          typeof migrated.pendingActiveConnectionId === 'string'
            ? migrated.pendingActiveConnectionId
            : null,
        previousActiveUrl:
          typeof migrated.previousActiveUrl === 'string' ? migrated.previousActiveUrl : null,
      });
    } catch (err) {
      console.warn('[db-bootstrap] legacy-shape persist failed (will retry on next write):', err);
    }
  }
  const list = Array.isArray(migrated.connections) ? migrated.connections : [];
  const normalized: ConnectionRecord[] = [];
  for (const r of list) {
    const n = normalizeRecord(r);
    if (n) normalized.push(n);
  }
  return {
    connections: normalized,
    activeConnectionId:
      typeof migrated.activeConnectionId === 'string' ? migrated.activeConnectionId : null,
    pendingActiveConnectionId:
      typeof migrated.pendingActiveConnectionId === 'string'
        ? migrated.pendingActiveConnectionId
        : null,
    previousActiveUrl:
      typeof migrated.previousActiveUrl === 'string' ? migrated.previousActiveUrl : null,
  };
}

/**
 * Internal — replace the connection list and active/pending ids
 * atomically while preserving every other field in the file (the
 * secrets, smtp block, public URL).
 */
function writeConnectionsBlock(next: {
  connections: ConnectionRecord[];
  activeConnectionId: string | null;
  pendingActiveConnectionId: string | null;
  previousActiveUrl?: string | null;
}): void {
  const store = readRawStore();
  // Drop the legacy single-URL field on the first write after
  // migration so we don't keep two competing sources of truth around.
  delete store.connectionUrl;
  // Drop the now-removed announcement-id slot left over from earlier
  // builds. Task #740 originally tracked an admin-targeted
  // system_announcements row id here, but the announcement creation
  // was never wired up (a cross-DB row would be unreachable from the
  // new DB after restart). Removing the field on next write prevents
  // stale data from lingering in older db-config.json files.
  delete store.pendingActiveAnnouncementId;
  store.connections = next.connections;
  store.activeConnectionId = next.activeConnectionId;
  store.pendingActiveConnectionId = next.pendingActiveConnectionId;
  store.previousActiveUrl = next.previousActiveUrl ?? null;
  writeStore(store);
}

export function getConnectionById(id: string): ConnectionRecord | null {
  const { connections } = readConnections();
  return connections.find((c) => c.id === id) ?? null;
}

export function getConnectionByName(name: string): ConnectionRecord | null {
  const trimmed = name.trim().toLowerCase();
  const { connections } = readConnections();
  return connections.find((c) => c.name.trim().toLowerCase() === trimmed) ?? null;
}

export interface AddConnectionInput {
  name: string;
  encryptedUrl: string;
  branch: ConnectionBranch;
  notes?: string | null;
  isSystem?: boolean;
  isDefault?: boolean;
}

export function addConnection(input: AddConnectionInput): ConnectionRecord {
  const state = readConnections();
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Connection name is required');
  }
  const dupName = state.connections.some(
    (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  if (dupName) {
    throw new Error(`A connection named "${trimmedName}" already exists`);
  }
  const id = slugify(trimmedName, state.connections.map((c) => c.id));
  const ts = nowIso();
  const record: ConnectionRecord = {
    id,
    name: trimmedName,
    connectionUrl: input.encryptedUrl,
    branch: input.branch,
    isSystem: !!input.isSystem,
    isDefault: !!input.isDefault,
    notes: input.notes ?? null,
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestLatencyMs: null,
    createdAt: ts,
    updatedAt: ts,
  };

  let connections = [...state.connections, record];
  // Per-branch "default" is exclusive — clearing siblings here keeps
  // the file in sync with the same UI contract the table mirror
  // enforces.
  if (record.isDefault) {
    connections = connections.map((c) =>
      c.id !== record.id && c.branch === record.branch
        ? { ...c, isDefault: false }
        : c,
    );
  }
  writeConnectionsBlock({
    connections,
    activeConnectionId: state.activeConnectionId,
    pendingActiveConnectionId: state.pendingActiveConnectionId,
    previousActiveUrl: state.previousActiveUrl,
  });
  return record;
}

export interface UpdateConnectionInput {
  name?: string;
  encryptedUrl?: string;
  branch?: ConnectionBranch;
  notes?: string | null;
  isDefault?: boolean;
  lastTestedAt?: string | null;
  lastTestSuccess?: boolean | null;
  lastTestLatencyMs?: number | null;
}

export function updateConnection(id: string, patch: UpdateConnectionInput): ConnectionRecord {
  const state = readConnections();
  const idx = state.connections.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error(`Connection "${id}" not found`);
  const current = state.connections[idx];

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error('Connection name cannot be blank');
    const collision = state.connections.some(
      (c) => c.id !== id && c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) {
      throw new Error(`Another connection is already named "${trimmed}"`);
    }
  }

  const next: ConnectionRecord = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    connectionUrl: patch.encryptedUrl ?? current.connectionUrl,
    branch: patch.branch ?? current.branch,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    isDefault: patch.isDefault !== undefined ? !!patch.isDefault : current.isDefault,
    lastTestedAt:
      patch.lastTestedAt !== undefined ? patch.lastTestedAt : current.lastTestedAt,
    lastTestSuccess:
      patch.lastTestSuccess !== undefined ? patch.lastTestSuccess : current.lastTestSuccess,
    lastTestLatencyMs:
      patch.lastTestLatencyMs !== undefined
        ? patch.lastTestLatencyMs
        : current.lastTestLatencyMs,
    updatedAt: nowIso(),
  };

  let connections = state.connections.map((c) => (c.id === id ? next : c));
  if (next.isDefault) {
    connections = connections.map((c) =>
      c.id !== next.id && c.branch === next.branch ? { ...c, isDefault: false } : c,
    );
  }

  writeConnectionsBlock({
    connections,
    activeConnectionId: state.activeConnectionId,
    pendingActiveConnectionId: state.pendingActiveConnectionId,
    previousActiveUrl: state.previousActiveUrl,
  });
  return next;
}

export function removeConnection(id: string): void {
  const state = readConnections();
  const target = state.connections.find((c) => c.id === id);
  if (!target) throw new Error(`Connection "${id}" not found`);
  if (target.isSystem) {
    throw new Error('Cannot delete a system connection');
  }
  if (state.activeConnectionId === id) {
    throw new Error('Cannot delete the currently active connection');
  }
  if (state.pendingActiveConnectionId === id) {
    throw new Error('Cannot delete a connection that is queued for the next restart');
  }
  writeConnectionsBlock({
    connections: state.connections.filter((c) => c.id !== id),
    activeConnectionId: state.activeConnectionId,
    pendingActiveConnectionId: state.pendingActiveConnectionId,
    previousActiveUrl: state.previousActiveUrl,
  });
}

export function setActiveConnectionId(id: string | null): void {
  const state = readConnections();
  if (id !== null && !state.connections.some((c) => c.id === id)) {
    throw new Error(`Connection "${id}" not found`);
  }
  writeConnectionsBlock({
    connections: state.connections,
    activeConnectionId: id,
    pendingActiveConnectionId: state.pendingActiveConnectionId,
    previousActiveUrl: state.previousActiveUrl,
  });
}

/**
 * Task #740 — record (or clear) the operator's "Set Active for next
 * restart" choice. When the URL of the currently-active row is being
 * edited via the typed-confirm modal, callers also pass
 * `previousActiveUrl` (the prior ciphertext) so a later
 * `cancelPendingActive()` can revert atomically.
 *
 * Note: an earlier draft of #740 also wrote a system_announcements
 * row id into the file via an `announcementId` slot. The cross-DB
 * write was removed (the row would land in the OLD database and be
 * unreachable from the NEW one after restart), so this helper is
 * intentionally announcement-free. The yellow banner in the panel is
 * file-driven via GET /api/db-connections/pending-active.
 */
export function setPendingActiveState(input: {
  pendingId: string | null;
  previousActiveUrl?: string | null;
}): void {
  const state = readConnections();
  if (input.pendingId !== null && !state.connections.some((c) => c.id === input.pendingId)) {
    throw new Error(`Connection "${input.pendingId}" not found`);
  }
  writeConnectionsBlock({
    connections: state.connections,
    activeConnectionId: state.activeConnectionId,
    pendingActiveConnectionId: input.pendingId,
    previousActiveUrl: input.previousActiveUrl ?? null,
  });
}

/** Backwards-compat shim for callers that only need the id slot. */
export function setPendingActiveConnectionId(id: string | null): void {
  setPendingActiveState({ pendingId: id });
}

/**
 * Task #740 — operator clicked "Cancel pending switch" in the
 * banner. Reverts a typed-confirm URL edit (if any) and clears the
 * pending-id slot.
 */
export function cancelPendingActive(): void {
  const state = readConnections();
  let connections = state.connections;
  // Revert the active row's URL if a typed-confirm edit was queued.
  if (state.previousActiveUrl && state.activeConnectionId) {
    connections = connections.map((c) =>
      c.id === state.activeConnectionId
        ? { ...c, connectionUrl: state.previousActiveUrl as string, updatedAt: nowIso() }
        : c,
    );
  }
  writeConnectionsBlock({
    connections,
    activeConnectionId: state.activeConnectionId,
    pendingActiveConnectionId: null,
    previousActiveUrl: null,
  });
}

/**
 * Task #740 — boot-time finalizer. Called by `server/index.ts` AFTER
 * the migration runner reports success against the pending DB. Swaps
 * `pendingActiveConnectionId` into `activeConnectionId` and clears
 * the pending-id and previousActiveUrl slots. Returns the committed
 * id so callers can log the swap. No-op (returns null) when there's
 * nothing to consume so it's safe to call unconditionally.
 */
export function consumePendingActive(): {
  committedActiveId: string | null;
} {
  const state = readConnections();
  if (!state.pendingActiveConnectionId) {
    return { committedActiveId: null };
  }
  // If the pending id no longer exists (e.g. the row was renamed
  // mid-flight), bail without committing — the operator will see
  // the still-pending banner and can pick again.
  if (!state.connections.some((c) => c.id === state.pendingActiveConnectionId)) {
    return { committedActiveId: null };
  }
  const committedActiveId = state.pendingActiveConnectionId;
  writeConnectionsBlock({
    connections: state.connections,
    activeConnectionId: committedActiveId,
    pendingActiveConnectionId: null,
    previousActiveUrl: null,
  });
  return { committedActiveId };
}

/**
 * Decrypt a record's connectionUrl. Returns the raw plaintext on
 * success, or an empty string if no key is configured (the file
 * also refused to encrypt in that mode, so the value is plaintext
 * already — see `encryptUrl`).
 */
export function decryptConnectionUrl(record: ConnectionRecord): string {
  return decryptUrl(record.connectionUrl);
}

/**
 * Encrypt a plaintext URL using the same wire format as the rest
 * of the connection store. Exposed so callers in `routes.ts` can
 * stay decoupled from `mfaUtils` if they want — both helpers
 * produce identical `iv:cipher:tag` hex output.
 */
export function encryptConnectionUrl(plaintext: string): string {
  return encryptUrl(plaintext);
}

// ---------------------------------------------------------------------
// Legacy single-URL helpers (kept for backwards compat with code
// paths that still call them — most notably the existing setup
// wizard which writes the install-time URL during Phase 4).
// ---------------------------------------------------------------------

export function readBootstrapConfig(): string | null {
  const state = readConnections();
  if (state.activeConnectionId) {
    const active = state.connections.find((c) => c.id === state.activeConnectionId);
    if (active) return decryptConnectionUrl(active);
  }
  // Fall back to the legacy single-URL field for one-boot downgrades.
  const raw = readRawStore();
  if (raw.connectionUrl && typeof raw.connectionUrl === 'string') {
    return decryptUrl(raw.connectionUrl);
  }
  return null;
}

export function writeBootstrapConfig(url: string): void {
  // Backwards-compat shim. The setup wizard's Phase 4 still calls
  // this to commit the operator-supplied URL to disk before any
  // routes module is loaded. We translate the call into the new
  // shape: if there are no connection records yet, seed a
  // `bootstrap-initial-install` row and mark it active; otherwise
  // upsert by name "Bootstrap (initial install)" so re-running the
  // wizard against a different DB updates the existing row in place
  // instead of accumulating duplicates.
  const state = readConnections();
  const encrypted = encryptUrl(url);
  const ts = nowIso();
  const existingIdx = state.connections.findIndex(
    (c) => c.id === 'bootstrap-initial-install' || c.isSystem,
  );

  let connections: ConnectionRecord[];
  let activeId: string;
  if (existingIdx >= 0) {
    const updated: ConnectionRecord = {
      ...state.connections[existingIdx],
      connectionUrl: encrypted,
      updatedAt: ts,
    };
    connections = state.connections.map((c, i) => (i === existingIdx ? updated : c));
    activeId = updated.id;
  } else {
    const seeded: ConnectionRecord = {
      id: 'bootstrap-initial-install',
      name: 'Bootstrap (initial install)',
      connectionUrl: encrypted,
      branch: 'production',
      isSystem: true,
      isDefault: true,
      notes:
        'Created automatically by the setup wizard. This row points at the database you just installed against.',
      lastTestedAt: null,
      lastTestSuccess: null,
      lastTestLatencyMs: null,
      createdAt: ts,
      updatedAt: ts,
    };
    connections = [...state.connections, seeded];
    activeId = seeded.id;
  }
  writeConnectionsBlock({
    connections,
    activeConnectionId: activeId,
    pendingActiveConnectionId: state.pendingActiveConnectionId,
    previousActiveUrl: state.previousActiveUrl,
  });
  console.log('[Bootstrap] Wrote db-config.json successfully');
}

export function clearBootstrapConfig(): void {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {}
}

export function bootstrapConfigExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Resolve the URL to boot the app against. Order of preference:
 *
 *   1. Pending record (Task #740) from the file's
 *      `pendingActiveConnectionId` field — the operator queued this
 *      DB for the next boot via "Set Active for next restart". The
 *      caller is expected to call `consumePendingActive()` after
 *      migrations succeed against this URL so the field gets cleared
 *      and `activeConnectionId` is updated. On migration failure the
 *      field stays so the warning banner is visible after recovery.
 *   2. Active record from the file's `connections[]` array (the
 *      canonical multi-DB store).
 *   3. Legacy single `connectionUrl` field on the file (covers the
 *      one-boot downgrade window between the migration step and the
 *      first write).
 *   4. `process.env.DATABASE_URL`.
 *   5. None.
 */
export function resolveConnectionUrl(): {
  url: string | null;
  source: 'file' | 'env' | 'none';
  pendingActive?: boolean;
  /** Prior-active URL used by the boot loader as fallback if a
   *  pending-active swap fails. Only populated when pendingActive=true. */
  fallbackUrl?: string | null;
} {
  const state = readConnections();
  // Honor a queued "set active for next restart" first. We
  // deliberately do NOT update the file here — `consumePendingActive`
  // does the swap once migrations succeed, so a failed boot leaves
  // the file pointing at the prior active row's id (the banner stays
  // visible to the admin on the next sign-in).
  if (state.pendingActiveConnectionId) {
    const pending = state.connections.find((c) => c.id === state.pendingActiveConnectionId);
    if (pending) {
      const decrypted = decryptConnectionUrl(pending);
      if (decrypted) {
        // Fallback URL for boot-failure recovery: prior active row
        // (swap case), or the captured previousActiveUrl (URL-edit
        // case where the active row's ciphertext is now the new URL).
        let fallbackUrl: string | null = null;
        if (state.activeConnectionId && state.activeConnectionId !== state.pendingActiveConnectionId) {
          const active = state.connections.find((c) => c.id === state.activeConnectionId);
          if (active) {
            const fb = decryptConnectionUrl(active);
            if (fb) fallbackUrl = fb;
          }
        } else if (state.previousActiveUrl) {
          const fb = decryptUrl(state.previousActiveUrl);
          if (fb) fallbackUrl = fb;
        }
        return { url: decrypted, source: 'file', pendingActive: true, fallbackUrl };
      }
    }
  }
  if (state.activeConnectionId) {
    const active = state.connections.find((c) => c.id === state.activeConnectionId);
    if (active) {
      const decrypted = decryptConnectionUrl(active);
      if (decrypted) return { url: decrypted, source: 'file' };
    }
  }

  // Fall back to the legacy single-URL field if the file still has
  // it (downgrade window).
  const raw = readRawStore();
  if (raw.connectionUrl && typeof raw.connectionUrl === 'string') {
    const decrypted = decryptUrl(raw.connectionUrl);
    if (decrypted) return { url: decrypted, source: 'file' };
  }

  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: 'env' };
  }
  return { url: null, source: 'none' };
}
