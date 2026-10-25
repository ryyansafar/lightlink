import { describe, expect, it } from 'vitest';
import { frameMatrix } from './qrmatrix';
import { frameBytes, PROFILES } from './profiles';

describe('qr generation speed', () => {
  it('fixed mask is much faster than the penalty search', () => {
    const p = PROFILES[2];
    const f = new Uint8Array(frameBytes(p)).map((_, i) => (i * 131 + 7) & 255);
    const t = (mask: number) => { const a = performance.now(); for (let i = 0; i < 6; i++) frameMatrix(f, p.version, 'L', mask); return (performance.now() - a) / 6; };
    t(2);
    const fast = t(2), slow = t(-1);
    console.log(`v40 per code: fixed mask ${fast.toFixed(1)} ms, best-mask search ${slow.toFixed(1)} ms`);
    expect(fast).toBeLessThan(slow);
  });
});
