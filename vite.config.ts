import { defineConfig } from 'vitest/config';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    const rel = base ? `${base}/${n}` : n;
    return statSync(p).isDirectory() ? walk(p, rel) : [rel];
  });
}

// Fills the service worker precache list from the built output so it works offline after one visit.
const precache = () => ({
  name: 'lightlink-precache',
  apply: 'build' as const,
  closeBundle() {
    const dist = 'dist';
    const files = walk(dist).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
    const list = ['./', ...files.map((f) => `./${f}`)];
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
      .replace('__PRECACHE__', JSON.stringify(list))
      .replace('__VERSION__', Date.now().toString(36));
    writeFileSync(join(dist, 'sw.js'), sw);
  },
});

export default defineConfig({
  base: './',
  plugins: [precache()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
