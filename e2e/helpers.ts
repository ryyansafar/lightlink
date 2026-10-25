import { createHash } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';

/** Receiver side: getUserMedia returns a canvas capture stream fed by the sender page over BroadcastChannel. */
export const RECEIVER_INIT = `
(() => {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const ch = new BroadcastChannel('lightlink-test-cam');
  window.__covered = false;
  ch.onmessage = (e) => {
    if (window.__covered) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); e.data.close?.(); return; }
    const b = e.data;
    const s = Math.min(cv.width / b.width, cv.height / b.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(b, (cv.width - b.width * s) / 2, (cv.height - b.height * s) / 2, b.width * s, b.height * s);
    b.close();
  };
  navigator.mediaDevices.getUserMedia = async () => cv.captureStream(30);
})();`;

/** Sender side: publish the visible QR canvas as a bitmap every 40 ms. */
export const SENDER_INIT = `
(() => {
  const ch = new BroadcastChannel('lightlink-test-cam');
  setInterval(async () => {
    const c = document.querySelector('canvas.qr');
    if (!c || !c.width) return;
    ch.postMessage(await createImageBitmap(c));
  }, 40);
})();`;

export async function pair(context: BrowserContext): Promise<{ sender: Page; receiver: Page }> {
  const sender = await context.newPage();
  const receiver = await context.newPage();
  await sender.addInitScript(SENDER_INIT);
  await receiver.addInitScript(RECEIVER_INIT);
  return { sender, receiver };
}

export const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

export function pseudoRandom(n: number, seed = 1): Buffer {
  const out = Buffer.alloc(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out[i] = x & 255;
  }
  return out;
}

export interface Transfer { ms: number; received: Buffer; fpSend: string; fpRecv: string; name: string }

export async function sendReceive(
  context: BrowserContext,
  file: { name: string; mimeType: string; buffer: Buffer },
  opts: { fps?: number; size?: 'S' | 'M' | 'L'; coverMs?: number; timeout?: number } = {}
): Promise<Transfer> {
  const { sender, receiver } = await pair(context);
  await receiver.goto('/#receive', { waitUntil: 'domcontentloaded' });
  await sender.goto('/#send', { waitUntil: 'domcontentloaded' });
  await sender.setInputFiles('input.file', file);
  await sender.waitForFunction(() => (document.querySelector('.fp')?.textContent ?? '').length > 2);
  const fpSend = (await sender.textContent('.fp'))!;
  await sender.click('text=Start');
  await sender.waitForSelector('canvas.qr');
  if (opts.fps || opts.size) {
    await sender.click('text=Auto: on');
    if (opts.fps) await sender.selectOption('select >> nth=0', String(opts.fps));
    if (opts.size) await sender.selectOption('select >> nth=1', opts.size);
  }
  const t0 = Date.now();
  if (opts.coverMs) {
    await receiver.waitForFunction(() => Number(/frames (\d+)/.exec(document.body.innerText)?.[1] ?? 0) >= 20, null, { timeout: 60_000 });
    await receiver.evaluate(() => { (window as any).__covered = true; });
    await receiver.waitForTimeout(opts.coverMs);
    await receiver.evaluate(() => { (window as any).__covered = false; });
  }
  await receiver.waitForSelector('text=Received', { timeout: opts.timeout ?? 150_000 });
  const ms = Date.now() - t0;
  const fpRecv = (await receiver.textContent('.fp'))!;
  const name = (await receiver.textContent('.info .row b'))!;
  const [dl] = await Promise.all([receiver.waitForEvent('download'), receiver.click('text=Save / Share')]);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  const received = readFileSync(path!);
  await sender.close();
  await receiver.close();
  return { ms, received, fpSend, fpRecv, name };
}
