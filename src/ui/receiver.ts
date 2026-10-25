import { Decoder } from '../codec';
import { QrScanner } from './scanner';

export interface Progress { progress: number; solved: number; K: number; done: boolean; received: number; chunkSize: number }

/** Frame pump: feeds decoded QR payloads into a Decoder and tracks decoded fps. */
export class Receiver {
  decoder = new Decoder();
  scanner = new QrScanner();
  times: number[] = [];
  frames = 0;
  frameBytes = 0;
  last: Progress = { progress: 0, solved: 0, K: 0, done: false, received: 0, chunkSize: 0 };

  async feed(img: ImageData): Promise<Progress | null> {
    const bytes = await this.scanner.decode(img);
    if (!bytes) return null;
    try {
      const p = this.decoder.push(bytes);
      this.frames++;
      this.frameBytes = bytes.length;
      const now = performance.now();
      this.times.push(now);
      while (this.times.length && now - this.times[0] > 2000) this.times.shift();
      this.last = p;
      return p;
    } catch {
      return null; // not a LightLink frame
    }
  }

  get fps(): number {
    return this.times.length / 2;
  }

  close() { this.scanner.close(); }
}
