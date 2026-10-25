import { Encoder, SIZES, fingerprint } from '../codec';
import { h, fmtSize, topBar, vcard, Screen } from './dom';
import { state } from './state';

export function pickScreen(go: (to: string) => void): Screen {
  const info = h('div', { class: 'info' });
  const start = h('button', { class: 'btn huge', disabled: 'true', onclick: () => go('flash') }, 'Start');
  (start as HTMLButtonElement).disabled = true;

  async function setOutgoing(bytes: Uint8Array, name: string, mime: string) {
    state.outgoing = { bytes, meta: { name, mime } };
    const enc = new Encoder(bytes, { name, mime }, { chunkSize: SIZES.M });
    const fp = await fingerprint(bytes);
    info.replaceChildren(
      h('div', { class: 'row' }, h('span', {}, 'Name'), h('b', {}, name)),
      h('div', { class: 'row' }, h('span', {}, 'Size'), h('b', {}, fmtSize(bytes.length))),
      h('div', { class: 'row' }, h('span', {}, 'Chunks (K)'), h('b', {}, String(enc.K))),
      h('div', { class: 'row' }, h('span', {}, 'Fingerprint'), h('b', { class: 'fp' }, fp))
    );
    (start as HTMLButtonElement).disabled = false;
  }

  const status = h('p', { class: 'note', role: 'status' });
  // The real file input sits invisibly on top of the button, so a tap lands on the input itself.
  // (A display:none input behind a label is unreliable on some phone browsers.)
  const file = h('input', {
    type: 'file',
    class: 'file',
    'aria-label': 'Choose a file',
    onchange: async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      if (!f) return;
      status.textContent = `Reading ${f.name}...`;
      try {
        await setOutgoing(new Uint8Array(await f.arrayBuffer()), f.name, f.type || 'application/octet-stream');
        status.textContent = '';
      } catch (err) {
        status.textContent = `Could not read that file: ${err instanceof Error ? err.message : 'unknown error'}. Try a smaller file.`;
      }
      input.value = '';
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
    h('div', { class: 'filewrap' }, h('div', { class: 'btn big alt' }, 'Choose a file'), file),
    status,
    h('h3', {}, 'Or a contact card'),
    name, phone, email, makeCard,
    info,
    start
  );
  return { el };
}
