import type { BigEncoder } from './bigencoder';
import { framesPerDisplay } from './compose';
import type { GenRequest, GenResponse } from './framegen.worker';
import type { Profile } from './profiles';
import { FIXED_MASK } from './qrmatrix';

export interface ReadyFrame { bitmap?: ImageBitmap; rgba?: ImageData; genMs: number }

/** 2 to 4 workers, from the core count (one core is left for the page). */
export function poolSize(): number {
  const c = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(2, Math.min(4, c - 1));
}

/**
 * Generates display frames in a pool of workers, ahead of display, into a ring of finished frames.
 * The fountain makes order irrelevant, so frames are handed out as they finish. The main thread only
 * produces the cheap droplet bytes and later blits a finished bitmap.
 */
export class FramePool {
  private workers: Worker[] = [];
  private ready: ReadyFrame[] = [];
  private inflight = 0;
  private nextId = 1;
  private alive = true;
  readonly depth: number;
  genMsTotal = 0;
  generated = 0;
  underruns = 0;

  constructor(private enc: BigEncoder, private p: Profile, private color: boolean, private W: number, private H: number, private pixels = false, n = poolSize()) {
    this.depth = n * 2 + 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./framegen.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<GenResponse>) => this.onDone(e.data);
      this.workers.push(w);
    }
    this.fill();
  }

  get size() { return this.workers.length; }
  get avgGenMs() { return this.generated ? this.genMsTotal / this.generated : 0; }

  private onDone(r: GenResponse) {
    this.inflight--;
    if (!this.alive) { r.bitmap?.close(); return; }
    this.genMsTotal += r.ms;
    this.generated++;
    this.ready.push({ bitmap: r.bitmap, rgba: r.buf ? new ImageData(new Uint8ClampedArray(r.buf), this.W, this.H) : undefined, genMs: r.ms });
    this.fill();
  }

  private fill() {
    while (this.alive && this.inflight + this.ready.length < this.depth) {
      const frames = Array.from({ length: framesPerDisplay(this.p, this.color) }, () => this.enc.nextFrame());
      const id = this.nextId++;
      const req: GenRequest = { id, frames, profile: this.p.id, color: this.color, W: this.W, H: this.H, pixels: this.pixels, mask: (globalThis as unknown as { __bigMask?: number }).__bigMask ?? FIXED_MASK };
      this.workers[id % this.workers.length].postMessage(req);
      this.inflight++;
    }
  }

  /** Oldest finished frame, or null (counted as an underrun) when generation has not kept up. */
  take(): ReadyFrame | null {
    const f = this.ready.shift() ?? null;
    if (!f) this.underruns++;
    this.fill();
    return f;
  }

  close() {
    this.alive = false;
    this.ready.forEach((f) => f.bitmap?.close());
    this.ready = [];
    this.workers.forEach((w) => w.terminate());
  }
}
