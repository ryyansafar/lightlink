# LightLink: what it is and how it works

LightLink sends a file from one phone (or laptop) to another using only the screen and the camera. No internet, Bluetooth, Wi-Fi or cable is involved. It is a web page: open it once over HTTPS, and it keeps working in airplane mode.

Live: https://lightlink-liart.vercel.app

## What you do
1. Sender: open the app, tap Send, choose a file (or make a contact card), tap Start. The screen shows a stream of QR codes.
2. Receiver: open the app, tap Receive, point the camera at the sender's screen. A progress bar and a block grid fill as pieces arrive.
3. When enough pieces have arrived, the file is rebuilt and checked. Both screens show the same four-emoji fingerprint to compare. The receiver can open it, save or share it, or save a contact card.

## The problem with plain QR streams
A numbered QR sequence needs every frame. A camera drops frames constantly (blur, glare, refocusing), so the receiver would wait for the loop to come around again. LightLink uses a fountain code so that no frame is special.

## Fountain codes (Luby Transform)
- The file is split into K chunks (250, 500 or 900 bytes depending on the QR size setting; 500 bytes is the default).
- Every transmitted frame is a "droplet": the XOR of a small random subset of chunks. The subset size follows a robust soliton degree distribution.
- The subset is derived from a 32-bit seed using a seeded generator (mulberry32), so a frame only carries the seed, not the list of chunks.
- The decoder is a peeling (belief propagation) decoder: a droplet that covers one unknown chunk reveals it, which simplifies the other droplets. If peeling stalls, a fallback solves the remainder by Gaussian elimination over GF(2), retried less often as the unknown count grows.
- Droplets can arrive in any order, with duplicates, with gaps, and starting from the middle of the stream. About K plus a few percent of frames are needed (measured overhead about 1.07 times at K=80 with the default 500 byte chunks; the tests assert under 1.25 over 200 seeds).

## Frame format
Each frame starts with a one-byte frame type (data or manifest), then transfer id, K, chunk size and file size; a data frame then carries the seed, and every frame ends with a CRC32. Corrupt frames are dropped silently. A manifest frame (file name, MIME type and the SHA-256 of the whole file) is interleaved about every 20th frame. Two transfers with different ids never mix.

## Integrity
Per-frame CRC32, and a SHA-256 check of the full file before it is released. The four-emoji fingerprint is derived from the SHA-256, so the two people can confirm by eye that the same file arrived.

## Sender
- Chunks and encodes the file, draws each droplet as a QR code (byte mode) on a canvas at a chosen frame rate (recommended: QR M, 8 fps).
- A laptop mode draws a very large QR for a bigger screen.
- The Send screen shows the size, chunk count, fingerprint and an estimated time, and warns for large files.

## Receiver
- Opens the rear camera with getUserMedia and decodes frames in a Web Worker (jsQR), so the interface stays responsive.
- Feeds every valid frame into the decoder as it arrives.
- Shows the percent as packets received over the packets expected, a grid of solved chunks, the decode rate, and a hint with exact sender settings when the rate is low.
- Handles camera-denied and no-camera states.

## App shell
TypeScript, Vite, no backend. A service worker caches the app so it works offline after one visit. A web manifest provides the icon. Deployed as a static site on Vercel (HTTPS is required for the camera).

## Testing
- Unit tests for the codec: round trips from 1 byte to 300 KB, 30 percent frame loss, shuffled, duplicated and corrupted frames, two interleaved transfers, starting mid-stream, and the overhead bound.
- Browser tests (Playwright) drive a full send-to-receive through the real QR draw and decode path, including a covered screen, PDF, PNG, contact card and offline reload.
- A built-in loopback self-test pipes a 100 KB file through the real draw and decode path on one device.
- One real transfer between two Android phones was run (an 86 KB PDF, received with the fingerprint shown, in about two minutes).

## Limits
Speed is bounded by how fast codes can be drawn, read and decoded: roughly seconds for documents and minutes for photos. Real camera speed was measured only once, imprecisely. See the README for the measured numbers and the Prior art section.

An experimental Big files mode (tiled QR codes, 1 MB generations with resume, native barcode detection, parallel workers) is proposed in pull request #1 and is not part of the shipped default path.

## Links
- Portfolio: https://ryyansafar.site
- GitHub: https://github.com/ryyansafar
- Buy Me a Coffee: https://buymeacoffee.com/ryyansafar
- PayPal: https://www.paypal.com/paypalme/ryyansafar
- Razorpay: https://razorpay.me/@ryyansafar
