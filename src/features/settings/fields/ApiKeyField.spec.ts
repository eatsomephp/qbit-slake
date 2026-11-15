import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useToastsStore } from '@/stores/toasts';

const qbit = vi.hoisted(() => ({ rotateApiKey: vi.fn(), deleteApiKey: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { default: ApiKeyField } = await import('./ApiKeyField.vue');

let wrapper: VueWrapper | undefined;

function mountField(storedKey: string) {
  wrapper = mount(ApiKeyField, { props: { id: 'key', storedKey }, attachTo: document.body });
  return wrapper;
}

const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const click = async (button: HTMLElement | undefined) => {
  button!.click();
  await flushPromises();
};
const dialogButton = (label: string) => buttonIn(document.body, label);
const toastMessages = () => useToastsStore().toasts.map((t) => t.message);

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
});

describe('ApiKeyField', () => {
  it('offers Generate and no Delete when there is no key', () => {
    const w = mountField('');
    expect(w.text()).toContain('No key');
    expect(buttonIn(w.element, 'Generate')).toBeDefined();
    expect(buttonIn(w.element, 'Delete')).toBeUndefined();
  });

  it('shows the stored key masked, with Rotate and Delete', () => {
    const w = mountField('abc123');
    expect(w.get<HTMLInputElement>('input').element.value).toBe('abc123');
    expect(w.get('input').attributes('type')).toBe('password');
    expect(w.get('input').attributes('readonly')).toBeDefined();
    expect(buttonIn(w.element, 'Rotate')).toBeDefined();
    expect(buttonIn(w.element, 'Delete')).toBeDefined();
  });

  it('generates a key only after confirming, then shows it', async () => {
    qbit.rotateApiKey.mockResolvedValue('qbt_new');
    const w = mountField('');
    await click(buttonIn(w.element, 'Generate'));
    expect(qbit.rotateApiKey).not.toHaveBeenCalled();

    await click(dialogButton('Generate key'));
    expect(qbit.rotateApiKey).toHaveBeenCalledTimes(1);
    expect(w.get<HTMLInputElement>('input').element.value).toBe('qbt_new');
    expect(toastMessages()).toEqual(['New API key generated.']);
  });

  it('rotates an existing key after confirming', async () => {
    qbit.rotateApiKey.mockResolvedValue('qbt_rotated');
    const w = mountField('old');
    await click(buttonIn(w.element, 'Rotate'));
    expect(qbit.rotateApiKey).not.toHaveBeenCalled();

    await click(dialogButton('Rotate key'));
    expect(qbit.rotateApiKey).toHaveBeenCalledTimes(1);
    expect(w.get<HTMLInputElement>('input').element.value).toBe('qbt_rotated');
  });

  it('deletes the key after confirming and falls back to Generate', async () => {
    qbit.deleteApiKey.mockResolvedValue(undefined);
    const w = mountField('old');
    await click(buttonIn(w.element, 'Delete'));
    expect(qbit.deleteApiKey).not.toHaveBeenCalled();

    await click(dialogButton('Delete key'));
    expect(qbit.deleteApiKey).toHaveBeenCalledTimes(1);
    expect(w.find('input').exists()).toBe(false);
    expect(w.text()).toContain('No key');
    expect(buttonIn(w.element, 'Generate')).toBeDefined();
    expect(toastMessages()).toEqual(['API key deleted.']);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const w = mountField('old');
    await click(buttonIn(w.element, 'Rotate'));
    await click(dialogButton('Cancel'));
    await click(buttonIn(w.element, 'Delete'));
    await click(dialogButton('Cancel'));

    expect(qbit.rotateApiKey).not.toHaveBeenCalled();
    expect(qbit.deleteApiKey).not.toHaveBeenCalled();
    expect(w.get<HTMLInputElement>('input').element.value).toBe('old');
    expect(toastMessages()).toEqual([]);
  });

  it('keeps the key and toasts an error when rotating fails', async () => {
    qbit.rotateApiKey.mockRejectedValue(new Error('boom'));
    const w = mountField('old');
    await click(buttonIn(w.element, 'Rotate'));
    await click(dialogButton('Rotate key'));

    expect(w.get<HTMLInputElement>('input').element.value).toBe('old');
    expect(toastMessages()).toHaveLength(1);
    expect(toastMessages()[0]).toContain("Couldn't change the API key");
  });

  it('keeps the key and toasts an error when deleting fails', async () => {
    qbit.deleteApiKey.mockRejectedValue(new Error('boom'));
    const w = mountField('old');
    await click(buttonIn(w.element, 'Delete'));
    await click(dialogButton('Delete key'));

    expect(w.get<HTMLInputElement>('input').element.value).toBe('old');
    expect(toastMessages()[0]).toContain("Couldn't change the API key");
  });

  it('follows the stored key when it changes', async () => {
    const w = mountField('old');
    await w.setProps({ storedKey: 'fresh' });
    expect(w.get<HTMLInputElement>('input').element.value).toBe('fresh');
  });

  it('disables every action when disabled', () => {
    wrapper = mount(ApiKeyField, {
      props: { id: 'key', storedKey: 'old', disabled: true },
      attachTo: document.body,
    });
    expect(buttonIn(wrapper.element, 'Rotate')!.disabled).toBe(true);
    expect(buttonIn(wrapper.element, 'Delete')!.disabled).toBe(true);
  });
});
