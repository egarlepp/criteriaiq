// In-process request pacing for the HubSpot API (ported from ImpactIQ).
//
// HubSpot limits a private app to 100 requests per 10 seconds on Free and
// Starter and 190 on Professional and Enterprise, plus 5 per second for the
// CRM search endpoints. Going over gets a 429 for every caller in the
// install at once, so requests wait for a free slot here instead. The
// general window starts 10% under the Free/Starter figure and follows
// X-HubSpot-RateLimit-Max once HubSpot reports it. Per process: with several
// replicas each paces itself, and the 429 retry in client.ts covers the rest.

export interface RateWindow {
  /** Most requests allowed to start within any `intervalMs` span. */
  max: number;
  intervalMs: number;
}

export class SlidingWindowLimiter {
  private starts: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private window: RateWindow,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  get limits(): RateWindow {
    return { ...this.window };
  }

  setLimits(next: RateWindow): void {
    if (next.max >= 1 && next.intervalMs >= 1) this.window = { ...next };
  }

  /** Resolves when the caller may send one request, in arrival order. */
  acquire(): Promise<void> {
    const turn = this.queue.then(() => this.waitForSlot());
    // A rejected wait must not stall everyone behind it.
    this.queue = turn.catch(() => {});
    return turn;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.starts = this.starts.filter((s) => t - s < this.window.intervalMs);
      if (this.starts.length < this.window.max) {
        this.starts.push(t);
        return;
      }
      const oldest = this.starts[0]!;
      await this.sleep(Math.max(1, oldest + this.window.intervalMs - t));
    }
  }

  /** Treat the window as full until `ms` from now (after a 429). */
  pause(ms: number): void {
    const until = this.now() + ms - this.window.intervalMs;
    this.starts = Array.from({ length: this.window.max }, () => until);
  }
}

const GENERAL_DEFAULT: RateWindow = { max: 90, intervalMs: 10_000 };
const SEARCH_DEFAULT: RateWindow = { max: 4, intervalMs: 1_000 };

export const generalLimiter = new SlidingWindowLimiter(GENERAL_DEFAULT);
export const searchLimiter = new SlidingWindowLimiter(SEARCH_DEFAULT);

/** Applies HubSpot's own per-app burst figures from a response, keeping a 10% margin. */
export function applyRateLimitHeaders(headers: Headers, limiter: SlidingWindowLimiter = generalLimiter): void {
  const max = Number(headers.get("x-hubspot-ratelimit-max"));
  const interval = Number(headers.get("x-hubspot-ratelimit-interval-milliseconds"));
  if (!Number.isFinite(max) || !Number.isFinite(interval) || max < 2 || interval < 1) return;
  const target = { max: Math.max(1, Math.floor(max * 0.9)), intervalMs: interval };
  const current = limiter.limits;
  if (current.max !== target.max || current.intervalMs !== target.intervalMs) limiter.setLimits(target);
}
