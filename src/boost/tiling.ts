/** Layout maths for a grid of independent QR codes per frame. */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout { cell: number; side: number; rects: Rect[] }

/** Largest integer module size so cols x rows square codes (with quiet zone) fit in W x H. */
export function layoutTiles(cols: number, rows: number, W: number, H: number, modules: number, quiet = 4): Layout {
  const span = modules + quiet * 2;
  const cell = Math.max(1, Math.floor(Math.min(W / cols, H / rows) / span));
  const side = span * cell;
  const rects: Rect[] = [];
  // each tile is centred in its own grid cell, so the receiver's grid crops contain exactly one code
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      rects.push({ x: Math.floor(((c + 0.5) * W) / cols - side / 2), y: Math.floor(((r + 0.5) * H) / rows - side / 2), w: side, h: side });
  return { cell, side, rects };
}

/** Regions of a camera image for the jsQR fallback: one per tile, expanded by `overlap` (fraction). */
export function cropRegions(cols: number, rows: number, W: number, H: number, overlap = 0.1): Rect[] {
  const out: Rect[] = [];
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = Math.max(0, Math.floor(c * cw - cw * overlap));
      const y = Math.max(0, Math.floor(r * ch - ch * overlap));
      const x2 = Math.min(W, Math.ceil((c + 1) * cw + cw * overlap));
      const y2 = Math.min(H, Math.ceil((r + 1) * ch + ch * overlap));
      out.push({ x, y, w: x2 - x, h: y2 - y });
    }
  return out;
}

/** Modules per side of a QR version. */
export const modulesOf = (version: number) => 17 + 4 * version;
