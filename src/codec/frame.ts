import { crc32 } from './crc32';

export const T_DATA = 1;
export const T_MANIFEST = 2;
const HEAD = 13; // type, xferId(4), K(2), chunkSize(2), fileSize(4)

export interface Header {
  xferId: number;
  K: number;
  chunkSize: number;
  fileSize: number;
}
export interface Manifest {
  name: string;
  mime: string;
  sha256: string;
}
export type Parsed =
  | { type: 'data'; h: Header; seed: number; payload: Uint8Array }
  | { type: 'manifest'; h: Header; m: Manifest };

function seal(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  new DataView(out.buffer).setUint32(body.length, crc32(body));
  return out;
}

function head(type: number, h: Header, extra: number): { buf: Uint8Array; dv: DataView } {
  const buf = new Uint8Array(HEAD + extra);
  const dv = new DataView(buf.buffer);
  buf[0] = type;
  dv.setUint32(1, h.xferId);
  dv.setUint16(5, h.K);
  dv.setUint16(7, h.chunkSize);
  dv.setUint32(9, h.fileSize);
  return { buf, dv };
}

export function packData(h: Header, seed: number, payload: Uint8Array): Uint8Array {
  const { buf, dv } = head(T_DATA, h, 4 + payload.length);
  dv.setUint32(HEAD, seed);
  buf.set(payload, HEAD + 4);
  return seal(buf);
}

/** Pseudo-random filler after a NUL, so a padded frame has the dense look of a data frame (long runs of one byte hurt some QR readers). */
export function fillAfterJson(buf: Uint8Array, from: number, jsonLen: number): void {
  let x = 0x2545f491;
  for (let i = from + jsonLen; i < buf.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    buf[i] = i === from + jsonLen ? 0 : x >>> 24;
  }
}

/** The JSON part of a body: everything up to the first NUL (plain unpadded manifests have no NUL). */
export function jsonPart(body: Uint8Array): Uint8Array {
  const z = body.indexOf(0);
  return z < 0 ? body : body.subarray(0, z);
}

/** `padTo` (optional) pads the frame to a full data-frame length. */
export function packManifest(h: Header, m: Manifest, padTo = 0): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(m));
  const { buf } = head(T_MANIFEST, h, Math.max(json.length, padTo - HEAD - 4));
  buf.set(json, HEAD);
  if (buf.length > HEAD + json.length) fillAfterJson(buf, HEAD, json.length);
  return seal(buf);
}

/** Returns null for anything short, corrupt (bad CRC) or malformed. Never throws. */
export function parse(frame: Uint8Array): Parsed | null {
  try {
    if (frame.length < HEAD + 4) return null;
    const body = frame.subarray(0, frame.length - 4);
    const dv = new DataView(frame.buffer, frame.byteOffset, frame.length);
    if (dv.getUint32(frame.length - 4) !== crc32(body)) return null;
    const h: Header = {
      xferId: dv.getUint32(1),
      K: dv.getUint16(5),
      chunkSize: dv.getUint16(7),
      fileSize: dv.getUint32(9),
    };
    if (h.K < 1 || h.chunkSize < 1) return null;
    if (h.fileSize > h.K * h.chunkSize || h.fileSize <= (h.K - 1) * h.chunkSize) {
      if (!(h.fileSize === 0 && h.K === 1)) return null;
    }
    if (frame[0] === T_DATA) {
      if (body.length !== HEAD + 4 + h.chunkSize) return null;
      return { type: 'data', h, seed: dv.getUint32(HEAD), payload: body.subarray(HEAD + 4) };
    }
    if (frame[0] === T_MANIFEST) {
      const m = JSON.parse(new TextDecoder().decode(jsonPart(body.subarray(HEAD))));
      if (typeof m.name !== 'string' || typeof m.mime !== 'string' || typeof m.sha256 !== 'string') return null;
      return { type: 'manifest', h, m };
    }
    return null;
  } catch {
    return null;
  }
}
