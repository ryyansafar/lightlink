import './style.css';
import { Screen } from './ui/dom';
import { homeScreen } from './ui/home';
import { pickScreen } from './ui/pick';
import { flashScreen } from './ui/flash';
import { scanScreen } from './ui/scan';
import { doneScreen } from './ui/done';
import { loopbackScreen } from './ui/loopback';

const app = document.getElementById('app')!;
let current: Screen | null = null;

const routes: Record<string, (go: (to: string) => void) => Screen> = {
  home: homeScreen,
  send: pickScreen,
  flash: flashScreen,
  receive: scanScreen,
  done: doneScreen,
  loopback: loopbackScreen,
};

function go(to: string) {
  if (location.hash.slice(1) !== to) location.hash = to;
  else render();
}

function render() {
  const name = location.hash.slice(1);
  const route = routes[name] ?? routes.home;
  current?.destroy?.();
  current = route(go);
  app.replaceChildren(current.el);
}

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
