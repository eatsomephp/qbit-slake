import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useToastsStore } from './toasts';

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
});
afterEach(() => vi.useRealTimers());

describe('toasts store', () => {
  it('runAction dismisses the toast, then runs the action', () => {
    const toasts = useToastsStore();
    let toastsWhenRun: number | null = null;
    toasts.info('Done', { label: 'Undo', run: () => (toastsWhenRun = toasts.toasts.length) });
    const [toast] = toasts.toasts;
    expect(toast!.action?.label).toBe('Undo');
    toasts.runAction(toast!);
    expect(toastsWhenRun).toBe(0);
  });

  it('keeps a toast with an action around longer than a plain one', () => {
    const toasts = useToastsStore();
    toasts.info('plain');
    toasts.info('with action', { label: 'Undo', run: () => {} });
    vi.advanceTimersByTime(3500);
    expect(toasts.toasts.map((t) => t.message)).toEqual(['with action']);
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts).toEqual([]);
  });
});
