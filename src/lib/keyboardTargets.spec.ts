import { afterEach, describe, expect, it } from 'vitest';
import { isTyping, overlayOpen } from './keyboardTargets';

afterEach(() => {
  document.body.innerHTML = '';
});

const add = (tag: string, attrs: Record<string, string> = {}) => {
  const el = document.body.appendChild(document.createElement(tag));
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

describe('isTyping', () => {
  it.each(['input', 'textarea', 'select'])('is true for %s', (tag) => {
    expect(isTyping(add(tag))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    const el = add('div');
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isTyping(el)).toBe(true);
  });

  it('is false for other elements and non-elements', () => {
    expect(isTyping(add('button'))).toBe(false);
    expect(isTyping(add('div'))).toBe(false);
    expect(isTyping(null)).toBe(false);
    expect(isTyping(window)).toBe(false);
    expect(isTyping(document)).toBe(false);
  });
});

describe('overlayOpen', () => {
  it('is false with no overlay', () => {
    add('div');
    expect(overlayOpen()).toBe(false);
  });

  it.each(['dialog', 'alertdialog', 'menu'])('is true for role=%s', (role) => {
    add('div', { role });
    expect(overlayOpen()).toBe(true);
  });

  it('ignores the overlay it is told to ignore, but not others', () => {
    const own = add('div', { role: 'dialog' });
    expect(overlayOpen(own)).toBe(false);
    add('div', { role: 'menu' });
    expect(overlayOpen(own)).toBe(true);
  });
});
