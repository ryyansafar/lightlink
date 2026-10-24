type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v !== undefined && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

export interface Screen {
  el: HTMLElement;
  destroy?: () => void;
}

export function vcard(name: string, phone: string, email: string): Uint8Array {
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(name)}`, `N:${esc(name)};;;;`];
  if (phone) lines.push(`TEL;TYPE=CELL:${esc(phone)}`);
  if (email) lines.push(`EMAIL:${esc(email)}`);
  lines.push('END:VCARD', '');
  return new TextEncoder().encode(lines.join('\r\n'));
}

export function topBar(title: string, onBack: () => void): HTMLElement {
  return h('div', { class: 'top' }, h('button', { class: 'btn small', onclick: onBack }, '< Back'), h('h2', {}, title));
}
