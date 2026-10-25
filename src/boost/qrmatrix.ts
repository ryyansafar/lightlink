import qrcode from 'qrcode-generator';
import type { Matrix } from './channels';
import { encodeText } from './text7';

/** Binary frame to a fixed-version, error-correction-L, byte-mode QR matrix. Throws if it does not fit. */
export function qrMatrix(frame: Uint8Array, version: number): Matrix {
  let s = '';
  for (let i = 0; i < frame.length; i++) s += String.fromCharCode(frame[i]);
  const qr = qrcode(version as never, 'L');
  qr.addData(s, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const data = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = qr.isDark(r, c) ? 1 : 0;
  return { n, data };
}

/** A boost frame as a text-safe QR (see text7.ts). */
export const frameMatrix = (frame: Uint8Array, version: number): Matrix => qrMatrix(encodeText(frame), version);
