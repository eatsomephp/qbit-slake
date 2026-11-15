import { describe, expect, it } from 'vitest';
import { startTagsMarquee, stopTagsMarquee } from './tagsMarquee';

function viewport(scrollWidth: number, clientWidth: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth });
  return el;
}

const eventOn = (el: HTMLElement) => ({ currentTarget: el }) as unknown as PointerEvent;

describe('tags marquee', () => {
  it('does nothing when the tags fit', () => {
    const el = viewport(100, 100);
    startTagsMarquee(eventOn(el));
    expect(el.dataset.marquee).toBeUndefined();
    expect(el.style.getPropertyValue('--marquee-distance')).toBe('');
  });

  it('scrolls by the overflow at a steady speed, with pauses folded into the cycle', () => {
    const el = viewport(190, 100);
    startTagsMarquee(eventOn(el));
    expect(el.style.getPropertyValue('--marquee-distance')).toBe('-90px');
    // 90px at 45px/s is 2s of travel; 30% of the cycle is pause, so the cycle is 2s / 0.7.
    expect(el.style.getPropertyValue('--marquee-duration')).toBe('2857ms');
    expect(el.dataset.marquee).toBe('');
  });

  it('stops by removing the marker', () => {
    const el = viewport(190, 100);
    startTagsMarquee(eventOn(el));
    stopTagsMarquee(eventOn(el));
    expect(el.dataset.marquee).toBeUndefined();
  });
});
