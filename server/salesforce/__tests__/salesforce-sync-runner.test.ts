// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// The runner imports storage and the linkage service at module load; these
// tests only exercise its pure helpers, so stub the I/O modules.
vi.mock('../../storage.js', () => ({ storage: {} }));
vi.mock('../salesforce-linkage-service.js', () => ({ salesforceLinkageService: {} }));
vi.mock('../salesforce-config-service.js', () => ({ getSalesforceConnectionForUser: vi.fn() }));

const { retryDelaySeconds, runStatusFrom } = await import('../salesforce-sync-runner.js');
const { chunk } = await import('../salesforce-link-health.js');

describe('retryDelaySeconds', () => {
  it('doubles from the base delay for each attempt', () => {
    expect(retryDelaySeconds(60, 1)).toBe(60);
    expect(retryDelaySeconds(60, 2)).toBe(120);
    expect(retryDelaySeconds(60, 3)).toBe(240);
  });

  it('caps at one hour', () => {
    expect(retryDelaySeconds(60, 10)).toBe(3600);
  });

  it('never goes below one second', () => {
    expect(retryDelaySeconds(0, 1)).toBe(1);
  });
});

describe('runStatusFrom', () => {
  it('is failed only when every record errored', () => {
    expect(runStatusFrom(2, { errorCount: 2, conflictCount: 0 })).toBe('failed');
    expect(runStatusFrom(2, { errorCount: 1, conflictCount: 0 })).toBe('partial');
  });

  it('is partial when there were conflicts', () => {
    expect(runStatusFrom(3, { errorCount: 0, conflictCount: 1 })).toBe('partial');
  });

  it('is success for an empty run', () => {
    expect(runStatusFrom(0, { errorCount: 0, conflictCount: 0 })).toBe('success');
  });
});

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 200)).toEqual([]);
  });
});
