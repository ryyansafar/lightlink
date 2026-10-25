import { h, Screen } from './dom';

async function offlineReady(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return false;
    const keys = await caches.keys();
    return keys.some((k) => k.startsWith('lightlink-'));
  } catch {
    return false;
  }
}

export function homeScreen(go: (to: string) => void): Screen {
  const badge = h('div', { class: 'badge' }, 'Checking offline cache...');
  const refresh = async () => {
    const ok = await offlineReady();
    badge.textContent = ok ? 'Ready offline' : 'Not cached yet. Stay online once.';
    badge.className = ok ? 'badge ok' : 'badge warn';
  };
  void refresh();
  const t = setInterval(refresh, 2000);
  const el = h(
    'div',
    { class: 'screen home' },
    h('h1', {}, 'LightLink'),
    h('p', { class: 'sub' }, 'Send a file with the screen and the camera. No internet needed.'),
    badge,
    h('button', { class: 'btn huge', onclick: () => go('send') }, 'Send'),
    h('button', { class: 'btn huge alt', onclick: () => go('receive') }, 'Receive'),
    h('button', { class: 'btn small', onclick: () => go('bigsend') }, 'Big files: send (laptop to phone)'),
    h('button', { class: 'btn small', onclick: () => go('bigreceive') }, 'Big files: receive'),
    h('button', { class: 'btn small', onclick: () => go('loopback') }, 'Loopback self-test'),
    h('button', { class: 'btn small', onclick: () => go('bigloop') }, 'Big loopback (all profiles)'),
    h('p', { class: 'foot' }, h('a', { href: 'https://ryyansafar.site' }, 'ryyansafar.site'), ' | ', h('a', { href: 'https://github.com/ryyansafar/lightlink' }, 'GitHub'))
  );
  return { el, destroy: () => clearInterval(t) };
}
