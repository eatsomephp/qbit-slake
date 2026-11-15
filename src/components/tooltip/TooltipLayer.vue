<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { placeTooltip } from './placeTooltip';
import {
  TOOLTIP_SIDE_ATTRIBUTE,
  TOOLTIP_TEXT_ATTRIBUTE,
  repeatsVisibleText,
  type TooltipSide,
} from './vTooltip';

const SHOW_DELAY_MS = 250;
const INSTANT_REOPEN_WINDOW_MS = 300;
const WIDE_ANCHOR_PX = 200;

const bubble = ref<HTMLElement>();
const isVisible = ref(false);
const isGliding = ref(false);
const text = ref('');
const side = ref<TooltipSide>('top');
const position = ref({ x: 0, y: 0 });
const caretOffset = ref(0);

let anchor: HTMLElement | null = null;
let anchorPointerX: number | undefined;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let lastHiddenAt = 0;
let anchorObserver: MutationObserver | undefined;

function tooltipAnchorFrom(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>(`[${TOOLTIP_TEXT_ATTRIBUTE}]`)
    : null;
}

function isTruncated(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
}

function preferredSideOf(el: HTMLElement): TooltipSide {
  return (el.getAttribute(TOOLTIP_SIDE_ATTRIBUTE) as TooltipSide | null) ?? 'top';
}

function cancelScheduledShow() {
  clearTimeout(showTimer);
  showTimer = undefined;
}

function hide() {
  cancelScheduledShow();
  anchorObserver?.disconnect();
  if (isVisible.value) lastHiddenAt = performance.now();
  isVisible.value = false;
  isGliding.value = false;
}

function forgetAnchor() {
  hide();
  anchor = null;
}

async function reposition() {
  await nextTick();
  if (!anchor || !bubble.value) return;
  const anchorRect = anchor.getBoundingClientRect();
  const placement = placeTooltip(
    anchorRect,
    { width: bubble.value.offsetWidth, height: bubble.value.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    preferredSideOf(anchor),
    anchorRect.width > WIDE_ANCHOR_PX ? anchorPointerX : undefined,
  );
  position.value = { x: placement.x, y: placement.y };
  side.value = placement.side;
  caretOffset.value = placement.caretOffset;
}

function watchAnchorWhileVisible() {
  anchorObserver ??= new MutationObserver(() => {
    const label = anchor?.isConnected ? anchor.getAttribute(TOOLTIP_TEXT_ATTRIBUTE) : null;
    if (!label) return forgetAnchor();
    if (label === text.value) return;
    text.value = label;
    void reposition();
  });
  anchorObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributeFilter: [TOOLTIP_TEXT_ATTRIBUTE],
  });
}

function show() {
  showTimer = undefined;
  const label = anchor?.getAttribute(TOOLTIP_TEXT_ATTRIBUTE);
  if (!anchor?.isConnected || !label) return hide();
  if (repeatsVisibleText(anchor, label) && !isTruncated(anchor)) return hide();
  isGliding.value = isVisible.value;
  text.value = label;
  isVisible.value = true;
  watchAnchorWhileVisible();
  void reposition();
}

function aim(target: HTMLElement, pointerX?: number) {
  anchor = target;
  anchorPointerX = pointerX;
  cancelScheduledShow();
  const isReopeningQuickly = performance.now() - lastHiddenAt < INSTANT_REOPEN_WINDOW_MS;
  if (isVisible.value || isReopeningQuickly) show();
  else showTimer = setTimeout(show, SHOW_DELAY_MS);
}

function onPointerOver(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  const target = tooltipAnchorFrom(event.target);
  if (target === anchor) return;
  if (target) aim(target, event.clientX);
  else forgetAnchor();
}

function onPointerOut(event: PointerEvent) {
  if (!event.relatedTarget) forgetAnchor();
}

function onFocusIn(event: FocusEvent) {
  const target = tooltipAnchorFrom(event.target);
  const focused = event.target as HTMLElement;
  if (!target || !focused.matches(':focus-visible') || focused.matches('input, textarea')) return;
  aim(target);
}

function onFocusOut(event: FocusEvent) {
  if (anchor && anchor.contains(event.target as Node)) forgetAnchor();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide();
}

const listeners = [
  ['pointerover', onPointerOver],
  ['pointerout', onPointerOut],
  ['pointerdown', hide],
  ['focusin', onFocusIn],
  ['focusout', onFocusOut],
  ['keydown', onKeyDown],
  ['scroll', forgetAnchor],
] as const;

onMounted(() => {
  for (const [type, listener] of listeners) {
    document.addEventListener(type, listener as EventListener, { capture: true, passive: true });
  }
  window.addEventListener('blur', forgetAnchor);
});

onBeforeUnmount(() => {
  for (const [type, listener] of listeners) {
    document.removeEventListener(type, listener as EventListener, { capture: true });
  }
  window.removeEventListener('blur', forgetAnchor);
  forgetAnchor();
});
</script>

<template>
  <div
    class="pointer-events-none fixed top-0 left-0 z-[70]"
    :class="isGliding && 'tooltip-glide'"
    :style="{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }"
  >
    <Transition name="tooltip">
      <div
        v-if="isVisible"
        ref="bubble"
        role="tooltip"
        :data-side="side"
        :style="{ '--tooltip-caret-offset': `${caretOffset}px` }"
        class="tooltip-bubble max-w-xs rounded-md border bg-popover px-2 py-1 text-xs leading-snug break-words whitespace-pre-line text-popover-foreground shadow-md"
      >
        {{ text }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tooltip-glide {
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.tooltip-bubble {
  --tooltip-nudge-x: 0px;
  --tooltip-nudge-y: 0px;
  --tooltip-caret-size: 8px;
  --tooltip-caret-overhang: calc(var(--tooltip-caret-size) / -2 - 1px);
  position: relative;
}
.tooltip-bubble::before {
  content: '';
  position: absolute;
  width: var(--tooltip-caret-size);
  height: var(--tooltip-caret-size);
  background: inherit;
  border: inherit;
  border-top-color: transparent;
  border-left-color: transparent;
  border-radius: 0 0 1px 0;
}
.tooltip-bubble[data-side='top'] {
  --tooltip-nudge-y: 4px;
  transform-origin: var(--tooltip-caret-offset) bottom;
}
.tooltip-bubble[data-side='top']::before {
  bottom: var(--tooltip-caret-overhang);
  left: var(--tooltip-caret-offset);
  transform: translateX(-50%) rotate(45deg);
}
.tooltip-bubble[data-side='bottom'] {
  --tooltip-nudge-y: -4px;
  transform-origin: var(--tooltip-caret-offset) top;
}
.tooltip-bubble[data-side='bottom']::before {
  top: var(--tooltip-caret-overhang);
  left: var(--tooltip-caret-offset);
  transform: translateX(-50%) rotate(225deg);
}
.tooltip-bubble[data-side='left'] {
  --tooltip-nudge-x: 4px;
  transform-origin: right var(--tooltip-caret-offset);
}
.tooltip-bubble[data-side='left']::before {
  right: var(--tooltip-caret-overhang);
  top: var(--tooltip-caret-offset);
  transform: translateY(-50%) rotate(-45deg);
}
.tooltip-bubble[data-side='right'] {
  --tooltip-nudge-x: -4px;
  transform-origin: left var(--tooltip-caret-offset);
}
.tooltip-bubble[data-side='right']::before {
  left: var(--tooltip-caret-overhang);
  top: var(--tooltip-caret-offset);
  transform: translateY(-50%) rotate(135deg);
}

.tooltip-enter-active {
  transition:
    opacity 150ms ease-out,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tooltip-leave-active {
  transition:
    opacity 110ms ease-in,
    transform 110ms ease-in;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translate(var(--tooltip-nudge-x), var(--tooltip-nudge-y)) scale(0.94);
}

@media (prefers-reduced-motion: reduce) {
  .tooltip-glide {
    transition: none;
  }
  .tooltip-enter-from,
  .tooltip-leave-to {
    transform: none;
  }
}
</style>
