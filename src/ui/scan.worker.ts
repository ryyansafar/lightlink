import jsQR from 'jsqr';

self.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer; width: number; height: number }>) => {
  const { id, buf, width, height } = e.data;
  const r = jsQR(new Uint8ClampedArray(buf), width, height, { inversionAttempts: 'dontInvert' });
  const bytes = r ? new Uint8Array(r.binaryData) : null;
  (self as unknown as Worker).postMessage({ id, bytes }, bytes ? [bytes.buffer] : []);
};
