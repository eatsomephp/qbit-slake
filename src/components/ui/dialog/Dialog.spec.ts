import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Dialog from './Dialog.vue';

let wrapper: ReturnType<typeof mount> | null = null;

async function openDialog(slot: string) {
  wrapper = mount(Dialog, {
    attachTo: document.body,
    props: { open: true, title: 'Title' },
    slots: { default: slot },
  });
  await flushPromises();
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('Dialog', () => {
  it('focuses the [autofocus] field in the slot on open instead of the Close button', async () => {
    await openDialog('<input id="name" autofocus /><input id="other" />');
    expect(document.activeElement).toBe(document.getElementById('name'));
  });

  it('keeps the default focus inside the dialog when nothing has autofocus', async () => {
    await openDialog('<input id="other" />');
    expect(document.activeElement).toBe(document.querySelector('button[aria-label="Close"]'));
  });
});
