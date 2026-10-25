/**
 * Text-safe transport. Chrome's BarcodeDetector hands back QR byte-mode payloads as strings and cuts them at
 * NUL or drops non-UTF-8 bytes, so raw binary frames cannot go through it. Every boost frame is therefore sent as
 * characters 1..127 (a base-127 digit per char, 6 bytes -> 7 chars, 14.3% overhead). jsQR and the native
 * detector both read it, so there is one wire format.
 */
const GROUP = 6;
const GROUP_CHARS = 7;
// chars needed for r leftover bytes (0..5), and the inverse
const TAIL = [0, 2, 3, 4, 5, 6];

export function encodedLen(n: number): number {
  return Math.floor(n / GROUP) * GROUP_CHARS + TAIL[n % GROUP];
}

/** Largest number of bytes whose encoding fits in `cap` characters. */
export function maxBytes(cap: number): number {
  let n = Math.floor((cap * GROUP) / GROUP_CHARS) + 1;
  while (encodedLen(n) > cap) n--;
  return n;
}

export function encodeText(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(encodedLen(bytes.length));
  let o = 0;
  for (let i = 0; i < bytes.length; i += GROUP) {
    const r = Math.min(GROUP, bytes.length - i);
    let v = 0n;
    for (let k = 0; k < r; k++) v = (v << 8n) | BigInt(bytes[i + k]);
    const digits = r === GROUP ? GROUP_CHARS : TAIL[r];
    for (let d = digits - 1; d >= 0; d--) {
      out[o + d] = Number(v % 127n) + 1;
      v /= 127n;
    }
    o += digits;
  }
  return out;
}

/** null when the characters are not a valid encoding. */
export function decodeText(chars: Uint8Array): Uint8Array | null {
  const q = Math.floor(chars.length / GROUP_CHARS);
  const t = TAIL.indexOf(chars.length % GROUP_CHARS);
  if (t < 0) return null;
  const out = new Uint8Array(q * GROUP + t);
  let o = 0;
  for (let i = 0; i < chars.length; ) {
    const digits = Math.min(GROUP_CHARS, chars.length - i);
    const r = digits === GROUP_CHARS ? GROUP : TAIL.indexOf(digits);
    let v = 0n;
    for (let d = 0; d < digits; d++) {
      const c = chars[i + d];
      if (c < 1 || c > 127) return null;
      v = v * 127n + BigInt(c - 1);
    }
    if (v >= 1n << BigInt(8 * r)) return null;
    for (let k = r - 1; k >= 0; k--) {
      out[o + k] = Number(v & 0xffn);
      v >>= 8n;
    }
    o += r;
    i += digits;
  }
  return out;
}
