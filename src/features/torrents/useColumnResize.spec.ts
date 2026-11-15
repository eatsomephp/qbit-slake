import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { MAX_COLUMN_WIDTH, useColumnResize } from './useColumnResize';

const ROOT_CLASS = 'is-resizing-column';

let container: HTMLElement;
let handle: HTMLElement;
let commit: ReturnType<typeof vi.fn<(columnId: string, width: number) => void>>;
let scope: ReturnType<typeof effectScope>;

function setup(minWidth = 40) {
  commit = vi.fn();
  scope = effectScope();
  return scope.run(() =>
    useColumnResize({
      container: ref(container),
      widthOf: () => 100,
      minWidthOf: () => minWidth,
      tableWidth: () => 1000,
      commit,
    }),
  )!;
}

function pointer(type: string, clientX: number, button = 0) {
  const event = new MouseEvent(type, { clientX, button, bubbles: true, cancelable: true });
  return Object.assign(event, { pointerId: 1 });
}

function start(resize: ReturnType<typeof setup>, clientX = 500, button = 0) {
  const event = pointer('pointerdown', clientX, button);
  Object.defineProperty(event, 'currentTarget', { value: handle });
  resize.startResize(event as unknown as PointerEvent, 'name');
  return event;
}

beforeEach(() => {
  container = document.createElement('div');
  handle = document.createElement('div');
  container.append(handle);
  document.body.append(container);
});

afterEach(() => {
  scope?.stop();
  container.remove();
  document.documentElement.classList.remove(ROOT_CLASS);
});

describe('startResize', () => {
  it('ignores non-primary buttons', () => {
    const resize = setup();
    start(resize, 500, 2);
    expect(resize.resizingColumnId.value).toBeNull();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
  });

  it('previews width and table width through CSS variables while dragging', () => {
    const resize = setup();
    start(resize);
    expect(resize.resizingColumnId.value).toBe('name');
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(true);

    handle.dispatchEvent(pointer('pointermove', 530));
    expect(container.style.getPropertyValue('--col-name')).toBe('130px');
    expect(container.style.getPropertyValue('--table-width')).toBe('1030px');
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits once on release', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 520));
    handle.dispatchEvent(pointer('pointermove', 540));
    handle.dispatchEvent(pointer('pointerup', 540));
    expect(commit).toHaveBeenCalledExactlyOnceWith('name', 140);
    expect(resize.resizingColumnId.value).toBeNull();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
  });

  it('clamps to the column minimum and the global maximum', () => {
    const resize = setup(60);
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 0));
    expect(container.style.getPropertyValue('--col-name')).toBe('60px');
    handle.dispatchEvent(pointer('pointermove', 100000));
    expect(container.style.getPropertyValue('--col-name')).toBe(`${MAX_COLUMN_WIDTH}px`);
  });

  it('does not commit when released at the starting width', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointerup', 500));
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancels on Escape, restoring the original width and swallowing the key', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 560));
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(container.style.getPropertyValue('--col-name')).toBe('100px');
    expect(container.style.getPropertyValue('--table-width')).toBe('1000px');
    expect(commit).not.toHaveBeenCalled();
    expect(resize.resizingColumnId.value).toBeNull();

    handle.dispatchEvent(pointer('pointerup', 560));
    expect(commit).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const resize = setup();
    start(resize);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(resize.resizingColumnId.value).toBe('name');
  });

  it('restores on pointercancel', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 560));
    handle.dispatchEvent(pointer('pointercancel', 560));
    expect(container.style.getPropertyValue('--col-name')).toBe('100px');
    expect(commit).not.toHaveBeenCalled();
  });

  it('abandons an in-flight resize when the scope is disposed', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 560));
    scope.stop();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
    handle.dispatchEvent(pointer('pointerup', 560));
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancels a previous resize when a new one starts', () => {
    const resize = setup();
    start(resize);
    handle.dispatchEvent(pointer('pointermove', 560));
    start(resize, 300);
    handle.dispatchEvent(pointer('pointerup', 300));
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('autoFit', () => {
  function addCell(
    columnId: string,
    childWidths: number[],
    style: Partial<CSSStyleDeclaration> = {},
  ) {
    const cell = document.createElement('div');
    cell.dataset.col = columnId;
    Object.assign(cell.style, style);
    for (const width of childWidths) {
      const child = document.createElement('span');
      Object.defineProperty(child, 'scrollWidth', { value: width });
      cell.append(child);
    }
    container.append(cell);
    return cell;
  }

  it('commits the widest cell including padding and gaps, rounded up', () => {
    addCell('name', [50, 20], { paddingLeft: '4px', paddingRight: '6px', columnGap: '2.5px' });
    addCell('name', [80], { paddingLeft: '0px', paddingRight: '0px' });
    addCell('other', [999]);
    setup().autoFit('name');
    expect(commit).toHaveBeenCalledExactlyOnceWith('name', 83);
  });

  it('skips the resize handle when measuring', () => {
    const cell = addCell('name', [30]);
    const grip = document.createElement('span');
    grip.dataset.resizeHandle = 'true';
    Object.defineProperty(grip, 'scrollWidth', { value: 500 });
    cell.append(grip);
    setup().autoFit('name');
    expect(commit).toHaveBeenCalledWith('name', 40);
  });

  it('does nothing when there is nothing to measure', () => {
    setup().autoFit('name');
    expect(commit).not.toHaveBeenCalled();
  });
});
