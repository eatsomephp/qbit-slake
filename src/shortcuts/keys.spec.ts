import { describe, expect, it } from 'vitest';
import {
  assignMnemonics,
  isModifierOnly,
  parseSequence,
  sequenceLabel,
  tokenLabel,
  tokenOf,
} from './keys';

const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: k, ...init });

describe('tokenOf', () => {
  it('keeps printable keys as typed, including their shifted form', () => {
    expect(tokenOf(key('j'))).toBe('j');
    expect(tokenOf(key('G', { shiftKey: true }))).toBe('G');
    expect(tokenOf(key('?', { shiftKey: true }))).toBe('?');
  });

  it('names special keys', () => {
    expect(tokenOf(key(' '))).toBe('Space');
    expect(tokenOf(key('ArrowDown'))).toBe('Down');
    expect(tokenOf(key('Escape'))).toBe('Esc');
    expect(tokenOf(key('Backspace'))).toBe('BS');
    expect(tokenOf(key('Delete'))).toBe('Del');
    expect(tokenOf(key('Enter'))).toBe('Enter');
  });

  it('spells out shift for named keys only', () => {
    expect(tokenOf(key('F10', { shiftKey: true }))).toBe('S-F10');
    expect(tokenOf(key('ArrowUp', { shiftKey: true }))).toBe('S-Up');
  });

  it('prefixes ctrl and meta and lowercases the printable key', () => {
    expect(tokenOf(key('d', { ctrlKey: true }))).toBe('C-d');
    expect(tokenOf(key('D', { ctrlKey: true, shiftKey: true }))).toBe('C-S-d');
    expect(tokenOf(key('z', { metaKey: true }))).toBe('D-z');
    expect(tokenOf(key('ArrowDown', { ctrlKey: true }))).toBe('C-Down');
    expect(tokenOf(key(' ', { ctrlKey: true }))).toBe('C-Space');
  });
});

describe('isModifierOnly', () => {
  it('detects bare modifier presses', () => {
    expect(isModifierOnly(key('Shift'))).toBe(true);
    expect(isModifierOnly(key('Control'))).toBe(true);
    expect(isModifierOnly(key('a'))).toBe(false);
  });
});

describe('parseSequence', () => {
  it('splits plain characters into tokens', () => {
    expect(parseSequence('gg')).toEqual(['g', 'g']);
    expect(parseSequence('fsA')).toEqual(['f', 's', 'A']);
  });

  it('keeps bracketed names as one token', () => {
    expect(parseSequence('<Space>qg')).toEqual(['Space', 'q', 'g']);
    expect(parseSequence('<C-d>')).toEqual(['C-d']);
    expect(parseSequence('<Esc>')).toEqual(['Esc']);
  });

  it('treats a lone angle bracket as a literal key', () => {
    expect(parseSequence('<')).toEqual(['<']);
    expect(parseSequence('>')).toEqual(['>']);
  });

  it('maps Mod to Ctrl off macOS', () => {
    expect(parseSequence('<Mod-a>')).toEqual(['C-a']);
  });

  it('round-trips with tokenOf for notation tokens', () => {
    const [token] = parseSequence('<C-Down>');
    expect(token).toBe(tokenOf(key('ArrowDown', { ctrlKey: true })));
  });
});

describe('labels', () => {
  it('labels named keys with symbols', () => {
    expect(tokenLabel('Down')).toBe('↓');
    expect(tokenLabel('BS')).toBe('⌫');
    expect(tokenLabel('PageDown')).toBe('PgDn');
  });

  it('labels modified keys with uppercase letters', () => {
    expect(tokenLabel('C-d')).toBe('Ctrl D');
    expect(tokenLabel('C-S-Down')).toBe('Ctrl Shift ↓');
  });

  it('joins consecutive single-character keys and spaces the rest', () => {
    expect(sequenceLabel('gg')).toBe('gg');
    expect(sequenceLabel('<Space>qg')).toBe('Space qg');
    expect(sequenceLabel('<Esc>')).toBe('Esc');
  });
});

describe('assignMnemonics', () => {
  it('gives each label its first letter when free', () => {
    expect(assignMnemonics(['Apple', 'Banana'])).toEqual(['a', 'b']);
  });

  it('falls back to later letters on collisions', () => {
    expect(assignMnemonics(['Seeding', 'Stopped'])).toEqual(['s', 't']);
  });

  it('gives first letters priority over later letters of earlier labels', () => {
    expect(assignMnemonics(['Sa', 'Ab', 'S2'])).toEqual(['s', 'a', '2']);
  });

  it('always produces unique keys, using the pool when letters run out', () => {
    const keys = assignMnemonics(['aa', 'aa', 'aa', '--']);
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((k) => k !== null)).toBe(true);
    expect(keys[0]).toBe('a');
  });

  it('is deterministic for the same input', () => {
    const labels = ['Active', 'Alpha', 'Archived'];
    expect(assignMnemonics(labels)).toEqual(assignMnemonics(labels));
  });
});
