import { droplet } from './prng';
import { parse, type Header, type Manifest } from './frame';
import { sha256, toHex } from './sha256';

type Meta = { name: string; mime: string; size: number };
type Status = { progress: number; solved: number; K: number; done: boolean; meta?: Meta };
interface Drop {
  idx: number[];
  data: Uint8Array;
  dead: boolean;
}

function xorInto(a: Uint8Array, b: Uint8Array): void {
  for (let i = 0; i < a.length; i++) a[i] ^= b[i];
}

export class Decoder {
  private h: Header | null = null;
  private manifest: Manifest | null = null;
  private chunks: (Uint8Array | null)[] = [];
  private refs: Drop[][] = [];
  private seen = new Set<number>();
  private solved = 0;
  private bytes: Uint8Array | null = null;
  private fileMeta: Meta | null = null;
  private live: Drop[] = [];
  private nextExcess = 0;

  reset(): void {
    this.h = null;
    this.manifest = null;
    this.chunks = [];
    this.refs = [];
    this.seen = new Set();
    this.solved = 0;
    this.bytes = null;
    this.fileMeta = null;
    this.live = [];
    this.nextExcess = 0;
  }

  push(frame: Uint8Array): Status {
    const p = this.bytes ? null : parse(frame);
    if (p) {
      if (!this.h) this.lock(p.h);
      if (this.h && this.sameXfer(p.h)) {
        if (p.type === 'manifest') this.manifest = p.m;
        else if (!this.seen.has(p.seed)) {
          this.seen.add(p.seed);
          this.addDroplet(droplet(p.seed, this.h.K), p.payload.slice());
        }
        this.tryFinish();
      }
    }
    return this.status();
  }

  result(): { bytes: Uint8Array; meta: Meta } | null {
    return this.bytes && this.fileMeta ? { bytes: this.bytes, meta: this.fileMeta } : null;
  }

  private status(): Status {
    const K = this.h?.K ?? 0;
    const done = this.bytes !== null;
    const s: Status = { progress: K ? this.solved / K : 0, solved: this.solved, K, done };
    if (this.manifest && this.h) {
      s.meta = this.fileMeta ?? { name: this.manifest.name, mime: this.manifest.mime, size: this.h.fileSize };
    }
    return s;
  }

  private lock(h: Header): void {
    this.h = h;
    this.chunks = new Array(h.K).fill(null);
    this.refs = Array.from({ length: h.K }, () => []);
  }

  private sameXfer(h: Header): boolean {
    const c = this.h!;
    return h.xferId === c.xferId && h.K === c.K && h.chunkSize === c.chunkSize && h.fileSize === c.fileSize;
  }

  private addDroplet(idx: number[], data: Uint8Array): void {
    const rest: number[] = [];
    for (const i of idx) {
      const c = this.chunks[i];
      if (c) xorInto(data, c);
      else rest.push(i);
    }
    if (rest.length === 0) return;
    if (rest.length === 1) return this.resolve(rest[0], data);
    const d: Drop = { idx: rest, data, dead: false };
    for (const i of rest) this.refs[i].push(d);
    this.live.push(d);
    this.maybeEliminate();
  }

  /** Peeling stalls near the end; once there are enough equations, solve the rest over GF(2). */
  private maybeEliminate(): void {
    const h = this.h!;
    this.live = this.live.filter((d) => !d.dead);
    const unknown = h.K - this.solved;
    const excess = this.live.length - unknown;
    if (excess < this.nextExcess) return;
    if (this.eliminate()) return;
    this.nextExcess = excess + 2;
  }

  private eliminate(): boolean {
    const cols: number[] = [];
    const colOf = new Map<number, number>();
    this.chunks.forEach((c, i) => {
      if (!c) {
        colOf.set(i, cols.length);
        cols.push(i);
      }
    });
    const n = cols.length;
    const words = Math.ceil(n / 32);
    const rows = this.live.map((d) => {
      const bits = new Uint32Array(words);
      for (const i of d.idx) {
        const c = colOf.get(i)!;
        bits[c >>> 5] |= 1 << (c & 31);
      }
      return { bits, data: d.data.slice() };
    });
    for (let c = 0; c < n; c++) {
      const w = c >>> 5, m = 1 << (c & 31);
      let p = c;
      while (p < rows.length && !(rows[p].bits[w] & m)) p++;
      if (p >= rows.length) return false;
      [rows[c], rows[p]] = [rows[p], rows[c]];
      const piv = rows[c];
      for (let r = 0; r < rows.length; r++) {
        if (r === c || !(rows[r].bits[w] & m)) continue;
        for (let k = 0; k < words; k++) rows[r].bits[k] ^= piv.bits[k];
        xorInto(rows[r].data, piv.data);
      }
    }
    for (let c = 0; c < n; c++) this.chunks[cols[c]] = rows[c].data;
    this.solved = this.h!.K;
    return true;
  }

  private resolve(first: number, data: Uint8Array): void {
    this.chunks[first] = data;
    this.solved++;
    const stack = [first];
    while (stack.length) {
      const j = stack.pop()!;
      const known = this.chunks[j]!;
      for (const d of this.refs[j]) {
        if (d.dead) continue;
        d.idx = d.idx.filter((x) => x !== j);
        xorInto(d.data, known);
        if (d.idx.length === 1) {
          d.dead = true;
          const k = d.idx[0];
          if (!this.chunks[k]) {
            this.chunks[k] = d.data;
            this.solved++;
            stack.push(k);
          }
        } else if (d.idx.length === 0) d.dead = true;
      }
      this.refs[j] = [];
    }
  }

  private tryFinish(): void {
    const h = this.h;
    if (!h || !this.manifest || this.solved < h.K) return;
    const all = new Uint8Array(h.K * h.chunkSize);
    this.chunks.forEach((c, i) => all.set(c!, i * h.chunkSize));
    const bytes = all.subarray(0, h.fileSize).slice();
    if (toHex(sha256(bytes)) !== this.manifest.sha256) {
      this.reset(); // corruption slipped past CRC: start clean
      return;
    }
    this.bytes = bytes;
    this.fileMeta = { name: this.manifest.name, mime: this.manifest.mime, size: h.fileSize };
  }
}
