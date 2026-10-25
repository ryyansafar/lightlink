import type { Layout } from './tiling';

/** One QR layer as a flat n*n matrix, 1 = dark. */
export interface Matrix { n: number; data: Uint8Array }

/**
 * Render tiles into an RGBA buffer. Mono: each tile has one matrix, dark = black.
 * Colour: each tile has three matrices; layer k dark clears channel k (0 = R, 1 = G, 2 = B), so the
 * three layers overlay like subtractive colour. Background is white.
 */
export function renderTiles(W: number, H: number, layout: Layout, tiles: Matrix[][], quiet = 4): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const px = new Uint32Array(rgba.buffer);
  px.fill(0xffffffff);
  const { cell, rects } = layout;
  tiles.forEach((layers, t) => {
    const rect = rects[t];
    if (!rect) return;
    const n = layers[0].n;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        let clear = 0;
        if (layers.length === 1) clear = layers[0].data[r * n + c] ? 0x00ffffff : 0;
        else for (let k = 0; k < 3; k++) if (layers[k].data[r * n + c]) clear |= 0xff << (8 * k);
        if (!clear) continue;
        const color = (0xffffffff & ~clear) >>> 0;
        const x0 = rect.x + (c + quiet) * cell, y0 = rect.y + (r + quiet) * cell;
        for (let y = y0; y < y0 + cell; y++) px.fill(color, y * W + x0, y * W + x0 + cell);
      }
  });
  return rgba;
}

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Calibration { black: [number, number, number]; m: Mat3 }

/** Plain channel as a grey RGBA image (for the QR readers). Optionally unmix crosstalk first. */
export function extractChannel(rgba: Uint8ClampedArray, c: number, cal?: { black: number[]; inv: Mat3 }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    let v: number;
    if (cal) {
      const o0 = rgba[i] - cal.black[0], o1 = rgba[i + 1] - cal.black[1], o2 = rgba[i + 2] - cal.black[2];
      v = (cal.inv[c * 3] * o0 + cal.inv[c * 3 + 1] * o1 + cal.inv[c * 3 + 2] * o2) * 255;
    } else v = rgba[i + c];
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Calibration frame: 2x2 patches [black, red / green, blue]. Returns RGBA. */
export function calibrationFrame(W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  const colors = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const col = colors[(y >= H / 2 ? 2 : 0) + (x >= W / 2 ? 1 : 0)];
      const i = (y * W + x) * 4;
      out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
    }
  return out;
}

/** Average colour of the centre 30% of each quadrant, as seen by the camera. Order: black, R, G, B. */
export function sampleQuadrants(rgba: Uint8ClampedArray, W: number, H: number): number[][] {
  const res: number[][] = [];
  for (let q = 0; q < 4; q++) {
    const cx = (q % 2 ? 0.75 : 0.25) * W, cy = (q >= 2 ? 0.75 : 0.25) * H;
    const hw = 0.15 * W / 2 * 2, hh = 0.15 * H / 2 * 2;
    let n = 0; const s = [0, 0, 0];
    for (let y = Math.floor(cy - hh / 2); y < cy + hh / 2; y++)
      for (let x = Math.floor(cx - hw / 2); x < cx + hw / 2; x++) {
        const i = (y * W + x) * 4;
        s[0] += rgba[i]; s[1] += rgba[i + 1]; s[2] += rgba[i + 2]; n++;
      }
    res.push(s.map((v) => v / Math.max(1, n)));
  }
  return res;
}

/** Fit the camera mixing matrix from the four patch colours. null if the patches are degenerate. */
export function fitCalibration(samples: number[][]): { black: number[]; inv: Mat3 } | null {
  const black = samples[0];
  const col = (k: number) => [0, 1, 2].map((ch) => (samples[k][ch] - black[ch]) / 255);
  const [r, g, b] = [col(1), col(2), col(3)];
  const m: Mat3 = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
  const inv = invert3(m);
  return inv ? { black, inv } : null;
}
