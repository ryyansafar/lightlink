/** Wraps the jsQR Web Worker. One frame in flight at a time; callers drop frames while busy. */
export class QrScanner {
  private worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, (b: Uint8Array | null) => void>();
  busy = false;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; bytes: Uint8Array | null }>) => {
      const cb = this.pending.get(e.data.id);
      this.pending.delete(e.data.id);
      this.busy = this.pending.size > 0;
      cb?.(e.data.bytes);
    };
  }

  decode(img: ImageData): Promise<Uint8Array | null> {
    const id = this.nextId++;
    this.busy = true;
    return new Promise((res) => {
      this.pending.set(id, res);
      this.worker.postMessage({ id, buf: img.data.buffer, width: img.width, height: img.height }, [img.data.buffer]);
    });
  }

  close() {
    this.worker.terminate();
  }
}
