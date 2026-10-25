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

## Big files

The home screen has a "Big files" path (send and receive) next to the default Send and Receive, which are unchanged. It adds 1 MB generations (flat memory, per-generation and whole-file SHA-256, pause and resume via IndexedDB), deflate for compressible types, selectable profiles with a one-tap test pattern, multi-QR tiling, native BarcodeDetector decoding with a jsQR fallback, an experimental colour mode (three QR layers in R, G, B), a live KB/s and time-remaining readout, and a pre-flight estimate. How it works: [docs/EXPLAIN.md](docs/EXPLAIN.md).

### Measured on one device (Big loopback)

Each profile sends a generated 192 KB payload (three 64 KB generations) through the real tile draw and the real decoder, on one machine, with no camera in between. That makes these numbers a decode-and-draw-limited upper bound; a real camera is slower and was not measured. Chromium 156 (headless) on a Mac, one run per row, 2026-10-25, via `node scripts/measure-big.mjs` after `npm run build` and `npx vite preview --port 4173`. Canvas: 1280x800 safe, 1920x1200 fast, 2560x1600 max. Rate is payload bytes over total time (draw and decode run one after the other here; in real use the sender and receiver run in parallel).

| Profile | Decoder | Result | KB/s | Draw ms/frame | Decode ms/frame |
|---|---|---|---|---|---|
| Phone to phone (safe), 1 x QR v15, 8 fps | BarcodeDetector | PASS | 7.5 | 11 | 20 |
| Phone to phone (safe) | jsQR | PASS | 7.8 | 9 | 31 |
| Laptop to phone (fast), 2 x QR v30, 15 fps | BarcodeDetector | PASS | 11.3 | 59 | 46 |
| Laptop to phone (fast) | jsQR | PASS | 11.9 | 59 | 118 |
| Laptop to phone (max), 6 x QR v40, 30 fps | BarcodeDetector | PASS | 17.5 | 267 | 124 |
| Laptop to phone (max) | jsQR | PASS | 14.1 | 292 | 421 |

Colour mode (experimental, same method, `node scripts/measure-colour.mjs`; pixels are exact here, a real camera adds channel crosstalk that was not tested):

| Profile | Decoder | Result | KB/s |
|---|---|---|---|
| safe + colour | BarcodeDetector | PASS | 10.2 |
| fast + colour | BarcodeDetector | PASS | 17.8 |
| fast + colour | jsQR | PASS | 9.8 |

What these numbers say. The fountain code is not the limit. The limit is drawing and reading QR codes in JavaScript: at "max" the sender spends about 270 ms per frame generating six v40 codes, so the 30 fps target is not reached (about 4 frames/s drawn). Frame rates above that need faster QR generation (for example generating tiles in worker threads), which is not built yet.

### What size is practical

Using the measured loopback rates above as an optimistic ceiling (about 8 to 18 KB/s) and assuming no losses:

| Size | At 8 KB/s | At 18 KB/s |
|---|---|---|
| 1 MB | about 2 min | about 1 min |
| 10 MB | about 21 min | about 10 min |
| 50 MB | about 1.8 h | about 49 min |
| 100 MB | about 3.6 h | about 1.6 h |

So: up to roughly 10 MB is practical with "fast" or "max" from a laptop screen; 10 to 50 MB works but takes the better part of an hour or more; 100 MB is supported by the design (generations stream through Blobs and IndexedDB, nothing holds the whole file) but is not practical at these rates. The phone-to-phone "safe" profile is for files up to a few MB. The app's pre-flight estimate uses the rate the Big loopback measured on the sending device, and says "unknown" if you have not run it. Real camera rates will be lower than these loopback rates.

Browser support: BarcodeDetector is used where present (Chromium on desktop and Android). iOS Safari lacks BarcodeDetector, so jsQR is used there, which is the slower column above. In the native column, frames are sent as text-safe characters (see docs/EXPLAIN.md), a 14.3% size cost that both decoders pay.

## Run it

```
npm install
npm run dev            # vite dev server (the camera needs HTTPS or localhost)
npm test               # vitest, codec
npm run build          # typecheck + production build
npx playwright install chromium
npm run test:e2e       # run `npm run build` first; serves dist with vite preview
npm run bench          # codec overhead benchmark
node scripts/measure-big.mjs   # measured table for every Big files profile and decoder (needs `npm run build` and `npx vite preview --port 4173`)
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
