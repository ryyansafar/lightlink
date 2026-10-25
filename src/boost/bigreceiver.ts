import { BigDecoder, type BigStatus } from './bigdecoder';
import { parseTest } from './bigframe';
import { IdbGenStore } from './genstore';
import { makeReader, type QrReader, type ReadOpts } from './readers';
import { ThroughputEstimator } from './throughput';

export interface TestReading { profileIdx: number; color: boolean; tiles: number; layers: number }

/** Camera or canvas frames in; generations, rate and test-pattern readings out. */
export class BigReceiver {
  dec: BigDecoder;
  est = new ThroughputEstimator();
  reader!: QrReader;
  frames = 0;
  decodeMs = 0;
  reads = 0;
  private recent: number[] = [];
  private testSeen = new Map<string, number>();
  test: TestReading | null = null;

  constructor(store: boolean) {
    this.dec = new BigDecoder(store ? new IdbGenStore() : undefined);
  }

  async init(kind: 'auto' | 'native' | 'jsqr'): Promise<this> {
    this.reader = await makeReader(kind);
    return this;
  }

  get busy() { return this.reader.busy; }

  /** Tiling to use: the sender's (from its manifest) once known, else the user's guess. */
  opts(guess: ReadOpts): ReadOpts {
    const t = this.dec.manifest?.t;
    return t ? { ...guess, cols: t[0], rows: t[1], color: t[2] === 1 } : guess;
  }

  async feed(img: ImageData, guess: ReadOpts): Promise<BigStatus> {
    const t0 = performance.now();
    const payloads = await this.reader.read(img, this.opts(guess));
    const now = performance.now();
    this.decodeMs += now - t0;
    this.reads++;
    for (const p of payloads) {
      const tp = parseTest(p);
      if (tp) {
        this.testSeen.set(`${tp.tile}:${tp.layer}`, now);
        this.test = { profileIdx: tp.profileIdx & 0x7f, color: (tp.profileIdx & 0x80) !== 0, tiles: 0, layers: 0 };
        continue;
      }
      this.dec.push(p);
      this.frames++;
      this.recent.push(now);
    }
    while (this.recent.length && now - this.recent[0] > 2000) this.recent.shift();
    for (const [k, t] of this.testSeen) if (now - t > 1500) this.testSeen.delete(k);
    if (this.test) {
      const keys = [...this.testSeen.keys()].map((k) => k.split(':').map(Number));
      this.test.tiles = new Set(keys.map((k) => k[0])).size;
      this.test.layers = new Set(keys.map((k) => k[1])).size;
      if (!keys.length) this.test = null;
    }
    const s = this.dec.status();
    this.est.record(now, s.bytesDone);
    return s;
  }

  get fps() { return this.recent.length / 2; }
  get avgDecodeMs() { return this.reads ? this.decodeMs / this.reads : 0; }
  close() { this.reader?.close(); }
}
