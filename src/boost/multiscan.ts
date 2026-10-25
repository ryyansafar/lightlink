import jsQR from 'jsqr';
import { extractChannel, type Mat3 } from './channels';
import { decodeText } from './text7';
import { cropRegions } from './tiling';

type Cal = { black: number[]; inv: Mat3 };

function crop(src: Uint8ClampedArray, W: number, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) out.set(src.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
  return out;
}

function read(img: Uint8ClampedArray, w: number, h: number) {
  const r = jsQR(img, w, h, { inversionAttempts: 'dontInvert' });
  const f = r && decodeText(new Uint8Array(r.binaryData));
  return { r, f };
}

/** Paint a found code white so the next pass can find the others. */
function blank(img: Uint8ClampedArray, w: number, h: number, loc: Record<string, { x: number; y: number }>, pad: number): void {
  const xs = Object.values(loc).map((p) => p.x), ys = Object.values(loc).map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), x1 = Math.min(w, Math.ceil(Math.max(...xs) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad)), y1 = Math.min(h, Math.ceil(Math.max(...ys) + pad));
  for (let y = y0; y < y1; y++) img.fill(255, (y * w + x0) * 4, (y * w + x1) * 4);
}

/**
 * All QR frames in one camera image with jsQR. Pass 1 reads the exact grid regions (fast, works when the
 * screen fills the view). Pass 2 reads the whole image, blanking each hit, to catch tiles the grid missed.
 */
export function scanAll(src: Uint8ClampedArray, W: number, H: number, cols: number, rows: number, color: boolean, cal?: Cal): Uint8Array[] {
  const found: Uint8Array[] = [];
  const want = cols * rows;
  for (let c = 0; c < (color ? 3 : 1); c++) {
    const layer = color ? extractChannel(src, c, cal) : src;
    let got = 0;
    if (want > 1)
      for (const g of cropRegions(cols, rows, W, H, 0)) {
        const { f } = read(crop(layer, W, g.x, g.y, g.w, g.h), g.w, g.h);
        if (f) { found.push(f); got++; }
      }
    if (got >= want) continue;
    const work = want > 1 ? new Uint8ClampedArray(layer) : layer;
    for (let i = 0; i < want + 1; i++) {
      const { r, f } = read(work, W, H);
      if (!r) break;
      if (f) found.push(f);
      if (want === 1) break;
      blank(work, W, H, r.location as unknown as Record<string, { x: number; y: number }>, 2);
    }
  }
  return found;
}
