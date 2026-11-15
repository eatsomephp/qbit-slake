import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleDocument } from './articleDocument';

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.cssText = '';
});

describe('articleDocument', () => {
  it('passes HTML descriptions through unescaped', () => {
    const html = articleDocument('<p>Hello <b>there</b></p>');
    expect(html).toContain('<body><p>Hello <b>there</b></p></body>');
  });

  it('escapes plain text and keeps line breaks', () => {
    const html = articleDocument('a < b & "c" > d\nnext');
    expect(html).toContain('white-space: pre-line');
    expect(html).toContain('a &lt; b &amp; &quot;c&quot; &gt; d\nnext');
    expect(html).not.toContain('a < b');
  });

  it('does not treat a bare less-than comparison as HTML', () => {
    expect(articleDocument('1 < 2 and 3 > 2')).toContain('1 &lt; 2 and 3 &gt; 2');
  });

  it('suppresses referrers and opens links in a new tab', () => {
    const html = articleDocument('x');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<base target="_blank">');
  });

  it('follows the dark class and theme tokens, with fallbacks', () => {
    expect(articleDocument('x')).toContain('color-scheme: light');
    expect(articleDocument('x')).toContain('color: CanvasText');

    const root = document.createElement('div');
    root.classList.add('dark');
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontFamily: 'Inter',
      getPropertyValue: (name: string) => (name === '--foreground' ? ' #eee ' : ''),
    } as unknown as CSSStyleDeclaration);
    const html = articleDocument('x', root);
    expect(html).toContain('color-scheme: dark');
    expect(html).toContain('color: #eee;');
    expect(html).toContain('background: Canvas');
  });
});
