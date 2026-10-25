# LightLink

Send a file between two phones using only the screen and the camera. The sender plays an animated stream of QR codes (a fountain code). The receiver points its camera at it. No internet, no Bluetooth, no cables. Works in airplane mode once the app has been opened once and cached.

Status: hackathon build (v0.1.0). Codec in `src/codec/`, PWA in `src/ui/`, end-to-end tests in `e2e/`.

Live: https://lightlink-liart.vercel.app (the camera needs HTTPS; the build in `dist/` is a plain static site and works from any HTTPS host).

| Home | Sender | Receiver | Done |
|---|---|---|---|
| ![home](docs/screenshots/mobile-home.png) | ![flash](docs/screenshots/mobile-flash.png) | ![receive](docs/screenshots/mobile-receive.png) | ![done](docs/screenshots/mobile-done.png) |

More captures (desktop, camera denied, no camera, low decode rate, loopback) are in `docs/screenshots/`.

## How it works, in plain words

1. The sender cuts the file into equal chunks (500 bytes by default, the QR M size; QR S is 250 and QR L is 900).
2. It then makes an endless stream of packets. Each packet is the XOR of a few randomly chosen chunks, plus a small header (transfer id, chunk count, packet seed, CRC-32). That is a fountain code (an LT code).
3. Each packet is drawn as one QR code (byte mode, error correction L) and the codes are shown as a video.
4. The receiver reads QR codes from the camera (jsQR in a Web Worker). It does not matter which packets it misses. Once it has seen slightly more packets than there are chunks (measured average about 1.06x at K around 100), it can solve for every chunk: first by peeling, then by Gaussian elimination over GF(2) for the stubborn last part.
5. A 4 emoji fingerprint of the SHA-256 of the file is shown on both phones. If they match, the bytes match.

Because any packet is as good as any other, covering the screen for a few seconds, bad focus or a late start only delay the transfer. Nothing needs to be re-sent. If the sender restarts or changes the QR size, the receiver follows the new transfer after a few valid packets.

## Measured numbers

All measured on one MacBook, headless Chromium, driven by Playwright, in October 2026. Rows marked "single run" are one run each and vary from run to run, so read them as order of magnitude, not benchmarks. The "camera" is a canvas capture stream of the sender page, so these are decode-limited upper bounds, not real camera throughput. Real phone-to-phone throughput has not been measured yet.

| Test | Result |
|---|---|
| Codec unit tests | 22 pass. Overhead about 1.06x at K=100 (the test asserts under 1.25 over 200 seeds) |
| 20 KB random file, 20 fps | single run: 4.2 s, bytes and fingerprint equal |
| 30 KB, QR size S (250 B chunks), 15 fps | single run: 10.5 s, equal |
| 30 KB, QR size L (900 B chunks), 15 fps | 5.0 s in one run, 91.8 s in a later run on the same MacBook (cause not isolated; other jobs were running on the machine), equal |
| 60 KB with the sender covered for 3 s mid-transfer | completes, equal |
| PDF, PNG, vCard | complete, byte for byte equal, fingerprint equal |
| 1 MB random file, QR L, 30 fps | single run: 70.9 s (about 14.4 KB/s), equal |
| Loopback self-test, 100 KB | PASS, 8 to 9 s across runs (about 11 to 12 KB/s), headless Chromium on a Mac, synthetic canvas camera, Oct 2026 |
| Offline after first load | home screen and loopback work with the network switched off |

## Big files

The home screen has a "Big files" path (send and receive) next to the default Send and Receive, which are unchanged. It adds 1 MB generations (flat memory, per-generation and whole-file SHA-256, pause and resume via IndexedDB), deflate for compressible types, selectable profiles with a one-tap test pattern, multi-QR tiling, native BarcodeDetector decoding with a jsQR fallback, an experimental colour mode (three QR layers in R, G, B), a live KB/s and time-remaining readout, and a pre-flight estimate. How it works: [docs/EXPLAIN.md](docs/EXPLAIN.md).

### Measured on one device (Big loopback)

Each profile sends a generated 192 KB payload (three 64 KB generations) through the real pipeline on one machine, with no camera in between: the sender draws frames in a pool of 4 Web Workers into a buffer ahead of display, a display clock shows one frame every 1/fps seconds, and the receiver hands the newest shown frame to a pool of 4 decode workers (BarcodeDetector inside a worker, or jsQR), dropping the frame when every worker is busy and never queueing. Decoding runs in parallel with drawing. Pixels are exact, so these numbers are an upper bound: a real camera adds blur, perspective, exposure and rolling shutter and was not measured. Chromium 156 (headless) on an 8-core Mac, one run per row, 2026-10-25, via `node scripts/measure-big.mjs` after `npm run build` and `npx vite preview`. Canvas: 1280x800 safe, 1920x1200 fast, 2560x1600 max. Rate is payload bytes over total time, including start-up, so short runs are noisy (the fast and max rows finish in about 5 to 7 s).

| Profile | Decoder | Result | KB/s | Frames shown per s | Generate ms/frame (per worker) | Decode ms/read | Frames dropped |
|---|---|---|---|---|---|---|---|
| Phone to phone (safe), 1 x QR v15, 8 fps | BarcodeDetector (worker) | PASS | 2.6 | 8.0 of 8 | 2 | 17 | 0 |
| Phone to phone (safe) | jsQR (worker) | PASS | 2.6 | 8.0 of 8 | 2 | 27 | 0 |
| Laptop to phone (fast), 2 x QR v30, 15 fps | BarcodeDetector (worker) | PASS | 31.0 | 14.9 of 15 | 10 | 37 | 0 |
| Laptop to phone (fast) | jsQR (worker) | PASS | 30.7 | 14.9 of 15 | 12 | 114 | 0 |
| Laptop to phone (max), 6 x QR v40, 30 fps | BarcodeDetector (worker) | PASS | 41.5 | 29.4 of 30 | 48 | 404 | 92 |
| Laptop to phone (max) | jsQR (worker) | PASS | 27.9 | 29.4 of 30 | 66 | 589 | 158 |

Colour mode (experimental, same method, `node scripts/measure-colour.mjs`; pixels are exact here, a real camera adds channel crosstalk that was not tested):

| Profile | Decoder | Result | KB/s | Frames shown per s |
|---|---|---|---|---|
| safe + colour | BarcodeDetector (worker) | PASS | 7.8 | 8.0 of 8 |
| fast + colour | BarcodeDetector (worker) | PASS | 41.7 | 14.5 of 15 |
| fast + colour | jsQR (worker) | PASS | 28.7 | 14.8 of 15 |

Before and after, same machine and payload (the "before" run drew and decoded one frame after the other on the main thread, with no display clock, and is the table this one replaces): fast 11.3 (BarcodeDetector) and 11.9 (jsQR) KB/s became 31.0 and 30.7; max 17.5 and 14.1 became 41.5 and 27.9; colour fast 17.8 and 9.8 became 41.7 and 28.7. The safe profile went from 7.5 and 7.8 to 2.6 on purpose, not because anything got slower: the old loop ran unpaced at about 32 frames per second, far above the 8 fps the safe profile promises a phone camera, while the new loop shows frames at the profile rate. At 8 fps the safe ceiling is 2.6 KB/s (one 424-byte payload per frame, 8 frames a second, divided by the 1.25 fountain budget), and the measurement matches it.

What changed and why it is faster. (1) QR generation was the sender bottleneck: about 118 ms for one v40 code, because the QR library scores all eight mask patterns and builds the code nine times. LightLink now vendors that library with one fixed mask (`src/boost/vendor/qrcode.js`, MIT, change noted in the file header): about 13 ms per v40 code measured in node, 9 times faster, and every profile still decodes (`fastframe.test.ts`). (2) Frames are generated ahead in a pool of 2 to 4 workers (from `navigator.hardwareConcurrency`) into a ring of finished bitmaps, so the main thread only draws a ready bitmap; "max" now shows 29.4 of 30 fps, "fast" 14.9 of 15, "safe" 8.0 of 8. A per-worker cost of 48 to 66 ms for six v40 codes, spread over 4 workers, is why the target rate holds. (3) The receiver decodes in a worker pool and drops frames rather than queueing. At "max" it now drops 92 to 158 shown frames per run because decoding six v40 codes takes 400 to 590 ms per frame per worker with 4 workers; that is the remaining limit, and the fountain code absorbs the drops.

Wasted bytes, measured from the code (`src/boost/profiles.ts`). Text-safe transport costs 14.3% of every QR (6 bytes become 7 characters, see docs/EXPLAIN.md). The frame header and CRC are 21 bytes: 4.7% of a safe frame, 1.4% of fast, 0.8% of max. Net payload per QR character: 81.5% (v15), 84.5% (v30), 85.0% (v40). The sender's fountain budget is 1.25x the chunks of a generation before it moves on, which is why the ceiling divides by 1.25. Error correction stays at level L: with exact pixels it carries the most payload (v40: 2953 characters at L against 2331 at M, 21% less), and the loopback cannot show what a camera needs, so no level was tuned against a camera. Short frames (manifests) are now padded with pseudo-random filler to full length, because BarcodeDetector could not read a mostly empty v40 code, which stalled native decoding (found while building this, fixed in `src/codec/frame.ts` by an optional pad that the default Send path does not use).

### What size is practical

Using the measured loopback rates above as an optimistic ceiling and assuming no losses (about 2.6 KB/s for safe, 31 KB/s for fast and 41 KB/s for max, taking the lower decoder for fast and the higher for max):

| Size | Safe at 2.6 KB/s | Fast at 31 KB/s | Max at 41 KB/s |
|---|---|---|---|
| 1 MB | about 7 min | about 33 s | about 25 s |
| 10 MB | about 65 min | about 6 min | about 4 min |
| 50 MB | about 5.4 h | about 28 min | about 21 min |
| 100 MB | about 10.9 h | about 56 min | about 41 min |

So: up to roughly 10 MB is practical with "fast" or "max" from a laptop screen (a few minutes in the loopback, longer with a real camera); 50 MB takes the better part of an hour; 100 MB is supported by the design (generations stream through Blobs and IndexedDB, nothing holds the whole file) but is a long session. The phone-to-phone "safe" profile is for files up to a few MB at most. In the app, the Big files send screen shows a "60-second budget": once a rate is measured it says the largest file that fits in about a minute and the time for the picked file, and before that it says "unknown until you run the test pattern". The rate comes from the receiver's test pattern (codes read per second, capped by what the sender can show, minus the fountain budget) when the same device ran it, else from the loopback on that device. What a real camera will change: it can read only as many frames as its sensor and exposure allow (a 30 fps camera sees at most 30 frames per second and often fewer in low light), screen glare and moire cost reads, and a hand-held phone moves, so expect real rates well below the loopback column; the numbers above should be quoted as a ceiling, not a promise.

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

Streaming a file as animated QR codes is not new, and neither are fountain codes. Existing projects include txqr, qrstream, Decimen Optical (animated QR with fountain coding) and Cimbar (a colour-barcode project that reaches much higher throughput). LightLink does not claim the technique.

What is different here is packaging and verification:

- Zero install: a web page that works offline on any phone after one visit.
- A 4-emoji fingerprint of the file's SHA-256, shown on both screens.
- A loopback self-test that pushes a file through the real draw and decode path on one device.
- A browser test suite (Playwright) that exercises the real QR draw and decode path, not only the codec.
- Peeling followed by a GF(2) elimination fallback (measured overhead is in the table above).
