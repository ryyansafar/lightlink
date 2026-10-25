// Usage: npm run build && npx vite preview --port 4173 &  npm run screenshots
import { chromium } from '@playwright/test';
import { RECEIVER_INIT, SENDER_INIT, pseudoRandom } from '../e2e/helpers';

const base = process.env.BASE ?? 'http://127.0.0.1:4173';
const sizes = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } } as const;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
for (const [name, viewport] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, permissions: ['camera'] });
  const shot = (p: import('@playwright/test').Page, n: string) => p.screenshot({ path: `docs/screenshots/${name}-${n}.png` });
  const s = await ctx.newPage();
  await s.addInitScript(SENDER_INIT);
  await s.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await s.waitForSelector('.badge.ok', { timeout: 10000 }).catch(() => {});
  await shot(s, 'home');
  await s.goto(`${base}/#send`);
  await s.setInputFiles('input.file', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: pseudoRandom(40000, 2) });
  await s.waitForFunction(() => (document.querySelector('.fp')?.textContent ?? '').length > 2);
  await shot(s, 'send');
  await s.click('text=Start');
  await s.waitForTimeout(800);
  await shot(s, 'flash');
  const r = await ctx.newPage();
  await r.addInitScript(RECEIVER_INIT);
  await r.goto(`${base}/#receive`, { waitUntil: 'domcontentloaded' });
  await r.waitForTimeout(2500);
  await shot(r, 'receive');
  await r.waitForSelector('text=Received', { timeout: 120000 });
  await shot(r, 'done');
  // camera denied / no camera
  const d = await ctx.newPage();
  await d.addInitScript(`navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));`);
  await d.goto(`${base}/#receive`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('.fail:not([hidden])');
  await shot(d, 'camera-denied');
  const n = await ctx.newPage();
  await n.addInitScript(`Object.defineProperty(navigator, 'mediaDevices', { value: undefined });`);
  await n.goto(`${base}/#receive`, { waitUntil: 'domcontentloaded' });
  await n.waitForSelector('.fail:not([hidden])');
  await shot(n, 'no-camera');
  // low decode rate hint: camera shows a black frame
  const l = await ctx.newPage();
  await l.addInitScript(`(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d'); let t = 0; setInterval(() => { x.fillStyle = t++ % 2 ? '#111' : '#161616'; x.fillRect(0,0,640,480); }, 50); navigator.mediaDevices.getUserMedia = async () => c.captureStream(15); })();`);
  await l.goto(`${base}/#receive`, { waitUntil: 'domcontentloaded' });
  await l.waitForSelector('.hint:not([hidden])', { timeout: 15000 });
  await shot(l, 'low-rate');
  const lb = await ctx.newPage();
  await lb.goto(`${base}/#loopback`);
  await lb.click('text=Run self-test');
  await lb.waitForSelector('.verdict', { timeout: 120000 });
  await shot(lb, 'loopback');
  await ctx.close();
}
await browser.close();
