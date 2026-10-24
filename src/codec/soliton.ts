// Robust soliton distribution; returns the cdf indexed by degree (index 0 unused).
export const SOLITON_C = 0.05;
export const SOLITON_DELTA = 0.5;

const cache = new Map<number, Float64Array>();

export function robustSoliton(K: number, c = SOLITON_C, delta = SOLITON_DELTA): Float64Array {
  const key = K;
  const hit = c === SOLITON_C && delta === SOLITON_DELTA ? cache.get(key) : undefined;
  if (hit) return hit;
  const R = Math.max(1, c * Math.log(K / delta) * Math.sqrt(K));
  const spike = Math.max(1, Math.min(K, Math.round(K / R)));
  const p = new Float64Array(K + 1);
  for (let i = 1; i <= K; i++) {
    const rho = i === 1 ? 1 / K : 1 / (i * (i - 1));
    let tau = 0;
    if (i < spike) tau = R / (i * K);
    else if (i === spike) tau = (R * Math.log(R / delta)) / K;
    p[i] = rho + Math.max(0, tau);
  }
  let sum = 0;
  for (let i = 1; i <= K; i++) sum += p[i];
  let acc = 0;
  const cdf = new Float64Array(K + 1);
  for (let i = 1; i <= K; i++) {
    acc += p[i] / sum;
    cdf[i] = acc;
  }
  cdf[K] = 1;
  if (c === SOLITON_C && delta === SOLITON_DELTA) cache.set(key, cdf);
  return cdf;
}
