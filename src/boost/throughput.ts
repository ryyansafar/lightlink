/** Throughput estimator, honest pre-flight estimate and per-profile limits. All inputs are measured or declared. */
export class ThroughputEstimator {
  private samples: { t: number; bytes: number }[] = [];
  constructor(private readonly windowMs = 8000) {}

  /** `bytes` is the cumulative number of file bytes delivered at time `t` (ms). */
  record(t: number, bytes: number): void {
    this.samples.push({ t, bytes });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  /** Bytes per second over the window, or 0 when there is not enough data. */
  rate(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const dt = s[s.length - 1].t - s[0].t;
    return dt > 0 ? ((s[s.length - 1].bytes - s[0].bytes) * 1000) / dt : 0;
  }

  /** Seconds remaining, or null while the rate is unknown. */
  remaining(totalBytes: number): number | null {
    const r = this.rate();
    const done = this.samples.length ? this.samples[this.samples.length - 1].bytes : 0;
    return r > 0 ? Math.max(0, (totalBytes - done) / r) : null;
  }
}

export function fmtDuration(sec: number): string {
  if (!isFinite(sec)) return 'unknown';
  if (sec < 90) return `${Math.max(1, Math.round(sec))} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

export function preflight(sizeBytes: number, rateBps: number): { seconds: number; text: string } {
  const seconds = rateBps > 0 ? sizeBytes / rateBps : Infinity;
  return { seconds, text: rateBps > 0 ? `about ${fmtDuration(seconds)} at ${(rateBps / 1024).toFixed(1)} KB/s` : 'unknown (no measured rate yet)' };
}

/** Largest payload that fits a time budget at a given rate. */
export function recommendedMax(rateBps: number, budgetSec = 600): number {
  return Math.floor(rateBps * budgetSec);
}

/** Largest file that fits in `sec` seconds at a measured rate (bytes/s). */
export const fitsInSeconds = (rateBps: number, sec = 60) => Math.floor(rateBps * sec);

/** One-line readout for the 60-second budget; says plainly when no rate has been measured. */
export function budgetLine(rateBps: number, fileBytes: number | null, fmtSize: (n: number) => string): string {
  if (!(rateBps > 0)) return 'unknown until you run the test pattern';
  const fit = `up to ${fmtSize(fitsInSeconds(rateBps))} fits in about a minute at ${(rateBps / 1024).toFixed(1)} KB/s`;
  return fileBytes === null ? fit : `${fit}; this file: about ${fmtDuration(fileBytes / rateBps)}`;
}
