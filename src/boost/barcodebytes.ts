import { decodeText } from './text7';

export interface Barcode { rawValue: string; rawBytes?: Uint8Array }

/** Frame bytes of a detected code. The payload is text-safe (see text7.ts), so rawValue is enough. */
export function barcodeBytes(b: Barcode): Uint8Array[] {
  const chars = b.rawBytes?.length ? new Uint8Array(b.rawBytes) : Uint8Array.from(b.rawValue ?? '', (ch) => ch.charCodeAt(0) & 0xff);
  const f = decodeText(chars);
  return f ? [f] : [];
}
