/** Deflate for compressible types; skip formats that are already compressed. */
const SKIP = /\.(jpe?g|png|gif|webp|heic|avif|mp4|mov|webm|mkv|m4a|mp3|aac|zip|gz|7z|rar|pdf)$/i;
const SKIP_MIME = /^(image\/(jpeg|png|gif|webp|heic|avif)|video\/|audio\/(mpeg|mp4|aac)|application\/(zip|gzip|pdf|x-7z-compressed))/i;

export function shouldCompress(name: string, mime: string): boolean {
  return !SKIP.test(name) && !SKIP_MIME.test(mime);
}

export async function deflate(blob: Blob): Promise<Blob> {
  return new Response(blob.stream().pipeThrough(new CompressionStream('deflate'))).blob();
}

export async function inflate(blob: Blob): Promise<Blob> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('deflate'))).blob();
}

/** Compress only when it is worth it (saves at least 5%). */
export async function maybeCompress(blob: Blob, name: string, mime: string): Promise<{ blob: Blob; compressed: boolean }> {
  if (!shouldCompress(name, mime) || blob.size === 0) return { blob, compressed: false };
  const z = await deflate(blob);
  return z.size < blob.size * 0.95 ? { blob: z, compressed: true } : { blob, compressed: false };
}
