import { h, fmtSize, topBar, Screen } from '../ui/dom';
import { big } from './bigstate';

export function bigDoneScreen(go: (to: string) => void): Screen {
  const r = big.result;
  if (!r) {
    queueMicrotask(() => go('home'));
    return { el: h('div') };
  }
  const save = () => {
    const a = h('a', { href: URL.createObjectURL(r.blob), download: r.meta.name });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const el = h('div', { class: 'screen done' }, topBar('Received', () => go('home')),
    h('div', { class: 'info' },
      h('div', { class: 'row' }, h('span', {}, 'Name'), h('b', {}, r.meta.name)),
      h('div', { class: 'row' }, h('span', {}, 'Size'), h('b', {}, fmtSize(r.meta.size))),
      h('div', { class: 'row' }, h('span', {}, 'SHA-256'), h('b', {}, r.verified ? 'verified (every generation and the whole file)' : 'NOT verified'))),
    h('button', { class: 'btn big alt', onclick: save }, 'Save'),
    h('button', { class: 'btn small', onclick: () => go('bigreceive') }, 'Receive another'));
  return { el };
}
