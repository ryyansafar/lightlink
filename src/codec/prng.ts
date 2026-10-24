import { robustSoliton } from './soliton';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic chunk subset for a droplet seed. Sender and receiver both call this. */
export function droplet(seed: number, K: number): number[] {
  const rnd = mulberry32(seed);
  const cdf = robustSoliton(K);
  const u = rnd();
  let d = cdf.findIndex((p) => u <= p);
  if (d < 0) d = K;
  d = Math.max(1, Math.min(d, K));
  if (d === 1) return [Math.min(K - 1, Math.floor(rnd() * K))];
  if (d * 2 > K) {
    const all = Array.from({ length: K }, (_, i) => i);
    for (let i = 0; i < d; i++) {
      const j = i + Math.floor(rnd() * (K - i));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, d).sort((x, y) => x - y);
  }
  const picked = new Set<number>();
  while (picked.size < d) picked.add(Math.floor(rnd() * K));
  return [...picked].sort((x, y) => x - y);
}
