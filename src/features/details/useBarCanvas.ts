import { ref, watchEffect } from 'vue';
import { useElementSize } from '@vueuse/core';

export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/**
 * Sizes a canvas to its wrapper at device resolution and calls `draw` with the CSS
 * width whenever the size or anything `draw` reads changes.
 */
export function useBarCanvas(
  height: number,
  draw: (ctx: CanvasRenderingContext2D, cssWidth: number) => void,
) {
  const wrap = ref<HTMLElement | null>(null);
  const canvas = ref<HTMLCanvasElement | null>(null);
  const { width } = useElementSize(wrap);

  watchEffect(() => {
    const el = canvas.value;
    const cssWidth = Math.floor(width.value);
    if (!el || cssWidth <= 0) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = cssWidth * dpr;
    el.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    draw(ctx, cssWidth);
    ctx.globalAlpha = 1;
  });

  return { wrap, canvas };
}
