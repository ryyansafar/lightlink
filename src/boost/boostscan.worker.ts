import type { Mat3 } from './channels';
import { scanAll } from './multiscan';

export interface ScanRequest {
  id: number; buf: ArrayBuffer; width: number; height: number;
  cols: number; rows: number; color: boolean; cal?: { black: number[]; inv: Mat3 };
}

self.onmessage = (e: MessageEvent<ScanRequest>) => {
  const { id, buf, width, height, cols, rows, color, cal } = e.data;
  const found = scanAll(new Uint8ClampedArray(buf), width, height, cols, rows, color, cal);
  (self as unknown as Worker).postMessage({ id, found }, found.map((f) => f.buffer));
};
