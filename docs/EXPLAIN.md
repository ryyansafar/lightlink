# Explaining LightLink

## 30-second spoken pitch

"You are somewhere with no signal, and you want to hand someone a file. LightLink turns the file into a flickering stream of QR codes on your screen. The other phone just looks at it with its camera and rebuilds the file. No internet, no Bluetooth, no cables, and it works in airplane mode. The trick is a fountain code, so if the camera misses frames, you do not resend anything: it just keeps watching until it has enough."

## 2-minute version

"Every phone has a screen and a camera, and they work in places where nothing else does. That is the channel. A single QR code only holds a couple of kilobytes, so we need a stream of them, and the problem with a stream is that cameras miss frames. If you number the frames and need all of them, one miss means waiting for that frame to come around again.

We use a fountain code. The sender chops the file into chunks and keeps producing packets, each one a mix, an XOR, of a few random chunks. The receiver does not care which packets it gets. After it has seen a little more packets than there are chunks, about 6 percent more in our measurements, it can solve for the whole file. Cover the screen for three seconds and it just carries on.

Each packet is one QR code. The receiver decodes them with jsQR in a Web Worker so the UI stays smooth, and a grid shows the file filling in. At the end both phones show a 4 emoji fingerprint of the file's SHA-256: if they match, the file is identical.

It is a plain web app: Vite, TypeScript, a service worker that caches it after one visit, no backend. It is slow, honest numbers are roughly 11 to 14 KB/s in our synthetic single-machine tests (October 2026), so it is for contacts, documents and photos, not movies."

## Fountain codes from the base, for a non-expert

Imagine a file as 100 jigsaw pieces. The boring way to send it: show piece 1, piece 2, and so on. If the viewer blinks and misses piece 37, you have to show 37 again, and they have to tell you.

The fountain way: you never show a piece alone, except by luck. Each thing you show is a mixture, like "piece 5 plus piece 40 plus piece 71 combined". Mixing here is XOR: a simple operation where mixing a mix with one of its ingredients gives back the other ingredients.

The viewer collects mixtures. Sometimes a mixture has just one piece in it, and that gives a piece directly. Knowing that piece lets them unmix other mixtures that contained it, which frees more pieces, which unmixes more. It is like Sudoku: one easy cell opens up the rest. Near the end this chain can stall, so we finish with ordinary algebra on the remaining pieces (Gaussian elimination over GF(2), meaning XOR arithmetic).

Why this is great for a camera: any mixture is as useful as any other. The sender never needs to know what was missed. It is called a fountain because you hold a cup under it until it is full, and it does not matter which drops land in the cup.

The recipe for who is mixed with whom comes from a seed in each packet, so the receiver can recompute it without it being sent. The mix sizes follow a distribution (robust soliton) that makes the chain-reaction work.

## Tech stack

- Vite, vanilla TypeScript, no framework. One font (system), dark, large single-purpose screens.
- Codec in `src/codec/` (500 byte chunks by default, the QR M size): LT fountain code with robust soliton, seeded PRNG, peeling decoder with a GF(2) elimination fallback, CRC-32 per frame, SHA-256 fingerprint rendered as 4 emoji. Tested with vitest (22 tests, including overhead, loss and restart cases).
- QR encode: `qrcode-generator`, byte mode, error correction L. QR decode: `jsQR` in a Web Worker, one frame in flight at a time.
- PWA: service worker with a build-time precache list, so it works in airplane mode after one visit.
- Tests: vitest for the codec, Playwright e2e that sends real files between two pages through the real QR draw, camera and decode path (the camera is a canvas capture stream). GitHub Actions CI.
- No backend, no analytics, no accounts.

## Honest limits

- Slow: roughly 11 to 14 KB/s in desktop Chromium on one MacBook with a synthetic camera (single runs, October 2026). Real phone cameras are not measured yet and will likely be slower.
- Needs brightness, a steady hand and decent light. Glare kills decoding.
- The camera API needs HTTPS or localhost. First open needs internet (or a local server) to cache the app.
- Not tested on real iOS and Android hardware in this repo yet.
- No encryption. Anyone who films your screen gets the file. The fingerprint detects corruption, not eavesdropping.
- Sender app must stay in the foreground.

## 12 likely judge questions

1. **How is this different from a QR code?** One QR holds about 2 to 3 KB. We stream many, and the fountain code means missed frames do not matter.
2. **Why not just number frames and resend?** There is no back channel. The receiver cannot tell the sender what it missed, since the only link is one-way light.
3. **Why a fountain code over Reed-Solomon?** LT codes are rateless: the sender just keeps going, and any sufficient subset works, so no fixed redundancy to guess in advance. Reed-Solomon would need a block size and rate chosen up front.
4. **How much overhead?** Measured average about 1.06x the chunk count at K around 100, asserted under 1.25 in tests. It is higher for very small K.
5. **How fast is it?** Synthetic desktop numbers from one MacBook, October 2026: 100 KB loopback in 8 to 9 s across runs (about 11 to 12 KB/s), and a single 1 MB run in 70.9 s (14.4 KB/s). Real cameras are not measured yet.
6. **Does it work offline for real?** Yes after one visit: a service worker precaches everything. Our e2e test switches the network off and runs the loopback. The first visit needs internet or a local host.
7. **How do you know the file is correct?** Per-frame CRC-32, and a 4 emoji fingerprint of the SHA-256 shown on both phones. The e2e tests compare bytes and fingerprints.
8. **What if the receiver starts late or misses a few seconds?** It just starts collecting. We test covering the sender for 3 seconds mid-transfer.
9. **What if the sender changes settings mid-way?** We found and fixed a bug here: the decoder used to stay locked to the first transfer. It now follows a new transfer after three valid frames from it.
10. **Is it secure?** No encryption. It is point-to-point and visible, so treat it like showing the file on a screen. Adding a shared passphrase and authenticated encryption is the obvious next step.
11. **Why not Bluetooth, AirDrop or Wi-Fi Direct?** Those are not available across platforms from a web page, need pairing or permissions, and are often disabled in secure areas. Screens and cameras are universal and need no radio.
12. **What would you do with more time?** Measure on real phones and tune chunk size, fps and QR size automatically from the receiver's decode rate (the sender has a "Recommended: QR M, 8 fps" reset button that changes nothing by itself and there is no adaptive mode; when the decode rate is low the receiver shows the exact settings to ask the sender for, for example "QR S, 4 fps", and a human applies them), add optional encryption, and support multiple files.

## Prior art

Animated QR codes and fountain codes are both well known. Projects in this space include txqr, qrstream, Decimen Optical and Cimbar (a colour-barcode project with higher throughput). LightLink does not claim a new technique. What differs here: a zero-install web page that works offline on any phone, a 4-emoji fingerprint on both screens, a loopback self-test, and a browser test suite that exercises the real QR draw and decode path.
