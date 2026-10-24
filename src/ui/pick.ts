import { Encoder, fingerprint } from '../codec';
import { h, fmtSize, topBar, vcard, Screen } from './dom';
import { state } from './state';

export function pickScreen(go: (to: string) => void): Screen {
  const info = h('div', { class: 'info' });
  const start = h('button', { class: 'btn huge', disabled: 'true', onclick: () => go('flash') }, 'Start');
  (start as HTMLButtonElement).disabled = true;

  async function setOutgoing(bytes: Uint8Array, name: string, mime: string) {
    state.outgoing = { bytes, meta: { name, mime } };
    const enc = new Encoder(bytes, { name, mime });
    const fp = await fingerprint(bytes);
    info.replaceChildren(
      h('div', { class: 'row' }, h('span', {}, 'Name'), h('b', {}, name)),
      h('div', { class: 'row' }, h('span', {}, 'Size'), h('b', {}, fmtSize(bytes.length))),
      h('div', { class: 'row' }, h('span', {}, 'Chunks (K)'), h('b', {}, String(enc.K))),
      h('div', { class: 'row' }, h('span', {}, 'Fingerprint'), h('b', { class: 'fp' }, fp))
    );
    (start as HTMLButtonElement).disabled = false;
  }

  const file = h('input', {
    type: 'file',
    class: 'file',
    onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      await setOutgoing(new Uint8Array(await f.arrayBuffer()), f.name, f.type || 'application/octet-stream');
    },
  });
  const name = h('input', { type: 'text', placeholder: 'Name', autocomplete: 'off' });
  const phone = h('input', { type: 'tel', placeholder: 'Phone' });
  const email = h('input', { type: 'email', placeholder: 'Email' });
  const makeCard = h(
    'button',
    {
      class: 'btn small',
      onclick: () => {
        const n = name.value.trim();
        if (!n) return name.focus();
        void setOutgoing(vcard(n, phone.value.trim(), email.value.trim()), `${n}.vcf`, 'text/vcard');
      },
    },
    'Make contact card'
  );

  const el = h(
    'div',
    { class: 'screen' },
    topBar('Send', () => go('home')),
    h('label', { class: 'btn big alt' }, 'Choose a file', file),
    h('h3', {}, 'Or a contact card'),
    name, phone, email, makeCard,
    info,
    start
  );
  return { el };
}
