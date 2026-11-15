import type { Directive } from 'vue';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipText = string | null | undefined | false;

export const TOOLTIP_TEXT_ATTRIBUTE = 'data-tooltip';
export const TOOLTIP_SIDE_ATTRIBUTE = 'data-tooltip-side';

const withoutWhitespace = (text: string) => text.replace(/\s+/g, '');

export function repeatsVisibleText(el: HTMLElement, text: string) {
  return withoutWhitespace(el.textContent ?? '') === withoutWhitespace(text);
}

const elementsLabelledByTooltip = new WeakSet<HTMLElement>();

function setOrRemoveAttribute(el: HTMLElement, name: string, value: string | null) {
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
}

function hasNoAccessibleName(el: HTMLElement) {
  return (
    !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent?.trim()
  );
}

// Mirrors native `title`: names icon-only elements, otherwise describes them.
function exposeToAssistiveTech(el: HTMLElement, text: string | null) {
  if (elementsLabelledByTooltip.has(el) || (text && hasNoAccessibleName(el))) {
    elementsLabelledByTooltip.add(el);
    setOrRemoveAttribute(el, 'aria-label', text);
    return;
  }
  const isRedundant =
    !text || text === el.getAttribute('aria-label') || repeatsVisibleText(el, text);
  setOrRemoveAttribute(el, 'aria-description', isRedundant ? null : text);
}

function applyTooltip(el: HTMLElement, value: TooltipText, side: TooltipSide | undefined) {
  const text = value || null;
  setOrRemoveAttribute(el, TOOLTIP_TEXT_ATTRIBUTE, text);
  setOrRemoveAttribute(el, TOOLTIP_SIDE_ATTRIBUTE, side ?? null);
  exposeToAssistiveTech(el, text);
}

export const vTooltip: Directive<HTMLElement, TooltipText, string, TooltipSide> = {
  mounted(el, binding) {
    applyTooltip(el, binding.value, binding.arg);
  },
  updated(el, binding) {
    if (binding.value === binding.oldValue) return;
    applyTooltip(el, binding.value, binding.arg);
  },
};
