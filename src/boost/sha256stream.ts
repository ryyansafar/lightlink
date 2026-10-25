import { sha256 } from '../codec/sha256';

/** Incremental SHA-256 so a file made of many generations is hashed without holding all of it in memory. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256Stream {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private tail = new Uint8Array(0);
  private len = 0;
  private w = new Uint32Array(64);

  private block(b: Uint8Array, off: number): void {
    const w = this.w, h = this.h;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], c = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b2, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b2) ^ (a & c) ^ (b2 & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b2; b2 = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b2; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }

  update(data: Uint8Array): void {
    this.len += data.length;
    let buf = data;
    if (this.tail.length) {
      buf = new Uint8Array(this.tail.length + data.length);
      buf.set(this.tail);
      buf.set(data, this.tail.length);
    }
    const full = buf.length - (buf.length % 64);
    for (let o = 0; o < full; o += 64) this.block(buf, o);
    this.tail = buf.slice(full);
  }

  digest(): Uint8Array {
    const t = this.tail;
    const total = t.length + 9 <= 64 ? 64 : 128;
    const pad = new Uint8Array(total);
    pad.set(t);
    pad[t.length] = 0x80;
    const dv = new DataView(pad.buffer);
    dv.setUint32(total - 8, Math.floor((this.len * 8) / 0x100000000));
    dv.setUint32(total - 4, (this.len * 8) >>> 0);
    for (let o = 0; o < total; o += 64) this.block(pad, o);
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, this.h[i]);
    return out;
  }
}

/** Hash a Blob 1 MB at a time. */
export async function hashBlob(blob: Blob, step = 1 << 20): Promise<Uint8Array> {
  const s = new Sha256Stream();
  for (let o = 0; o < blob.size; o += step) s.update(new Uint8Array(await blob.slice(o, o + step).arrayBuffer()));
  return s.digest();
}

export { sha256 };
