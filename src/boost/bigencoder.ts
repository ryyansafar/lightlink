import { Encoder, MANIFEST_EVERY } from '../codec/encoder';
import { toHex } from '../codec/sha256';
import { packBigManifest, type BigManifest } from './bigframe';
import { GEN_SIZE, genCount, genRange, genXferId } from './generations';
import { hashBlob } from './sha256stream';

export const BIG_MANIFEST_EVERY = 25; // coprime with 2, 3, 6 and 18 frames per display frame, so the manifest rotates through every tile slot
export const OVERHEAD = 1.25;

export interface BigMeta { name: string; mime: string; origSize: number; compressed: boolean }

interface Cur { g: number; enc: Encoder; used: number; budget: number }

/** Sends a big blob as a carousel of 1 MB generations, each its own fountain code. Frames are produced synchronously. */
export class BigEncoder {
  readonly gens: number;
  readonly manifest: BigManifest;
  pass = 0;
  private cur!: Cur;
  private next: Cur | null = null;
  private nextLoading: Promise<void> | null = null;
  private frameNo = 0;
  private dataSent: number[];

  private constructor(private blob: Blob, meta: BigMeta, sha: string, private chunkSize: number, private genSize: number, fileId: number) {
    this.gens = genCount(blob.size, genSize);
    this.dataSent = new Array(this.gens).fill(0);
    this.manifest = { v: 1, id: fileId, g: this.gens, gs: genSize, size: blob.size, osz: meta.origSize, z: meta.compressed, sha, name: meta.name, mime: meta.mime };
    this.metaBase = { name: meta.name, mime: meta.mime };
  }
  private metaBase: { name: string; mime: string };

  static async create(blob: Blob, meta: BigMeta, opts: { chunkSize: number; genSize?: number; fileId?: number; tiling?: [number, number, number] }): Promise<BigEncoder> {
    const genSize = opts.genSize ?? GEN_SIZE;
    const sha = toHex(await hashBlob(blob));
    const e = new BigEncoder(blob, meta, sha, opts.chunkSize, genSize, opts.fileId ?? crypto.getRandomValues(new Uint32Array(1))[0]);
    if (opts.tiling) e.manifest.t = opts.tiling;
    e.cur = await e.load(0);
    e.prefetch();
    return e;
  }

  get currentGen(): number {
    return this.cur.g;
  }

  private async load(g: number): Promise<Cur> {
    const [a, b] = genRange(g, this.blob.size, this.genSize);
    const bytes = new Uint8Array(await this.blob.slice(a, b).arrayBuffer());
    const enc = new Encoder(bytes, this.metaBase, { chunkSize: this.chunkSize, xferId: genXferId(this.manifest.id, g), seedOffset: this.dataSent[g], padManifestTo: this.chunkSize + 21 });
    return { g, enc, used: 0, budget: Math.ceil(enc.K * OVERHEAD) + 4 };
  }

  private prefetch(): void {
    if (this.gens < 2 || this.next || this.nextLoading) return;
    const g = (this.cur.g + 1) % this.gens;
    this.nextLoading = this.load(g).then((c) => { this.next = c; this.nextLoading = null; });
  }

  /** Resolves when the next generation is loaded (tests and sync callers use this). */
  async settle(): Promise<void> {
    await this.nextLoading;
  }

  nextFrame(): Uint8Array {
    if (this.frameNo++ % BIG_MANIFEST_EVERY === 0) return packBigManifest(this.manifest, this.chunkSize + 21);
    const c = this.cur;
    const f = c.enc.nextFrame();
    c.used++;
    if (c.used >= c.budget && this.gens > 1 && this.next) {
      const sent = c.used - Math.ceil(c.used / MANIFEST_EVERY);
      this.dataSent[c.g] += sent;
      if (this.next.g <= c.g) this.pass++;
      this.cur = this.next;
      this.next = null;
      this.prefetch();
    }
    return f;
  }
}
