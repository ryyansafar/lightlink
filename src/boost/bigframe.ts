import { crc32 } from '../codec/crc32';

export const T_BIGMANIFEST = 0x10;
export const T_TEST = 0x11;

export interface BigManifest {
  v: 1;
  id: number; // file id
  g: number; // generation count
  gs: number; // generation size (bytes)
  size: number; // stored (possibly compressed) size
  osz: number; // original size
  z: boolean; // deflated
  sha: string; // sha256 hex of the stored bytes
  name: string;
  mime: string;
  t?: [number, number, number]; // sender tiling: cols, rows, colour (0/1)
}

function seal(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  new DataView(out.buffer).setUint32(body.length, crc32(body));
  return out;
}

function unseal(frame: Uint8Array): Uint8Array | null {
  if (frame.length < 6) return null;
  const body = frame.subarray(0, frame.length - 4);
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.length);
  return dv.getUint32(frame.length - 4) === crc32(body) ? body : null;
}

export function packBigManifest(m: BigManifest): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(m));
  const body = new Uint8Array(1 + json.length);
  body[0] = T_BIGMANIFEST;
  body.set(json, 1);
  return seal(body);
}

export function parseBigManifest(frame: Uint8Array): BigManifest | null {
  try {
    if (frame[0] !== T_BIGMANIFEST) return null;
    const body = unseal(frame);
    if (!body) return null;
    const m = JSON.parse(new TextDecoder().decode(body.subarray(1)));
    const ok = m && m.v === 1 && Number.isInteger(m.g) && m.g >= 1 && Number.isInteger(m.gs) && m.gs > 0 &&
      Number.isInteger(m.size) && m.size >= 0 && Number.isInteger(m.osz) && typeof m.sha === 'string' &&
      typeof m.name === 'string' && typeof m.mime === 'string' && Number.isInteger(m.id);
    if (!ok || m.g !== Math.max(1, Math.ceil(m.size / m.gs))) return null;
    return m as BigManifest;
  } catch {
    return null;
  }
}

/** Test-pattern frame, padded to `total` bytes so it draws the same QR version as real data. */
export function packTest(profileIdx: number, tile: number, layer: number, total: number): Uint8Array {
  const body = new Uint8Array(total - 4);
  body[0] = T_TEST;
  body[1] = profileIdx;
  body[2] = tile;
  body[3] = layer;
  for (let i = 4; i < body.length; i++) body[i] = (i * 31 + tile * 7 + layer * 13) & 0xff;
  return seal(body);
}

export function parseTest(frame: Uint8Array): { profileIdx: number; tile: number; layer: number } | null {
  if (frame[0] !== T_TEST) return null;
  const body = unseal(frame);
  return body ? { profileIdx: body[1], tile: body[2], layer: body[3] } : null;
}
