import { maxBytes } from './text7';
import { modulesOf } from './tiling';

export interface Profile {
  id: 'safe' | 'fast' | 'max';
  label: string;
  version: number;
  fps: number;
  cols: number;
  rows: number;
  note: string;
  /** QR error-correction level. L maximises payload; see README for why it stays L. */
  ec?: 'L' | 'M';
}

export const ecOf = (p: Profile): 'L' | 'M' => p.ec ?? 'L';

/** Byte-mode, error-correction L capacities (bytes) of the QR versions used. */
export const QR_CAPACITY: Record<number, number> = { 10: 271, 15: 520, 20: 858, 30: 1732, 36: 2431, 40: 2953 };
export const FRAME_OVERHEAD = 21; // header 13 + seed 4 + crc 4

export const PROFILES: Profile[] = [
  { id: 'safe', label: 'Phone to phone (safe)', version: 15, fps: 8, cols: 1, rows: 1, note: 'One QR v15, 8 fps. Works on small phone screens.' },
  { id: 'fast', label: 'Laptop to phone (fast)', version: 30, fps: 15, cols: 2, rows: 1, note: 'Two QR v30 side by side, 15 fps. Needs a big screen.' },
  { id: 'max', label: 'Laptop to phone (max)', version: 40, fps: 30, cols: 3, rows: 2, note: 'Six QR v40, 30 fps. Needs a big screen and a good camera.' },
];

/** Frame bytes that fit one tile after the text-safe encoding. */
export const frameBytes = (p: Profile) => maxBytes(QR_CAPACITY[p.version]);
export const chunkSizeOf = (p: Profile) => frameBytes(p) - FRAME_OVERHEAD;
export const modulesPerTile = (p: Profile) => modulesOf(p.version);

/** Theoretical payload ceiling in bytes/s if every drawn frame is decoded (about 1.25x fountain overhead). */
export function ceilingBps(p: Profile, layers = 1): number {
  return (chunkSizeOf(p) * p.cols * p.rows * layers * p.fps) / 1.25;
}

export const profileById = (id: string) => PROFILES.find((p) => p.id === id) ?? PROFILES[0];
