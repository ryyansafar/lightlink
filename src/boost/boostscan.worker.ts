import jsQR from 'jsqr';
import { extractChannel, type Mat3 } from './channels';
import { cropRegions } from './tiling';

export interface ScanRequest {
  id: number; buf: ArrayBuffer; width: number; height: number;
  cols: number; rows: number; color: boolean; cal?: { black: number[]; inv: Mat3 };
}

function crop(src: Uint8ClampedArray, W: number, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) out.set(src.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
  return out;
}

self.onmessage = (e: MessageEvent<ScanRequest>) => {
  const { id, buf, width, height, cols, rows, color, cal } = e.data;
  const src = new Uint8ClampedArray(buf);
  const regions = cols * rows > 1 ? cropRegions(cols, rows, width, height) : [{ x: 0, y: 0, w: width, h: height }];
  const found: Uint8Array[] = [];
  for (const g of regions) {
    const tile = regions.length > 1 ? crop(src, width, g.x, g.y, g.w, g.h) : src;
    for (let c = 0; c < (color ? 3 : 1); c++) {
      const img = color ? extractChannel(tile, c, cal) : tile;
      const r = jsQR(img, g.w, g.h, { inversionAttempts: 'dontInvert' });
      if (r) found.push(new Uint8Array(r.binaryData));
    }
  }
  (self as unknown as Worker).postMessage({ id, found }, found.map((f) => f.buffer));
};
