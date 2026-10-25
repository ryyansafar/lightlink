import { droplet } from './prng';
import { packData, packManifest, type Header, type Manifest } from './frame';
import { sha256, toHex } from './sha256';

/** Chunk bytes per QR size; the app's default is M. */
export const SIZES: Record<string, number> = { S: 250, M: 500, L: 900 };
export const DEFAULT_CHUNK = SIZES.M;
export const MANIFEST_EVERY = 20;

export class Encoder {
  readonly K: number;
  private readonly chunks: Uint8Array[];
  private readonly header: Header;
  private readonly manifest: Manifest;
  private counter = 0;
  private dataCount: number;
  private readonly padTo: number;

  constructor(bytes: Uint8Array, meta: { name: string; mime: string }, opts?: { chunkSize?: number; xferId?: number; seedOffset?: number; padManifestTo?: number }) {
    const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? DEFAULT_CHUNK, 0xffff));
    this.K = Math.max(1, Math.ceil(bytes.length / chunkSize));
    if (this.K > 0xffff) throw new Error('file too large for this chunk size');
    this.chunks = Array.from({ length: this.K }, (_, i) => {
      const c = new Uint8Array(chunkSize);
      c.set(bytes.subarray(i * chunkSize, (i + 1) * chunkSize));
      return c;
    });
    const xferId = opts?.xferId ?? crypto.getRandomValues(new Uint32Array(1))[0];
    this.dataCount = opts?.seedOffset ?? 0;
    this.padTo = opts?.padManifestTo ?? 0;
    this.header = { xferId, K: this.K, chunkSize, fileSize: bytes.length };
    this.manifest = { name: meta.name, mime: meta.mime, sha256: toHex(sha256(bytes)) };
  }

  nextFrame(): Uint8Array {
    const n = this.counter++;
    if (n % MANIFEST_EVERY === 0) return packManifest(this.header, this.manifest, this.padTo);
    const i = this.dataCount++;
    const seed = (Math.imul(i + 1, 0x9e3779b1) ^ this.header.xferId) >>> 0;
    const out = new Uint8Array(this.header.chunkSize);
    for (const idx of droplet(seed, this.K)) {
      const c = this.chunks[idx];
      for (let j = 0; j < out.length; j++) out[j] ^= c[j];
    }
    return packData(this.header, seed, out);
  }
}
