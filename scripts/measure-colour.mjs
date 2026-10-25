// Measures the experimental colour mode through the real draw and decode path. Usage: node scripts/measure-colour.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/#bigloop');
for (const [idx, dec] of [[0, 'native'], [1, 'native'], [1, 'jsqr']]) {
  const r = await page.evaluate(([i, d]) => window.__bigRunOne(i, d, true), [idx, dec]);
  console.log(JSON.stringify({ ...r, kbps: Number(r.kbps.toFixed(1)), seconds: Number(r.seconds.toFixed(1)) }));
}
await browser.close();
