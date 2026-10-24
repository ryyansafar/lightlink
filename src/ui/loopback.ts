import { Encoder } from '../codec';
import { h, fmtSize, topBar, Screen } from './dom';
import { drawQr } from './qr';
import { Receiver } from './receiver';

export function loopbackScreen(go: (to: string) => void): Screen {
  const out = h('div', { class: 'info' }, 'Sends a generated 100 KB file through the real QR draw and the real decode path on this device.');
  const canvas = h('canvas', { class: 'qr small' });
  const run = h('button', { class: 'btn huge', onclick: () => void start() }, 'Run self-test');
  let alive = true;

  async function start() {
    (run as HTMLButtonElement).disabled = true;
    const data = new Uint8Array(100 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
    const enc = new Encoder(data, { name: 'loopback.bin', mime: 'application/octet-stream' }, { chunkSize: 500 });
    const rx = new Receiver();
    const t0 = performance.now();
    let sent = 0;
    let ok = false;
    try {
      while (alive && sent < enc.K * 6) {
        drawQr(canvas, enc.nextFrame(), 480);
        sent++;
        const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const p = await rx.feed(img);
        if (p) out.textContent = `Decoding ${Math.floor(p.progress * 100)}% (${sent} frames drawn)`;
        if (p?.done) {
          const r = rx.decoder.result();
          ok = !!r && r.bytes.length === data.length && r.bytes.every((b, i) => b === data[i]);
          break;
        }
      }
    } catch (e) {
      out.textContent = `FAIL: ${(e as Error).message}`;
    }
    rx.close();
    (run as HTMLButtonElement).disabled = false;
    const sec = (performance.now() - t0) / 1000;
    if (!alive) return;
    out.replaceChildren(
      h('div', { class: ok ? 'verdict pass' : 'verdict fail' }, ok ? 'PASS' : 'FAIL'),
      h('div', {}, `${fmtSize(data.length)} in ${sec.toFixed(1)} s, ${sent} frames (K ${enc.K})`),
      h('div', {}, `Measured: ${fmtSize(Math.round(data.length / sec))}/s, ${(sent / sec).toFixed(1)} frames/s`),
      h('div', { class: 'sub' }, 'Decode-limited upper bound on this device. Real camera throughput is lower.')
    );
  }

  const el = h('div', { class: 'screen' }, topBar('Loopback self-test', () => go('home')), canvas, out, run);
  return { el, destroy: () => { alive = false; } };
}
