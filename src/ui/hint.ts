import { SIZES } from '../codec';

/** The exact settings to ask the sender for, given the chunk size the receiver is decoding (0 if unknown). */
export function senderAsk(chunkSize: number): string {
  if (chunkSize > SIZES.M) return 'QR M, 4 fps';
  if (chunkSize > SIZES.S) return 'QR S, 4 fps';
  return 'QR S, 2 fps';
}

export function lowRateHint(chunkSize: number): string {
  return `Low decode rate. Hold steady, fill the camera view with the QR and turn screen brightness up. If it stays low, ask the sender for ${senderAsk(chunkSize)}.`;
}
