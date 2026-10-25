import { h, Screen } from '../ui/dom';
import { BigEncoder } from './bigencoder';
import { calibrationFrame } from './channels';
import { composeTest } from './compose';
import { FramePool } from './framepool';
import { chunkSizeOf, profileById } from './profiles';
import { big } from './bigstate';

export function bigFlashScreen(go: (to: string) => void): Screen {
  const out = big.out;
  if (!out && !big.test) {
    queueMicrotask(() => go('bigsend'));
    return { el: h('div') };
  }
  const p = profileById(big.profileId);
  const canvas = h('canvas', { class: 'bigcanvas' });
  const stat = h('div', { class: 'stat' }, big.test ? 'Test pattern. Ask the receiver to tap "Test pattern".' : 'Preparing...');
  const strip = h('div', { class: 'strip' });
  const calBtn = h('button', { class: 'btn small', onclick: () => { calibrating = !calibrating; if (calibrating) drawCal(); } }, 'Calibration patches');
  const root = h('div', { class: 'screen flash bigflash' },
    h('div', { class: 'top' }, h('button', { class: 'btn small', onclick: () => go('bigsend') }, 'Stop'), big.color && calBtn),
    canvas, stat, strip);
  let alive = true;
  let calibrating = false;
  let enc: BigEncoder | null = null;
  let pool: FramePool | null = null;
  let sent = 0;
  let lastFrame = 0;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(300, Math.floor(window.innerWidth * dpr)), H = Math.max(300, Math.floor(window.innerHeight * 0.8 * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return [W, H];
  };
  function drawCal() {
    const [W, H] = size();
    canvas.getContext('2d')!.putImageData(new ImageData(calibrationFrame(W, H) as unknown as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  }

  async function run() {
    if (big.test) {
      const [W, H] = size();
      canvas.getContext('2d')!.putImageData(composeTest(p, big.color, W, H), 0, 0);
      return;
    }
    enc = await BigEncoder.create(out!.blob, out!.meta, { chunkSize: chunkSizeOf(p), tiling: [p.cols, p.rows, big.color ? 1 : 0] });
    strip.replaceChildren(...Array.from({ length: Math.min(enc.gens, 200) }, () => h('i', {})));
    const [W, H] = size();
    pool = new FramePool(enc, p, big.color, W, H);
    const ctx = canvas.getContext('2d')!;
    const shown: number[] = [];
    const tick = (t: number) => {
      if (!alive) return;
      requestAnimationFrame(tick);
      if (calibrating || t - lastFrame < 1000 / p.fps - 2) return;
      const f = pool!.take();
      if (!f?.bitmap) return; // not ready yet: try again on the next animation frame
      lastFrame = t;
      ctx.drawImage(f.bitmap, 0, 0);
      f.bitmap.close();
      sent++;
      shown.push(t);
      while (shown.length && t - shown[0] > 2000) shown.shift();
      const cur = enc!.currentGen;
      const fps = shown.length > 1 ? ((shown.length - 1) * 1000) / (t - shown[0]) : 0;
      stat.textContent = `gen ${cur + 1}/${enc!.gens}, pass ${enc!.pass + 1} | ${sent} frames, shown ${fps.toFixed(1)} fps (target ${p.fps}) | ${pool!.size} workers, ${pool!.avgGenMs.toFixed(0)} ms/frame each, ${pool!.underruns} late`;
      [...strip.children].forEach((c, i) => ((c as HTMLElement).className = i === cur % 200 ? 'on' : ''));
    };
    requestAnimationFrame(tick);
  }
  void run();
  return { el: root, destroy: () => { alive = false; pool?.close(); } };
}
