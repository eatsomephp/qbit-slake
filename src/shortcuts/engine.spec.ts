import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import {
  activeKeymaps,
  cheatSheetEntries,
  groupLabel,
  hintsAfter,
  keyState,
  resetPending,
  shortcutLabel,
  useKeymap,
  withShortcut,
  type Binding,
  type Keymap,
} from './engine';

const mounted: VueWrapper[] = [];

function install(keymap: Keymap) {
  const wrapper = mount(
    defineComponent({
      setup() {
        useKeymap(keymap);
        return () => h('div');
      },
    }),
  );
  mounted.push(wrapper);
  return wrapper;
}

function press(k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const typeKeys = (text: string) => [...text].forEach((c) => press(c));

function binding(keys: string, run = vi.fn(), extra: Partial<Binding> = {}): Binding {
  return { keys, label: keys, run, ...extra };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  resetPending();
  keyState.isVisual = false;
});

describe('dispatch', () => {
  it('runs a single-key binding and prevents default', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run)] });
    const event = press('x');
    expect(run).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves unbound keys alone', () => {
    install({ bindings: [binding('x')] });
    expect(press('z').defaultPrevented).toBe(false);
  });

  it('runs fallbacks like the primary keys', () => {
    const run = vi.fn();
    install({ bindings: [binding('j', run, { fallbacks: ['<Down>'] })] });
    press('ArrowDown');
    press('j');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('completes multi-key sequences and tracks pending state', () => {
    const run = vi.fn();
    install({ bindings: [binding('gg', run)] });
    press('g');
    expect(keyState.pending).toEqual(['g']);
    expect(run).not.toHaveBeenCalled();
    press('g');
    expect(run).toHaveBeenCalledOnce();
    expect(keyState.pending).toEqual([]);
  });

  it('cancels a sequence on a non-matching key and swallows it', () => {
    const run = vi.fn();
    const other = vi.fn();
    install({ bindings: [binding('gg', run), binding('z', other)] });
    press('g');
    const event = press('z');
    expect(event.defaultPrevented).toBe(true);
    expect(other).not.toHaveBeenCalled();
    expect(keyState.pending).toEqual([]);
  });

  it('cancels a pending sequence on Escape without running Esc bindings', () => {
    const esc = vi.fn();
    install({ bindings: [binding('gg'), binding('<Esc>', esc)] });
    press('g');
    press('Escape');
    expect(keyState.pending).toEqual([]);
    expect(esc).not.toHaveBeenCalled();
    press('Escape');
    expect(esc).toHaveBeenCalledOnce();
  });

  it('prefers a longer sequence when a shorter one is its prefix', () => {
    const short = vi.fn();
    const long = vi.fn();
    install({ bindings: [binding('d', short), binding('dd', long)] });
    press('d');
    expect(short).not.toHaveBeenCalled();
    press('d');
    expect(long).toHaveBeenCalledOnce();
  });

  it('ignores alt chords, modifier-only presses and defaultPrevented events', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run)] });
    press('x', { altKey: true });
    press('Shift', { shiftKey: true });
    const prevented = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.body.dispatchEvent(prevented);
    expect(run).not.toHaveBeenCalled();
  });

  it('skips bindings whose isAvailable is false and lets the key through', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run, { isAvailable: () => false })] });
    expect(press('x').defaultPrevented).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('swallows the key but skips run when isEnabled is false', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run, { isEnabled: () => false })] });
    expect(press('x').defaultPrevented).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('counts', () => {
  it('accumulates digits and passes the count to the binding', () => {
    const run = vi.fn();
    install({ bindings: [binding('j', run)] });
    typeKeys('12j');
    expect(run).toHaveBeenCalledWith({ count: 12, extend: false, wasVisual: false });
    expect(keyState.count).toBeNull();
  });

  it('treats 0 as a count digit only after another digit', () => {
    const zero = vi.fn();
    const run = vi.fn();
    install({ bindings: [binding('0', zero), binding('j', run)] });
    press('0');
    expect(zero).toHaveBeenCalledOnce();
    typeKeys('10j');
    expect(run.mock.calls[0]![0].count).toBe(10);
  });

  it('caps the count', () => {
    install({ bindings: [binding('j')] });
    typeKeys('9999999');
    expect(keyState.count).toBe(99_999);
  });

  it('does not take digits as a count in the middle of a sequence', () => {
    const run = vi.fn();
    install({ bindings: [binding('g1', run)] });
    press('g');
    press('1');
    expect(run).toHaveBeenCalledOnce();
  });

  it('Escape clears a pending count', () => {
    install({ bindings: [binding('j')] });
    press('3');
    expect(keyState.count).toBe(3);
    press('Escape');
    expect(keyState.count).toBeNull();
  });
});

describe('visual mode and shifted motions', () => {
  it('motions keep visual mode and report extend; other bindings leave it', () => {
    const motion = vi.fn();
    const action = vi.fn();
    install({
      bindings: [binding('j', motion, { isMotion: true }), binding('x', action)],
    });
    keyState.isVisual = true;
    press('j');
    expect(motion).toHaveBeenCalledWith({ count: null, extend: true, wasVisual: true });
    expect(keyState.isVisual).toBe(true);
    press('x');
    expect(keyState.isVisual).toBe(false);
  });

  it('shift plus a named motion key extends the selection', () => {
    const run = vi.fn();
    install({ bindings: [binding('j', run, { fallbacks: ['<Down>'], isMotion: true })] });
    press('ArrowDown', { shiftKey: true });
    expect(run).toHaveBeenCalledWith({ count: null, extend: true, wasVisual: false });
  });

  it('shift does not extend for non-motion bindings', () => {
    const run = vi.fn();
    install({ bindings: [binding('<Enter>', run)] });
    expect(press('Enter', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('pointerdown and blur reset modes', () => {
    install({ bindings: [binding('gg')] });
    press('g');
    keyState.isVisual = true;
    window.dispatchEvent(new Event('blur'));
    expect(keyState.pending).toEqual([]);
    expect(keyState.isVisual).toBe(true);
    window.dispatchEvent(new Event('pointerdown'));
    expect(keyState.isVisual).toBe(false);
  });
});

describe('suppression', () => {
  it.each(['input', 'textarea', 'select'])('ignores keys typed into a %s', (tag) => {
    const run = vi.fn();
    install({ bindings: [binding('x', run)] });
    const field = document.body.appendChild(document.createElement(tag));
    press('x', {}, field);
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores keys in a contenteditable element', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run)] });
    const div = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(div, 'isContentEditable', { value: true });
    press('x', {}, div);
    expect(run).not.toHaveBeenCalled();
  });

  it('typing in a field cancels a pending sequence', () => {
    const run = vi.fn();
    install({ bindings: [binding('gg', run)] });
    press('g');
    const input = document.body.appendChild(document.createElement('input'));
    press('g', {}, input);
    expect(keyState.pending).toEqual([]);
  });

  it('stays out of the way while a dialog or menu is open', () => {
    const run = vi.fn();
    install({ bindings: [binding('x', run)] });
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    press('x');
    expect(run).not.toHaveBeenCalled();
    dialog.setAttribute('role', 'menu');
    press('x');
    expect(run).not.toHaveBeenCalled();
    dialog.remove();
    press('x');
    expect(run).toHaveBeenCalledOnce();
  });

  it('allows the keymap that owns the open dialog root', () => {
    const run = vi.fn();
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    install({ bindings: [binding('x', run)], dialogRoot: () => dialog });
    press('x');
    expect(run).toHaveBeenCalledOnce();
  });

  it.each(['button', 'a'])('leaves Space and Enter to a focused %s', (tag) => {
    const run = vi.fn();
    install({ bindings: [binding('<Space>', run), binding('<Enter>', run)] });
    const el = document.body.appendChild(document.createElement(tag));
    if (tag === 'a') el.setAttribute('href', '#');
    expect(press(' ', {}, el).defaultPrevented).toBe(false);
    expect(press('Enter', {}, el).defaultPrevented).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('still handles Space on a button when a sequence is pending', () => {
    const run = vi.fn();
    install({ bindings: [binding('g<Space>', run)] });
    const button = document.body.appendChild(document.createElement('button'));
    press('g', {}, button);
    press(' ', {}, button);
    expect(run).toHaveBeenCalledOnce();
  });
});

describe('keymap stacking', () => {
  it('only the top keymap handles keys and a plain keymap blocks those below', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    install({ bindings: [binding('x', lower), binding('y', lower)] });
    install({ bindings: [binding('x', upper)] });
    press('x');
    press('y');
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
  });

  it('unbound keys pass down when the upper keymap allows it', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    install({ bindings: [binding('x', lower), binding('y', lower)] });
    install({ bindings: [binding('x', upper)], passesUnboundKeysDown: true });
    press('x');
    press('y');
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).toHaveBeenCalledOnce();
  });

  it('the upper keymap wins duplicate sequences and its fallbacks shadow lower primaries', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    install({ bindings: [binding('j', lower)] });
    install({
      bindings: [binding('k', upper, { fallbacks: ['j'] })],
      passesUnboundKeysDown: true,
    });
    press('j');
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
  });

  it('skips inactive keymaps and falls through to the one below', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    let active = false;
    install({ bindings: [binding('x', lower)] });
    install({ bindings: [binding('x', upper)], isActive: () => active });
    press('x');
    expect(lower).toHaveBeenCalledOnce();
    active = true;
    press('x');
    expect(upper).toHaveBeenCalledOnce();
  });

  it('activeKeymaps lists the chain top-down and stops at a blocking keymap', () => {
    const a: Keymap = { bindings: [] };
    const b: Keymap = { bindings: [], passesUnboundKeysDown: true };
    const c: Keymap = { bindings: [], passesUnboundKeysDown: true };
    install(a);
    install(b);
    install(c);
    expect(activeKeymaps()).toEqual([c, b, a]);
    install({ bindings: [] });
    expect(activeKeymaps()).toHaveLength(1);
  });

  it('removes its keymap and resets state on unmount', () => {
    const run = vi.fn();
    const wrapper = install({ bindings: [binding('gg', run)] });
    press('g');
    keyState.isVisual = true;
    wrapper.unmount();
    mounted.length = 0;
    expect(activeKeymaps()).toEqual([]);
    expect(keyState.pending).toEqual([]);
    expect(keyState.isVisual).toBe(false);
    press('x');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('which-key hints', () => {
  it('shows hints only after a delay once a prefix is pending', () => {
    install({ bindings: [binding('gg')] });
    press('g');
    expect(keyState.showsHints).toBe(false);
    vi.advanceTimersByTime(250);
    expect(keyState.showsHints).toBe(true);
    press('g');
    expect(keyState.showsHints).toBe(false);
  });

  it('lists next tokens, collapsing deeper sequences into groups', () => {
    const keymap: Keymap = {
      bindings: [
        binding('<Space>a', vi.fn(), { label: 'All' }),
        binding('<Space>qg', vi.fn(), { label: 'Top' }),
        binding('<Space>qk', vi.fn(), { label: 'Up', isEnabled: () => false }),
        binding('<Space>j', vi.fn(), { label: 'J', fallbacks: ['<Space>z'] }),
      ],
      groups: [{ keys: '<Space>q', label: 'Queue' }],
    };
    const hints = hintsAfter([keymap], ['Space']);
    expect(hints.map((h) => h.token)).toEqual(['a', 'j', 'q']);
    expect(hints.find((h) => h.token === 'q')).toMatchObject({
      label: 'Queue',
      isGroup: true,
      isEnabled: true,
    });
    expect(hints.find((h) => h.token === 'a')).toMatchObject({ label: 'All', isGroup: false });
  });

  it('marks a group disabled only when every member is disabled', () => {
    const off = { isEnabled: () => false };
    const hints = hintsAfter(
      [{ bindings: [binding('qa', vi.fn(), off), binding('qb', vi.fn(), off)] }],
      [],
    );
    expect(hints).toEqual([{ token: 'q', label: '…', isGroup: true, isEnabled: false }]);
    const mixed = hintsAfter([{ bindings: [binding('qa', vi.fn(), off), binding('qb')] }], []);
    expect(mixed[0]!.isEnabled).toBe(true);
  });

  it('sorts case-insensitively with lowercase first', () => {
    const tokens = hintsAfter(
      [{ bindings: [binding('B'), binding('a'), binding('b'), binding('A')] }],
      [],
    ).map((h) => h.token);
    expect(tokens).toEqual(['a', 'A', 'b', 'B']);
  });

  it('groupLabel finds a group by its keys', () => {
    const keymap: Keymap = { bindings: [], groups: [{ keys: 'fs', label: 'Status' }] };
    expect(groupLabel([keymap], ['f', 's'])).toBe('Status');
    expect(groupLabel([keymap], ['f'])).toBeUndefined();
  });
});

describe('cheat sheet and labels', () => {
  it('collects primary and fallback sequences per binding and group entries', () => {
    const j = binding('j', vi.fn(), { section: 'navigate', fallbacks: ['<Down>'] });
    const hidden = binding('h', vi.fn(), { section: 'navigate', isAvailable: () => false });
    const unsectioned = binding('u');
    const entries = cheatSheetEntries([
      {
        bindings: [j, hidden, unsectioned],
        groups: [
          { keys: 'fs', label: 'Status', cheatSheet: { section: 'filter', label: 'Toggle' } },
        ],
      },
    ]);
    expect(entries).toEqual([
      { section: 'navigate', label: 'j', sequences: [['j'], ['Down']] },
      { section: 'filter', label: 'Toggle', sequences: [['f', 's', '…']] },
    ]);
  });

  it('shortcutLabel and withShortcut reflect registered, available bindings', () => {
    expect(shortcutLabel('x')).toBeNull();
    expect(withShortcut('Stop', 'x')).toBe('Stop');
    let available = true;
    install({ bindings: [binding('x', vi.fn(), { isAvailable: () => available })] });
    expect(shortcutLabel('x')).toBe('x');
    expect(withShortcut('Stop', 'x')).toBe('Stop (x)');
    available = false;
    expect(withShortcut('Stop', 'x')).toBe('Stop');
  });
});
