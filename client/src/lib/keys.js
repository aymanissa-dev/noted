// Platform-aware key labels. Shortcuts are written as "Mod+Shift+K" and shown as ⌘⇧K on a Mac, Ctrl+Shift+K elsewhere.
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

const MAC = { Mod: '⌘', Ctrl: '⌃', Shift: '⇧', Alt: '⌥', Enter: '↵', Up: '↑', Down: '↓', Left: '←', Right: '→' };
const PC = { Mod: 'Ctrl', Ctrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Enter: 'Enter', Up: '↑', Down: '↓', Left: '←', Right: '→' };

// "Mod+Shift+K" → ['⌘', '⇧', 'K'] (Mac) or ['Ctrl', 'Shift', 'K'].
export function keyParts(combo, mac = IS_MAC) {
  const map = mac ? MAC : PC;
  return combo.split('+').map((k) => map[k] || k);
}
// Text label for tooltips: "⌘K" on Mac, "Ctrl+K" elsewhere. Sequences ("G N") stay spaced.
export function keyLabel(combo, mac = IS_MAC) {
  return combo.split(' ').map((c) => keyParts(c, mac).join(mac ? '' : '+')).join(' then ');
}
