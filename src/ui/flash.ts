import { Encoder, SIZES } from '../codec';
import { h, Screen } from './dom';
import { drawQr } from './qr';
import { state } from './state';

export function flashScreen(go: (to: string) => void): Screen {
  const out = state.outgoing;
  if (!out) {
    queueMicrotask(() => go('send'));
    return { el: h('div') };
  }
  let sizeKey = 'M';
  let fps = 8;
  let auto = true;
  let laptop = false;
  let enc = new Encoder(out.bytes, out.meta, { chunkSize: SIZES[sizeKey] });
  let sent = 0;
  let raf = 0;
  let last = 0;

  const canvas = h('canvas', { class: 'qr' });
  const counter = h('div', { class: 'stat' });
  const modules = h('div', { class: 'stat' });
  const fpsSel = h('select', {}, ...[2, 4, 6, 8, 10, 12, 15, 20, 30].map((f) => h('option', { value: String(f) }, `${f} fps`)));
  const sizeSel = h('select', {}, ...Object.keys(SIZES).map((k) => h('option', { value: k }, `QR ${k} (${SIZES[k]} B)`)));
  const autoBtn = h('button', { class: 'btn small', onclick: () => setAuto(!auto) }, '');

  function applyControls() {
    fpsSel.value = String(fps);
    sizeSel.value = sizeKey;
    fpsSel.disabled = auto;
    sizeSel.disabled = auto;
    autoBtn.textContent = auto ? 'Defaults (QR M, 8 fps)' : 'Custom settings';
  }
  function setAuto(v: boolean) {
    auto = v;
    if (auto) { fps = 8; sizeKey = 'M'; resetEnc(); }
    applyControls();
  }
  function resetEnc() {
    enc = new Encoder(out!.bytes, out!.meta, { chunkSize: SIZES[sizeKey] });
  }
  fpsSel.addEventListener('change', () => { fps = Number(fpsSel.value); });
  sizeSel.addEventListener('change', () => { sizeKey = sizeSel.value; resetEnc(); });

  const avail = () => Math.floor(Math.min(window.innerWidth, laptop ? window.innerHeight : window.innerHeight * 0.65) * (window.devicePixelRatio || 1));
  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (t - last < 1000 / fps) return;
    last = t;
    const n = drawQr(canvas, enc.nextFrame(), Math.max(300, avail()));
    sent++;
    counter.textContent = `Packets sent: ${sent}`;
    modules.textContent = `K ${enc.K} | ${n}x${n} modules`;
  }

  const controls = h('div', { class: 'controls' }, counter, modules, autoBtn, fpsSel, sizeSel);
  const laptopBtn = h('button', { class: 'btn small', onclick: () => { laptop = !laptop; root.classList.toggle('laptop', laptop); laptopBtn.textContent = laptop ? 'Exit laptop mode' : 'Laptop mode'; } }, 'Laptop mode');
  const root = h(
    'div',
    { class: 'screen flash' },
    h('div', { class: 'top' }, h('button', { class: 'btn small', onclick: () => go('send') }, 'Stop'), laptopBtn),
    h('div', { class: 'qrwrap' }, canvas),
    controls
  );
  applyControls();
  raf = requestAnimationFrame(tick);
  let wake: { release(): Promise<void> } | null = null;
  (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((w) => (wake = w)).catch(() => {});
  return { el: root, destroy: () => { cancelAnimationFrame(raf); void wake?.release(); } };
}
