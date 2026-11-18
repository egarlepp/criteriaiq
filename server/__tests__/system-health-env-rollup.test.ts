// @vitest-environment node
//
// Coverage for `server/lib/system-health-env-rollup.ts` — the helper that
// folds the env-var snapshot returned by `getBootstrapSnapshot()` into
// the response served by `/api/system/health` (Task #350).
//
// Before Task #350 the env-var rollup lived only inside the React
// dashboard, so any other consumer of `/api/system/health` (uptime
// probes, status pages, future CLI checks) would see "All systems
// healthy" while a required env var was missing or only backed by
// `data/db-config.json`. These tests pin the helper's per-row grading,
// the overall env status precedence (error > warning > ok), and the
// `withEnvVars` fold that updates the report's `overallStatus` and
// attaches the `envVars` block — without leaking the snapshot's optional
// `revealValues` secret payload.
//
// The helper is pure (no I/O, no globals) so the tests pass plain object
// fixtures rather than mounting a server or mocking modules.

import { describe, expect, it } from 'vitest';

import {
  buildEnvVarsBlock,
  categoryStatusCounts,
  envHealthCounts,
  overallEnvStatus,
  withEnvVars,
  withOverviewCounts,
  worstHealthStatus,
  type EnvHealthStatus,
} from '../lib/system-health-env-rollup';

// Minimal `getBootstrapSnapshot()`-shaped fixture. Only the five fields
// the helper actually reads are required, but we keep the rest so the
// `withEnvVars` test can assert the secret payload is dropped.
function snapshot(overrides: Partial<{
  databaseUrlSource: 'env' | 'wizard' | 'none';
  sessionSecretSource: 'env' | 'file' | 'none';
  encryptionKeySource: 'env' | 'file' | 'none';
  publicAppUrl: string;
  publicAppUrlSource: 'env' | 'file' | 'default';
  sessionSecretValue: string | undefined;
  encryptionKeyValue: string | undefined;
}> = {}) {
  return {
    hasConnectionUrl: true,
    databaseUrlSource: 'env' as const,
    hasSessionSecret: true,
    sessionSecretSource: 'env' as const,
    hasEncryptionKey: true,
    encryptionKeySource: 'env' as const,
    publicAppUrl: 'https://app.example.com',
    publicAppUrlSource: 'env' as const,
    sessionSecretValue: undefined,
    encryptionKeyValue: undefined,
    ...overrides,
  };
}

describe('worstHealthStatus', () => {
  it('returns "error" when either side is error', () => {
    expect(worstHealthStatus('error', 'ok')).toBe('error');
    expect(worstHealthStatus('ok', 'error')).toBe('error');
    expect(worstHealthStatus('warning', 'error')).toBe('error');
    expect(worstHealthStatus('error', 'warning')).toBe('error');
  });

  it('returns "warning" when no error and at least one warning', () => {
    expect(worstHealthStatus('warning', 'ok')).toBe('warning');
    expect(worstHealthStatus('ok', 'warning')).toBe('warning');
    expect(worstHealthStatus('warning', 'warning')).toBe('warning');
  });

  it('returns "ok" when both sides are ok', () => {
    expect(worstHealthStatus('ok', 'ok')).toBe('ok');
  });
});

describe('envHealthCounts', () => {
  it('counts all four rows as ok when every source is `env`', () => {
    expect(envHealthCounts(snapshot())).toEqual({ ok: 4, warning: 0, error: 0 });
  });

  it('grades file-sourced secrets and wizard-sourced DATABASE_URL as warnings', () => {
    expect(
      envHealthCounts(
        snapshot({
          databaseUrlSource: 'wizard',
          sessionSecretSource: 'file',
          encryptionKeySource: 'file',
        }),
      ),
    ).toEqual({ ok: 1, warning: 3, error: 0 });
  });

  it('grades `none` and the publicAppUrl `default` fallback as errors', () => {
    expect(
      envHealthCounts(
        snapshot({
          databaseUrlSource: 'none',
          sessionSecretSource: 'none',
          encryptionKeySource: 'none',
          publicAppUrlSource: 'default',
        }),
      ),
    ).toEqual({ ok: 0, warning: 0, error: 4 });
  });

  it('mixes buckets independently when the snapshot has a bit of everything', () => {
    expect(
      envHealthCounts(
        snapshot({
          databaseUrlSource: 'wizard',
          sessionSecretSource: 'none',
          encryptionKeySource: 'env',
          publicAppUrlSource: 'file',
        }),
      ),
    ).toEqual({ ok: 1, warning: 2, error: 1 });
  });
});

describe('overallEnvStatus', () => {
  it('returns "ok" only when every row is `env`-sourced', () => {
    expect(overallEnvStatus(snapshot())).toBe('ok');
  });

  it('returns "warning" when only file/wizard rows are present', () => {
    expect(
      overallEnvStatus(
        snapshot({ sessionSecretSource: 'file' }),
      ),
    ).toBe('warning');
    expect(
      overallEnvStatus(
        snapshot({ databaseUrlSource: 'wizard' }),
      ),
    ).toBe('warning');
  });

  it('returns "error" when any row is missing', () => {
    expect(
      overallEnvStatus(
        snapshot({ sessionSecretSource: 'none' }),
      ),
    ).toBe('error');
  });

  it('treats the publicAppUrl `default` fallback as an error', () => {
    expect(
      overallEnvStatus(
        snapshot({ publicAppUrlSource: 'default' }),
      ),
    ).toBe('error');
  });

  it('error always wins over warning when both are present', () => {
    expect(
      overallEnvStatus(
        snapshot({
          databaseUrlSource: 'wizard',
          sessionSecretSource: 'none',
        }),
      ),
    ).toBe('error');
  });
});

describe('buildEnvVarsBlock', () => {
  it('echoes the four source labels and publicAppUrl from the snapshot', () => {
    expect(
      buildEnvVarsBlock(
        snapshot({
          databaseUrlSource: 'wizard',
          sessionSecretSource: 'file',
          encryptionKeySource: 'env',
          publicAppUrl: 'https://acme.example.com',
          publicAppUrlSource: 'env',
        }),
      ),
    ).toEqual({
      status: 'warning',
      databaseUrlSource: 'wizard',
      sessionSecretSource: 'file',
      encryptionKeySource: 'env',
      publicAppUrl: 'https://acme.example.com',
      publicAppUrlSource: 'env',
      // No data-dir probe passed → reported as writable (Task #741).
      dataDir: { ok: true, path: '', reason: null },
    });
  });

  it('NEVER includes the optional reveal-only secret payload, even when the snapshot carries it', () => {
    const block = buildEnvVarsBlock(
      snapshot({
        sessionSecretValue: 'should-never-leak',
        encryptionKeyValue: 'should-never-leak',
      }),
    );
    // The block intentionally has a fixed shape — none of the
    // `*Value` fields ever cross the wire.
    expect(JSON.stringify(block)).not.toContain('should-never-leak');
    expect(block).not.toHaveProperty('sessionSecretValue');
    expect(block).not.toHaveProperty('encryptionKeyValue');
  });
});

// Skeleton report that mirrors the shape returned by
// `healthMonitor.getFullHealthReport()` — the env helpers only need
// `overallStatus` plus the eleven category status fields (CATEGORY_KEYS
// in system-health-env-rollup.ts), but we keep
// the rest so assertions that unrelated fields pass through stay
// meaningful.
const baseReport = {
  overallStatus: 'ok' as EnvHealthStatus,
  lastChecked: '2026-04-25T00:00:00.000Z',
  database: { status: 'ok' as EnvHealthStatus },
  email: { status: 'ok' as EnvHealthStatus },
  integrations: { status: 'ok' as EnvHealthStatus },
  security: { status: 'ok' as EnvHealthStatus },
  backgroundServices: { status: 'ok' as EnvHealthStatus },
  storage: { status: 'ok' as EnvHealthStatus },
  performance: { status: 'ok' as EnvHealthStatus },
  archiveSchemaValidation: { status: 'ok' as EnvHealthStatus },
  featureRequests: { status: 'ok' as EnvHealthStatus },
  supportRequests: { status: 'ok' as EnvHealthStatus },
  clientErrors: { status: 'ok' as EnvHealthStatus },
};

describe('categoryStatusCounts', () => {
  it('counts all eleven categories as healthy when every status is ok', () => {
    expect(categoryStatusCounts(baseReport)).toEqual({
      healthy: 11,
      warning: 0,
      error: 0,
    });
  });

  it('mixes healthy, warning and error buckets independently', () => {
    expect(
      categoryStatusCounts({
        ...baseReport,
        email: { status: 'warning' },
        integrations: { status: 'warning' },
        security: { status: 'error' },
      }),
    ).toEqual({ healthy: 8, warning: 2, error: 1 });
  });

  it('treats a missing category field as an error so contract drift surfaces loudly', () => {
    // Drop `archiveSchemaValidation` entirely — defensively counted as
    // an error rather than silently inflating the healthy total.
    const { archiveSchemaValidation: _drop, ...partial } = baseReport;
    expect(categoryStatusCounts(partial)).toEqual({
      healthy: 10,
      warning: 0,
      error: 1,
    });
  });

  it('treats an unknown / out-of-grammar status string as an error', () => {
    expect(
      categoryStatusCounts({
        ...baseReport,
        performance: { status: 'degraded' },
      }),
    ).toEqual({ healthy: 10, warning: 0, error: 1 });
  });
});

describe('withOverviewCounts', () => {
  it('attaches the eleven-category overview counts to a healthy report', () => {
    const result = withOverviewCounts(baseReport);
    expect(result.overviewCounts).toEqual({
      healthy: 11,
      warning: 0,
      error: 0,
    });
    // All other fields pass through verbatim — the helper only adds
    // the `overviewCounts` key, never strips or renames anything else.
    expect(result.overallStatus).toBe('ok');
    expect(result.lastChecked).toBe(baseReport.lastChecked);
    expect(result.database).toEqual(baseReport.database);
  });

  it('reflects mixed category statuses without folding env-vars (non-admin path)', () => {
    const result = withOverviewCounts({
      ...baseReport,
      overallStatus: 'warning',
      email: { status: 'warning' },
      storage: { status: 'error' },
    });
    expect(result.overviewCounts).toEqual({
      healthy: 9,
      warning: 1,
      error: 1,
    });
    expect(result.overallStatus).toBe('warning');
    // No env-vars block on the non-admin code path.
    expect(result).not.toHaveProperty('envVars');
  });

  it('returns a NEW object so callers cannot accidentally mutate the upstream report', () => {
    const result = withOverviewCounts(baseReport);
    expect(result).not.toBe(baseReport);
    expect(baseReport).not.toHaveProperty('overviewCounts');
  });
});

describe('withEnvVars', () => {

  it('attaches the envVars block and leaves overallStatus as "ok" when both base and env are healthy', () => {
    const result = withEnvVars(baseReport, snapshot());
    expect(result.overallStatus).toBe('ok');
    expect(result.envVars).toEqual({
      status: 'ok',
      databaseUrlSource: 'env',
      sessionSecretSource: 'env',
      encryptionKeySource: 'env',
      publicAppUrl: 'https://app.example.com',
      publicAppUrlSource: 'env',
      dataDir: { ok: true, path: '', reason: null },
    });
    // Eleven category tiles + ONE env-vars tile, all healthy → 12 / 0 / 0.
    // The env block contributes a single entry to the headline counts
    // (graded by `envVars.status`) so the numbers always equal the
    // count of tiles with each border colour in the grid (Task #354).
    expect(result.overviewCounts).toEqual({
      healthy: 12,
      warning: 0,
      error: 0,
    });
    // Other report fields still pass through verbatim — the helper
    // must not strip / rename anything outside the env block.
    expect(result.lastChecked).toBe(baseReport.lastChecked);
    expect(result.database).toEqual(baseReport.database);
  });

  it('folds the env-vars tile into overviewCounts.warning as a single entry when its rolled-up status is "warning"', () => {
    // Two file-sourced rows still produce ONE warning entry in the
    // headline counts because the dashboard only renders ONE env-vars
    // tile — graded by the worst of the four rows (Task #354).
    const result = withEnvVars(
      baseReport,
      snapshot({ sessionSecretSource: 'file', encryptionKeySource: 'file' }),
    );
    expect(result.overallStatus).toBe('warning');
    expect(result.envVars.status).toBe('warning');
    expect(result.overviewCounts).toEqual({
      healthy: 11,
      warning: 1,
      error: 0,
    });
  });

  it('folds the env-vars tile as a single error entry and survives a mixed base report', () => {
    const result = withEnvVars(
      {
        ...baseReport,
        overallStatus: 'warning',
        email: { status: 'warning' },
        storage: { status: 'error' },
      },
      snapshot({
        databaseUrlSource: 'wizard',
        sessionSecretSource: 'none',
        publicAppUrlSource: 'default',
      }),
    );
    // Base: 9 healthy / 1 warning / 1 error across the eleven categories.
    // Env tile: rolled-up status is `error` (worst of wizard/none/env/default)
    // so it contributes a single error entry — total 9 / 1 / 2 across
    // the twelve tiles the dashboard actually renders.
    expect(result.envVars.status).toBe('error');
    expect(result.overviewCounts).toEqual({
      healthy: 9,
      warning: 1,
      error: 2,
    });
    expect(result.overallStatus).toBe('error');
  });

  it('escalates a healthy base report to "warning" when a secret is file-sourced', () => {
    const result = withEnvVars(
      baseReport,
      snapshot({ sessionSecretSource: 'file' }),
    );
    expect(result.overallStatus).toBe('warning');
    expect(result.envVars.status).toBe('warning');
    expect(result.envVars.sessionSecretSource).toBe('file');
  });

  it('escalates a healthy base report to "error" when a required env var is missing', () => {
    const result = withEnvVars(
      baseReport,
      snapshot({ databaseUrlSource: 'none' }),
    );
    expect(result.overallStatus).toBe('error');
    expect(result.envVars.status).toBe('error');
  });

  it('preserves a "warning" base report when env rows only add more warnings', () => {
    const result = withEnvVars(
      { ...baseReport, overallStatus: 'warning' },
      snapshot({ encryptionKeySource: 'file' }),
    );
    expect(result.overallStatus).toBe('warning');
  });

  it('preserves an "error" base report even when env rows are all healthy (no downgrade)', () => {
    const result = withEnvVars(
      { ...baseReport, overallStatus: 'error' },
      snapshot(),
    );
    expect(result.overallStatus).toBe('error');
  });

  it('returns a NEW object so callers cannot accidentally mutate the upstream report', () => {
    const result = withEnvVars(baseReport, snapshot());
    expect(result).not.toBe(baseReport);
    // Original report retains its original status — the helper does
    // not modify the input even when re-deriving overallStatus.
    expect(baseReport.overallStatus).toBe('ok');
    expect(baseReport).not.toHaveProperty('envVars');
  });

  it('does NOT propagate optional reveal-only secret payload from the snapshot', () => {
    const result = withEnvVars(
      baseReport,
      snapshot({
        sessionSecretValue: 'should-never-leak',
        encryptionKeyValue: 'should-never-leak',
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('should-never-leak');
    expect(result.envVars).not.toHaveProperty('sessionSecretValue');
    expect(result.envVars).not.toHaveProperty('encryptionKeyValue');
  });
});

// Contract-level coverage for Task #354 — pin the invariant the
// dashboard relies on so a future regression to either side of the
// fold (a server bug that miscounts, or a UI bug that adds/removes a
// tile) trips a focused test instead of being noticed only during an
// incident.
//
// The invariant is: for every payload `/api/system/health` returns,
// `overviewCounts.{healthy,warning,error}` MUST equal the number of
// tiles the dashboard would render with each border colour. The
// dashboard renders the eleven category fields plus — for admins — the
// env-vars block as one extra tile coloured by `envVars.status`.
describe('overviewCounts ↔ rendered tile count contract', () => {
  // Mirror the eleven category keys the dashboard builds tiles from in
  // `SystemHealthSection.tsx`. Listed locally rather than imported so a
  // future renaming of the constant on either side has to be a
  // conscious cross-file change.
  const TILE_CATEGORY_KEYS = [
    'database',
    'email',
    'integrations',
    'security',
    'backgroundServices',
    'storage',
    'performance',
    'archiveSchemaValidation',
    'featureRequests',
    'supportRequests',
    'clientErrors',
  ] as const;

  function tileColourCounts(
    response: { overallStatus: EnvHealthStatus } & Record<string, unknown>,
    includeEnvTile: boolean,
  ): OverviewCounts {
    const counts: OverviewCounts = { healthy: 0, warning: 0, error: 0 };
    const tileStatuses: EnvHealthStatus[] = TILE_CATEGORY_KEYS.map((key) => {
      const raw = response[key] as { status?: unknown } | undefined;
      if (!raw || typeof raw.status !== 'string') return 'error';
      const value = raw.status;
      if (value === 'ok' || value === 'warning' || value === 'error') return value;
      return 'error';
    });
    if (includeEnvTile) {
      const env = (response as { envVars?: { status: EnvHealthStatus } }).envVars;
      if (env) tileStatuses.push(env.status);
    }
    for (const status of tileStatuses) {
      if (status === 'ok') counts.healthy += 1;
      else if (status === 'warning') counts.warning += 1;
      else counts.error += 1;
    }
    return counts;
  }

  it('matches the eleven-tile non-admin grid for a healthy report', () => {
    const response = withOverviewCounts(baseReport);
    expect(response.overviewCounts).toEqual(tileColourCounts(response, false));
    // Sanity check the absolute numbers so a future change to
    // `tileColourCounts` cannot silently make the contract trivially
    // satisfied (e.g. by counting nothing).
    expect(response.overviewCounts).toEqual({ healthy: 11, warning: 0, error: 0 });
  });

  it('matches the eleven-tile non-admin grid for a mixed report (9 ok / 1 warning / 1 error)', () => {
    const response = withOverviewCounts({
      ...baseReport,
      overallStatus: 'error',
      email: { status: 'warning' },
      security: { status: 'error' },
    });
    expect(response.overviewCounts).toEqual(tileColourCounts(response, false));
    expect(response.overviewCounts).toEqual({ healthy: 9, warning: 1, error: 1 });
  });

  it('matches the twelve-tile admin grid (11 categories + env-vars tile) for the same mixed scenario', () => {
    // 9 ok / 1 warning / 1 error categories + a file-sourced session
    // secret → env tile coloured warning. Total tiles: 9 green, 2 yellow,
    // 1 red. The headline counts must match exactly — anything else
    // would render a grid where e.g. the headline says "0 errors" while
    // a tile is bright red.
    const response = withEnvVars(
      {
        ...baseReport,
        overallStatus: 'error',
        email: { status: 'warning' },
        security: { status: 'error' },
      },
      snapshot({ sessionSecretSource: 'file' }),
    );
    expect(response.envVars.status).toBe('warning');
    expect(response.overviewCounts).toEqual(tileColourCounts(response, true));
    expect(response.overviewCounts).toEqual({ healthy: 9, warning: 2, error: 1 });
  });

  it('matches the admin grid when the env-vars tile is the only red tile', () => {
    // All eleven categories healthy + a missing required env var. The
    // headline must show exactly one error — matching the single red
    // env-vars tile in the grid. A naive "count all four env rows"
    // implementation would inflate this to 1 error + 3 healthy on the
    // env side and the operator would see a 15-row total above a
    // 12-tile grid.
    const response = withEnvVars(
      baseReport,
      snapshot({ sessionSecretSource: 'none' }),
    );
    expect(response.envVars.status).toBe('error');
    expect(response.overviewCounts).toEqual(tileColourCounts(response, true));
    expect(response.overviewCounts).toEqual({ healthy: 11, warning: 0, error: 1 });
  });
});
