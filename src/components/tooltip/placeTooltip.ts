import type { TooltipSide } from './vTooltip';

export const TOOLTIP_GAP_PX = 9;
export const VIEWPORT_MARGIN_PX = 8;
export const CARET_EDGE_INSET_PX = 8;

const OPPOSITE_SIDE: Record<TooltipSide, TooltipSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Size {
  width: number;
  height: number;
}

export interface TooltipPlacement {
  x: number;
  y: number;
  side: TooltipSide;
  caretOffset: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function placeTooltip(
  anchor: Rect,
  tooltip: Size,
  viewport: Size,
  preferredSide: TooltipSide,
  pointerX?: number,
): TooltipPlacement {
  const fitsOn: Record<TooltipSide, boolean> = {
    top: anchor.top - TOOLTIP_GAP_PX - tooltip.height >= VIEWPORT_MARGIN_PX,
    bottom: anchor.bottom + TOOLTIP_GAP_PX + tooltip.height <= viewport.height - VIEWPORT_MARGIN_PX,
    left: anchor.left - TOOLTIP_GAP_PX - tooltip.width >= VIEWPORT_MARGIN_PX,
    right: anchor.right + TOOLTIP_GAP_PX + tooltip.width <= viewport.width - VIEWPORT_MARGIN_PX,
  };
  const side =
    fitsOn[preferredSide] || !fitsOn[OPPOSITE_SIDE[preferredSide]]
      ? preferredSide
      : OPPOSITE_SIDE[preferredSide];

  const isVertical = side === 'top' || side === 'bottom';
  const centerX = pointerX ?? (anchor.left + anchor.right) / 2;
  const centerY = (anchor.top + anchor.bottom) / 2;
  let x: number;
  let y: number;
  if (isVertical) {
    x = centerX - tooltip.width / 2;
    y =
      side === 'top'
        ? anchor.top - TOOLTIP_GAP_PX - tooltip.height
        : anchor.bottom + TOOLTIP_GAP_PX;
  } else {
    x =
      side === 'left'
        ? anchor.left - TOOLTIP_GAP_PX - tooltip.width
        : anchor.right + TOOLTIP_GAP_PX;
    y = centerY - tooltip.height / 2;
  }

  const clampedX = Math.round(
    clamp(x, VIEWPORT_MARGIN_PX, viewport.width - VIEWPORT_MARGIN_PX - tooltip.width),
  );
  const clampedY = Math.round(
    clamp(y, VIEWPORT_MARGIN_PX, viewport.height - VIEWPORT_MARGIN_PX - tooltip.height),
  );
  const edgeLength = isVertical ? tooltip.width : tooltip.height;
  const caretOffset = clamp(
    isVertical ? centerX - clampedX : centerY - clampedY,
    Math.min(CARET_EDGE_INSET_PX, edgeLength / 2),
    Math.max(edgeLength - CARET_EDGE_INSET_PX, edgeLength / 2),
  );

  return { x: clampedX, y: clampedY, side, caretOffset: Math.round(caretOffset) };
}
