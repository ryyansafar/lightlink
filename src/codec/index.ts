import { sha256 } from './sha256';

export { Encoder } from './encoder';
export { Decoder } from './decoder';
export { crc32 } from './crc32';

const EMOJI = ['🦊', '🐙', '🌵', '🚀', '🍋', '🎸', '🐢', '🌈', '🔑', '🍄', '🐝', '⚓', '🎲', '🌙', '🍉', '🦉',
  '⛵', '🔥', '🐳', '🍪', '🧲', '🎈', '🦋', '🌻', '🍕', '🐧', '🛸', '🧩', '🏔', '🪁', '🐞', '🥑',
  '🎯', '🦄', '🍩', '🌊', '🐸', '🎹', '🧭', '🪐', '🥕', '🦀', '🍓', '🚲', '⭐', '🐘', '🍇', '🛶',
  '🎺', '🦜', '🌶', '🪄', '🐌', '🍒', '🔔', '🦈', '🥨', '🏀', '🐼', '🌴', '🍔', '🦎', '🎻', '🧸'];

/** 4 emoji from SHA-256 (6 bits each), shown on both phones to compare by eye. */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const h = sha256(bytes);
  return [0, 1, 2, 3].map((i) => EMOJI[h[i] & 63]).join('');
}
