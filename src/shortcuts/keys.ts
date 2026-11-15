export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  ArrowDown: 'Down',
  ArrowUp: 'Up',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: 'BS',
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock']);

export function isModifierOnly(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(event.key);
}

// Shift is spelled out only for named keys: printable ones already carry it (`G`, `?`).
export function tokenOf(event: KeyboardEvent): string {
  const key = NAMED_KEYS[event.key] ?? event.key;
  const isNamed = key.length > 1;
  let prefix = '';
  if (event.ctrlKey) prefix += 'C-';
  if (event.metaKey) prefix += 'D-';
  if (event.shiftKey && (isNamed || prefix)) prefix += 'S-';
  return prefix + (prefix && !isNamed ? key.toLowerCase() : key);
}

export function parseSequence(notation: string): string[] {
  const tokens: string[] = [];
  for (const [, bracketed, plain] of notation.matchAll(/<([^>]+)>|(.)/g)) {
    tokens.push(bracketed ? bracketed.replace(/^Mod-/, isMac ? 'D-' : 'C-') : plain!);
  }
  return tokens;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  Down: '↓',
  Up: '↑',
  Left: '←',
  Right: '→',
  Esc: 'Esc',
  Del: 'Del',
  BS: '⌫',
  PageDown: 'PgDn',
  PageUp: 'PgUp',
  ContextMenu: 'Menu',
};

const MODIFIER_LABELS: Record<string, string> = isMac
  ? { C: '⌃', D: '⌘', S: '⇧' }
  : { C: 'Ctrl ', D: 'Win ', S: 'Shift ' };

export function tokenLabel(token: string): string {
  const parts = token.split(/-(?=.)/);
  const key = parts.pop()!;
  const modifiers = parts.map((m) => MODIFIER_LABELS[m] ?? m).join('');
  const keyLabel = KEY_LABELS[key] ?? (modifiers && key.length === 1 ? key.toUpperCase() : key);
  return modifiers + keyLabel;
}

export function sequenceLabel(keys: string): string {
  const labels = parseSequence(keys).map(tokenLabel);
  return labels.reduce((text, label, index) => {
    const joinsPreviousKey = index > 0 && label.length === 1 && labels[index - 1]!.length === 1;
    return index === 0 || joinsPreviousKey ? text + label : `${text} ${label}`;
  }, '');
}

const MNEMONIC_POOL = [...'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function assignMnemonics(labels: readonly string[]): (string | null)[] {
  const taken = new Set<string>();
  const keys: (string | null)[] = labels.map(() => null);
  const claim = (index: number, key: string | undefined) => {
    if (keys[index] !== null || key === undefined || taken.has(key)) return;
    taken.add(key);
    keys[index] = key;
  };
  const candidates = labels.map((label) =>
    [...label.toLowerCase()].filter((c) => /[a-z0-9]/.test(c)),
  );
  candidates.forEach((chars, index) => claim(index, chars[0]));
  candidates.forEach((chars, index) => chars.forEach((c) => claim(index, c)));
  labels.forEach((_, index) =>
    claim(
      index,
      MNEMONIC_POOL.find((key) => !taken.has(key)),
    ),
  );
  return keys;
}
