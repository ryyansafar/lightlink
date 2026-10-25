# LightLink

Send a file between two phones using only the screen and the camera. The sender plays an animated stream of QR codes (a fountain code). The receiver points its camera at it. No internet, no Bluetooth, no cables. Works in airplane mode once the app has been opened once and cached.

Status: hackathon build (v0.1.0). Codec in `src/codec/`, PWA in `src/ui/`, end-to-end tests in `e2e/`.

Live (may 404, see below): https://ryyansafar.site/lightlink/ (GitHub Pages, deployed by `.github/workflows/pages.yml`). The camera needs HTTPS. The account-level custom domain may route `/lightlink/` to the portfolio host, so this URL can 404; the build in `dist/` is a plain static site and works from any HTTPS host.

| Home | Sender | Receiver | Done |
|---|---|---|---|
| ![home](docs/screenshots/mobile-home.png) | ![flash](docs/screenshots/mobile-flash.png) | ![receive](docs/screenshots/mobile-receive.png) | ![done](docs/screenshots/mobile-done.png) |

More captures (desktop, camera denied, no camera, low decode rate, loopback) are in `docs/screenshots/`.

## How it works, in plain words

1. The sender cuts the file into equal chunks (500 bytes by default).
2. It then makes an endless stream of packets. Each packet is the XOR of a few randomly chosen chunks, plus a small header (transfer id, chunk count, packet seed, CRC-32). That is a fountain code (an LT code).
3. Each packet is drawn as one QR code (byte mode, error correction L) and the codes are shown as a video.
4. The receiver reads QR codes from the camera (jsQR in a Web Worker). It does not matter which packets it misses. Once it has seen slightly more packets than there are chunks (measured average about 1.06x at K around 100), it can solve for every chunk: first by peeling, then by Gaussian elimination over GF(2) for the stubborn last part.
5. A 4 emoji fingerprint of the SHA-256 of the file is shown on both phones. If they match, the bytes match.

Because any packet is as good as any other, covering the screen for a few seconds, bad focus or a late start only delay the transfer. Nothing needs to be re-sent. If the sender restarts or changes the QR size, the receiver follows the new transfer after a few valid packets.

## Measured numbers

All measured on one MacBook, headless Chromium, driven by Playwright. The "camera" is a canvas capture stream of the sender page, so these are decode-limited upper bounds, not real camera throughput. Real phone-to-phone throughput has not been measured yet.

| Test | Result |
|---|---|
| Codec unit tests | 22 pass. Overhead about 1.06x at K=100 (the test asserts under 1.25 over 200 seeds) |
| 20 KB random file, 20 fps | 4.2 s, bytes and fingerprint equal |
| 30 KB, QR size S (250 B chunks), 15 fps | 10.5 s, equal |
| 30 KB, QR size L (900 B chunks), 15 fps | 5.0 s, equal |
| 60 KB with the sender covered for 3 s mid-transfer | completes, equal |
| PDF, PNG, vCard | complete, byte for byte equal, fingerprint equal |
| 1 MB random file, QR L, 30 fps | 70.9 s (about 14.4 KB/s), equal |
| Loopback self-test, 100 KB | PASS, 8 to 9 s across runs (about 11 to 12 KB/s), headless Chromium on a Mac, synthetic canvas camera, Oct 2026 |
| Offline after first load | home screen and loopback work with the network switched off |

## Run it

```
npm install
npm run dev            # vite dev server (the camera needs HTTPS or localhost)
npm test               # vitest, codec
npm run build          # typecheck + production build
npx playwright install chromium
npm run test:e2e       # run `npm run build` first; serves dist with vite preview
npm run bench          # codec overhead benchmark
npm run screenshots    # regenerate docs/screenshots (needs `npx vite preview --port 4173` running)
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build and the e2e suite (the 1 MB test is skipped in CI).

Docs: [3-minute demo script](docs/DEMO.md), [how to explain it and judge Q&A](docs/EXPLAIN.md).

## Limits

- Throughput is a few KB/s to low tens of KB/s. It is for small files: contacts, PDFs, photos, notes. A 1 MB file took about 71 s in the synthetic test and will likely take longer with real cameras.
- Both screens need decent brightness, a steady hold and no heavy glare. A low decode rate shows a hint on the receiver.
- Not yet tested on real iOS Safari or Android Chrome cameras in this repo. The camera API needs HTTPS (or localhost).
- Chunk count is a 16-bit field (65,535 max), far beyond what is practical.
- No encryption or authentication. The fingerprint catches corruption and mix-ups. Anyone who can film the screen can get the file.
- The sender must stay in the app and awake (a screen wake lock is requested where supported).

## Links

- Portfolio: https://ryyansafar.site
- GitHub: https://github.com/ryyansafar
- Buy me a coffee: https://buymeacoffee.com/ryyansafar
- PayPal: https://www.paypal.com/paypalme/ryyansafar
- Razorpay: https://razorpay.me/@ryyansafar

## Real-camera status

No transfer has yet been run through a physical phone camera; every number above is from a synthetic canvas camera in headless Chromium. The 1 MB / 14.4 KB/s figure uses QR L at 30 fps and is laptop-to-laptop only. For phones use the defaults (QR M, 8 fps); if the receiver shows the low decode rate hint, ask the sender for QR S and a lower fps. The receiver reads the camera at 800 px wide and switches to 1280 px for dense QR codes or when decoding is slow.

## Prior art

Streaming QR codes with fountain codes is not new: see txqr, qrstream and Cimbar. LightLink's difference is packaging and verification: a zero-install PWA that works offline on both phones, a GF(2) fallback after peeling (measured overhead is in the table), a 4-emoji fingerprint shown on both screens, a loopback self-test, and a Playwright suite that exercises the real QR draw and decode path.
