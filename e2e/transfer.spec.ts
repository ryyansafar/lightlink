import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pseudoRandom, sendReceive, sha } from './helpers';

function check(t: Awaited<ReturnType<typeof sendReceive>>, orig: Buffer) {
  expect(t.received.length).toBe(orig.length);
  expect(sha(t.received)).toBe(sha(orig));
  expect(t.fpRecv).toBe(t.fpSend);
}

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + 'x'.repeat(30000));

test('20 KB random file, send to receive', async ({ context }) => {
  const buf = pseudoRandom(20_000, 7);
  const t = await sendReceive(context, { name: 'r.bin', mimeType: 'application/octet-stream', buffer: buf }, { fps: 20 });
  check(t, buf);
  console.log(`20 KB: ${(t.ms / 1000).toFixed(1)} s`);
});

test('cover the sender for 3 seconds mid-transfer', async ({ context }) => {
  const buf = pseudoRandom(60_000, 3);
  const t = await sendReceive(context, { name: 'c.bin', mimeType: 'application/octet-stream', buffer: buf }, { fps: 15, coverMs: 3000 });
  check(t, buf);
  console.log(`60 KB with 3 s cover: ${(t.ms / 1000).toFixed(1)} s`);
});

for (const size of ['S', 'L'] as const) {
  test(`QR size ${size}`, async ({ context }) => {
    const buf = pseudoRandom(30_000, 11);
    const t = await sendReceive(context, { name: `s${size}.bin`, mimeType: 'application/octet-stream', buffer: buf }, { fps: 15, size });
    check(t, buf);
    console.log(`30 KB size ${size}: ${(t.ms / 1000).toFixed(1)} s`);
  });
}

test('PDF', async ({ context }) => {
  const t = await sendReceive(context, { name: 'doc.pdf', mimeType: 'application/pdf', buffer: PDF }, { fps: 15 });
  check(t, PDF);
  expect(t.name).toBe('doc.pdf');
});

test('PNG', async ({ context }) => {
  const t = await sendReceive(context, { name: 'p.png', mimeType: 'image/png', buffer: PNG }, { fps: 15 });
  check(t, PNG);
});

test('vCard made in the app', async ({ context, browser }) => {
  const sender = await context.newPage();
  await sender.goto('/#send');
  await sender.fill('input[type=text]', 'Ada Lovelace');
  await sender.fill('input[type=tel]', '+91 99999 00000');
  await sender.fill('input[type=email]', 'ada@example.com');
  await sender.click('text=Make contact card');
  await sender.waitForFunction(() => (document.querySelector('.fp')?.textContent ?? '').length > 2);
  const fpSend = (await sender.textContent('.fp'))!;
  await sender.close();
  const card = Buffer.from('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nN:Ada Lovelace;;;;\r\nTEL;TYPE=CELL:+91 99999 00000\r\nEMAIL:ada@example.com\r\nEND:VCARD\r\n');
  const t = await sendReceive(context, { name: 'Ada Lovelace.vcf', mimeType: 'text/vcard', buffer: card }, { fps: 15 });
  check(t, card);
  expect(t.fpSend).toBe(fpSend);
});

test('1 MB file, timed', async ({ context }) => {
  test.skip(!!process.env.LIGHTLINK_SKIP_BIG, 'skipped in CI');
  test.setTimeout(600_000);
  const buf = pseudoRandom(1_048_576, 5);
  const t = await sendReceive(context, { name: '1mb.bin', mimeType: 'application/octet-stream', buffer: buf }, { fps: 30, size: 'L', timeout: 550_000 });
  check(t, buf);
  console.log(`1 MB (QR L, 30 fps): ${(t.ms / 1000).toFixed(1)} s, ${(1048576 / 1024 / (t.ms / 1000)).toFixed(1)} KB/s`);
});

test('loopback self-test passes', async ({ page }) => {
  await page.goto('/#loopback');
  await page.click('text=Run self-test');
  await expect(page.locator('.verdict')).toHaveText('PASS', { timeout: 120_000 });
  console.log('loopback:', await page.locator('.screen').innerText());
});

test('works offline after first load', async ({ context, page }) => {
  await page.goto('/');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active != null && (await caches.keys()).length > 0);
  await page.waitForSelector('.badge.ok');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('LightLink');
  await page.goto('/#loopback');
  await page.reload();
  await page.click('text=Run self-test');
  await expect(page.locator('.verdict')).toHaveText('PASS', { timeout: 120_000 });
  await context.setOffline(false);
});
