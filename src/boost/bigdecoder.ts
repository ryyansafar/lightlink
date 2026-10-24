import { Decoder } from '../codec/decoder';
import { toHex } from '../codec/sha256';
import { T_BIGMANIFEST, parseBigManifest, type BigManifest } from './bigframe';
import { inflate } from './compress';
import { genRange, genXferId, ResumeTracker } from './generations';
import type { GenStore } from './genstore';
import { hashBlob } from './sha256stream';

export type GenState = 'done' | 'active' | 'idle';
export interface BigStatus {
  manifest: BigManifest | null;
  gens: number;
  doneGens: number;
  states: GenState[];
  bytesDone: number;
  totalBytes: number;
  progress: number;
  complete: boolean;
}
export interface BigResult { blob: Blob; meta: { name: string; mime: string; size: number }; verified: boolean }

const MAX_ACTIVE = 2;

/** Routes frames to one small Decoder per generation, keeps finished generations as Blobs (and in the store). */
export class BigDecoder {
  manifest: BigManifest | null = null;
  tracker = new ResumeTracker(0);
  result: BigResult | null = null;
  onComplete: ((r: BigResult) => void) | null = null;
  private blobs: (Blob | undefined)[] = [];
  private active = new Map<number, { dec: Decoder; progress: number }>();
  private route = new Map<number, number>();
  private fin: Promise<BigResult | null> | null = null;

  constructor(private store?: GenStore) {}

  push(frame: Uint8Array): BigStatus {
    if (this.result) return this.status();
    if (frame[0] === T_BIGMANIFEST) {
      const m = parseBigManifest(frame);
      if (m && (!this.manifest || m.id !== this.manifest.id)) this.adopt(m);
      return this.status();
    }
    const m = this.manifest;
    if (!m || frame.length < 9) return this.status();
    const g = this.route.get(new DataView(frame.buffer, frame.byteOffset, frame.length).getUint32(1));
    if (g === undefined || this.tracker.isDone(g)) return this.status();
    let a = this.active.get(g);
    if (!a) {
      a = { dec: new Decoder(), progress: 0 };
      this.active.set(g, a);
      while (this.active.size > MAX_ACTIVE) this.active.delete(this.active.keys().next().value as number);
    }
    const p = a.dec.push(frame);
    a.progress = p.progress;
    if (p.done) {
      const r = a.dec.result();
      const [s, e] = genRange(g, m.size, m.gs);
      this.active.delete(g);
      if (r && r.bytes.length === e - s) this.accept(g, new Blob([r.bytes as BlobPart]));
    }
    return this.status();
  }

  private adopt(m: BigManifest): void {
    this.manifest = m;
    this.tracker = new ResumeTracker(m.g);
    this.blobs = new Array(m.g);
    this.active.clear();
    this.route.clear();
    for (let g = 0; g < m.g; g++) this.route.set(genXferId(m.id, g), g);
    void this.restore(m);
  }

  private async restore(m: BigManifest): Promise<void> {
    if (!this.store) return;
    try {
      for (const g of await this.store.keys(m.id)) {
        const b = await this.store.get(m.id, g);
        if (b && this.manifest === m && !this.tracker.isDone(g)) {
          this.blobs[g] = b;
          this.tracker.markDone(g);
        }
      }
      if (this.manifest === m && this.tracker.complete) void this.finalize();
    } catch { /* store unavailable: resume simply does not persist */ }
  }

  private accept(g: number, blob: Blob): void {
    this.blobs[g] = blob;
    this.tracker.markDone(g);
    const m = this.manifest!;
    void this.store?.put(m.id, g, blob).catch(() => {});
    if (this.tracker.complete) void this.finalize();
  }

  /** Verify the whole file by SHA-256, undo compression, publish the result. */
  finalize(): Promise<BigResult | null> {
    if (this.fin) return this.fin;
    this.fin = this.doFinalize().finally(() => { this.fin = null; });
    return this.fin;
  }

  private async doFinalize(): Promise<BigResult | null> {
    const m = this.manifest;
    if (!m || this.result) return this.result;
    {
      const stored = new Blob(this.blobs as Blob[]);
      if (toHex(await hashBlob(stored)) !== m.sha) {
        this.adopt(m); // corruption slipped past per-generation checks: start clean
        return null;
      }
      const out = m.z ? await inflate(stored) : stored;
      this.result = { blob: out, meta: { name: m.name, mime: m.mime, size: out.size }, verified: true };
      void this.store?.clear(m.id).catch(() => {});
      this.onComplete?.(this.result);
      return this.result;
    }
  }

  status(): BigStatus {
    const m = this.manifest;
    if (!m) return { manifest: null, gens: 0, doneGens: 0, states: [], bytesDone: 0, totalBytes: 0, progress: 0, complete: false };
    let bytes = 0;
    const states: GenState[] = [];
    for (let g = 0; g < m.g; g++) {
      const [s, e] = genRange(g, m.size, m.gs);
      if (this.tracker.isDone(g)) { bytes += e - s; states.push('done'); }
      else if (this.active.has(g)) { bytes += (e - s) * this.active.get(g)!.progress; states.push('active'); }
      else states.push('idle');
    }
    return { manifest: m, gens: m.g, doneGens: this.tracker.doneCount, states, bytesDone: bytes, totalBytes: m.size, progress: m.size ? bytes / m.size : 1, complete: this.result !== null };
  }
}
