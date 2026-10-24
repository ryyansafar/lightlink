export interface Outgoing {
  bytes: Uint8Array;
  meta: { name: string; mime: string };
}
export interface Incoming {
  bytes: Uint8Array;
  meta: { name: string; mime: string; size: number };
}
export const state: { outgoing?: Outgoing; incoming?: Incoming } = {};
