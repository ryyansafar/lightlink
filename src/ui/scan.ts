import { h, topBar, Screen } from './dom';
import { Receiver } from './receiver';
import { state } from './state';
import { lowRateHint } from './hint';

export function scanScreen(go: (to: string) => void): Screen {
  const rx = new Receiver();
  const video = h('video', { playsinline: 'true', muted: 'true', autoplay: 'true', class: 'cam' });
  video.muted = true;
  const grid = h('canvas', { class: 'grid', width: 600, height: 300 });
  const bar = h('div', { class: 'bar' }, h('div', { class: 'fill' }));
  const pct = h('div', { class: 'stat big' }, '0%');
  const fpsEl = h('div', { class: 'stat' }, 'Decoded: 0 fps');
  const msg = h('div', { class: 'stat' }, 'Point the camera at the sender screen.');
  const hint = h('div', { class: 'hint', hidden: 'true' }, lowRateHint(0));
  const fail = h('div', { class: 'fail', hidden: 'true' });
  const started = performance.now();
  const root = h('div', { class: 'screen scan' }, topBar('Receive', () => go('home')), h('div', { class: 'camwrap' }, video), pct, bar, grid, fpsEl, msg, hint, fail);
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  let stream: MediaStream | null = null;
  let alive = true;
  let finished = false;

  function drawGrid(mask: boolean[], K: number) {
    const ctx = grid.getContext('2d')!;
    const W = grid.width, H = grid.height;
    ctx.clearRect(0, 0, W, H);
    if (!K) return;
    const cols = Math.ceil(Math.sqrt((K * W) / H));
    const rows = Math.ceil(K / cols);
    const cw = W / cols, ch = H / rows;
    for (let i = 0; i < K; i++) {
      ctx.fillStyle = mask[i] ? '#3ddc84' : '#2a2f36';
      ctx.fillRect((i % cols) * cw + 1, Math.floor(i / cols) * ch + 1, cw - 2, ch - 2);
    }
  }

  async function loop() {
    if (!alive) return;
    if (!finished && performance.now() - started > 6000 && rx.fps < 2) {
      hint.textContent = lowRateHint(rx.last.chunkSize);
      hint.hidden = false;
      fpsEl.textContent = `Decoded: ${rx.fps.toFixed(1)} fps | frames ${rx.frames}`;
    }
    if (!rx.scanner.busy && video.videoWidth) {
      // Dense QR (L) or a struggling decoder gets the full camera width; otherwise 800 px keeps it fast.
      const wide = rx.frameBytes > 700 || (performance.now() - started > 4000 && rx.fps < 2);
      const scale = Math.min(1, (wide ? 1280 : 800) / video.videoWidth);
      work.width = Math.round(video.videoWidth * scale);
      work.height = Math.round(video.videoHeight * scale);
      wctx.drawImage(video, 0, 0, work.width, work.height);
      const p = await rx.feed(wctx.getImageData(0, 0, work.width, work.height));
      if (p && !finished) {
        const need = Math.max(1, Math.ceil(p.K * 1.1));
        const percent = p.done ? 100 : Math.min(99, Math.floor((Math.min(1, p.received / need)) * 100));
        pct.textContent = `${percent}%`;
        (bar.firstChild as HTMLElement).style.width = `${percent}%`;
        fpsEl.textContent = `Decoded: ${rx.fps.toFixed(1)} fps | frames ${rx.frames}`;
        hint.hidden = true;
        msg.textContent = `${p.received} packets of about ${need} needed | ${p.solved} of ${p.K} chunks solved | ${((performance.now() - started) / 1000).toFixed(0)} s elapsed`;
        drawGrid(rx.decoder.solvedMask(), p.K);
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
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera API (needs HTTPS and a browser with camera support)');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play();
      void loop();
    } catch (e) {
      const err = e as Error;
      const denied = err.name === 'NotAllowedError' || err.name === 'SecurityError';
      const none = err.name === 'NotFoundError' || err.name === 'OverconstrainedError' || /no camera API/.test(err.message);
      for (const el of [msg, pct, bar, grid, fpsEl, video]) el.hidden = true;
      fail.hidden = false;
      fail.replaceChildren(
        h('b', {}, denied ? 'Camera access was blocked.' : none ? 'No camera found.' : 'Camera could not start.'),
        h('p', {}, denied ? 'Allow the camera for this site in the browser settings, then try again.' : none ? 'Use a device with a rear camera, or run the Loopback self-test to check the codec without one.' : err.message),
        h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again'),
        h('button', { class: 'btn small', onclick: () => go('loopback') }, 'Loopback self-test')
      );
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
