import { h, fmtSize, topBar, Screen } from '../ui/dom';
import { BigReceiver } from './bigreceiver';
import { fitCalibration, sampleQuadrants } from './channels';
import { PROFILES, profileById } from './profiles';
import { big } from './bigstate';
import { fmtDuration } from './throughput';

export function bigScanScreen(go: (to: string) => void): Screen {
  const video = h('video', { playsinline: 'true', muted: 'true', autoplay: 'true', class: 'cam' });
  video.muted = true;
  const pct = h('div', { class: 'stat big' }, '0%');
  const strip = h('div', { class: 'strip' });
  const rate = h('div', { class: 'stat' }, 'Rate: measuring');
  const msg = h('div', { class: 'stat' }, 'Point the camera at the sender screen.');
  const verdict = h('div', { class: 'verdict' });
  const dsel = h('select', {}, h('option', { value: 'auto' }, 'Decoder: auto (native if available)'), h('option', { value: 'native' }, 'Decoder: native'), h('option', { value: 'jsqr' }, 'Decoder: jsQR'));
  const psel = h('select', {}, ...PROFILES.map((p) => h('option', { value: p.id }, `Sender: ${p.label}`)));
  psel.value = big.profileId;
  let testMode = false;
  const testBtn = h('button', { class: 'btn small', onclick: () => { testMode = !testMode; testBtn.textContent = testMode ? 'Test pattern: on' : 'Test pattern'; verdict.textContent = ''; } }, 'Test pattern');
  const calBtn = h('button', { class: 'btn small', onclick: () => { wantCal = true; } }, 'Calibrate colour');
  const root = h('div', { class: 'screen scan' }, topBar('Receive big file', () => go('home')),
    h('div', { class: 'camwrap' }, video), verdict, pct, strip, rate, msg, dsel, psel, h('div', { class: 'controls' }, testBtn, calBtn));
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  let rx: BigReceiver | null = null;
  let stream: MediaStream | null = null;
  let alive = true;
  let wantCal = false;
  let cal: ReturnType<typeof fitCalibration> = null;

  async function setReader() {
    rx?.close();
    const prev = rx;
    rx = await new BigReceiver(true).init(dsel.value as 'auto' | 'native' | 'jsqr');
    if (prev) rx.dec = prev.dec;
    msg.textContent = `Decoder in use: ${rx.reader.name === 'native' ? 'native BarcodeDetector' : 'jsQR (worker)'}`;
  }
  dsel.addEventListener('change', () => void setReader());

  async function loop() {
    if (!alive || !rx) return;
    if (!rx.busy && video.videoWidth) {
      const scale = Math.min(1, 1920 / video.videoWidth);
      work.width = Math.round(video.videoWidth * scale);
      work.height = Math.round(video.videoHeight * scale);
      wctx.drawImage(video, 0, 0, work.width, work.height);
      let img = wctx.getImageData(0, 0, work.width, work.height);
      if (wantCal) {
        wantCal = false;
        cal = fitCalibration(sampleQuadrants(img.data, img.width, img.height));
        verdict.textContent = cal ? 'Colour calibrated' : 'Calibration failed: show the patches full screen';
      }
      const pf = profileById(psel.value);
      const s = await rx.feed(img, { cols: pf.cols, rows: pf.rows, color: big.color, cal: cal ?? undefined });
      img = null as unknown as ImageData;
      if (testMode) {
        const t = rx.test;
        if (t) {
          const p2 = PROFILES[t.profileIdx] ?? pf;
          const want = p2.cols * p2.rows;
          verdict.textContent = t.tiles >= want && (!t.color || t.layers >= 3) ? `I can read this: ${t.tiles}/${want} tiles${t.color ? ', 3 colour layers' : ''} at ${rx.fps.toFixed(1)} reads/s` : `Partly: ${t.tiles}/${want} tiles${t.color ? `, ${t.layers}/3 layers` : ''}. Move closer or pick a lower profile.`;
          verdict.className = t.tiles >= want ? 'verdict pass' : 'verdict fail';
        } else { verdict.textContent = 'No test pattern seen yet'; verdict.className = 'verdict'; }
      } else {
        const percent = Math.floor(s.progress * 100);
        pct.textContent = `${percent}%`;
        if (strip.children.length !== Math.min(s.gens, 200)) strip.replaceChildren(...Array.from({ length: Math.min(s.gens, 200) }, () => h('i', {})));
        [...strip.children].forEach((c, i) => ((c as HTMLElement).className = s.states[i] ?? ''));
        const bps = rx.est.rate();
        const rem = rx.est.remaining(s.totalBytes);
        rate.textContent = `${(bps / 1024).toFixed(1)} KB/s | ${rx.fps.toFixed(1)} frames/s | decode ${rx.avgDecodeMs.toFixed(0)} ms | ${rem === null ? 'time remaining: measuring' : `about ${fmtDuration(rem)} left`}`;
        if (s.manifest) msg.textContent = `${s.manifest.name}: ${s.doneGens}/${s.gens} generations, ${fmtSize(s.bytesDone)} of ${fmtSize(s.totalBytes)}`;
        if (s.complete && rx.dec.result) {
          big.result = rx.dec.result;
          navigator.vibrate?.([80, 60, 80]);
          go('bigdone');
          return;
        }
      }
    }
    requestAnimationFrame(() => void loop());
  }

  (async () => {
    try {
      await setReader();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play();
      void loop();
    } catch (e) {
      msg.textContent = `Camera unavailable: ${(e as Error).message}. HTTPS and camera permission are required.`;
    }
  })();
  return { el: root, destroy: () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); rx?.close(); } };
}
