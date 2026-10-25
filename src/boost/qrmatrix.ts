import type { Matrix } from './channels';
import { encodeText } from './text7';
import qrcode from './vendor/qrcode';

/** Mask pattern used for every boost frame. The penalty search is skipped: it costs about 8x for no readability gain on random data. */
export const FIXED_MASK = 2;

/** Binary frame to a fixed-version, byte-mode QR matrix at a given error-correction level. Throws if it does not fit. */
export function qrMatrix(frame: Uint8Array, version: number, ec: 'L' | 'M' | 'Q' | 'H' = 'L', mask = FIXED_MASK): Matrix {
  let s = '';
  for (let i = 0; i < frame.length; i++) s += String.fromCharCode(frame[i]);
  const qr = qrcode(version, ec);
  if (mask >= 0) qr.setMask(mask);
  qr.addData(s, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const data = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = qr.isDark(r, c) ? 1 : 0;
  return { n, data };
}

/** A boost frame as a text-safe QR (see text7.ts). */
export const frameMatrix = (frame: Uint8Array, version: number, ec: 'L' | 'M' | 'Q' | 'H' = 'L', mask = FIXED_MASK): Matrix => qrMatrix(encodeText(frame), version, ec, mask);
