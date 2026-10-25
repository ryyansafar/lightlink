import { barcodeBytes, type Barcode } from './barcodebytes';
import { extractChannel, type Mat3 } from './channels';
import { scanAll } from './multiscan';

export interface DecodeRequest {
  id: number; kind: 'native' | 'jsqr'; buf: ArrayBuffer; width: number; height: number;
  cols: number; rows: number; color: boolean; cal?: { black: number[]; inv: Mat3 };
}
export interface DecodeResponse { id: number; found: Uint8Array[]; ms: number }

interface Detector { detect(src: ImageData): Promise<Barcode[]> }
let det: Detector | null = null;

function detector(): Detector {
  const C = (globalThis as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  return (det ??= new C({ formats: ['qr_code'] }));
}

/** One camera frame in, every QR frame found in it out. Runs BarcodeDetector (Chromium allows it in workers) or jsQR. */
self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, kind, buf, width, height, cols, rows, color, cal } = e.data;
  const t0 = performance.now();
  const px = new Uint8ClampedArray(buf);
  const found: Uint8Array[] = [];
  if (kind === 'jsqr') found.push(...scanAll(px, width, height, cols, rows, color, cal));
  else {
    const layers = color ? [0, 1, 2].map((c) => extractChannel(px, c, cal)) : [px];
    for (const l of layers)
      for (const b of await detector().detect(new ImageData(l as unknown as Uint8ClampedArray<ArrayBuffer>, width, height))) found.push(...barcodeBytes(b));
  }
  (self as unknown as Worker).postMessage({ id, found, ms: performance.now() - t0 } satisfies DecodeResponse, found.map((f) => f.buffer as ArrayBuffer));
};
