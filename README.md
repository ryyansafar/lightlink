# LightLink

Send a file between two phones using only the screen and the camera. The sender shows an animated stream of QR codes (a fountain code); the receiver points its camera at it. No internet, no Bluetooth, no cables. Works in airplane mode once the app is cached.

Status: hackathon build (v0.1.0). Codec in `src/codec/`, PWA in `src/ui/`.

Live: https://ryyansafar.site/lightlink/ (GitHub Pages, deployed by `.github/workflows/pages.yml`). The camera needs HTTPS. Note: the account-level custom domain currently routes `/lightlink/` to the portfolio host, so this URL may 404 until that host forwards it; the build in `dist/` is a plain static site and works from any HTTPS host.

## How it works

Send: pick a file (or make a contact card), the app draws one QR code per fountain-code packet on a canvas (byte mode, error correction L) at a chosen fps and QR size. Receive: rear camera frames are downscaled and decoded by jsQR in a Web Worker, packets go into the Decoder, a block grid lights up as chunks resolve. Done screen shows a 4-emoji fingerprint to compare, then open, save/share, or save contact. A service worker precaches everything so it works in airplane mode after one visit. The Loopback self-test pushes a generated 100 KB file through the real QR draw and decode path on one device and reports pass/fail and measured throughput (measured once in desktop Chromium: PASS, 100 KB in 5.2 s, about 19 KB/s; decode-limited, real camera throughput is lower and not yet measured).

## Commands

```
npm install
npm test        # vitest
npm run bench   # codec overhead benchmark
npm run dev     # vite dev server
npm run build
```

## Links

- Portfolio: https://ryyansafar.site
- GitHub: https://github.com/ryyansafar
- Buy me a coffee: https://buymeacoffee.com/ryyansafar
- PayPal: https://www.paypal.com/paypalme/ryyansafar
- Razorpay: https://razorpay.me/@ryyansafar
