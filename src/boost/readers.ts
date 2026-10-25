import { extractChannel, type Mat3 } from './channels';
import { barcodeBytes, type Barcode } from './barcodebytes';
import type { ScanRequest } from './boostscan.worker';
import type { DecodeRequest } from './decode.worker';

export interface ReadOpts { cols: number; rows: number; color: boolean; cal?: { black: number[]; inv: Mat3 } }
export interface QrReader {
  name: 'native' | 'jsqr';
  busy: boolean;
  read(img: ImageData, o: ReadOpts): Promise<Uint8Array[]>;
  close(): void;
}

interface Detector { detect(src: ImageData): Promise<Barcode[]> }
type DetectorCtor = (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

function ctor(): DetectorCtor | undefined {
  return (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

export async function nativeAvailable(): Promise<boolean> {
  const C = ctor();
  if (!C) return false;
  try {
    return (await C.getSupportedFormats?.())?.includes('qr_code') ?? true;
  } catch {
    return false;
  }
}

export { barcodeBytes };

export class NativeReader implements QrReader {
  name = 'native' as const;
  busy = false;
  private det: Detector;
  constructor() {
    this.det = new (ctor()!)({ formats: ['qr_code'] });
  }
  async read(img: ImageData, o: ReadOpts): Promise<Uint8Array[]> {
    this.busy = true;
    try {
      const layers = o.color ? [0, 1, 2].map((c) => new ImageData(extractChannel(img.data, c, o.cal) as unknown as Uint8ClampedArray<ArrayBuffer>, img.width, img.height)) : [img];
      const out: Uint8Array[] = [];
      for (const l of layers) for (const b of await this.det.detect(l)) out.push(...barcodeBytes(b));
      return out;
    } finally {
      this.busy = false;
    }
  }
  close() {}
}

export class JsqrReader implements QrReader {
  name = 'jsqr' as const;
  busy = false;
  private worker = new Worker(new URL('./boostscan.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, (f: Uint8Array[]) => void>();
  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; found: Uint8Array[] }>) => {
      const cb = this.pending.get(e.data.id);
      this.pending.delete(e.data.id);
      this.busy = this.pending.size > 0;
      cb?.(e.data.found);
    };
  }
  read(img: ImageData, o: ReadOpts): Promise<Uint8Array[]> {
    const id = this.nextId++;
    this.busy = true;
    return new Promise((res) => {
      this.pending.set(id, res);
      const req: ScanRequest = { id, buf: img.data.buffer as ArrayBuffer, width: img.width, height: img.height, ...o };
      this.worker.postMessage(req, [img.data.buffer]);
    });
  }
  close() {
    this.worker.terminate();
  }
}

export async function makeReader(kind: 'auto' | 'native' | 'jsqr'): Promise<QrReader> {
  if (kind !== 'jsqr' && (await nativeAvailable())) return new NativeReader();
  return new JsqrReader();
}

/**
 * N decode workers. read() on a free worker starts at once; when every worker is busy the frame is dropped
 * (resolves to []), never queued, so the newest camera frame is always the one that gets decoded next.
 */
export class PoolReader implements QrReader {
  name: 'native' | 'jsqr';
  private workers: { w: Worker; busy: boolean; cb?: (f: Uint8Array[]) => void }[] = [];
  private nextId = 1;
  reads = 0;
  decodeMsTotal = 0;
  dropped = 0;
  constructor(kind: 'native' | 'jsqr', private n: number) {
    this.name = kind;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
      const slot: { w: Worker; busy: boolean; cb?: (f: Uint8Array[]) => void } = { w, busy: false };
      w.onmessage = (e: MessageEvent<{ id: number; found: Uint8Array[]; ms: number }>) => {
        slot.busy = false;
        this.reads++;
        this.decodeMsTotal += e.data.ms;
        const cb = slot.cb;
        slot.cb = undefined;
        cb?.(e.data.found);
      };
      this.workers.push(slot);
    }
  }
  get busy() { return this.workers.every((s) => s.busy); }
  get size() { return this.n; }
  get avgDecodeMs() { return this.reads ? this.decodeMsTotal / this.reads : 0; }
  read(img: ImageData, o: ReadOpts): Promise<Uint8Array[]> {
    const slot = this.workers.find((s) => !s.busy);
    if (!slot) { this.dropped++; return Promise.resolve([]); }
    slot.busy = true;
    return new Promise((res) => {
      slot.cb = res;
      const req: DecodeRequest = { id: this.nextId++, kind: this.name, buf: img.data.buffer as ArrayBuffer, width: img.width, height: img.height, ...o };
      slot.w.postMessage(req, [img.data.buffer]);
    });
  }
  close() { this.workers.forEach((s) => s.w.terminate()); }
}

/** Reader workers for the receiver: enough to overlap decodes, but leave cores for the page and camera. */
export function readerCount(): number {
  const c = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(2, Math.min(4, c - 1));
}

/** Detect once whether BarcodeDetector works inside a worker in this browser. */
export async function nativeWorkerOk(): Promise<boolean> {
  if (!(await nativeAvailable())) return false;
  try {
    const r = new PoolReader('native', 1);
    const px = new ImageData(64, 64);
    px.data.fill(255);
    await Promise.race([r.read(px, { cols: 1, rows: 1, color: false }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
    r.close();
    return true;
  } catch {
    return false;
  }
}

export async function makePoolReader(kind: 'auto' | 'native' | 'jsqr'): Promise<QrReader> {
  const n = readerCount();
  if (kind !== 'jsqr' && (await nativeWorkerOk())) return new PoolReader('native', n);
  return new PoolReader('jsqr', n);
}
