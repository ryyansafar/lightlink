import { h, fmtSize, topBar, Screen } from '../ui/dom';
import { BigDecoder } from './bigdecoder';
import { BigEncoder } from './bigencoder';
import { composeFrame } from './compose';
import { chunkSizeOf, PROFILES } from './profiles';
import { nativeAvailable, NativeReader, JsqrReader, type QrReader } from './readers';
import { saveRate } from './bigstate';

export interface LoopResult { profile: string; decoder: string; ok: boolean; bytes: number; seconds: number; kbps: number; frames: number; drawMs: number; decodeMs: number; progress: number }

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

/** Real draw (tiles, optional colour) -> real decode (native or jsQR worker) -> BigDecoder, on this device. */
export async function runOne(profileIdx: number, reader: QrReader, color: boolean, log: (s: string) => void): Promise<LoopResult> {
  const p = PROFILES[profileIdx];
  const data = payload();
  const enc = await BigEncoder.create(new Blob([data as BlobPart]), { name: 'loop.bin', mime: 'application/octet-stream', origSize: data.length, compressed: false }, { chunkSize: chunkSizeOf(p), genSize: GEN, tiling: [p.cols, p.rows, color ? 1 : 0] });
  const dec = new BigDecoder();
  const [W, H] = CANVAS[p.id];
  const t0 = performance.now();
  let frames = 0, drawMs = 0, decodeMs = 0;
  while (!dec.result && performance.now() - t0 < TIMEOUT_MS) {
    await enc.settle();
    const a = performance.now();
    const img = composeFrame(enc, p, color, W, H);
    const b = performance.now();
    const found = await reader.read(img, { cols: p.cols, rows: p.rows, color });
    const c = performance.now();
    drawMs += b - a; decodeMs += c - b; frames++;
    for (const f of found) dec.push(f);
    if (dec.tracker.complete) await dec.finalize();
    if (frames % 5 === 0) log(`${p.id}/${reader.name}${color ? '/colour' : ''}: ${Math.floor(dec.status().progress * 100)}%`);
  }
  const seconds = (performance.now() - t0) / 1000;
  let ok = false;
  if (dec.result) {
    const got = new Uint8Array(await dec.result.blob.arrayBuffer());
    ok = got.length === data.length && got.every((v, i) => v === data[i]);
  }
  const kbps = ok ? data.length / 1024 / seconds : 0;
  if (ok && !color) saveRate(p.id, reader.name, kbps * 1024);
  return { profile: p.id + (color ? '+colour' : ''), decoder: reader.name, ok, bytes: data.length, seconds, kbps, frames, drawMs, decodeMs, progress: dec.status().progress };
}

export function bigLoopScreen(go: (to: string) => void): Screen {
  const out = h('div', { class: 'info' }, `Sends a generated ${fmtSize(PAYLOAD)} payload in ${fmtSize(GEN)} generations through the real tile draw and the real decoders on this device, for every profile. Decode-limited upper bound; a real camera is slower.`);
  const table = h('pre', { class: 'info', id: 'bigloop-table' });
  const colorBox = h('input', { type: 'checkbox' });
  const run = h('button', { class: 'btn huge', id: 'bigloop-run', onclick: () => void start() }, 'Run all profiles');
  let alive = true;

  async function start() {
    (run as HTMLButtonElement).disabled = true;
    const native = await nativeAvailable();
    const readers: QrReader[] = [new JsqrReader()];
    if (native) readers.unshift(new NativeReader());
    const results: LoopResult[] = [];
    const render = () => {
      table.textContent = ['profile      decoder  result  KB/s   s     frames draw ms/f decode ms/f',
        ...results.map((r) => `${r.profile.padEnd(12)} ${r.decoder.padEnd(8)} ${(r.ok ? 'PASS' : `FAIL ${Math.floor(r.progress * 100)}%`).padEnd(7)} ${r.kbps.toFixed(1).padStart(5)} ${r.seconds.toFixed(1).padStart(5)} ${String(r.frames).padStart(6)} ${(r.drawMs / r.frames).toFixed(0).padStart(9)} ${(r.decodeMs / r.frames).toFixed(0).padStart(11)}`),
        native ? '' : 'native BarcodeDetector: not available in this browser (jsQR only)'].join('\n');
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
(window as unknown as { __bigRunOne?: unknown }).__bigRunOne = async (profileIdx: number, decoder: 'native' | 'jsqr', color: boolean) => {
  const r = decoder === 'native' ? new NativeReader() : new JsqrReader();
  const res = await runOne(profileIdx, r, color, () => {});
  r.close();
  return res;
};
