import { h, fmtSize, topBar, Screen } from '../ui/dom';
import { maybeCompress } from './compress';
import { genCount } from './generations';
import { PROFILES, ceilingBps, profileById } from './profiles';
import { big, bestRate } from './bigstate';
import { budgetLine, fmtDuration, preflight, recommendedMax } from './throughput';

export function bigSendScreen(go: (to: string) => void): Screen {
  const info = h('div', { class: 'info' }, 'Choose a file. Files of 100 MB and more are fine: it is sent in 1 MB generations.');
  const prof = h('select', {}, ...PROFILES.map((p) => h('option', { value: p.id }, p.label)));
  prof.value = big.profileId;
  const colorBox = h('input', { type: 'checkbox' });
  colorBox.checked = big.color;
  const note = h('div', { class: 'sub' });
  const start = h('button', { class: 'btn huge', onclick: () => { big.test = false; go('bigflash'); } }, 'Start');
  const test = h('button', { class: 'btn big alt', onclick: () => { big.test = true; go('bigflash'); } }, 'Show test pattern');
  (start as HTMLButtonElement).disabled = true;

  function refresh() {
    big.profileId = prof.value;
    big.color = colorBox.checked;
    const p = profileById(prof.value);
    note.textContent = p.note;
    if (!big.out) {
      info.replaceChildren(h('div', {}, 'Choose a file. Files of 100 MB and more are fine: it is sent in 1 MB generations.'),
        h('div', { class: 'row' }, h('span', {}, '60-second budget'), h('b', {}, budgetLine(bestRate(p.id).bps, null, fmtSize))));
      return;
    }
    const size = big.out.blob.size;
    const { bps: measured, source } = bestRate(p.id);
    const layers = big.color ? 3 : 1;
    const est = measured ? preflight(size, measured * layers * 0 + measured) : null;
    const rows = [
      h('div', { class: 'row' }, h('span', {}, 'Name'), h('b', {}, big.out.meta.name)),
      h('div', { class: 'row' }, h('span', {}, 'Size'), h('b', {}, fmtSize(big.out.meta.origSize))),
      h('div', { class: 'row' }, h('span', {}, 'To send'), h('b', {}, `${fmtSize(size)}${big.out.meta.compressed ? ' (deflated)' : ''}`)),
      h('div', { class: 'row' }, h('span', {}, 'Generations'), h('b', {}, String(genCount(size)))),
      h('div', { class: 'row' }, h('span', {}, 'Estimate'), h('b', {}, est ? `${est.text} (${source})` : 'unknown until you run the test pattern')),
      h('div', { class: 'row' }, h('span', {}, 'Ceiling'), h('b', {}, `${(ceilingBps(p, layers) / 1024).toFixed(0)} KB/s if every frame is decoded`)),
    ];
    rows.push(h('div', { class: 'row' }, h('span', {}, '60-second budget'), h('b', {}, budgetLine(measured, size, fmtSize))));
    if (measured) rows.push(h('div', { class: 'row' }, h('span', {}, 'Recommended max'), h('b', {}, `${fmtSize(recommendedMax(measured))} in ${fmtDuration(600)}`)));
    info.replaceChildren(...rows);
  }

  const file = h('input', {
    type: 'file', class: 'file',
    onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      info.textContent = 'Preparing...';
      const mime = f.type || 'application/octet-stream';
      const r = await maybeCompress(f, f.name, mime);
      big.out = { blob: r.blob, meta: { name: f.name, mime, origSize: f.size, compressed: r.compressed } };
      (start as HTMLButtonElement).disabled = false;
      refresh();
    },
  });
  prof.addEventListener('change', refresh);
  colorBox.addEventListener('change', refresh);
  refresh();
  const el = h('div', { class: 'screen' },
    topBar('Send big file', () => go('home')),
    h('label', { class: 'btn big alt' }, 'Choose a file', file),
    h('label', {}, 'Profile'), prof, note,
    h('label', { class: 'sub' }, colorBox, ' Colour channels (experimental)'),
    info, test, start);
  return { el };
}
