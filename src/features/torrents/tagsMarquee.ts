const SCROLL_PX_PER_SECOND = 45;
const PAUSE_SHARE_AT_EACH_END = 0.3;

export function startTagsMarquee(event: PointerEvent) {
  const viewport = event.currentTarget as HTMLElement;
  const overflowPx = viewport.scrollWidth - viewport.clientWidth;
  if (overflowPx <= 0) return;
  const travelMs = (overflowPx / SCROLL_PX_PER_SECOND) * 1000;
  const cycleMs = travelMs / (1 - PAUSE_SHARE_AT_EACH_END);
  viewport.style.setProperty('--marquee-distance', `${-overflowPx}px`);
  viewport.style.setProperty('--marquee-duration', `${Math.round(cycleMs)}ms`);
  viewport.dataset.marquee = '';
}

export function stopTagsMarquee(event: PointerEvent) {
  delete (event.currentTarget as HTMLElement).dataset.marquee;
}
