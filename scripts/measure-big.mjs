// Runs the Big loopback screen in Chromium and prints the measured table. Usage: node scripts/measure-big.mjs [url] [--headed]
import { chromium } from '@playwright/test';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/#bigloop';
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(url);
console.log('BarcodeDetector present:', await page.evaluate(() => 'BarcodeDetector' in window));
console.log('UA:', await page.evaluate(() => navigator.userAgent));
if (process.argv.includes('--colour')) await page.check('input[type=checkbox]');
await page.click('#bigloop-run');
const poll = setInterval(async () => {
  try { console.log('...', await page.textContent('.info')); } catch { /* page closed */ }
}, 10000);
await page.waitForFunction(() => window.__bigLoopDone === true, null, { timeout: 25 * 60 * 1000 });
clearInterval(poll);
console.log(await page.textContent('#bigloop-table'));
console.log(JSON.stringify(await page.evaluate(() => window.__bigLoop)));
await browser.close();
