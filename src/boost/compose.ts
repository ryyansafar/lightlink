import type { BigEncoder } from './bigencoder';
import { packTest } from './bigframe';
import { renderTiles, type Matrix } from './channels';
import { PROFILES, frameBytes, type Profile } from './profiles';
import { frameMatrix } from './qrmatrix';
import { layoutTiles, modulesOf } from './tiling';

/** One display frame: cols x rows tiles, each tile one droplet (three droplets in colour mode). */
export function composeFrame(enc: BigEncoder, p: Profile, color: boolean, W: number, H: number): ImageData {
  const layers = color ? 3 : 1;
  const tiles: Matrix[][] = [];
  for (let t = 0; t < p.cols * p.rows; t++) {
    const ls: Matrix[] = [];
    for (let k = 0; k < layers; k++) ls.push(frameMatrix(enc.nextFrame(), p.version));
    tiles.push(ls);
  }
  const L = layoutTiles(p.cols, p.rows, W, H, modulesOf(p.version));
  return new ImageData(renderTiles(W, H, L, tiles) as unknown as Uint8ClampedArray<ArrayBuffer>, W, H);
}

/** Static test pattern: every tile carries a known frame so the receiver can say "I can read this". */
export function composeTest(p: Profile, color: boolean, W: number, H: number): ImageData {
  const layers = color ? 3 : 1;
  const idx = PROFILES.findIndex((x) => x.id === p.id) | (color ? 0x80 : 0);
  const tiles: Matrix[][] = [];
  for (let t = 0; t < p.cols * p.rows; t++) {
    const ls: Matrix[] = [];
    for (let k = 0; k < layers; k++) ls.push(frameMatrix(packTest(idx, t, k, frameBytes(p)), p.version));
    tiles.push(ls);
  }
  const L = layoutTiles(p.cols, p.rows, W, H, modulesOf(p.version));
  return new ImageData(renderTiles(W, H, L, tiles) as unknown as Uint8ClampedArray<ArrayBuffer>, W, H);
}
