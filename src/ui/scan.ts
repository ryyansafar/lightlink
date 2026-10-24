import { h, topBar, Screen } from './dom';
import { Receiver } from './receiver';
import { state } from './state';

export function scanScreen(go: (to: string) => void): Screen {
  const rx = new Receiver();
  const video = h('video', { playsinline: 'true', muted: 'true', autoplay: 'true', class: 'cam' });
  video.muted = true;
  const grid = h('canvas', { class: 'grid', width: 600, height: 300 });
  const bar = h('div', { class: 'bar' }, h('div', { class: 'fill' }));
  const pct = h('div', { class: 'stat big' }, '0%');
  const fpsEl = h('div', { class: 'stat' }, 'Decoded: 0 fps');
  const msg = h('div', { class: 'stat' }, 'Point the camera at the sender screen.');
  const root = h('div', { class: 'screen scan' }, topBar('Receive', () => go('home')), h('div', { class: 'camwrap' }, video), pct, bar, grid, fpsEl, msg);
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  let stream: MediaStream | null = null;
  let alive = true;
  let finished = false;

  function drawGrid(solved: number, K: number) {
    const ctx = grid.getContext('2d')!;
    const W = grid.width, H = grid.height;
    ctx.clearRect(0, 0, W, H);
    if (!K) return;
    const cols = Math.ceil(Math.sqrt((K * W) / H));
    const rows = Math.ceil(K / cols);
    const cw = W / cols, ch = H / rows;
    for (let i = 0; i < K; i++) {
      ctx.fillStyle = i < solved ? '#3ddc84' : '#2a2f36';
      ctx.fillRect((i % cols) * cw + 1, Math.floor(i / cols) * ch + 1, cw - 2, ch - 2);
    }
  }

  async function loop() {
    if (!alive) return;
    if (!rx.scanner.busy && video.videoWidth) {
      const scale = Math.min(1, 800 / video.videoWidth);
      work.width = Math.round(video.videoWidth * scale);
      work.height = Math.round(video.videoHeight * scale);
      wctx.drawImage(video, 0, 0, work.width, work.height);
      const p = await rx.feed(wctx.getImageData(0, 0, work.width, work.height));
      if (p && !finished) {
        const percent = Math.floor(p.progress * 100);
        pct.textContent = `${percent}%`;
        (bar.firstChild as HTMLElement).style.width = `${percent}%`;
        fpsEl.textContent = `Decoded: ${rx.fps.toFixed(1)} fps | frames ${rx.frames}`;
        msg.textContent = `${p.solved} of ${p.K} chunks resolved`;
        drawGrid(p.solved, p.K);
        if (p.done) {
          const r = rx.decoder.result();
          if (r) {
            finished = true;
            state.incoming = r;
            root.classList.add('flashgreen');
            navigator.vibrate?.([80, 60, 80]);
            setTimeout(() => go('done'), 450);
            return;
          }
        }
      }
    }
    requestAnimationFrame(() => void loop());
  }

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play();
      void loop();
    } catch (e) {
      msg.textContent = `Camera unavailable: ${(e as Error).message}. HTTPS and camera permission are required.`;
    }
  })();

  return {
    el: root,
    destroy: () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
      rx.close();
    },
  };
}
