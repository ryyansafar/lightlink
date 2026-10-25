import { extractChannel, type Mat3 } from './channels';
import { decodeText } from './text7';
import type { ScanRequest } from './boostscan.worker';

export interface ReadOpts { cols: number; rows: number; color: boolean; cal?: { black: number[]; inv: Mat3 } }
export interface QrReader {
  name: 'native' | 'jsqr';
  busy: boolean;
  read(img: ImageData, o: ReadOpts): Promise<Uint8Array[]>;
  close(): void;
}

interface Barcode { rawValue: string; rawBytes?: Uint8Array }
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

/** Frame bytes of a detected code. The payload is text-safe (see text7.ts), so rawValue is enough. */
export function barcodeBytes(b: Barcode): Uint8Array[] {
  const chars = b.rawBytes?.length ? new Uint8Array(b.rawBytes) : Uint8Array.from(b.rawValue ?? '', (ch) => ch.charCodeAt(0) & 0xff);
  const f = decodeText(chars);
  return f ? [f] : [];
}

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
