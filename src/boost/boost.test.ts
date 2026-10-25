import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { BigDecoder } from './bigdecoder';
import { BigEncoder } from './bigencoder';
import { packTest, parseTest, packBigManifest, parseBigManifest } from './bigframe';
import { calibrationFrame, extractChannel, fitCalibration, renderTiles, sampleQuadrants } from './channels';
import { deflate, inflate, maybeCompress, shouldCompress } from './compress';
import { genCount, genRange, genXferId, joinGenerations, ResumeTracker, splitGenerations } from './generations';
import { MemoryGenStore } from './genstore';
import { ceilingBps, chunkSizeOf, frameBytes, PROFILES, QR_CAPACITY, FRAME_OVERHEAD } from './profiles';
import { decodeText, encodedLen, encodeText, maxBytes } from './text7';
import { frameMatrix, qrMatrix } from './qrmatrix';
import { Sha256Stream, hashBlob } from './sha256stream';
import { sha256, toHex } from '../codec/sha256';
import { ThroughputEstimator, fmtDuration, preflight, recommendedMax } from './throughput';
import { cropRegions, layoutTiles, modulesOf } from './tiling';

const rnd = (n: number, seed = 1) => {
  const b = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; b[i] = x >>> 24; }
  return b;
};

describe('generations', () => {
  it('splits and joins at awkward sizes', () => {
    for (const size of [0, 1, 99, 100, 101, 1000]) {
      const b = rnd(size);
      const parts = splitGenerations(b, 100);
      expect(parts.length).toBe(genCount(size, 100));
      expect(joinGenerations(parts)).toEqual(b);
      expect(genRange(parts.length - 1, size, 100)[1]).toBe(size);
    }
  });
  it('gives distinct fountain ids per generation', () => {
    const ids = new Set(Array.from({ length: 500 }, (_, i) => genXferId(12345, i)));
    expect(ids.size).toBe(500);
  });
  it('tracks resume bookkeeping', () => {
    const t = new ResumeTracker(4);
    t.markDone(1); t.markDone(1); t.markDone(3); t.markDone(9);
    expect(t.doneCount).toBe(2);
    expect(t.remaining()).toEqual([0, 2]);
    expect(t.complete).toBe(false);
    t.markDone(0); t.markDone(2);
    expect(t.complete).toBe(true);
  });
});

describe('sha256 stream', () => {
  it('matches the one-shot hash across split points', async () => {
    const b = rnd(5000, 7);
    for (const cut of [1, 55, 56, 63, 64, 65, 1000]) {
      const s = new Sha256Stream();
      s.update(b.subarray(0, cut)); s.update(b.subarray(cut));
      expect(toHex(s.digest())).toBe(toHex(sha256(b)));
    }
    expect(toHex(await hashBlob(new Blob([b]), 777))).toBe(toHex(sha256(b)));
  });
});

describe('compression', () => {
  it('round-trips and skips compressed types', async () => {
    const text = new Blob([new TextEncoder().encode('hello lightlink '.repeat(500))]);
    const z = await deflate(text);
    expect(z.size).toBeLessThan(text.size / 5);
    expect(new Uint8Array(await (await inflate(z)).arrayBuffer())).toEqual(new Uint8Array(await text.arrayBuffer()));
    for (const n of ['a.jpg', 'b.PNG', 'c.mp4', 'd.zip', 'e.pdf']) expect(shouldCompress(n, '')).toBe(false);
    expect(shouldCompress('a.txt', 'text/plain')).toBe(true);
    expect(shouldCompress('x', 'image/jpeg')).toBe(false);
    const r = await maybeCompress(text, 'a.txt', 'text/plain');
    expect(r.compressed).toBe(true);
    const inc = await maybeCompress(new Blob([rnd(4000)]), 'a.bin', '');
    expect(inc.compressed).toBe(false);
  });
});

describe('tiling maths', () => {
  it('fits non-overlapping tiles inside the canvas', () => {
    for (const [c, r] of [[1, 1], [2, 1], [2, 2], [3, 2]]) {
      const L = layoutTiles(c, r, 1600, 1000, modulesOf(40));
      expect(L.rects.length).toBe(c * r);
      for (const a of L.rects) {
        expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(1600); expect(a.y + a.h).toBeLessThanOrEqual(1000);
      }
      for (let i = 0; i < L.rects.length; i++) for (let j = i + 1; j < L.rects.length; j++) {
        const a = L.rects[i], b = L.rects[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
  });
  it('crops cover the image with overlap', () => {
    const regs = cropRegions(3, 2, 900, 600, 0.1);
    expect(regs.length).toBe(6);
    expect(regs[0].x).toBe(0);
    expect(regs[5].x + regs[5].w).toBe(900);
    expect(regs[5].y + regs[5].h).toBe(600);
    expect(regs[1].w).toBeGreaterThan(300);
  });
});

describe('profiles', () => {
  it('chunk size plus frame overhead equals QR capacity', () => {
    for (const p of PROFILES) { expect(chunkSizeOf(p) + FRAME_OVERHEAD).toBe(frameBytes(p)); expect(encodedLen(frameBytes(p))).toBeLessThanOrEqual(QR_CAPACITY[p.version]); expect(encodedLen(frameBytes(p) + 1)).toBeGreaterThan(QR_CAPACITY[p.version]); }
    expect(ceilingBps(PROFILES[2])).toBeGreaterThan(ceilingBps(PROFILES[0]));
  });
});

describe('text-safe transport', () => {
  it('round trips every length, never emits NUL or bytes above 127', () => {
    for (let n = 0; n < 60; n++) {
      const b = rnd(n, n + 1);
      const e = encodeText(b);
      expect(e.length).toBe(encodedLen(n));
      expect(e.every((c) => c >= 1 && c <= 127)).toBe(true);
      expect(decodeText(e)).toEqual(b);
    }
    const edge = new Uint8Array([0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255]);
    expect(decodeText(encodeText(edge))).toEqual(edge);
    expect(decodeText(new Uint8Array([0, 1, 2]))).toBeNull();
    expect(decodeText(new Uint8Array([127, 127, 127, 127, 127, 127, 127]))).toBeNull();
    expect(maxBytes(2953)).toBe(2531);
  });
  it('a full text-safe v30 frame reads back through jsQR', () => {
    const p = PROFILES[1];
    const frame = rnd(frameBytes(p), 21);
    const m = frameMatrix(frame, p.version);
    const L = layoutTiles(1, 1, 800, 800, m.n);
    const r = jsQR(renderTiles(800, 800, L, [[m]]), 800, 800, { inversionAttempts: 'dontInvert' });
    expect(r && decodeText(new Uint8Array(r.binaryData))).toEqual(frame);
  });
});

describe('real QR render and read', () => {
  it('draws and reads a v30 frame through jsQR (mono)', () => {
    const frame = rnd(QR_CAPACITY[30], 3);
    const m = qrMatrix(frame, 30);
    const L = layoutTiles(1, 1, 700, 700, m.n);
    const img = renderTiles(700, 700, L, [[m]]);
    const r = jsQR(img, 700, 700, { inversionAttempts: 'dontInvert' });
    expect(r && new Uint8Array(r.binaryData)).toEqual(frame);
  });
  it('colour: three layers pack into RGB and unpack to three readable codes', () => {
    const frames = [rnd(300, 1), rnd(300, 2), rnd(300, 3)];
    const ms = frames.map((f) => qrMatrix(f, 15));
    const L = layoutTiles(1, 1, 600, 600, ms[0].n);
    const img = renderTiles(600, 600, L, [ms]);
    for (let c = 0; c < 3; c++) {
      const r = jsQR(extractChannel(img, c), 600, 600, { inversionAttempts: 'dontInvert' });
      expect(r && new Uint8Array(r.binaryData)).toEqual(frames[c]);
    }
  });
  it('colour: calibration undoes synthetic channel crosstalk', () => {
    const mix = [[0.65, 0.18, 0.04], [0.14, 0.6, 0.14], [0.04, 0.2, 0.55]];
    const black = [12, 9, 14];
    const camera = (src: Uint8ClampedArray) => {
      const o = new Uint8ClampedArray(src.length);
      for (let i = 0; i < src.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) o[i + ch] = black[ch] + mix[ch][0] * src[i] + mix[ch][1] * src[i + 1] + mix[ch][2] * src[i + 2];
        o[i + 3] = 255;
      }
      return o;
    };
    const cal = fitCalibration(sampleQuadrants(camera(calibrationFrame(400, 400)), 400, 400))!;
    expect(cal).toBeTruthy();
    const frames = [rnd(200, 4), rnd(200, 5), rnd(200, 6)];
    const ms = frames.map((f) => qrMatrix(f, 12));
    const L = layoutTiles(1, 1, 500, 500, ms[0].n);
    const seen = camera(renderTiles(500, 500, L, [ms]));
    for (let c = 0; c < 3; c++) {
      const r = jsQR(extractChannel(seen, c, cal), 500, 500, { inversionAttempts: 'dontInvert' });
      expect(r && new Uint8Array(r.binaryData)).toEqual(frames[c]);
    }
  });
});

describe('throughput estimator', () => {
  it('reports rate, remaining time and honest preflight', () => {
    const e = new ThroughputEstimator(10000);
    expect(e.rate()).toBe(0);
    expect(e.remaining(1000)).toBeNull();
    e.record(0, 0); e.record(2000, 20000);
    expect(e.rate()).toBe(10000);
    expect(e.remaining(120000)).toBe(10);
    expect(preflight(600000, 10000).seconds).toBe(60);
    expect(preflight(1, 0).text).toContain('unknown');
    expect(recommendedMax(10000, 600)).toBe(6000000);
    expect(fmtDuration(30)).toBe('30 s');
    expect(fmtDuration(600)).toBe('10 min');
  });
});

describe('big transfer end to end (codec level)', () => {
  it('moves many generations, tolerates loss and a pause, verifies by SHA-256', async () => {
    const data = rnd(60000, 9);
    const enc = await BigEncoder.create(new Blob([data]), { name: 'x.bin', mime: 'application/octet-stream', origSize: data.length, compressed: false }, { chunkSize: 200, genSize: 8192 });
    expect(enc.gens).toBe(8);
    const dec = new BigDecoder(new MemoryGenStore());
    let n = 0;
    while (!dec.result && n < 20000) {
      await enc.settle();
      const f = enc.nextFrame();
      n++;
      if (n % 5 === 0) continue; // 20% loss
      if (n > 80 && n < 160) continue; // a pause: receiver looks away
      dec.push(f);
      if (dec.tracker.complete) await dec.finalize();
    }
    expect(dec.result?.verified).toBe(true);
    expect(new Uint8Array(await dec.result!.blob.arrayBuffer())).toEqual(data);
  });
  it('restores finished generations from the store after a reload', async () => {
    const data = rnd(30000, 11);
    const store = new MemoryGenStore();
    const enc = await BigEncoder.create(new Blob([data]), { name: 'y', mime: '', origSize: data.length, compressed: false }, { chunkSize: 300, genSize: 6000 });
    const a = new BigDecoder(store);
    let n = 0;
    while (a.tracker.doneCount < 2 && n++ < 5000) { await enc.settle(); a.push(enc.nextFrame()); }
    await new Promise((r) => setTimeout(r, 10));
    const b = new BigDecoder(store);
    b.push(enc.nextFrame()); // may or may not be the manifest
    while (!b.manifest && n++ < 6000) { await enc.settle(); b.push(enc.nextFrame()); }
    await new Promise((r) => setTimeout(r, 20));
    expect(b.tracker.doneCount).toBeGreaterThanOrEqual(2);
    while (!b.result && n++ < 20000) { await enc.settle(); b.push(enc.nextFrame()); if (b.tracker.complete) await b.finalize(); }
    expect(new Uint8Array(await b.result!.blob.arrayBuffer())).toEqual(data);
  });
  it('compressed transfers inflate back to the original', async () => {
    const orig = new TextEncoder().encode('lightlink '.repeat(4000));
    const z = await deflate(new Blob([orig]));
    const enc = await BigEncoder.create(z, { name: 't.txt', mime: 'text/plain', origSize: orig.length, compressed: true }, { chunkSize: 150, genSize: 2000 });
    const dec = new BigDecoder();
    let n = 0;
    while (!dec.result && n++ < 20000) { await enc.settle(); dec.push(enc.nextFrame()); if (dec.tracker.complete) await dec.finalize(); }
    expect(dec.result!.meta.size).toBe(orig.length);
    expect(new Uint8Array(await dec.result!.blob.arrayBuffer())).toEqual(orig);
  });
  it('frames: manifest and test patterns round trip, garbage is rejected', () => {
    const m = { v: 1 as const, id: 5, g: 3, gs: 100, size: 250, osz: 250, z: false, sha: 'ab', name: 'n', mime: 'm' };
    expect(parseBigManifest(packBigManifest(m))).toEqual(m);
    const bad = packBigManifest(m); bad[3] ^= 1;
    expect(parseBigManifest(bad)).toBeNull();
    expect(parseBigManifest(packBigManifest({ ...m, g: 9 }))).toBeNull();
    const t = packTest(2, 4, 1, 500);
    expect(t.length).toBe(500);
    expect(parseTest(t)).toEqual({ profileIdx: 2, tile: 4, layer: 1 });
  });
});

import { budgetLine, fitsInSeconds } from './throughput';
describe('60-second budget', () => {
  const fmt = (n: number) => `${n} B`;
  it('says unknown until a rate is measured', () => {
    expect(budgetLine(0, null, fmt)).toBe('unknown until you run the test pattern');
  });
  it('computes the largest file in a minute and the time for a file', () => {
    expect(fitsInSeconds(10 * 1024)).toBe(614400);
    expect(budgetLine(10 * 1024, 1024 * 1024, fmt)).toContain('this file: about 102 s'.replace('102 s', '2 min'));
  });
});
