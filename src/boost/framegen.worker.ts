import { composeFromFrames } from './compose';
import { profileById } from './profiles';

export interface GenRequest { id: number; frames: Uint8Array[]; profile: string; color: boolean; W: number; H: number; pixels: boolean; mask: number }
export interface GenResponse { id: number; ms: number; bitmap?: ImageBitmap; buf?: ArrayBuffer }

/** Generates one display frame (QR matrices and pixels) off the main thread. */
self.onmessage = async (e: MessageEvent<GenRequest>) => {
  const { id, frames, profile, color, W, H, pixels, mask } = e.data;
  const t0 = performance.now();
  const rgba = composeFromFrames(frames, profileById(profile), color, W, H, mask);
  const ms = performance.now() - t0;
  const w = self as unknown as Worker;
  if (pixels) {
    w.postMessage({ id, ms, buf: rgba.buffer as ArrayBuffer } satisfies GenResponse, [rgba.buffer]);
  } else {
    const bitmap = await createImageBitmap(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, W, H));
    w.postMessage({ id, ms, bitmap } satisfies GenResponse, [bitmap]);
  }
};
