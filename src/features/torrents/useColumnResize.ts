import { onScopeDispose, ref, type Ref } from 'vue';

export const MAX_COLUMN_WIDTH = 1200;
const RESIZING_ROOT_CLASS = 'is-resizing-column';

interface ColumnResizeOptions {
  container: Ref<HTMLElement | null>;
  widthOf: (columnId: string) => number;
  minWidthOf: (columnId: string) => number;
  tableWidth: () => number;
  commit: (columnId: string, width: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Resizing writes CSS variables directly and persists once on release. Routing each
// pointermove through reactive state re-renders the header and writes localStorage per frame.
export function useColumnResize(options: ColumnResizeOptions) {
  const resizingColumnId = ref<string | null>(null);
  let stopActiveResize: ((keep: boolean) => void) | null = null;

  function previewWidth(columnId: string, width: number, tableWidth: number) {
    const el = options.container.value;
    if (!el) return;
    el.style.setProperty(`--col-${columnId}`, `${width}px`);
    el.style.setProperty('--table-width', `${tableWidth}px`);
  }

  function startResize(event: PointerEvent, columnId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopActiveResize?.(false);

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = options.widthOf(columnId);
    const startTableWidth = options.tableWidth();
    const minWidth = options.minWidthOf(columnId);
    let width = startWidth;

    resizingColumnId.value = columnId;
    document.documentElement.classList.add(RESIZING_ROOT_CLASS);

    const onMove = (moveEvent: PointerEvent) => {
      width = Math.round(
        clamp(startWidth + moveEvent.clientX - startX, minWidth, MAX_COLUMN_WIDTH),
      );
      previewWidth(columnId, width, startTableWidth + width - startWidth);
    };
    const onUp = () => stop(true);
    const onCancel = () => stop(false);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      stop(false);
    };

    function stop(keep: boolean) {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown, true);
      document.documentElement.classList.remove(RESIZING_ROOT_CLASS);
      resizingColumnId.value = null;
      stopActiveResize = null;
      if (keep && width !== startWidth) options.commit(columnId, width);
      else previewWidth(columnId, startWidth, startTableWidth);
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown, true);
    stopActiveResize = stop;
  }

  function autoFit(columnId: string) {
    const el = options.container.value;
    if (!el) return;
    let widest = 0;
    for (const cell of el.querySelectorAll<HTMLElement>(`[data-col="${columnId}"]`)) {
      widest = Math.max(widest, measureContentWidth(cell));
    }
    if (!widest) return;
    const width = Math.ceil(clamp(widest, options.minWidthOf(columnId), MAX_COLUMN_WIDTH));
    options.commit(columnId, width);
  }

  onScopeDispose(() => stopActiveResize?.(false));

  return { resizingColumnId, startResize, autoFit };
}

function measureContentWidth(cell: HTMLElement): number {
  const style = getComputedStyle(cell);
  const children = [...cell.children].filter(
    (child) => !(child as HTMLElement).dataset?.resizeHandle,
  );
  const gap = parseFloat(style.columnGap) || 0;
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const contentWidth = children.reduce(
    (sum, child) => sum + Math.max(child.scrollWidth, child.getBoundingClientRect().width),
    0,
  );
  return contentWidth + gap * Math.max(0, children.length - 1) + padding;
}
