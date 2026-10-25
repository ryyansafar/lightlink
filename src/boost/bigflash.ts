import { h, Screen } from '../ui/dom';
import { BigEncoder } from './bigencoder';
import { calibrationFrame } from './channels';
import { composeFrame, composeTest } from './compose';
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
  let sent = 0;
  const t0 = performance.now();
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
    const tick = (t: number) => {
      if (!alive) return;
      requestAnimationFrame(tick);
      if (calibrating || t - lastFrame < 1000 / p.fps) return;
      lastFrame = t;
      const [W, H] = size();
      canvas.getContext('2d')!.putImageData(composeFrame(enc!, p, big.color, W, H), 0, 0);
      sent++;
      const secs = (performance.now() - t0) / 1000;
      const cur = enc!.currentGen;
      stat.textContent = `gen ${cur + 1}/${enc!.gens}, pass ${enc!.pass + 1} | ${sent} frames, drawn ${(sent / secs).toFixed(1)} fps (target ${p.fps})`;
      [...strip.children].forEach((c, i) => ((c as HTMLElement).className = i === cur % 200 ? 'on' : ''));
    };
    requestAnimationFrame(tick);
  }
  void run();
  return { el: root, destroy: () => { alive = false; } };
}
