import { h, fmtSize, topBar, Screen } from '../ui/dom';
import { BigDecoder } from './bigdecoder';
import { BigEncoder } from './bigencoder';
import { chunkSizeOf, PROFILES } from './profiles';
import { nativeWorkerOk, PoolReader, readerCount } from './readers';
import { FramePool } from './framepool';
import { saveRate } from './bigstate';

export interface LoopResult {
  profile: string; decoder: string; ok: boolean; bytes: number; seconds: number; kbps: number; frames: number;
  /** Frames the sender actually put on the "screen" per second, against the profile target. */
  shownFps: number; targetFps: number; genMs: number; genWorkers: number; readers: number; reads: number; dropped: number; decodeMs: number; progress: number; found: number;
}

const PAYLOAD = 192 * 1024;
const GEN = 64 * 1024;
/** Canvas per profile: a big phone screen for safe, laptop screens for the others. */
const CANVAS: Record<string, [number, number]> = { safe: [1280, 800], fast: [1920, 1200], max: [2560, 1600] };
const TIMEOUT_MS = 60000;

function payload(): Uint8Array {
  const b = new Uint8Array(PAYLOAD);
  let x = 12345;
  for (let i = 0; i < b.length; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; b[i] = x >>> 24; }
  return b;
}

/**
 * Real pipelined loop on one device: the sender's worker pool draws frames ahead, a display clock "shows" one per
 * 1/fps, and the receiver takes the newest shown frame whenever a reader worker is free (otherwise it drops it).
 * Decode runs in parallel with drawing. Pixels are exact (no camera), so this is still an upper bound.
 */
export async function runOne(profileIdx: number, reader: PoolReader, color: boolean, log: (s: string) => void): Promise<LoopResult> {
  const p = PROFILES[profileIdx];
  const data = payload();
  const enc = await BigEncoder.create(new Blob([data as BlobPart]), { name: 'loop.bin', mime: 'application/octet-stream', origSize: data.length, compressed: false }, { chunkSize: chunkSizeOf(p), genSize: GEN, tiling: [p.cols, p.rows, color ? 1 : 0] });
  const dec = new BigDecoder();
  const [W, H] = CANVAS[p.id];
  const pool = new FramePool(enc, p, color, W, H, true);
  const t0 = performance.now();
  const period = 1000 / p.fps;
  let nextShow = t0, shown = 0, finalizing = false, foundN = 0;
  while (!dec.result && performance.now() - t0 < ((window as unknown as { __bigTimeout?: number }).__bigTimeout ?? TIMEOUT_MS)) {
    const now = performance.now();
    if (now >= nextShow) {
      nextShow = Math.max(nextShow + period, now - period);
      const f = pool.take();
      if (f?.rgba) {
        shown++;
        if (!reader.busy)
          void reader.read(f.rgba, { cols: p.cols, rows: p.rows, color }).then(async (found) => {
            foundN += found.length;
            for (const fr of found) dec.push(fr);
            if (dec.tracker.complete && !finalizing) { finalizing = true; await dec.finalize(); }
          });
        else reader.dropped++;
      }
    }
    await new Promise((r) => setTimeout(r, 1));
    if (shown % 15 === 0) log(`${p.id}/${reader.name}${color ? '/colour' : ''}: ${Math.floor(dec.status().progress * 100)}%`);
  }
  const seconds = (performance.now() - t0) / 1000;
  let ok = false;
  if (dec.result) {
    const got = new Uint8Array(await dec.result.blob.arrayBuffer());
    ok = got.length === data.length && got.every((v, i) => v === data[i]);
  }
  const kbps = ok ? data.length / 1024 / seconds : 0;
  if (ok && !color) saveRate(p.id, reader.name, kbps * 1024);
  const res: LoopResult = { profile: p.id + (color ? '+colour' : ''), decoder: reader.name, ok, bytes: data.length, seconds, kbps, frames: pool.generated, shownFps: shown / seconds, targetFps: p.fps, genMs: pool.avgGenMs, genWorkers: pool.size, readers: reader.size, reads: reader.reads, dropped: reader.dropped, decodeMs: reader.avgDecodeMs, progress: dec.status().progress, found: foundN };
  pool.close();
  return res;
}

export function bigLoopScreen(go: (to: string) => void): Screen {
  const out = h('div', { class: 'info' }, `Sends a generated ${fmtSize(PAYLOAD)} payload in ${fmtSize(GEN)} generations through the real tile draw and the real decoders on this device, for every profile. The sender draws in a worker pool, the receiver decodes in parallel and drops frames when busy. Upper bound; a real camera is slower.`);
  const table = h('pre', { class: 'info', id: 'bigloop-table' });
  const colorBox = h('input', { type: 'checkbox' });
  const run = h('button', { class: 'btn huge', id: 'bigloop-run', onclick: () => void start() }, 'Run all profiles');
  let alive = true;

  async function start() {
    (run as HTMLButtonElement).disabled = true;
    const native = await nativeWorkerOk();
    const readers: PoolReader[] = [new PoolReader('jsqr', readerCount())];
    if (native) readers.unshift(new PoolReader('native', readerCount()));
    const results: LoopResult[] = [];
    const render = () => {
      table.textContent = ['profile      decoder  result  KB/s   s     shown/target fps  gen ms/frame (workers)  decode ms (readers)  dropped',
        ...results.map((r) => `${r.profile.padEnd(12)} ${r.decoder.padEnd(8)} ${(r.ok ? 'PASS' : `FAIL ${Math.floor(r.progress * 100)}%`).padEnd(7)} ${r.kbps.toFixed(1).padStart(5)} ${r.seconds.toFixed(1).padStart(5)} ${r.shownFps.toFixed(1).padStart(5)}/${String(r.targetFps).padEnd(3)} ${r.genMs.toFixed(0).padStart(8)} (${r.genWorkers}) ${r.decodeMs.toFixed(0).padStart(14)} (${r.readers}) ${String(r.dropped).padStart(9)}`),
        native ? '' : 'native BarcodeDetector in a worker: not available in this browser (jsQR only)'].join('\n');
      (window as unknown as { __bigLoop?: LoopResult[] }).__bigLoop = results;
    };
    try {
      for (let i = 0; i < PROFILES.length && alive; i++)
        for (const r of readers) {
          if (!alive) break;
          results.push(await runOne(i, r, false, (s) => (out.textContent = s)));
          render();
          if (colorBox.checked) { results.push(await runOne(i, r, true, (s) => (out.textContent = s))); render(); }
        }
    } catch (e) {
      out.textContent = `Error: ${(e as Error).message}`;
    }
    readers.forEach((r) => r.close());
    (window as unknown as { __bigLoopDone?: boolean }).__bigLoopDone = true;
    if (alive) out.textContent = 'Done. Numbers below are measured on this device.';
    (run as HTMLButtonElement).disabled = false;
  }
  const el = h('div', { class: 'screen' }, topBar('Big loopback', () => go('home')), out, h('label', { class: 'sub' }, colorBox, ' Include colour (experimental)'), table, run);
  return { el, destroy: () => { alive = false; } };
}

// Test hook: lets scripts/measure-big.mjs run a single profile/decoder/colour combination.
(window as unknown as { __bigRunOne?: unknown }).__bigRunOne = async (profileIdx: number, decoder: 'native' | 'jsqr', color: boolean, readers = readerCount()) => {
  const r = new PoolReader(decoder, readers);
  const res = await runOne(profileIdx, r, color, () => {});
  r.close();
  return res;
};
