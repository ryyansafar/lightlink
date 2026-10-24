/** Persistence for finished generations so a transfer can be paused or survive a reload. */
export interface GenStore {
  put(fileId: number, g: number, blob: Blob): Promise<void>;
  keys(fileId: number): Promise<number[]>;
  get(fileId: number, g: number): Promise<Blob | null>;
  clear(fileId: number): Promise<void>;
}

export class MemoryGenStore implements GenStore {
  private m = new Map<string, Blob>();
  async put(f: number, g: number, b: Blob) { this.m.set(`${f}:${g}`, b); }
  async keys(f: number) { return [...this.m.keys()].filter((k) => k.startsWith(`${f}:`)).map((k) => Number(k.split(':')[1])); }
  async get(f: number, g: number) { return this.m.get(`${f}:${g}`) ?? null; }
  async clear(f: number) { for (const k of [...this.m.keys()]) if (k.startsWith(`${f}:`)) this.m.delete(k); }
}

export class IdbGenStore implements GenStore {
  private db: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((res, rej) => {
      const r = indexedDB.open('lightlink-big', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('gens');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((res, rej) => {
      const req = fn(db.transaction('gens', mode).objectStore('gens'));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async put(f: number, g: number, b: Blob) { await this.tx('readwrite', (s) => s.put(b, `${f}:${g}`)); }
  async get(f: number, g: number) { return ((await this.tx('readonly', (s) => s.get(`${f}:${g}`))) as Blob | undefined) ?? null; }
  async keys(f: number) {
    const all = (await this.tx('readonly', (s) => s.getAllKeys())) as string[];
    return all.filter((k) => String(k).startsWith(`${f}:`)).map((k) => Number(String(k).split(':')[1]));
  }
  async clear(f: number) {
    for (const g of await this.keys(f)) await this.tx('readwrite', (s) => s.delete(`${f}:${g}`));
  }
}
