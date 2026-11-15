import { describe, expect, it } from 'vitest';
import {
  CARET_EDGE_INSET_PX,
  TOOLTIP_GAP_PX,
  VIEWPORT_MARGIN_PX,
  placeTooltip,
} from './placeTooltip';

const viewport = { width: 800, height: 600 };
const tooltip = { width: 100, height: 30 };
const rect = (left: number, top: number, width = 40, height = 20) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('placeTooltip side choice', () => {
  it('uses the preferred side when it fits', () => {
    const result = placeTooltip(rect(400, 300), tooltip, viewport, 'top');
    expect(result.side).toBe('top');
    expect(result.y).toBe(300 - TOOLTIP_GAP_PX - tooltip.height);
  });

  it('flips to the opposite side when the preferred one does not fit', () => {
    expect(placeTooltip(rect(400, 10), tooltip, viewport, 'top').side).toBe('bottom');
    expect(placeTooltip(rect(400, 570), tooltip, viewport, 'bottom').side).toBe('top');
    expect(placeTooltip(rect(10, 300), tooltip, viewport, 'left').side).toBe('right');
    expect(placeTooltip(rect(750, 300), tooltip, viewport, 'right').side).toBe('left');
  });

  it('keeps the preferred side when neither side fits', () => {
    const tiny = { width: 800, height: 40 };
    expect(placeTooltip(rect(400, 10), { width: 10, height: 30 }, tiny, 'top').side).toBe('top');
  });
});

describe('placeTooltip position', () => {
  it('centers a vertical tooltip on the anchor', () => {
    const result = placeTooltip(rect(380, 300), tooltip, viewport, 'bottom');
    expect(result.x).toBe(400 - 50);
    expect(result.y).toBe(320 + TOOLTIP_GAP_PX);
    expect(result.caretOffset).toBe(50);
  });

  it('centers a horizontal tooltip vertically on the anchor', () => {
    const result = placeTooltip(rect(400, 300), tooltip, viewport, 'right');
    expect(result.x).toBe(440 + TOOLTIP_GAP_PX);
    expect(result.y).toBe(310 - 15);
  });

  it('follows the pointer horizontally when given', () => {
    const result = placeTooltip(rect(200, 300, 400), tooltip, viewport, 'top', 250);
    expect(result.x).toBe(200);
    expect(result.caretOffset).toBe(50);
  });

  it('clamps inside the viewport margin and slides the caret to stay on the anchor', () => {
    const left = placeTooltip(rect(10, 300, 20), tooltip, viewport, 'top');
    expect(left.x).toBe(VIEWPORT_MARGIN_PX);
    expect(left.caretOffset).toBe(20 - VIEWPORT_MARGIN_PX);

    const right = placeTooltip(rect(780, 300, 20), tooltip, viewport, 'top');
    expect(right.x).toBe(viewport.width - VIEWPORT_MARGIN_PX - tooltip.width);
    expect(right.caretOffset).toBe(tooltip.width - CARET_EDGE_INSET_PX);
  });

  it('keeps the caret off the tooltip corners', () => {
    const result = placeTooltip(rect(-100, 300, 20), tooltip, viewport, 'top');
    expect(result.caretOffset).toBe(CARET_EDGE_INSET_PX);
  });
});
