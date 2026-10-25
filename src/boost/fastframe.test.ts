import { describe, expect, it } from 'vitest';
import { composeFromFrames } from './compose';
import { chunkSizeOf, frameBytes, PROFILES } from './profiles';
import { scanAll } from './multiscan';
import { encodeText } from './text7';

const CANVAS: Record<string, [number, number]> = { safe: [1280, 800], fast: [1920, 1200], max: [2560, 1600] };

describe('fixed-mask frames decode', () => {
  for (const p of PROFILES)
    it(`${p.id}: every tile is read back byte for byte`, () => {
      const [W, H] = CANVAS[p.id];
      const frames = Array.from({ length: p.cols * p.rows }, (_, t) => new Uint8Array(frameBytes(p)).map((_, i) => (i * 37 + t * 11 + 5) & 255));
      void chunkSizeOf; void encodeText;
      const rgba = composeFromFrames(frames, p, false, W, H);
      const got = scanAll(rgba, W, H, p.cols, p.rows, false);
      expect(got.length).toBe(frames.length);
      for (const f of frames) expect(got.some((g) => g.length === f.length && g.every((v, i) => v === f[i]))).toBe(true);
    });
});
