// Runs one profile/decoder/colour combination. Usage: node scripts/measure-one.mjs <profileIdx> <native|jsqr> [colour] [readers] [url]
import { chromium } from '@playwright/test';

const [idx, dec, col, readers] = [Number(process.argv[2]), process.argv[3], process.argv[4] === 'colour', Number(process.argv[5]) || undefined];
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/#bigloop';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(url);
await page.evaluate(() => { window.__bigTimeout = 60000; window.__bigMask = Number(new URL(location.href).searchParams.get('mask') ?? -2) === -2 ? undefined : Number(new URL(location.href).searchParams.get('mask')); });
const r = await page.evaluate(([i, d, c, n]) => window.__bigRunOne(i, d, c, n), [idx, dec, col, readers]);
console.log(JSON.stringify({ ...r, kbps: +r.kbps.toFixed(1), seconds: +r.seconds.toFixed(1), shownFps: +r.shownFps.toFixed(1), genMs: +r.genMs.toFixed(0), decodeMs: +r.decodeMs.toFixed(0) }));
await browser.close();
