import qrcode from 'qrcode-generator';

/** Draw a binary frame as a byte-mode, error-correction-L QR code. Returns module count. */
export function drawQr(canvas: HTMLCanvasElement, frame: Uint8Array, targetPx: number): number {
  let s = '';
  for (let i = 0; i < frame.length; i++) s += String.fromCharCode(frame[i]);
  const qr = qrcode(0, 'L');
  qr.addData(s, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.max(2, Math.floor(targetPx / (n + quiet * 2)));
  const px = (n + quiet * 2) * cell;
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return n;
}
