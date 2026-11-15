import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useToastsStore } from '@/stores/toasts';
import Toaster from './Toaster.vue';

beforeEach(() => setActivePinia(createPinia()));

describe('Toaster', () => {
  it('renders an action button that runs the action and removes the toast', async () => {
    const run = vi.fn();
    const toasts = useToastsStore();
    toasts.info('Deleted', { label: 'Undo', run });
    const w = mount(Toaster);
    const undo = w.findAll('button').find((b) => b.text() === 'Undo')!;
    await undo.trigger('click');
    await nextTick();
    expect(run).toHaveBeenCalledOnce();
    expect(toasts.toasts).toEqual([]);
  });

  it('shows no action button for a plain toast', () => {
    useToastsStore().info('Hello');
    const w = mount(Toaster);
    expect(w.findAll('button').map((b) => b.text())).toEqual(['']);
  });
});
