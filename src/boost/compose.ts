import type { BigEncoder } from './bigencoder';
import { packTest } from './bigframe';
import { renderTiles, type Matrix } from './channels';
import { PROFILES, ecOf, frameBytes, type Profile } from './profiles';
import { frameMatrix, FIXED_MASK } from './qrmatrix';
import { layoutTiles, modulesOf } from './tiling';

/** Frames one display frame needs: cols x rows tiles, three droplets per tile in colour mode. */
export const framesPerDisplay = (p: Profile, color: boolean) => p.cols * p.rows * (color ? 3 : 1);

/** Render already-built droplet frames (tile-major, layers inner) into RGBA. Pure, so a worker can run it. */
export function composeFromFrames(frames: Uint8Array[], p: Profile, color: boolean, W: number, H: number, mask = FIXED_MASK): Uint8ClampedArray {
  const layers = color ? 3 : 1;
  const tiles: Matrix[][] = [];
  for (let t = 0; t < p.cols * p.rows; t++) {
    const ls: Matrix[] = [];
    for (let k = 0; k < layers; k++) ls.push(frameMatrix(frames[t * layers + k], p.version, ecOf(p), mask));
    tiles.push(ls);
  }
  const L = layoutTiles(p.cols, p.rows, W, H, modulesOf(p.version));
  return renderTiles(W, H, L, tiles);
}

/** One display frame on the calling thread. */
export function composeFrame(enc: BigEncoder, p: Profile, color: boolean, W: number, H: number): ImageData {
  const frames = Array.from({ length: framesPerDisplay(p, color) }, () => enc.nextFrame());
  return new ImageData(composeFromFrames(frames, p, color, W, H) as unknown as Uint8ClampedArray<ArrayBuffer>, W, H);
}

/** Static test pattern: every tile carries a known frame so the receiver can say "I can read this". */
export function composeTest(p: Profile, color: boolean, W: number, H: number): ImageData {
  const layers = color ? 3 : 1;
  const idx = PROFILES.findIndex((x) => x.id === p.id) | (color ? 0x80 : 0);
  const tiles: Matrix[][] = [];
  for (let t = 0; t < p.cols * p.rows; t++) {
    const ls: Matrix[] = [];
    for (let k = 0; k < layers; k++) ls.push(frameMatrix(packTest(idx, t, k, frameBytes(p)), p.version, ecOf(p)));
    tiles.push(ls);
  }
  const L = layoutTiles(p.cols, p.rows, W, H, modulesOf(p.version));
  return new ImageData(renderTiles(W, H, L, tiles) as unknown as Uint8ClampedArray<ArrayBuffer>, W, H);
}
