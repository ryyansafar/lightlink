import type { BigResult } from './bigdecoder';

export interface BigOutgoing {
  blob: Blob;
  meta: { name: string; mime: string; origSize: number; compressed: boolean };
}
export const big: { out?: BigOutgoing; profileId: string; color: boolean; test: boolean; result?: BigResult } = {
  profileId: 'fast',
  color: false,
  test: false,
};

const key = (profile: string, decoder: string) => `lightlink.rate.${profile}.${decoder}`;

/** Measured loopback rate (bytes/s) saved by the self-test on this device, or 0. */
export function savedRate(profile: string, decoder: string): number {
  try {
    return Number(localStorage.getItem(key(profile, decoder))) || 0;
  } catch {
    return 0;
  }
}
export function saveRate(profile: string, decoder: string, bps: number): void {
  try {
    localStorage.setItem(key(profile, decoder), String(Math.round(bps)));
  } catch { /* storage unavailable */ }
}
