import { onScopeDispose, reactive, shallowRef } from 'vue';
import { useEventListener } from '@vueuse/core';
import { isTyping, overlayOpen } from '@/lib/keyboardTargets';
import { isModifierOnly, parseSequence, sequenceLabel, tokenOf } from './keys';

export type KeymapSection =
  | 'navigate'
  | 'panel'
  | 'page'
  | 'select'
  | 'details'
  | 'torrent'
  | 'change'
  | 'copy'
  | 'filter'
  | 'goto'
  | 'app';

export interface RunContext {
  count: number | null;
  extend: boolean;
  wasVisual: boolean;
}

export interface Binding {
  keys: string;
  fallbacks?: string[];
  label: string;
  section?: KeymapSection;
  isMotion?: boolean;
  isAvailable?: () => boolean;
  isEnabled?: () => boolean;
  run: (context: RunContext) => void;
}

export interface KeyGroup {
  keys: string;
  label: string;
  cheatSheet?: { section: KeymapSection; label: string };
}

export interface Keymap {
  readonly bindings: readonly Binding[];
  readonly groups?: readonly KeyGroup[];
  isActive?: () => boolean;
  passesUnboundKeysDown?: boolean;
  dialogRoot?: () => Element | null;
}

export interface Hint {
  token: string;
  label: string;
  isGroup: boolean;
  isEnabled: boolean;
}

export interface CheatSheetEntry {
  section: KeymapSection;
  label: string;
  sequences: string[][];
}

const HINT_DELAY_MS = 250;
const MAX_COUNT = 99_999;

export const keyState = reactive({
  pending: [] as string[],
  count: null as number | null,
  isVisual: false,
  showsHints: false,
});

const keymapStack = shallowRef<readonly Keymap[]>([]);

export function activeKeymaps(): Keymap[] {
  const chain: Keymap[] = [];
  for (const keymap of [...keymapStack.value].reverse()) {
    if (!(keymap.isActive?.() ?? true)) continue;
    chain.push(keymap);
    if (!keymap.passesUnboundKeysDown) break;
  }
  return chain;
}

interface CompiledSequence {
  tokens: string[];
  binding: Binding;
  isPrimary: boolean;
}

const isAvailable = (binding: Binding) => binding.isAvailable?.() ?? true;
const isEnabled = (binding: Binding) => binding.isEnabled?.() ?? true;

function compile(keymaps: readonly Keymap[]): CompiledSequence[] {
  const claimed = new Set<string>();
  const sequences: CompiledSequence[] = [];
  for (const keymap of keymaps) {
    for (const binding of keymap.bindings) {
      if (!isAvailable(binding)) continue;
      const all = [binding.keys, ...(binding.fallbacks ?? [])];
      all.forEach((keys, index) => {
        const tokens = parseSequence(keys);
        const id = tokens.join(' ');
        if (claimed.has(id)) return;
        claimed.add(id);
        sequences.push({ tokens, binding, isPrimary: index === 0 });
      });
    }
  }
  return sequences;
}

function startsWith(tokens: readonly string[], prefix: readonly string[]) {
  return prefix.every((token, index) => tokens[index] === token);
}

function sameTokens(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && startsWith(a, b);
}

function findGroup(keymaps: readonly Keymap[], tokens: readonly string[]) {
  for (const keymap of keymaps) {
    const group = keymap.groups?.find((g) => sameTokens(parseSequence(g.keys), tokens));
    if (group) return group;
  }
  return undefined;
}

export function hintsAfter(keymaps: readonly Keymap[], prefix: readonly string[]): Hint[] {
  const byToken = new Map<string, Hint>();
  for (const { tokens, binding, isPrimary } of compile(keymaps)) {
    if (!isPrimary) continue;
    if (tokens.length <= prefix.length || !startsWith(tokens, prefix)) continue;
    const token = tokens[prefix.length]!;
    const existing = byToken.get(token);
    if (tokens.length === prefix.length + 1) {
      byToken.set(token, {
        token,
        label: binding.label,
        isGroup: false,
        isEnabled: isEnabled(binding),
      });
    } else if (existing?.isGroup) {
      existing.isEnabled ||= isEnabled(binding);
    } else if (!existing) {
      byToken.set(token, {
        token,
        label: findGroup(keymaps, [...prefix, token])?.label ?? '…',
        isGroup: true,
        isEnabled: isEnabled(binding),
      });
    }
  }
  return [...byToken.values()].sort(compareHintTokens);
}

function compareHintTokens(a: Hint, b: Hint) {
  const aKey = a.token.toLowerCase();
  const bKey = b.token.toLowerCase();
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  return a.token < b.token ? 1 : -1;
}

export function groupLabel(keymaps: readonly Keymap[], tokens: readonly string[]) {
  return findGroup(keymaps, tokens)?.label;
}

export function cheatSheetEntries(keymaps: readonly Keymap[]): CheatSheetEntry[] {
  const sequencesByBinding = new Map<Binding, string[][]>();
  for (const { tokens, binding } of compile(keymaps)) {
    if (!binding.section) continue;
    const sequences = sequencesByBinding.get(binding) ?? [];
    sequences.push(tokens);
    sequencesByBinding.set(binding, sequences);
  }
  const bindingEntries = [...sequencesByBinding].map(([binding, sequences]) => ({
    section: binding.section!,
    label: binding.label,
    sequences,
  }));
  const groupEntries = keymaps.flatMap((keymap) =>
    (keymap.groups ?? []).flatMap(({ keys, cheatSheet }) =>
      cheatSheet ? [{ ...cheatSheet, sequences: [[...parseSequence(keys), '…']] }] : [],
    ),
  );
  return [...bindingEntries, ...groupEntries];
}

export function shortcutLabel(keys: string): string | null {
  for (const keymap of keymapStack.value) {
    const binding = keymap.bindings.find((b) => b.keys === keys);
    if (binding && isAvailable(binding)) return sequenceLabel(keys);
  }
  return null;
}

export function withShortcut(text: string, keys: string): string {
  const shortcut = shortcutLabel(keys);
  return shortcut ? `${text} (${shortcut})` : text;
}

/** Space and Enter belong to a focused button, link, tab or checkbox. */
function isActivatable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button, a[href], [role=button], [role=tab], [role=checkbox]') !== null
  );
}

function leaveAllModes() {
  resetPending();
  keyState.isVisual = false;
}

let hintTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleHints() {
  clearTimeout(hintTimer);
  keyState.showsHints = false;
  hintTimer = setTimeout(() => (keyState.showsHints = true), HINT_DELAY_MS);
}

export function resetPending() {
  clearTimeout(hintTimer);
  keyState.pending = [];
  keyState.count = null;
  keyState.showsHints = false;
}

export function useKeymap(keymap: Keymap) {
  keymapStack.value = [...keymapStack.value, keymap];

  function matching(sequences: readonly CompiledSequence[], tokens: readonly string[]) {
    let exact: CompiledSequence | undefined;
    let isPrefix = false;
    for (const sequence of sequences) {
      if (!startsWith(sequence.tokens, tokens)) continue;
      if (sequence.tokens.length === tokens.length) exact ??= sequence;
      else isPrefix = true;
    }
    return { exact, isPrefix };
  }

  function shiftedMotion(sequences: readonly CompiledSequence[], tokens: readonly string[]) {
    const last = tokens.at(-1)!;
    if (!last.startsWith('S-')) return undefined;
    const { exact } = matching(sequences, [...tokens.slice(0, -1), last.slice(2)]);
    return exact?.binding.isMotion ? exact : undefined;
  }

  function run(binding: Binding, extend: boolean, event: KeyboardEvent) {
    event.preventDefault();
    const context: RunContext = {
      count: keyState.count,
      extend: extend || keyState.isVisual,
      wasVisual: keyState.isVisual,
    };
    resetPending();
    if (!binding.isMotion) keyState.isVisual = false;
    if (isEnabled(binding)) binding.run(context);
  }

  function onKeydown(event: KeyboardEvent) {
    const keymaps = activeKeymaps();
    if (keymaps[0] !== keymap) return;
    if (event.defaultPrevented || event.altKey || isModifierOnly(event)) return;
    if (isTyping(event.target) || overlayOpen(keymaps.at(-1)!.dialogRoot?.() ?? null)) {
      resetPending();
      return;
    }
    const token = tokenOf(event);
    const hasPending = keyState.pending.length > 0 || keyState.count !== null;
    if (!hasPending && (token === 'Space' || token === 'Enter') && isActivatable(event.target))
      return;
    if (hasPending && token === 'Esc') {
      event.preventDefault();
      resetPending();
      return;
    }
    const continuesCount = keyState.count !== null && token === '0';
    if (!keyState.pending.length && (/^[1-9]$/.test(token) || continuesCount)) {
      event.preventDefault();
      keyState.count = Math.min((keyState.count ?? 0) * 10 + Number(token), MAX_COUNT);
      scheduleHints();
      return;
    }

    const sequences = compile(keymaps);
    const tokens = [...keyState.pending, token];
    const { exact, isPrefix } = matching(sequences, tokens);
    if (exact && !isPrefix) return run(exact.binding, false, event);
    if (isPrefix) {
      event.preventDefault();
      keyState.pending = tokens;
      scheduleHints();
      return;
    }
    const shifted = shiftedMotion(sequences, tokens);
    if (shifted) return run(shifted.binding, true, event);
    if (hasPending) {
      event.preventDefault();
      resetPending();
    }
  }

  useEventListener(window, 'keydown', onKeydown);
  useEventListener(window, 'blur', resetPending);
  useEventListener(window, 'pointerdown', leaveAllModes);
  onScopeDispose(() => {
    keymapStack.value = keymapStack.value.filter((k) => k !== keymap);
    if (keymapStack.value.length) resetPending();
    else leaveAllModes();
  });
}
