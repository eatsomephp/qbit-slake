const LOOKS_LIKE_HTML = /<[a-z][^>]*>/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function themeToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function articleDocument(description: string, root: HTMLElement = document.documentElement) {
  const styles = getComputedStyle(root);
  const isDark = root.classList.contains('dark');
  const body = LOOKS_LIKE_HTML.test(description)
    ? description
    : `<div style="white-space: pre-line">${escapeHtml(description)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><style>
:root { color-scheme: ${isDark ? 'dark' : 'light'}; }
body { margin: 0; padding: 12px; font: 13px/1.55 ${styles.fontFamily}; color: ${themeToken(styles, '--foreground', 'CanvasText')}; background: ${themeToken(styles, '--background', 'Canvas')}; overflow-wrap: anywhere; }
a { color: ${themeToken(styles, '--primary', 'LinkText')}; }
img, video { max-width: 100%; height: auto; }
table { border-collapse: collapse; max-width: 100%; }
td, th { border: 1px solid ${themeToken(styles, '--border', 'GrayText')}; padding: 2px 6px; }
pre, code { white-space: pre-wrap; }
hr { border: 0; border-top: 1px solid ${themeToken(styles, '--border', 'GrayText')}; }
</style></head><body>${body}</body></html>`;
}
