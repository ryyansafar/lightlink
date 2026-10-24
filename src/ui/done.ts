import { fingerprint } from '../codec';
import { h, fmtSize, topBar, Screen } from './dom';
import { state } from './state';

function download(blob: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

export function doneScreen(go: (to: string) => void): Screen {
  const inc = state.incoming;
  if (!inc) {
    queueMicrotask(() => go('home'));
    return { el: h('div') };
  }
  const { bytes, meta } = inc;
  const blob = new Blob([bytes as BlobPart], { type: meta.mime || 'application/octet-stream' });
  const fp = h('b', { class: 'fp' }, '...');
  void fingerprint(bytes).then((f) => (fp.textContent = f));
  navigator.vibrate?.(200);
  const canOpen = /^image\//.test(meta.mime) || meta.mime === 'application/pdf';
  const isCard = meta.mime === 'text/vcard' || /\.vcf$/i.test(meta.name);
  const share = async () => {
    const file = new File([blob], meta.name, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else download(blob, meta.name);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') download(blob, meta.name);
    }
  };
  const el = h(
    'div',
    { class: 'screen done' },
    topBar('Received', () => go('home')),
    h('div', { class: 'info' },
      h('div', { class: 'row' }, h('span', {}, 'Name'), h('b', {}, meta.name)),
      h('div', { class: 'row' }, h('span', {}, 'Size'), h('b', {}, fmtSize(meta.size))),
      h('div', { class: 'row' }, h('span', {}, 'Fingerprint'), fp)),
    h('p', { class: 'sub' }, 'Compare the 4 emoji with the sender screen.'),
    canOpen && h('button', { class: 'btn big', onclick: () => window.open(URL.createObjectURL(blob), '_blank') }, 'Open'),
    isCard && h('button', { class: 'btn big', onclick: () => download(new Blob([bytes as BlobPart], { type: 'text/vcard' }), meta.name) }, 'Save contact'),
    h('button', { class: 'btn big alt', onclick: share }, 'Save / Share'),
    h('button', { class: 'btn small', onclick: () => go('receive') }, 'Receive another')
  );
  return { el };
}
