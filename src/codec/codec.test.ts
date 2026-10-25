import { describe, it, expect } from 'vitest';
import { Encoder, Decoder, crc32, fingerprint } from './index';
import { mulberry32 } from './prng';
import { sha256, toHex } from './sha256';

const META = { name: 'a.bin', mime: 'application/octet-stream' };

function rand(n: number, seed = 1): Uint8Array {
  const r = mulberry32(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
}

/** Feed frames until done; returns frames consumed. */
function run(enc: Encoder, dec: Decoder, filter: (f: Uint8Array, i: number) => Uint8Array | null = (f) => f, max = 20000) {
  let i = 0;
  for (; i < max; i++) {
    const f = filter(enc.nextFrame(), i);
    if (f && dec.push(f).done) return i + 1;
  }
  throw new Error('did not finish in ' + max + ' frames');
}

describe('primitives', () => {
  it('crc32 known vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('sha256 known vectors', () => {
    expect(toHex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const big = rand(1000, 9);
    const ref = new Uint8Array(require('node:crypto').createHash('sha256').update(big).digest());
    expect(toHex(sha256(big))).toBe(toHex(ref));
  });
  it('fingerprint is 4 emoji and stable', async () => {
    const a = await fingerprint(rand(100));
    expect([...a].length).toBe(4);
    expect(await fingerprint(rand(100))).toBe(a);
    expect(await fingerprint(rand(101))).not.toBe('');
  });
});

describe('round trips', () => {
  for (const size of [1, 1024, 50 * 1024, 300 * 1024]) {
    it(`${size} bytes`, () => {
      const data = rand(size, size);
      const enc = new Encoder(data, META);
      const dec = new Decoder();
      run(enc, dec);
      const r = dec.result()!;
      expect(r.bytes).toEqual(data);
      expect(r.meta).toEqual({ ...META, size });
    });
  }
  it('empty file', () => {
    const dec = new Decoder();
    run(new Encoder(new Uint8Array(), META), dec);
    expect(dec.result()!.bytes.length).toBe(0);
  });
  it('custom chunk size', () => {
    const data = rand(5000, 3);
    const enc = new Encoder(data, META, { chunkSize: 128 });
    expect(enc.K).toBe(Math.ceil(5000 / 128));
    const dec = new Decoder();
    run(enc, dec);
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('result is null before done and progress is monotonic', () => {
    const enc = new Encoder(rand(20000, 4), META);
    const dec = new Decoder();
    expect(dec.result()).toBeNull();
    let last = 0;
    for (let i = 0; i < 5000; i++) {
      const s = dec.push(enc.nextFrame());
      expect(s.progress).toBeGreaterThanOrEqual(last);
      last = s.progress;
      if (s.done) break;
    }
    expect(dec.result()).not.toBeNull();
  });
  it('reset allows a second transfer', () => {
    const dec = new Decoder();
    const a = rand(3000, 5), b = rand(4000, 6);
    run(new Encoder(a, META), dec);
    dec.reset();
    expect(dec.result()).toBeNull();
    run(new Encoder(b, META), dec);
    expect(dec.result()!.bytes).toEqual(b);
  });
});

describe('hostile channel', () => {
  const data = rand(40 * 1024, 11);
  it('30 percent random loss', () => {
    const r = mulberry32(77);
    const dec = new Decoder();
    run(new Encoder(data, META), dec, (f) => (r() < 0.3 ? null : f));
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('shuffled order', () => {
    const enc = new Encoder(data, META);
    const frames = Array.from({ length: enc.K * 2 + 40 }, () => enc.nextFrame());
    const r = mulberry32(5);
    for (let i = frames.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [frames[i], frames[j]] = [frames[j], frames[i]];
    }
    const dec = new Decoder();
    for (const f of frames) if (dec.push(f).done) break;
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('duplicated frames', () => {
    const dec = new Decoder();
    run(new Encoder(data, META), dec, (f) => {
      dec.push(f);
      dec.push(f);
      return f;
    });
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('corrupted frames are dropped silently', () => {
    const r = mulberry32(3);
    const dec = new Decoder();
    run(new Encoder(data, META), dec, (f) => {
      if (r() < 0.2) {
        const c = f.slice();
        c[Math.floor(r() * c.length)] ^= 1 << Math.floor(r() * 8);
        return c;
      }
      return f;
    });
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('garbage and truncated input never throws', () => {
    const dec = new Decoder();
    for (const g of [new Uint8Array(), new Uint8Array(3), rand(500, 1), rand(17, 2)]) {
      expect(() => dec.push(g)).not.toThrow();
    }
    expect(dec.push(new Uint8Array()).done).toBe(false);
  });
  it('two interleaved transfers do not mix', () => {
    const a = rand(30000, 21), b = rand(30000, 22);
    const ea = new Encoder(a, { name: 'a', mime: 'x/a' });
    const eb = new Encoder(b, { name: 'b', mime: 'x/b' });
    const dec = new Decoder();
    for (let i = 0; i < 5000 && !dec.result(); i++) {
      dec.push(ea.nextFrame());
      dec.push(eb.nextFrame());
    }
    const r = dec.result()!;
    expect(r.bytes).toEqual(a);
    expect(r.meta.name).toBe('a');
  });
  it('can start mid-stream', () => {
    const enc = new Encoder(data, META);
    for (let i = 0; i < 37; i++) enc.nextFrame();
    const dec = new Decoder();
    run(enc, dec);
    expect(dec.result()!.bytes).toEqual(data);
  });
  it('meta shows up once the manifest arrives', () => {
    const enc = new Encoder(data, META);
    const dec = new Decoder();
    const first = dec.push(enc.nextFrame()); // frame 0 is a manifest
    expect(first.meta).toEqual({ ...META, size: data.length });
  });
});

describe('overhead', () => {
  it('averages under 1.25 over 200 seeds for K above 50', () => {
    const size = 100 * 400; // K = 100
    let total = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      const enc = new Encoder(rand(size, s + 1000), META);
      const dec = new Decoder();
      let dataFrames = 0;
      for (let i = 0; i < 5000; i++) {
        const f = enc.nextFrame();
        if (f[0] === 1) dataFrames++;
        if (dec.push(f).done) break;
      }
      total += dataFrames / enc.K;
    }
    const avg = total / N;
    console.log('avg overhead K=100:', avg.toFixed(3));
    expect(avg).toBeLessThan(1.25);
  });
});

describe('sender restarts mid-transfer', () => {
  it('follows a new transfer after a few frames from it', () => {
    const a = new Encoder(rand(5000, 1), META, { chunkSize: 250 });
    const bytes = rand(7000, 2);
    const b = new Encoder(bytes, META, { chunkSize: 500 });
    const dec = new Decoder();
    for (let i = 0; i < 5; i++) dec.push(a.nextFrame());
    run(b, dec);
    expect(Array.from(dec.result()!.bytes)).toEqual(Array.from(bytes));
  });

  it('a single stray frame from another transfer does not derail the current one', () => {
    const bytes = rand(6000, 3);
    const a = new Encoder(bytes, META);
    const stray = new Encoder(rand(6000, 4), META);
    const dec = new Decoder();
    run(a, dec, (f, i) => (i % 7 === 3 ? stray.nextFrame() : f));
    expect(Array.from(dec.result()!.bytes)).toEqual(Array.from(bytes));
  });
});

describe('progress reporting', () => {
  it('counts received packets and exposes the solved mask', () => {
    const bytes = new Uint8Array(2000).map((_, i) => (i * 7) & 255);
    const enc = new Encoder(bytes, { name: 'a', mime: 'x/y' }, { chunkSize: 100 });
    const dec = new Decoder();
    let last = dec.push(enc.nextFrame());
    expect(last.received).toBe(0);
    for (let i = 0; i < 5; i++) last = dec.push(enc.nextFrame());
    expect(last.received).toBeGreaterThan(0);
    const mask = dec.solvedMask();
    expect(mask.length).toBe(enc.K);
    expect(mask.filter(Boolean).length).toBe(last.solved);
    while (!last.done) last = dec.push(enc.nextFrame());
    expect(dec.solvedMask().every(Boolean)).toBe(true);
  });
});
