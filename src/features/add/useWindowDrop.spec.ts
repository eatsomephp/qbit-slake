import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { addRequest, resetAdd } from './addState';
import { useWindowDrop } from './useWindowDrop';

interface FakeTransfer {
  types: string[];
  files?: File[];
  data?: Record<string, string>;
  dropEffect?: string;
}

function dragEvent(type: string, transfer: FakeTransfer | null) {
  const event = new Event(type, { cancelable: true, bubbles: true }) as DragEvent;
  const dataTransfer = transfer && {
    types: transfer.types,
    files: transfer.files ?? [],
    dropEffect: 'none',
    getData: (format: string) => transfer.data?.[format] ?? '',
  };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  window.dispatchEvent(event);
  return event;
}

const FILES: FakeTransfer = { types: ['Files'] };
let scope: EffectScope;
let drop: ReturnType<typeof useWindowDrop>;

beforeEach(() => {
  resetAdd();
  addRequest.open = false;
  scope = effectScope();
  drop = scope.run(() => useWindowDrop())!;
});
afterEach(() => scope.stop());

describe('useWindowDrop', () => {
  it('shows the overlay while a drag with files is over the window', () => {
    expect(dragEvent('dragenter', FILES).defaultPrevented).toBe(true);
    expect(drop.active.value).toBe(true);
  });

  it('ignores drags that carry nothing droppable', () => {
    const event = dragEvent('dragenter', { types: ['text/html'] });
    expect(event.defaultPrevented).toBe(false);
    expect(drop.active.value).toBe(false);
    expect(dragEvent('dragenter', null).defaultPrevented).toBe(false);
  });

  it('keeps the overlay until every nested dragenter has left', () => {
    dragEvent('dragenter', FILES);
    dragEvent('dragenter', FILES);
    dragEvent('dragleave', FILES);
    expect(drop.active.value).toBe(true);
    dragEvent('dragleave', FILES);
    expect(drop.active.value).toBe(false);
  });

  it('does not go negative on stray dragleave events', () => {
    dragEvent('dragleave', FILES);
    dragEvent('dragleave', FILES);
    dragEvent('dragenter', FILES);
    expect(drop.active.value).toBe(true);
  });

  it('marks the drop effect as copy on dragover', () => {
    const transfer = { ...FILES };
    const event = dragEvent('dragover', transfer);
    expect(event.defaultPrevented).toBe(true);
    expect((event.dataTransfer as unknown as FakeTransfer).dropEffect).toBe('copy');
  });

  it('opens the add dialog with dropped .torrent files only', () => {
    dragEvent('dragenter', FILES);
    const torrent = new File(['x'], 'a.torrent');
    const other = new File(['x'], 'notes.txt');
    const event = dragEvent('drop', { types: ['Files'], files: [torrent, other] });
    expect(event.defaultPrevented).toBe(true);
    expect(drop.active.value).toBe(false);
    expect(addRequest.open).toBe(true);
    expect(addRequest.files).toEqual([torrent]);
    expect(addRequest.text).toBe('');
  });

  it('prefers files over text when both are dropped', () => {
    dragEvent('drop', {
      types: ['Files', 'text/plain'],
      files: [new File(['x'], 'a.torrent')],
      data: { 'text/plain': 'magnet:?xt=urn:btih:abc' },
    });
    expect(addRequest.text).toBe('');
    expect(addRequest.files).toHaveLength(1);
  });

  it('opens the add dialog with a dropped link, preferring the uri-list', () => {
    dragEvent('drop', {
      types: ['text/uri-list', 'text/plain'],
      data: { 'text/uri-list': ' magnet:?xt=urn:btih:abc ', 'text/plain': 'ignored' },
    });
    expect(addRequest.open).toBe(true);
    expect(addRequest.text).toBe('magnet:?xt=urn:btih:abc');
  });

  it('does nothing for a drop of non-torrent files or blank text', () => {
    dragEvent('drop', { types: ['Files'], files: [new File(['x'], 'notes.txt')] });
    dragEvent('drop', { types: ['text/plain'], data: { 'text/plain': '  ' } });
    expect(addRequest.open).toBe(false);
  });

  it('stops listening once the scope is disposed', () => {
    scope.stop();
    dragEvent('dragenter', FILES);
    expect(drop.active.value).toBe(false);
    dragEvent('drop', { types: ['text/plain'], data: { 'text/plain': 'magnet:?x' } });
    expect(addRequest.open).toBe(false);
  });
});
