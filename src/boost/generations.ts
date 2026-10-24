/** Generation maths: a big file is cut into fixed-size generations, each its own small fountain code. */
export const GEN_SIZE = 1 << 20;

export function genCount(size: number, genSize = GEN_SIZE): number {
  return Math.max(1, Math.ceil(size / genSize));
}

export function genRange(i: number, size: number, genSize = GEN_SIZE): [number, number] {
  return [Math.min(size, i * genSize), Math.min(size, (i + 1) * genSize)];
}

export function splitGenerations(bytes: Uint8Array, genSize = GEN_SIZE): Uint8Array[] {
  const n = genCount(bytes.length, genSize);
  return Array.from({ length: n }, (_, i) => {
    const [a, b] = genRange(i, bytes.length, genSize);
    return bytes.subarray(a, b);
  });
}

export function joinGenerations(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Deterministic per-generation fountain id so the receiver can route frames without a lookup table. */
export function genXferId(fileId: number, i: number): number {
  return (fileId + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
}

/** Which generations are finished. Pure bookkeeping used for resume and the progress strip. */
export class ResumeTracker {
  private readonly done: boolean[];
  constructor(readonly total: number) {
    this.done = new Array(total).fill(false);
  }
  markDone(i: number): void {
    if (i >= 0 && i < this.total) this.done[i] = true;
  }
  isDone(i: number): boolean {
    return this.done[i] === true;
  }
  get doneCount(): number {
    return this.done.filter(Boolean).length;
  }
  get complete(): boolean {
    return this.doneCount === this.total;
  }
  remaining(): number[] {
    return this.done.flatMap((d, i) => (d ? [] : [i]));
  }
  snapshot(): boolean[] {
    return [...this.done];
  }
}
